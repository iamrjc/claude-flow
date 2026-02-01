/**
 * OllamaProvider Unit Tests
 *
 * Tests for WP01: Ollama Provider Implementation
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../ollama-provider.js';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    fetchMock.mockReset();
    provider = new OllamaProvider({
      config: {
        provider: 'ollama',
        model: 'llama3.2',
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
        json: async () => ({ models: [] }),
      });

      await provider.initialize();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/tags');
    });

    it('should use custom host from config', async () => {
      const customProvider = new OllamaProvider({
        config: {
          provider: 'ollama',
          model: 'llama3.2',
          apiUrl: 'http://custom-host:11434',
        },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await customProvider.initialize();
      expect(fetchMock).toHaveBeenCalledWith('http://custom-host:11434/api/tags');
    });

    it('should warn when Ollama server is not available', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      // Should not throw, just warn
      await provider.initialize();
    });
  });

  describe('generate()', () => {
    it('should generate text from a prompt', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'Hello world', role: 'assistant' },
          done: true,
          prompt_eval_count: 10,
          eval_count: 5,
        }),
      });

      const response = await provider.generate('Hello');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
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
          message: { content: 'Response', role: 'assistant' },
          done: true,
        }),
      });

      await provider.generate('Test', { temperature: 0.5 });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.options.temperature).toBe(0.5);
    });

    it('should pass maxTokens option', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'Response', role: 'assistant' },
          done: true,
        }),
      });

      await provider.generate('Test', { maxTokens: 100 });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.options.num_predict).toBe(100);
    });
  });

  describe('chat()', () => {
    it('should handle chat messages', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'I am fine', role: 'assistant' },
          done: true,
        }),
      });

      const messages = [{ role: 'user' as const, content: 'How are you?' }];
      const response = await provider.chat(messages);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
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
          message: { content: 'The weather is nice', role: 'assistant' },
          done: true,
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
          message: { content: 'Ahoy!', role: 'assistant' },
          done: true,
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
  });

  describe('embed()', () => {
    it('should embed a single text', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
      });

      const embedding = await provider.embed('test');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"prompt":"test"'),
        })
      );
      expect(embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should embed multiple texts', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ embedding: [0.1, 0.2] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ embedding: [0.3, 0.4] }),
        });

      const embeddings = await provider.embed(['text1', 'text2']);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(embeddings).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
    });

    it('should handle embedding errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: 'Embedding failed' }),
      });

      await expect(provider.embed('test')).rejects.toThrow();
    });
  });

  describe('pullModel()', () => {
    it('should pull a model successfully', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      await provider.pullModel('llama3.2');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/pull',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"llama3.2"'),
        })
      );
    });

    it('should handle pull errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: 'Model not found' }),
      });

      await expect(provider.pullModel('nonexistent')).rejects.toThrow();
    });
  });

  describe('checkHealth()', () => {
    it('should return healthy when server responds', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.details?.server).toBe('ollama');
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
        status: 500,
      });

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
    });
  });

  describe('listModels()', () => {
    it('should list available models', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2' }, { name: 'mistral' }],
        }),
      });

      const models = await provider.listModels();

      expect(models).toEqual(['llama3.2', 'mistral']);
    });

    it('should return default models on error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const models = await provider.listModels();

      expect(models).toContain('llama3.2');
      expect(models).toContain('mistral');
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
  });

  describe('getModelInfo()', () => {
    it('should return model information', async () => {
      const info = await provider.getModelInfo('llama3.2');

      expect(info.model).toBe('llama3.2');
      expect(info.description).toContain('Llama');
      expect(info.pricing.promptCostPer1k).toBe(0);
    });

    it('should return default description for unknown models', async () => {
      const info = await provider.getModelInfo('unknown-model' as any);

      expect(info.description).toBe('Local Ollama model');
    });
  });
});
