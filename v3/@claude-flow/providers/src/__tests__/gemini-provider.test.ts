/**
 * GeminiProvider Unit Tests
 *
 * Tests for WP07: Gemini-3-Pro Provider Implementation
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from '../gemini-provider.js';

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
    clone: function() { return this; },
    body: data.body ?? null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: data.text ?? (async () => ''),
    json: data.json ?? (async () => ({})),
  } as Response;
};

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    fetchMock.mockReset();
    provider = new GeminiProvider({
      config: {
        provider: 'google',
        model: 'gemini-1.5-pro',
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
      const oldEnv = process.env.GOOGLE_API_KEY;
      process.env.GOOGLE_API_KEY = 'env-api-key';

      const envProvider = new GeminiProvider({
        config: {
          provider: 'google',
          model: 'gemini-1.5-pro',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await envProvider.initialize();
      expect(envProvider['apiKey']).toBe('env-api-key');

      process.env.GOOGLE_API_KEY = oldEnv;
    });

    it('should throw error when no API key is provided', async () => {
      const oldEnv = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const noKeyProvider = new GeminiProvider({
        config: {
          provider: 'google',
          model: 'gemini-1.5-pro',
        },
      });

      await expect(noKeyProvider.initialize()).rejects.toThrow('API key is required');

      process.env.GOOGLE_API_KEY = oldEnv;
    });

    it('should use custom base URL from config', async () => {
      const customProvider = new GeminiProvider({
        config: {
          provider: 'google',
          model: 'gemini-1.5-pro',
          apiKey: 'test-key',
        },
        geminiConfig: {
          baseUrl: 'https://custom.api.com',
        },
      });

      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await customProvider.initialize();
      expect(customProvider['baseUrl']).toBe('https://custom.api.com');
    });

    it('should initialize token budget', async () => {
      // Mock health check
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      const budget = provider.getTokenBudget();

      expect(budget.dailyLimit).toBe(2000000);
      expect(budget.used).toBe(0);
      expect(budget.remaining).toBe(2000000);
      expect(budget.resetAt).toBeInstanceOf(Date);
    });
  });

  describe('generate()', () => {
    it('should generate text from a prompt', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock generate request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello world' }],
                role: 'model',
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        }),
      }));

      await provider.initialize();
      const response = await provider.generate('Hello');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('generateContent'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hello'),
        })
      );
      expect(response.content).toBe('Hello world');
      expect(response.usage.totalTokens).toBe(15);
    });

    it('should pass generation options', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock generate request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Response' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 3,
            totalTokenCount: 8,
          },
        }),
      }));

      await provider.initialize();
      await provider.generate('Test', {
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
        topK: 40,
      });

      const callBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(callBody.generationConfig.temperature).toBe(0.7);
      expect(callBody.generationConfig.maxOutputTokens).toBe(100);
      expect(callBody.generationConfig.topP).toBe(0.9);
      expect(callBody.generationConfig.topK).toBe(40);
    });

    it('should update token budget after generation', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock generate request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Response' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        }),
      }));

      await provider.initialize();
      await provider.generate('Test');

      const budget = provider.getTokenBudget();
      expect(budget.used).toBe(15);
      expect(budget.remaining).toBe(2000000 - 15);
    });
  });

  describe('chat()', () => {
    it('should handle chat messages', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock chat request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'I am fine' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 3,
            totalTokenCount: 8,
          },
        }),
      }));

      await provider.initialize();
      const messages = [{ role: 'user' as const, content: 'How are you?' }];
      const response = await provider.chat(messages);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('generateContent'),
        expect.objectContaining({
          body: expect.stringContaining('How are you?'),
        })
      );
      expect(response.content).toBe('I am fine');
    });

    it('should handle multi-turn conversations', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock chat request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'The weather is nice' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 5,
            totalTokenCount: 20,
          },
        }),
      }));

      await provider.initialize();
      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'What is the weather?' },
      ];
      const response = await provider.chat(messages);

      const callBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(callBody.contents).toHaveLength(3);
      expect(response.content).toBe('The weather is nice');
    });

    it('should handle system messages', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock chat request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Ahoy!' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 8,
            candidatesTokenCount: 2,
            totalTokenCount: 10,
          },
        }),
      }));

      await provider.initialize();
      const messages = [
        { role: 'system' as const, content: 'You are a pirate' },
        { role: 'user' as const, content: 'Hello' },
      ];
      await provider.chat(messages);

      const callBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(callBody.systemInstruction).toBeDefined();
      expect(callBody.systemInstruction.parts[0].text).toBe('You are a pirate');
    });
  });

  describe('generateWithImages()', () => {
    it('should generate with base64 images', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock generateWithImages request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'I see a cat' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 5,
            totalTokenCount: 105,
          },
        }),
      }));

      await provider.initialize();
      const base64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const response = await provider.generateWithImages('What do you see?', [base64Image]);

      expect(response.content).toBe('I see a cat');
      const callBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(callBody.contents[0].parts).toHaveLength(2);
      expect(callBody.contents[0].parts[0].text).toBe('What do you see?');
      expect(callBody.contents[0].parts[1].inlineData).toBeDefined();
    });

    it('should reject image URLs', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      await expect(
        provider.generateWithImages('Describe this', ['https://example.com/image.jpg'])
      ).rejects.toThrow('Image URLs not supported');
    });

    it('should handle multiple images', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock generateWithImages request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Two images' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 200,
            candidatesTokenCount: 3,
            totalTokenCount: 203,
          },
        }),
      }));

      await provider.initialize();
      const images = ['base64image1', 'base64image2'];
      await provider.generateWithImages('Compare', images);

      const callBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(callBody.contents[0].parts).toHaveLength(3); // 1 text + 2 images
    });
  });

  describe('countTokens()', () => {
    it('should count tokens using API', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock countTokens request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({ totalTokens: 42 }),
      }));

      await provider.initialize();
      const count = await provider.countTokens('Hello world, this is a test');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('countTokens'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(count).toBe(42);
    });

    it('should fallback to estimation on API error', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock failed countTokens request
      fetchMock.mockResolvedValueOnce(mockResponse({
        ok: false,
        status: 500,
      }));

      await provider.initialize();
      const count = await provider.countTokens('Hello world');

      // Estimation: ~4 chars per token
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('listModels()', () => {
    it('should list available models from API', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock listModels request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          models: [
            { name: 'models/gemini-1.5-pro', version: '001' },
            { name: 'models/gemini-1.5-flash', version: '001' },
          ],
        }),
      }));

      await provider.initialize();
      const models = await provider.listModels();

      expect(models).toContain('gemini-1.5-pro');
      expect(models).toContain('gemini-1.5-flash');
    });

    it('should return default models on error', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock failed listModels request
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await provider.initialize();
      const models = await provider.listModels();

      expect(models).toContain('gemini-2.0-flash-exp');
      expect(models).toContain('gemini-1.5-pro');
    });
  });

  describe('checkHealth()', () => {
    it('should return healthy when API responds', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();

      // Mock another health check call
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
      const health = await provider.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.details?.budgetRemaining).toBe(2000000);
    });

    it('should return unhealthy when API is down', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();

      // Mock failed health check
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'));
      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Connection refused');
    });

    it('should return unhealthy on HTTP error', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();

      // Mock failed health check
      fetchMock.mockResolvedValueOnce(mockResponse({
        ok: false,
        status: 500,
      }));
      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
    });
  });

  describe('token budget', () => {
    it('should track token usage', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock generate request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Response' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            totalTokenCount: 150,
          },
        }),
      }));

      await provider.initialize();
      await provider.generate('Test');

      const budget = provider.getTokenBudget();
      expect(budget.used).toBe(150);
      expect(budget.remaining).toBe(2000000 - 150);
    });

    it('should reset budget at midnight UTC', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();

      // Manually set budget to simulate past midnight
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      provider['tokenBudget'].resetAt = pastDate;
      provider['tokenBudget'].used = 1000000;

      const newBudget = provider.getTokenBudget();
      expect(newBudget.used).toBe(0);
      expect(newBudget.remaining).toBe(2000000);
    });

    it('should warn when approaching budget limit', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      const warnSpy = vi.spyOn(provider['logger'], 'warn');

      await provider.initialize();

      // Set budget to 85% used
      provider['tokenBudget'].used = 1700000;
      provider['tokenBudget'].remaining = 300000;

      // Mock generate request
      fetchMock.mockResolvedValueOnce(mockResponse({
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Response' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        }),
      }));

      await provider.generate('Test');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('budget warning'),
        expect.anything()
      );
    });
  });

  describe('error handling', () => {
    it('should handle authentication errors', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock the actual request with error
      fetchMock.mockResolvedValueOnce(mockResponse({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
      }));

      await provider.initialize();
      await expect(provider.generate('test')).rejects.toThrow('Invalid API key');
    });

    it('should handle rate limit errors', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock the actual request with error
      fetchMock.mockResolvedValueOnce(mockResponse({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
      }));

      await provider.initialize();
      await expect(provider.generate('test')).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle timeout', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock timeout error
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 100);
          })
      );

      await provider.initialize();
      await expect(provider.generate('test')).rejects.toThrow();
    });

    it('should handle malformed JSON response', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      // Mock malformed JSON
      fetchMock.mockResolvedValueOnce(mockResponse({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      }));

      await provider.initialize();
      await expect(provider.generate('test')).rejects.toThrow();
    });
  });

  describe('getModelInfo()', () => {
    it('should return model information', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      const info = await provider.getModelInfo('gemini-1.5-pro');

      expect(info.model).toBe('gemini-1.5-pro');
      expect(info.description).toContain('Gemini');
      expect(info.contextLength).toBe(2000000);
      expect(info.supportedFeatures).toContain('vision');
    });

    it('should return default description for unknown models', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await provider.initialize();
      const info = await provider.getModelInfo('unknown-model' as any);

      expect(info.description).toBe('Google Gemini model');
    });
  });

  describe('streaming', () => {
    it('should stream responses', async () => {
      // Mock health check during initialize
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}]}\n',
        'data: {"candidates":[{"content":{"parts":[{"text":" world"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3,"totalTokenCount":8}}\n',
        'data: [DONE]\n',
      ];

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[0]) })
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[1]) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      // Mock streaming request
      fetchMock.mockResolvedValueOnce(mockResponse({
        ok: true,
        body: { getReader: () => mockReader },
      }));

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
  });
});
