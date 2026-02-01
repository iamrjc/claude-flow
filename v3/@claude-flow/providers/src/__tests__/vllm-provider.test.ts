/**
 * VLLMProvider Unit Tests
 *
 * Tests for WP06: vLLM Provider Implementation
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VLLMProvider } from '../vllm-provider.js';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('VLLMProvider', () => {
  let provider: VLLMProvider;

  beforeEach(() => {
    fetchMock.mockReset();
    provider = new VLLMProvider({
      config: {
        provider: 'custom',
        model: 'llama-2-7b',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
      });

      await provider.initialize();
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.objectContaining({ headers: {} })
      );
    });

    it('should use custom host from apiUrl', async () => {
      const customProvider = new VLLMProvider({
        config: {
          provider: 'custom',
          model: 'llama-2-7b',
          apiUrl: 'http://custom-host:8080',
        },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
      });

      await customProvider.initialize();
      expect(fetchMock).toHaveBeenCalledWith(
        'http://custom-host:8080/health',
        expect.objectContaining({ headers: {} })
      );
    });

    it('should use custom host and port from providerOptions', async () => {
      const customProvider = new VLLMProvider({
        config: {
          provider: 'custom',
          model: 'llama-2-7b',
          providerOptions: {
            host: 'http://custom-host',
            port: 9000,
          },
        },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
      });

      await customProvider.initialize();
      expect(fetchMock).toHaveBeenCalledWith(
        'http://custom-host:9000/health',
        expect.objectContaining({ headers: {} })
      );
    });

    it('should warn when vLLM server is not available', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      // Should not throw, just warn
      await provider.initialize();
    });

    it('should fetch available models on initialization', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            object: 'list',
            data: [
              { id: 'llama-2-7b', object: 'model' },
              { id: 'mistral-7b', object: 'model' },
            ],
          }),
        });

      await provider.initialize();
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/v1/models',
        expect.objectContaining({ headers: {} })
      );
    });
  });

  describe('generate()', () => {
    it('should generate text from a prompt', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'completion-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'llama-2-7b',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello world' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const response = await provider.generate('Hello');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"content":"Hello"'),
        })
      );
      expect(response.content).toBe('Hello world');
    });

    it('should pass temperature option', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'completion-123',
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      await provider.generate('Test', { temperature: 0.7 });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.temperature).toBe(0.7);
    });

    it('should pass maxTokens option', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      await provider.generate('Test', { maxTokens: 100 });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.max_tokens).toBe(100);
    });

    it('should pass topP option', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        }),
      });

      await provider.generate('Test', { topP: 0.9 });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.top_p).toBe(0.9);
    });

    it('should pass stopSequences option', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        }),
      });

      await provider.generate('Test', { stopSequences: ['\n', 'END'] });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.stop).toEqual(['\n', 'END']);
    });

    it('should include authorization header if apiKey is set', async () => {
      const authProvider = new VLLMProvider({
        config: {
          provider: 'custom',
          model: 'llama-2-7b',
          apiKey: 'test-api-key',
        },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        }),
      });

      await authProvider.generate('Test');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });
  });

  describe('chat()', () => {
    it('should handle chat messages', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'I am fine', role: 'assistant' }, finish_reason: 'stop' }],
        }),
      });

      const messages = [{ role: 'user' as const, content: 'How are you?' }];
      const response = await provider.chat(messages);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"role":"user"'),
        })
      );
      expect(response.content).toBe('I am fine');
    });

    it('should handle multi-turn conversations', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'The weather is nice', role: 'assistant' }, finish_reason: 'stop' }],
        }),
      });

      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'What is the weather?' },
      ];
      const response = await provider.chat(messages);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.messages).toHaveLength(3);
      expect(response.content).toBe('The weather is nice');
    });

    it('should handle system messages', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Ahoy!', role: 'assistant' }, finish_reason: 'stop' }],
        }),
      });

      const messages = [
        { role: 'system' as const, content: 'You are a pirate' },
        { role: 'user' as const, content: 'Hello' },
      ];
      await provider.chat(messages);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.messages[0].role).toBe('system');
    });

    it('should pass additional options to chat', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response', role: 'assistant' }, finish_reason: 'stop' }],
        }),
      });

      await provider.chat([{ role: 'user', content: 'Test' }], {
        temperature: 0.8,
        maxTokens: 200,
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.temperature).toBe(0.8);
      expect(callBody.max_tokens).toBe(200);
    });
  });

  describe('listModels()', () => {
    it('should list available models', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: 'list',
          data: [
            { id: 'llama-2-7b', object: 'model' },
            { id: 'mistral-7b', object: 'model' },
          ],
        }),
      });

      const models = await provider.listModels();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/v1/models',
        expect.objectContaining({ headers: {} })
      );
      expect(models).toEqual(['llama-2-7b', 'mistral-7b']);
    });

    it('should return default models on error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const models = await provider.listModels();

      expect(models).toContain('custom-model');
    });

    it('should handle empty model list', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      });

      const models = await provider.listModels();

      expect(models).toContain('custom-model'); // Fallback to default
    });
  });

  describe('getModelInfo()', () => {
    it('should return model information from server', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'llama-2-7b',
          object: 'model',
          created: Date.now(),
          owned_by: 'organization',
        }),
      });

      const info = await provider.getModelInfo('llama-2-7b');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/v1/models/llama-2-7b',
        expect.objectContaining({ headers: {} })
      );
      expect(info.model).toBe('llama-2-7b');
      expect(info.name).toBe('llama-2-7b');
      expect(info.pricing.promptCostPer1k).toBe(0);
    });

    it('should return default info when server fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const info = await provider.getModelInfo('unknown-model' as any);

      expect(info.description).toContain('vLLM hosted model');
      expect(info.model).toBe('unknown-model');
    });

    it('should handle network errors gracefully', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const info = await provider.getModelInfo('test-model' as any);

      expect(info.model).toBe('test-model');
      expect(info.description).toContain('vLLM hosted model');
    });
  });

  describe('checkHealth()', () => {
    it('should return healthy when server responds', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      const health = await provider.checkHealth();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.objectContaining({ headers: {} })
      );
      expect(health.healthy).toBe(true);
      expect(health.details?.server).toBe('vllm');
    });

    it('should detect local deployment', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      const health = await provider.checkHealth();

      expect(health.details?.local).toBe(true);
    });

    it('should return unhealthy when server is down', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Connection refused');
    });

    it('should return unhealthy on HTTP error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('HTTP 503');
    });

    it('should include helpful hint for unreachable server', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const health = await provider.checkHealth();

      expect(health.details?.hint).toBe('Ensure vLLM server is running and accessible');
    });
  });

  describe('streaming', () => {
    it('should handle streaming responses', async () => {
      const mockStream = [
        'data: {"id":"1","choices":[{"message":{"content":"Hello"},"finish_reason":null}]}\n',
        'data: {"id":"1","choices":[{"message":{"content":" world"},"finish_reason":null}]}\n',
        'data: {"id":"1","choices":[{"message":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n',
        'data: [DONE]\n',
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of mockStream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const chunks: string[] = [];
      const generator = provider.streamComplete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      for await (const event of generator) {
        if (event.type === 'content') {
          chunks.push(event.delta.content || '');
        }
      }

      expect(chunks.join('')).toContain('Hello');
      expect(chunks.join('')).toContain('world');
    });

    it('should handle streaming errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: { message: 'Internal error' } }),
      });

      await expect(async () => {
        const generator = provider.streamComplete({
          messages: [{ role: 'user', content: 'Test' }],
        });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of generator) {
          // Should throw before yielding
        }
      }).rejects.toThrow();
    });

    it('should handle malformed streaming chunks gracefully', async () => {
      const mockStream = [
        'data: {"id":"1","choices":[{"message":{"content":"Good"},"finish_reason":null}]}\n',
        'data: invalid json here\n', // Malformed
        'data: {"id":"1","choices":[{"message":{"content":" data"},"finish_reason":"stop"}]}\n',
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of mockStream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const chunks: string[] = [];
      const generator = provider.streamComplete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      for await (const event of generator) {
        if (event.type === 'content') {
          chunks.push(event.delta.content || '');
        }
      }

      expect(chunks.join('')).toBe('Good data');
    });
  });

  describe('error handling', () => {
    it('should handle connection timeout', async () => {
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 100);
          })
      );

      await expect(provider.generate('test')).rejects.toThrow();
    });

    it('should handle malformed JSON response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(provider.generate('test')).rejects.toThrow();
    });

    it('should handle server error with detailed message', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: { message: 'Model not loaded' } }),
      });

      await expect(provider.generate('test')).rejects.toThrow('Model not loaded');
    });

    it('should handle empty error response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => '',
      });

      await expect(provider.generate('test')).rejects.toThrow();
    });

    it('should detect connection errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 0,
        text: async () => JSON.stringify({ message: 'Connection failed' }),
      });

      await expect(provider.generate('test')).rejects.toThrow('Connection failed');
    });
  });

  describe('response handling', () => {
    it('should handle text completion format', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'completion-123',
          object: 'text_completion',
          choices: [
            {
              text: 'Completion text',
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const response = await provider.generate('Test');
      expect(response.content).toBe('Completion text');
    });

    it('should handle missing usage data', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        }),
      });

      const response = await provider.generate('Test');
      expect(response.usage.promptTokens).toBe(0);
      expect(response.usage.completionTokens).toBe(0);
    });

    it('should handle length finish reason', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'length' }],
        }),
      });

      const response = await provider.generate('Test');
      expect(response.finishReason).toBe('length');
    });

    it('should default to empty content if none provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: {}, finish_reason: 'stop' }],
        }),
      });

      const response = await provider.generate('Test');
      expect(response.content).toBe('');
    });
  });
});
