/**
 * LiteLLMProvider Unit Tests
 *
 * Tests for WP10: LiteLLM Provider Implementation
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiteLLMProvider } from '../litellm-provider.js';
import { LiteLLMConfig } from '../litellm-types.js';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Helper to create a proper Response mock
const mockResponse = (data: {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  body?: unknown;
}): Response => {
  return {
    ok: data.ok ?? true,
    status: data.status ?? 200,
    statusText: 'OK',
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: function () {
      return this;
    },
    body: data.body ?? null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: data.text ?? (async () => ''),
    json: data.json ?? (async () => ({})),
  } as Response;
};

describe('LiteLLMProvider', () => {
  let provider: LiteLLMProvider;

  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with hosted API', async () => {
      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
          apiKey: 'test-api-key',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      expect(provider['apiKey']).toBe('test-api-key');
      expect(provider['baseUrl']).toBe('https://api.litellm.ai');
    });

    it('should initialize with self-hosted proxy', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'claude-3-opus-20240229',
        proxy: {
          url: 'http://localhost:4000',
          apiKey: 'proxy-key',
        },
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      expect(provider['apiKey']).toBe('proxy-key');
      expect(provider['baseUrl']).toBe('http://localhost:4000');
    });

    it('should initialize with API key from env var', async () => {
      const oldEnv = process.env.LITELLM_API_KEY;
      process.env.LITELLM_API_KEY = 'env-api-key';

      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      expect(provider['apiKey']).toBe('env-api-key');

      process.env.LITELLM_API_KEY = oldEnv;
    });

    it('should throw error when no API key is provided', async () => {
      const oldEnv = process.env.LITELLM_API_KEY;
      delete process.env.LITELLM_API_KEY;

      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
        },
      });

      await expect(provider.initialize()).rejects.toThrow('API key is required');

      process.env.LITELLM_API_KEY = oldEnv;
    });

    it('should initialize with cache enabled', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        cacheConfig: {
          enabled: true,
          ttl: 300,
          maxSize: 100,
        },
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      expect(provider['cache']).toBeDefined();
    });

    it('should initialize budget tracking', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        budget: {
          dailyLimit: 50,
          monthlyLimit: 1000,
        },
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      const budget = provider.getBudget();

      expect(budget.dailyLimit).toBe(50);
      expect(budget.monthlyLimit).toBe(1000);
      expect(budget.currentSpend?.daily).toBe(0);
    });
  });

  describe('model resolution', () => {
    beforeEach(async () => {
      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
          apiKey: 'test-key',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();
    });

    it('should use model mapping when configured', async () => {
      const mappedProvider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'claude-opus',
          apiKey: 'test-key',
        },
        litellmConfig: {
          provider: 'litellm',
          model: 'claude-opus',
          modelMapping: {
            'claude-opus': 'anthropic/claude-3-opus-20240229',
          },
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'anthropic/claude-3-opus-20240229',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Hello',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
        })
      );

      await mappedProvider.initialize();
      await mappedProvider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const completionCall = fetchMock.mock.calls.find(call =>
        call[0]?.toString().includes('/chat/completions')
      );
      expect(completionCall).toBeDefined();
      const requestBody = JSON.parse(completionCall![1].body);
      expect(requestBody.model).toBe('anthropic/claude-3-opus-20240229');
    });

    it('should auto-prefix Claude models', async () => {
      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'claude-3-opus-20240229',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'claude-3-opus-20240229',
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(requestBody.model).toBe('anthropic/claude-3-opus-20240229');
    });

    it('should auto-prefix OpenAI models', async () => {
      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-4o',
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(requestBody.model).toBe('openai/gpt-4o');
    });

    it('should auto-prefix Gemini models', async () => {
      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gemini-1.5-pro',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gemini-1.5-pro',
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(requestBody.model).toBe('google/gemini-1.5-pro');
    });

    it('should not modify models with provider prefix', async () => {
      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'custom/my-model',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'custom/my-model',
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(requestBody.model).toBe('custom/my-model');
    });
  });

  describe('complete()', () => {
    beforeEach(async () => {
      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
          apiKey: 'test-key',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();
    });

    it('should complete a request', async () => {
      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1677652288,
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Hello! How can I help you?',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 8,
              total_tokens: 18,
            },
          }),
        })
      );

      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.content).toBe('Hello! How can I help you?');
      expect(response.usage.totalTokens).toBe(18);
      expect(response.provider).toBe('litellm');
    });

    it('should pass generation parameters', async () => {
      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
        stopSequences: ['STOP'],
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(requestBody.temperature).toBe(0.7);
      expect(requestBody.max_tokens).toBe(100);
      expect(requestBody.top_p).toBe(0.9);
      expect(requestBody.frequency_penalty).toBe(0.5);
      expect(requestBody.presence_penalty).toBe(0.5);
      expect(requestBody.stop).toEqual(['STOP']);
    });

    it('should handle tool calls', async () => {
      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_123',
                      type: 'function',
                      function: {
                        name: 'get_weather',
                        arguments: '{"location":"London"}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          }),
        })
      );

      const response = await provider.complete({
        messages: [{ role: 'user', content: 'What is the weather in London?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          },
        ],
        toolChoice: 'auto',
      });

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls![0].function.name).toBe('get_weather');
      expect(response.finishReason).toBe('tool_calls');
    });

    it('should calculate cost correctly', async () => {
      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
          }),
        })
      );

      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(response.cost).toBeDefined();
      expect(response.cost!.promptCost).toBe((1000 / 1000) * 0.005);
      expect(response.cost!.completionCost).toBe((500 / 1000) * 0.015);
      expect(response.cost!.totalCost).toBe(
        (1000 / 1000) * 0.005 + (500 / 1000) * 0.015
      );
    });

    it('should update budget after request', async () => {
      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      const budget = provider.getBudget();
      expect(budget.currentSpend!.daily).toBeGreaterThan(0);
    });
  });

  describe('fallback chain', () => {
    it('should try fallback models on primary failure', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        fallbackChain: ['gpt-4-turbo', 'gpt-3.5-turbo'],
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();

      // Mock primary model failure
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 503,
          text: async () => JSON.stringify({ error: { message: 'Service unavailable' } }),
        })
      );

      // Mock successful fallback
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4-turbo',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Fallback response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        })
      );

      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(response.content).toBe('Fallback response');
      expect(fetchMock).toHaveBeenCalledTimes(3); // health + primary + fallback
    });

    it('should throw error when all fallbacks fail', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        fallbackChain: ['gpt-4-turbo'],
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();

      // Mock all failures
      fetchMock.mockResolvedValue(
        mockResponse({
          ok: false,
          status: 503,
          text: async () => JSON.stringify({ error: { message: 'Service unavailable' } }),
        })
      );

      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow();
    });
  });

  describe('caching', () => {
    beforeEach(async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        cacheConfig: {
          enabled: true,
          ttl: 300,
          maxSize: 10,
        },
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();
    });

    it('should cache responses', async () => {
      // Mock first request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Cached response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        })
      );

      const request = {
        messages: [{ role: 'user' as const, content: 'Test' }],
      };

      const response1 = await provider.complete(request);
      const response2 = await provider.complete(request);

      expect(response1.content).toBe('Cached response');
      expect(response2.content).toBe('Cached response');
      expect(fetchMock).toHaveBeenCalledTimes(2); // health + 1 request (second is cached)
    });

    it('should clear cache', async () => {
      provider.clearCache();
      expect(provider['cache'].size).toBe(0);
    });

    it('should respect max cache size', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        cacheConfig: {
          enabled: true,
          ttl: 300,
          maxSize: 2,
        },
      };

      const smallCacheProvider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await smallCacheProvider.initialize();

      // Mock responses for multiple requests
      for (let i = 0; i < 3; i++) {
        fetchMock.mockResolvedValueOnce(
          mockResponse({
            json: async () => ({
              id: `test-id-${i}`,
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-4o',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: `Response ${i}` },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }),
          })
        );
      }

      await smallCacheProvider.complete({
        messages: [{ role: 'user', content: 'Test 1' }],
      });
      await smallCacheProvider.complete({
        messages: [{ role: 'user', content: 'Test 2' }],
      });
      await smallCacheProvider.complete({
        messages: [{ role: 'user', content: 'Test 3' }],
      });

      expect(smallCacheProvider['cache'].size).toBeLessThanOrEqual(2);
    });
  });

  describe('budget tracking', () => {
    it('should track daily spend', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        budget: {
          dailyLimit: 1.0,
          monthlyLimit: 10.0,
        },
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();

      // Mock request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1000, completion_tokens: 1000, total_tokens: 2000 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      const budget = provider.getBudget();
      expect(budget.currentSpend!.daily).toBeGreaterThan(0);
    });

    it('should throw error when daily limit exceeded', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        budget: {
          dailyLimit: 0.001,
        },
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();

      // Set current spend to exceed limit
      provider['budget'].currentSpend!.daily = 0.002;

      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow('Daily budget limit exceeded');
    });

    it('should warn when approaching budget threshold', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        budget: {
          dailyLimit: 1.0,
          warningThreshold: 0.8,
        },
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();

      const warnSpy = vi.spyOn(provider['logger'], 'warn');

      // Set spend to 85%
      provider['budget'].currentSpend!.daily = 0.85;

      // Mock request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Budget warning'),
        expect.anything()
      );
    });
  });

  describe('streaming', () => {
    beforeEach(async () => {
      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
          apiKey: 'test-key',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();
    });

    it('should stream responses', async () => {
      const chunks = [
        'data: {"id":"test","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}\n',
        'data: {"id":"test","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" world"}}]}\n',
        'data: {"id":"test","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}\n',
        'data: [DONE]\n',
      ];

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[0]) })
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[1]) })
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[2]) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          body: { getReader: () => mockReader },
        })
      );

      const stream = provider.streamComplete({
        messages: [{ role: 'user', content: 'test' }],
      });

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events.some((e) => e.type === 'content' && e.delta?.content === 'Hello')).toBe(true);
      expect(events.some((e) => e.type === 'content' && e.delta?.content === ' world')).toBe(true);
      expect(events.some((e) => e.type === 'done')).toBe(true);
    });

    it('should handle streaming tool calls', async () => {
      const chunks = [
        'data: {"id":"test","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather"}}]}}]}\n',
        'data: {"id":"test","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\":\\"London\\"}"}}]}}]}\n',
        'data: [DONE]\n',
      ];

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[0]) })
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[1]) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          body: { getReader: () => mockReader },
        })
      );

      const stream = provider.streamComplete({
        messages: [{ role: 'user', content: 'test' }],
      });

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
          apiKey: 'test-key',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();
    });

    it('should handle authentication errors', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
        })
      );

      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Invalid API key');
    });

    it('should handle rate limit errors', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 429,
          text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
        })
      );

      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle model not found errors', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ error: { message: 'Model not found' } }),
        })
      );

      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow();
    });

    it('should handle timeout', async () => {
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 100);
          })
      );

      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow();
    });

    it('should handle malformed JSON response', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          },
        })
      );

      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow();
    });
  });

  describe('listModels()', () => {
    beforeEach(async () => {
      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
          apiKey: 'test-key',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();
    });

    it('should list available models from API', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            data: [
              { id: 'gpt-4o', object: 'model', created: 1686935002, owned_by: 'openai' },
              { id: 'gpt-4-turbo', object: 'model', created: 1686935002, owned_by: 'openai' },
            ],
          }),
        })
      );

      const models = await provider.listModels();

      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4-turbo');
    });

    it('should return default models on error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const models = await provider.listModels();

      expect(models).toContain('gpt-4o');
      expect(models).toContain('claude-3-5-sonnet-20241022');
    });
  });

  describe('getModelInfo()', () => {
    beforeEach(async () => {
      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
          apiKey: 'test-key',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();
    });

    it('should return model information', async () => {
      const info = await provider.getModelInfo('gpt-4o');

      expect(info.model).toBe('gpt-4o');
      expect(info.description).toContain('LiteLLM');
      expect(info.contextLength).toBeGreaterThan(0);
      expect(info.supportedFeatures).toContain('streaming');
    });
  });

  describe('healthCheck()', () => {
    beforeEach(async () => {
      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
          apiKey: 'test-key',
        },
      });

      // Mock initial health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();
    });

    it('should return healthy when API responds', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.details?.budgetRemaining).toBeDefined();
    });

    it('should return unhealthy when API is down', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Connection refused');
    });

    it('should return unhealthy on HTTP error', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 500,
        })
      );

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
    });
  });

  describe('custom headers', () => {
    it('should add custom headers to requests', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        customHeaders: {
          'X-Custom-Header': 'custom-value',
        },
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();

      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      const headers = fetchMock.mock.calls[1][1].headers;
      expect(headers['X-Custom-Header']).toBe('custom-value');
    });
  });

  describe('virtual key', () => {
    it('should add virtual key header for multi-tenant proxy', async () => {
      const config: LiteLLMConfig = {
        provider: 'litellm',
        model: 'gpt-4o',
        apiKey: 'test-key',
        proxy: {
          url: 'http://localhost:4000',
          virtualKey: 'tenant-key-123',
        },
      };

      provider = new LiteLLMProvider({
        config,
        litellmConfig: config,
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();

      // Mock complete request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        })
      );

      await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      const headers = fetchMock.mock.calls[1][1].headers;
      expect(headers['X-LiteLLM-Virtual-Key']).toBe('tenant-key-123');
    });
  });

  describe('destroy()', () => {
    it('should cleanup resources', async () => {
      provider = new LiteLLMProvider({
        config: {
          provider: 'litellm',
          model: 'gpt-4o',
          apiKey: 'test-key',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      await provider.initialize();

      provider.destroy();

      expect(provider['cache'].size).toBe(0);
    });
  });
});
