/**
 * OpenRouterProvider Unit Tests
 *
 * Tests for WP09: OpenRouter Provider Implementation
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from '../openrouter-provider.js';

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
  headers?: Record<string, string>;
}): Response => {
  const headers = new Headers(data.headers || {});
  return {
    ok: data.ok ?? true,
    status: data.status ?? 200,
    statusText: 'OK',
    headers,
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

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    fetchMock.mockReset();
    provider = new OpenRouterProvider({
      config: {
        provider: 'openrouter',
        model: 'anthropic/claude-3-opus',
        apiKey: 'test-api-key',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with API key from config', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      expect(provider['apiKey']).toBe('test-api-key');
    });

    it('should initialize with API key from env var', async () => {
      const oldEnv = process.env.OPENROUTER_API_KEY;
      process.env.OPENROUTER_API_KEY = 'env-api-key';

      const envProvider = new OpenRouterProvider({
        config: {
          provider: 'openrouter',
          model: 'anthropic/claude-3-opus',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await envProvider.initialize();
      expect(envProvider['apiKey']).toBe('env-api-key');

      process.env.OPENROUTER_API_KEY = oldEnv;
    });

    it('should throw error when no API key is provided', async () => {
      const oldEnv = process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      const noKeyProvider = new OpenRouterProvider({
        config: {
          provider: 'openrouter',
          model: 'anthropic/claude-3-opus',
        },
      });

      await expect(noKeyProvider.initialize()).rejects.toThrow('API key is required');

      process.env.OPENROUTER_API_KEY = oldEnv;
    });

    it('should use custom base URL from config', async () => {
      const customProvider = new OpenRouterProvider({
        config: {
          provider: 'openrouter',
          model: 'anthropic/claude-3-opus',
          apiKey: 'test-key',
        },
        openRouterConfig: {
          provider: 'openrouter',
          model: 'anthropic/claude-3-opus',
          baseUrl: 'https://custom.openrouter.com',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await customProvider.initialize();
      expect(customProvider['baseUrl']).toBe('https://custom.openrouter.com');
    });

    it('should set HTTP-Referer and X-Title headers', async () => {
      const headerProvider = new OpenRouterProvider({
        config: {
          provider: 'openrouter',
          model: 'anthropic/claude-3-opus',
          apiKey: 'test-key',
        },
        openRouterConfig: {
          provider: 'openrouter',
          model: 'anthropic/claude-3-opus',
          siteUrl: 'https://example.com',
          siteName: 'My App',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock completion request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            model: 'anthropic/claude-3-opus',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello' },
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

      await headerProvider.initialize();
      await headerProvider.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      const headers = fetchMock.mock.calls[1][1].headers;
      expect(headers['HTTP-Referer']).toBe('https://example.com');
      expect(headers['X-Title']).toBe('My App');
    });
  });

  describe('complete()', () => {
    it('should complete a basic request', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock completion request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            model: 'anthropic/claude-3-opus',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello world' },
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

      await provider.initialize();
      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.content).toBe('Hello world');
      expect(response.usage.totalTokens).toBe(15);
      expect(response.provider).toBe('openrouter');
    });

    it('should route to different models', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock GPT-4 request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'gpt4-id',
            model: 'openai/gpt-4-turbo',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'GPT-4 response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 8,
              completion_tokens: 4,
              total_tokens: 12,
            },
          }),
        })
      );

      await provider.initialize();
      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'openai/gpt-4-turbo',
      });

      expect(response.model).toBe('openai/gpt-4-turbo');
      expect(response.content).toBe('GPT-4 response');
    });

    it('should pass generation parameters', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock completion request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            model: 'anthropic/claude-3-opus',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 3,
              total_tokens: 8,
            },
          }),
        })
      );

      await provider.initialize();
      await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.3,
      });

      const callBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(callBody.temperature).toBe(0.7);
      expect(callBody.max_tokens).toBe(100);
      expect(callBody.top_p).toBe(0.9);
      expect(callBody.frequency_penalty).toBe(0.5);
      expect(callBody.presence_penalty).toBe(0.3);
    });

    it('should handle tool calls', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock completion with tool calls
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            model: 'anthropic/claude-3-opus',
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
                        arguments: '{"location":"Paris"}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
              total_tokens: 30,
            },
          }),
        })
      );

      await provider.initialize();
      const response = await provider.complete({
        messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for location',
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
      });

      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].function.name).toBe('get_weather');
      expect(response.finishReason).toBe('tool_calls');
    });

    it('should calculate cost correctly', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock completion request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            model: 'anthropic/claude-3-opus',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 500,
              total_tokens: 1500,
            },
          }),
        })
      );

      await provider.initialize();
      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      // Claude 3 Opus pricing: $0.015/1K prompt, $0.075/1K completion
      expect(response.cost?.promptCost).toBeCloseTo(0.015);
      expect(response.cost?.completionCost).toBeCloseTo(0.0375);
      expect(response.cost?.totalCost).toBeCloseTo(0.0525);
    });
  });

  describe('streamComplete()', () => {
    it('should stream responses', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      const chunks = [
        'data: {"id":"test","model":"anthropic/claude-3-opus","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n',
        'data: {"id":"test","model":"anthropic/claude-3-opus","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n',
        'data: {"id":"test","model":"anthropic/claude-3-opus","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}\n',
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

      // Mock streaming request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          body: { getReader: () => mockReader },
        })
      );

      await provider.initialize();
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
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      const chunks = [
        'data: {"id":"test","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}\n',
        'data: {"id":"test","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\":\\"Paris\\"}"}}]},"finish_reason":null}]}\n',
        'data: {"id":"test","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n',
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

      await provider.initialize();
      const stream = provider.streamComplete({
        messages: [{ role: 'user', content: 'test' }],
      });

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events.some((e) => e.type === 'tool_call')).toBe(true);
      expect(events.some((e) => e.type === 'done')).toBe(true);
    });
  });

  describe('listModels()', () => {
    it('should list available models from API', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock listModels request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            data: [
              {
                id: 'anthropic/claude-3-opus',
                name: 'Claude 3 Opus',
                description: 'Most capable Claude model',
                contextLength: 200000,
                pricing: { prompt: 0.000015, completion: 0.000075 },
                topProvider: {
                  contextLength: 200000,
                  maxCompletionTokens: 4096,
                  isModerated: false,
                },
                created: Date.now(),
                object: 'model',
              },
              {
                id: 'openai/gpt-4-turbo',
                name: 'GPT-4 Turbo',
                description: 'Latest GPT-4 model',
                contextLength: 128000,
                pricing: { prompt: 0.00001, completion: 0.00003 },
                topProvider: {
                  contextLength: 128000,
                  maxCompletionTokens: 4096,
                  isModerated: true,
                },
                created: Date.now(),
                object: 'model',
              },
            ],
          }),
        })
      );

      await provider.initialize();
      const models = await provider.listModels();

      expect(models).toContain('anthropic/claude-3-opus');
      expect(models).toContain('openai/gpt-4-turbo');
    });

    it('should return default models on error', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock failed listModels request
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await provider.initialize();
      const models = await provider.listModels();

      expect(models).toContain('anthropic/claude-3-opus');
      expect(models).toContain('openai/gpt-4-turbo');
    });
  });

  describe('getModelInfo()', () => {
    it('should return cached model info', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();

      // Add model to cache
      provider['modelCache'].set('anthropic/claude-3-opus', {
        id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        description: 'Most capable Claude model',
        contextLength: 200000,
        pricing: { prompt: 0.000015, completion: 0.000075 },
        topProvider: {
          contextLength: 200000,
          maxCompletionTokens: 4096,
          isModerated: false,
        },
        created: Date.now(),
        object: 'model',
      });

      const info = await provider.getModelInfo('anthropic/claude-3-opus');

      expect(info.model).toBe('anthropic/claude-3-opus');
      expect(info.name).toBe('Claude 3 Opus');
      expect(info.contextLength).toBe(200000);
    });

    it('should return fallback info for uncached models', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      const info = await provider.getModelInfo('unknown/model' as any);

      expect(info.model).toBe('unknown/model');
      expect(info.description).toContain('OpenRouter model');
    });
  });

  describe('validateModel()', () => {
    it('should validate supported models', () => {
      expect(provider.validateModel('anthropic/claude-3-opus')).toBe(true);
      expect(provider.validateModel('openai/gpt-4-turbo')).toBe(true);
    });

    it('should validate models with provider prefix', () => {
      expect(provider.validateModel('custom/model-name' as any)).toBe(true);
    });

    it('should reject invalid model formats', () => {
      expect(provider.validateModel('invalid-model-name' as any)).toBe(false);
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy when API responds', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          headers: {
            'x-ratelimit-remaining': '100',
            'x-ratelimit-reset': String(Date.now() / 1000 + 3600),
          },
        })
      );

      await provider.initialize();

      // Mock another health check call
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          headers: {
            'x-ratelimit-remaining': '100',
            'x-ratelimit-reset': String(Date.now() / 1000 + 3600),
          },
        })
      );
      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.details?.rateLimitRemaining).toBe(100);
    });

    it('should return unhealthy when API is down', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();

      // Mock failed health check
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'));
      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Connection refused');
    });

    it('should return unhealthy on HTTP error', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();

      // Mock failed health check
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

  describe('rate limiting', () => {
    it('should track rate limit info from headers', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock completion with rate limit headers
      const resetTime = Date.now() / 1000 + 3600;
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            model: 'anthropic/claude-3-opus',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
          headers: {
            'x-ratelimit-remaining': '42',
            'x-ratelimit-reset': String(resetTime),
          },
        })
      );

      await provider.initialize();
      await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(provider['rateLimitRemaining']).toBe(42);
      expect(provider['rateLimitReset']).toBeInstanceOf(Date);
    });
  });

  describe('cost tracking', () => {
    it('should track costs per model', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock completion request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            model: 'anthropic/claude-3-opus',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 500,
              total_tokens: 1500,
            },
          }),
        })
      );

      await provider.initialize();
      await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      const costs = provider.getAllCosts();
      expect(costs.length).toBe(1);
      expect(costs[0].model).toBe('anthropic/claude-3-opus');
      expect(costs[0].promptCost).toBeGreaterThan(0);
    });

    it('should accumulate costs for the same model', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock first completion
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-1',
            model: 'anthropic/claude-3-opus',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response 1' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          }),
        })
      );

      // Mock second completion
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-2',
            model: 'anthropic/claude-3-opus',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response 2' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 200,
              completion_tokens: 100,
              total_tokens: 300,
            },
          }),
        })
      );

      await provider.initialize();
      await provider.complete({
        messages: [{ role: 'user', content: 'test 1' }],
      });
      await provider.complete({
        messages: [{ role: 'user', content: 'test 2' }],
      });

      const modelCost = provider.getModelCost('anthropic/claude-3-opus');
      expect(modelCost).toBeDefined();
      // Should accumulate costs from both requests
      expect(modelCost!.promptCost).toBeCloseTo(0.0045); // (100+200)/1000 * 0.015
    });
  });

  describe('error handling', () => {
    it('should handle authentication errors', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock 401 error
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
        })
      );

      await provider.initialize();
      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Invalid API key');
    });

    it('should handle rate limit errors', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock 429 error
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 429,
          text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
          headers: {
            'retry-after': '60',
          },
        })
      );

      await provider.initialize();
      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle model not found errors', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock 404 error
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ error: { message: 'Model not found' } }),
        })
      );

      await provider.initialize();
      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Model');
    });

    it('should handle 500 server errors', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock 500 error
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: { message: 'Internal server error' } }),
        })
      );

      await provider.initialize();
      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Internal server error');
    });

    it('should handle 503 service unavailable errors', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock 503 error
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 503,
          text: async () => JSON.stringify({ error: { message: 'Service unavailable' } }),
        })
      );

      await provider.initialize();
      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('unavailable');
    });

    it('should handle timeout', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock timeout error
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 100);
          })
      );

      await provider.initialize();
      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow();
    });

    it('should handle malformed JSON response', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock malformed JSON
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          },
        })
      );

      await provider.initialize();
      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow();
    });
  });

  describe('fallback models', () => {
    it('should configure fallback models', async () => {
      const fallbackProvider = new OpenRouterProvider({
        config: {
          provider: 'openrouter',
          model: 'anthropic/claude-3-opus',
          apiKey: 'test-key',
        },
        openRouterConfig: {
          provider: 'openrouter',
          model: 'anthropic/claude-3-opus',
          fallbackModels: ['anthropic/claude-3-sonnet', 'openai/gpt-4-turbo'],
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock completion request
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          json: async () => ({
            id: 'test-id',
            model: 'anthropic/claude-3-opus',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
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

      await fallbackProvider.initialize();
      await fallbackProvider.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      const callBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(callBody.provider.order).toEqual([
        'anthropic/claude-3-opus',
        'anthropic/claude-3-sonnet',
        'openai/gpt-4-turbo',
      ]);
      expect(callBody.provider.allow_fallbacks).toBe(true);
    });
  });

  describe('estimateCost()', () => {
    it('should estimate cost for a request', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      const estimate = await provider.estimateCost({
        messages: [{ role: 'user', content: 'Hello world, how are you today?' }],
        maxTokens: 500,
      });

      expect(estimate.estimatedPromptTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCompletionTokens).toBe(500);
      expect(estimate.estimatedCost.total).toBeGreaterThan(0);
      expect(estimate.confidence).toBe(0.8);
    });

    it('should use cached pricing when available', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();

      // Add model to cache with custom pricing
      provider['modelCache'].set('custom/model', {
        id: 'custom/model',
        name: 'Custom Model',
        description: 'Test',
        contextLength: 100000,
        pricing: { prompt: 0.00001, completion: 0.00002 },
        topProvider: {
          contextLength: 100000,
          maxCompletionTokens: 4096,
          isModerated: false,
        },
        created: Date.now(),
        object: 'model',
      });

      const estimate = await provider.estimateCost({
        messages: [{ role: 'user', content: 'test' }],
        model: 'custom/model',
        maxTokens: 1000,
      });

      expect(estimate.estimatedCost.total).toBeGreaterThan(0);
    });
  });
});
