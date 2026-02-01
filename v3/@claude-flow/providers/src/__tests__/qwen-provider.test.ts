/**
 * QwenProvider Unit Tests
 *
 * Tests for WP08: Qwen-Agent Provider Implementation
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QwenProvider } from '../qwen-provider.js';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('QwenProvider', () => {
  let provider: QwenProvider;

  beforeEach(() => {
    fetchMock.mockReset();
    provider = new QwenProvider({
      config: {
        provider: 'qwen',
        model: 'qwen2.5:7b',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default config (local)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await provider.initialize();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.any(Object));
    });

    it('should use custom host from config', async () => {
      const customProvider = new QwenProvider({
        config: {
          provider: 'qwen',
          model: 'qwen2.5:7b',
          apiUrl: 'http://custom-host:8080',
          host: 'http://custom-host',
          port: 8080,
          useLocal: true,
        } as any,
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await customProvider.initialize();
      expect(fetchMock).toHaveBeenCalledWith('http://custom-host:8080/api/tags', expect.any(Object));
    });

    it('should initialize with DashScope API config', async () => {
      const dashscopeProvider = new QwenProvider({
        config: {
          provider: 'qwen',
          model: 'qwen2.5:7b',
          useLocal: false,
          apiKey: 'test-api-key',
        } as any,
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await dashscopeProvider.initialize();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://dashscope.aliyuncs.com/api/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should warn when Qwen server is not available', async () => {
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
          id: 'test-id',
          message: { content: 'Hello from Qwen', role: 'assistant' },
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
      expect(response.content).toBe('Hello from Qwen');
    });

    it('should pass temperature option', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
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
          id: 'test-id',
          message: { content: 'Response', role: 'assistant' },
          done: true,
        }),
      });

      await provider.generate('Test', { maxTokens: 100 });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.options.max_tokens).toBe(100);
    });
  });

  describe('chat()', () => {
    it('should handle chat messages', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
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
          id: 'test-id',
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
          id: 'test-id',
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

  describe('chatWithTools()', () => {
    it('should handle function calling', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          message: {
            content: '',
            role: 'assistant',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: JSON.stringify({ location: 'San Francisco' }),
                },
              },
            ],
          },
          done: true,
        }),
      });

      const messages = [{ role: 'user' as const, content: 'What is the weather in SF?' }];
      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather for a location',
            parameters: {
              type: 'object' as const,
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
            },
          },
        },
      ];

      const response = await provider.chatWithTools(messages, tools);

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls![0].function.name).toBe('get_weather');
    });

    it('should pass tools in request', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          message: { content: 'Response', role: 'assistant' },
          done: true,
        }),
      });

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'test_tool',
            description: 'Test tool',
            parameters: {
              type: 'object' as const,
              properties: {},
            },
          },
        },
      ];

      await provider.chatWithTools(messages, tools);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.tools).toBeDefined();
      expect(callBody.tools[0].function.name).toBe('test_tool');
    });
  });

  describe('embed()', () => {
    it('should embed a single text (local only)', async () => {
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

    it('should throw error for DashScope API embeddings', async () => {
      const dashscopeProvider = new QwenProvider({
        config: {
          provider: 'qwen',
          model: 'qwen2.5:7b',
          useLocal: false,
        } as any,
      });

      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ models: [] }) });
      await dashscopeProvider.initialize();

      await expect(dashscopeProvider.embed('test')).rejects.toThrow('Embeddings not supported');
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
    it('should pull a model successfully (local only)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      await provider.pullModel('qwen2.5:7b');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/pull',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"qwen2.5:7b"'),
        })
      );
    });

    it('should throw error for DashScope API pull', async () => {
      const dashscopeProvider = new QwenProvider({
        config: {
          provider: 'qwen',
          model: 'qwen2.5:7b',
          useLocal: false,
        } as any,
      });

      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ models: [] }) });
      await dashscopeProvider.initialize();

      await expect(dashscopeProvider.pullModel('qwen2.5:7b')).rejects.toThrow(
        'Model pulling only supported for local deployment'
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
    it('should return healthy when server responds (local)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.details?.server).toBe('qwen');
      expect(health.details?.local).toBe(true);
    });

    it('should return healthy when DashScope API responds', async () => {
      const dashscopeProvider = new QwenProvider({
        config: {
          provider: 'qwen',
          model: 'qwen2.5:7b',
          useLocal: false,
          apiKey: 'test-key',
        } as any,
      });

      // Initialize call
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ models: [] }) });
      await dashscopeProvider.initialize();

      // Health check call
      fetchMock.mockResolvedValueOnce({ ok: true });

      const health = await dashscopeProvider.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.details?.local).toBe(false);
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
    it('should list available models (local)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'qwen2.5:7b' }, { name: 'qwen2.5:14b' }],
        }),
      });

      const models = await provider.listModels();

      expect(models).toEqual(['qwen2.5:7b', 'qwen2.5:14b']);
    });

    it('should list models from DashScope API', async () => {
      const dashscopeProvider = new QwenProvider({
        config: {
          provider: 'qwen',
          model: 'qwen2.5:7b',
          useLocal: false,
          apiKey: 'test-key',
        } as any,
      });

      // Initialize call
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ models: [] }) });
      await dashscopeProvider.initialize();

      // List models call
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'qwen2.5:72b' }],
        }),
      });

      const models = await dashscopeProvider.listModels();

      // Check the second call (after initialize)
      expect(fetchMock).toHaveBeenNthCalledWith(2,
        'https://dashscope.aliyuncs.com/api/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('should return default models on error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const models = await provider.listModels();

      expect(models).toContain('qwen2.5:7b');
      expect(models).toContain('qwen2.5:14b');
      expect(models).toContain('qwen2.5:72b');
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

    it('should handle connection errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 0,
        text: async () => JSON.stringify({ error: 'connection error' }),
      });

      await expect(provider.generate('test')).rejects.toThrow();
    });
  });

  describe('getModelInfo()', () => {
    it('should return model information for qwen2.5:7b', async () => {
      const info = await provider.getModelInfo('qwen2.5:7b');

      expect(info.model).toBe('qwen2.5:7b');
      expect(info.description).toContain('Qwen 2.5 7B');
      expect(info.pricing.promptCostPer1k).toBe(0);
      expect(info.contextLength).toBe(32768);
    });

    it('should return model information for qwen2.5-coder:7b', async () => {
      const info = await provider.getModelInfo('qwen2.5-coder:7b');

      expect(info.model).toBe('qwen2.5-coder:7b');
      expect(info.description).toContain('Code specialist');
      expect(info.supportedFeatures).toContain('tools');
    });

    it('should return default description for unknown models', async () => {
      const info = await provider.getModelInfo('unknown-model' as any);

      expect(info.description).toBe('Qwen 2.5 model');
    });
  });

  describe('streaming', () => {
    it('should support streaming responses', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              JSON.stringify({ message: { content: 'Hello' }, done: false }) + '\n'
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              JSON.stringify({
                message: { content: ' world' },
                done: true,
                prompt_eval_count: 5,
                eval_count: 2,
              }) + '\n'
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const stream = provider.streamComplete({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toHaveLength(3); // 2 content + 1 done
      expect(events[0].type).toBe('content');
      expect(events[0].delta?.content).toBe('Hello');
      expect(events[2].type).toBe('done');
    });
  });
});
