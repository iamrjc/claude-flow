/**
 * WP12: Provider Integration Tests
 *
 * Tests cross-provider functionality:
 * - All providers implement ILLMProvider correctly
 * - Provider switching mid-session
 * - Failover from one provider to another
 * - Consistent response format across providers
 * - Tool calling compatibility
 * - Streaming consistency
 *
 * @module @claude-flow/providers/__tests__/integration/provider-integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ILLMProvider,
  ProviderCapabilities,
  isLLMResponse,
  isLLMStreamEvent,
} from '../../types.js';
import { ProviderManager } from '../../provider-manager.js';
import {
  MockProvider,
  createTestRequest,
  collectStreamEvents,
  Timer,
  TestLogger,
  silentLogger,
} from '../test-helpers.js';

describe('Provider Integration Tests', () => {
  describe('ILLMProvider Interface Compliance', () => {
    it('should implement all required interface methods', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      // Core methods
      expect(typeof provider.complete).toBe('function');
      expect(typeof provider.streamComplete).toBe('function');

      // Model management
      expect(typeof provider.listModels).toBe('function');
      expect(typeof provider.getModelInfo).toBe('function');
      expect(typeof provider.validateModel).toBe('function');

      // Health and status
      expect(typeof provider.healthCheck).toBe('function');
      expect(typeof provider.getStatus).toBe('function');

      // Cost management
      expect(typeof provider.estimateCost).toBe('function');
      expect(typeof provider.getUsage).toBe('function');

      // Cleanup
      expect(typeof provider.destroy).toBe('function');

      provider.destroy();
    });

    it('should have required properties', async () => {
      const provider = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });

      await provider.initialize();

      expect(provider.name).toBe('openai');
      expect(provider.capabilities).toBeDefined();
      expect(provider.config).toBeDefined();

      // Capabilities structure
      expect(Array.isArray(provider.capabilities.supportedModels)).toBe(true);
      expect(typeof provider.capabilities.maxContextLength).toBe('object');
      expect(typeof provider.capabilities.supportsStreaming).toBe('boolean');
      expect(typeof provider.capabilities.pricing).toBe('object');

      provider.destroy();
    });

    it('should emit events on completion', async () => {
      const provider = new MockProvider('google', {
        supportedModels: ['gemini-2.0-flash'],
      });

      await provider.initialize();

      const responseEvent = vi.fn();
      provider.on('response', responseEvent);

      await provider.complete(createTestRequest());

      expect(responseEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          latency: expect.any(Number),
          tokens: expect.any(Number),
        })
      );

      provider.destroy();
    });

    it('should emit events on errors', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const errorEvent = vi.fn();
      provider.on('error', errorEvent);

      provider.setMockError(new Error('Test error'));

      await expect(provider.complete(createTestRequest())).rejects.toThrow('Test error');

      expect(errorEvent).toHaveBeenCalled();

      provider.destroy();
    });
  });

  describe('Provider Switching Mid-Session', () => {
    it('should switch between providers seamlessly', async () => {
      const anthropic = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });
      const openai = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });

      await anthropic.initialize();
      await openai.initialize();

      anthropic.setMockResponse({
        content: 'Response from Anthropic',
        provider: 'anthropic',
      });

      openai.setMockResponse({
        content: 'Response from OpenAI',
        provider: 'openai',
      });

      // First request to Anthropic
      const response1 = await anthropic.complete(createTestRequest());
      expect(response1.provider).toBe('anthropic');
      expect(response1.content).toBe('Response from Anthropic');

      // Switch to OpenAI
      const response2 = await openai.complete(createTestRequest());
      expect(response2.provider).toBe('openai');
      expect(response2.content).toBe('Response from OpenAI');

      // Back to Anthropic
      const response3 = await anthropic.complete(createTestRequest());
      expect(response3.provider).toBe('anthropic');

      anthropic.destroy();
      openai.destroy();
    });

    it('should maintain separate state per provider', async () => {
      const provider1 = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });
      const provider2 = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });

      await provider1.initialize();
      await provider2.initialize();

      // Make requests to both
      await provider1.complete(createTestRequest());
      await provider2.complete(createTestRequest());

      const usage1 = await provider1.getUsage();
      const usage2 = await provider2.getUsage();

      // Each provider tracks its own usage
      expect(usage1.requests).toBe(1);
      expect(usage2.requests).toBe(1);

      provider1.destroy();
      provider2.destroy();
    });
  });

  describe('Automatic Failover', () => {
    it('should failover to secondary provider on primary failure', async () => {
      const primary = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });
      const secondary = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });

      await primary.initialize();
      await secondary.initialize();

      const manager = new ProviderManager(
        {
          providers: [
            {
              provider: 'anthropic',
              model: 'claude-3-5-sonnet-latest',
            },
            {
              provider: 'openai',
              model: 'gpt-4o',
            },
          ],
          fallback: {
            enabled: true,
            maxAttempts: 2,
          },
        },
        silentLogger
      );

      // Inject our mock providers
      (manager as any).providers.set('anthropic', primary);
      (manager as any).providers.set('openai', secondary);

      // Primary fails
      primary.setMockError(new Error('Primary provider failed'));

      // Secondary succeeds
      secondary.setMockResponse({
        content: 'Fallback response',
        provider: 'openai',
      });

      const response = await manager.complete(createTestRequest());

      expect(response.provider).toBe('openai');
      expect(response.content).toBe('Fallback response');

      manager.destroy();
      primary.destroy();
      secondary.destroy();
    });

    it('should try all providers before failing', async () => {
      const p1 = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });
      const p2 = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });
      const p3 = new MockProvider('google', {
        supportedModels: ['gemini-2.0-flash'],
      });

      await p1.initialize();
      await p2.initialize();
      await p3.initialize();

      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
            { provider: 'openai', model: 'gpt-4o' },
            { provider: 'google', model: 'gemini-2.0-flash' },
          ],
          fallback: {
            enabled: true,
            maxAttempts: 3,
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', p1);
      (manager as any).providers.set('openai', p2);
      (manager as any).providers.set('google', p3);

      // First two fail
      p1.setMockError(new Error('Provider 1 failed'));
      p2.setMockError(new Error('Provider 2 failed'));

      // Third succeeds
      p3.setMockResponse({
        content: 'Success on third try',
        provider: 'google',
      });

      const response = await manager.complete(createTestRequest());

      expect(response.provider).toBe('google');
      expect(response.content).toBe('Success on third try');

      manager.destroy();
      p1.destroy();
      p2.destroy();
      p3.destroy();
    });

    it('should track failover metrics', async () => {
      const primary = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });
      const secondary = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });

      await primary.initialize();
      await secondary.initialize();

      const logger = new TestLogger();
      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
            { provider: 'openai', model: 'gpt-4o' },
          ],
          fallback: {
            enabled: true,
            maxAttempts: 2,
          },
        },
        logger
      );

      (manager as any).providers.set('anthropic', primary);
      (manager as any).providers.set('openai', secondary);

      primary.setMockError(new Error('Primary failed'));
      secondary.setMockResponse({ content: 'Fallback' });

      await manager.complete(createTestRequest());

      // Verify logging captured failover
      expect(logger.findLog('warn', 'failed')).toBe(true);

      manager.destroy();
      primary.destroy();
      secondary.destroy();
    });
  });

  describe('Consistent Response Format', () => {
    it('should return consistent response structure across providers', async () => {
      const providers = [
        new MockProvider('anthropic', { supportedModels: ['claude-3-5-sonnet-latest'] }),
        new MockProvider('openai', { supportedModels: ['gpt-4o'] }),
        new MockProvider('google', { supportedModels: ['gemini-2.0-flash'] }),
      ];

      await Promise.all(providers.map((p) => p.initialize()));

      const responses = await Promise.all(
        providers.map((p) => p.complete(createTestRequest()))
      );

      // All responses should have same structure
      responses.forEach((response) => {
        expect(isLLMResponse(response)).toBe(true);
        expect(response).toHaveProperty('id');
        expect(response).toHaveProperty('model');
        expect(response).toHaveProperty('provider');
        expect(response).toHaveProperty('content');
        expect(response).toHaveProperty('usage');
        expect(response).toHaveProperty('cost');

        // Usage structure
        expect(response.usage).toHaveProperty('promptTokens');
        expect(response.usage).toHaveProperty('completionTokens');
        expect(response.usage).toHaveProperty('totalTokens');

        // Cost structure
        expect(response.cost).toHaveProperty('promptCost');
        expect(response.cost).toHaveProperty('completionCost');
        expect(response.cost).toHaveProperty('totalCost');
        expect(response.cost).toHaveProperty('currency');
      });

      providers.forEach((p) => p.destroy());
    });

    it('should normalize errors consistently', async () => {
      const providers = [
        new MockProvider('anthropic', { supportedModels: ['claude-3-5-sonnet-latest'] }),
        new MockProvider('openai', { supportedModels: ['gpt-4o'] }),
      ];

      await Promise.all(providers.map((p) => p.initialize()));

      providers.forEach((p) => p.setMockError(new Error('Test error')));

      const errors = await Promise.all(
        providers.map((p) =>
          p.complete(createTestRequest()).catch((err) => err)
        )
      );

      // All errors should have consistent structure
      errors.forEach((error) => {
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('code');
        expect(error).toHaveProperty('provider');
        expect(error).toHaveProperty('retryable');
      });

      providers.forEach((p) => p.destroy());
    });
  });

  describe('Tool Calling Compatibility', () => {
    it('should support tool calling when provider supports it', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
        supportsToolCalling: true,
      });

      await provider.initialize();

      expect(provider.capabilities.supportsToolCalling).toBe(true);

      const request = createTestRequest('Use the calculator tool', {
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculate',
              description: 'Perform calculation',
              parameters: {
                type: 'object',
                properties: {
                  expression: { type: 'string' },
                },
                required: ['expression'],
              },
            },
          },
        ],
      });

      provider.setMockResponse({
        content: '',
        toolCalls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'calculate',
              arguments: '{"expression": "2+2"}',
            },
          },
        ],
      });

      const response = await provider.complete(request);

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBeGreaterThan(0);

      provider.destroy();
    });

    it('should reject tool calls when not supported', async () => {
      const provider = new MockProvider('ollama', {
        supportedModels: ['llama3.2'],
        supportsToolCalling: false,
      });

      await provider.initialize();

      expect(provider.capabilities.supportsToolCalling).toBe(false);

      provider.destroy();
    });
  });

  describe('Streaming Consistency', () => {
    it('should stream events consistently across providers', async () => {
      const providers = [
        new MockProvider('anthropic', {
          supportedModels: ['claude-3-5-sonnet-latest'],
          supportsStreaming: true,
        }),
        new MockProvider('openai', {
          supportedModels: ['gpt-4o'],
          supportsStreaming: true,
        }),
      ];

      await Promise.all(providers.map((p) => p.initialize()));

      const streamResults = await Promise.all(
        providers.map(async (p) => {
          const events = await collectStreamEvents(p.streamComplete(createTestRequest()));
          return events;
        })
      );

      // All streams should have consistent event structure
      streamResults.forEach((events) => {
        expect(events.length).toBeGreaterThan(0);

        events.forEach((event) => {
          expect(isLLMStreamEvent(event)).toBe(true);
          expect(event).toHaveProperty('type');
          expect(['content', 'tool_call', 'error', 'done']).toContain(event.type);
        });

        // Should have a 'done' event
        const doneEvents = events.filter((e) => e.type === 'done');
        expect(doneEvents.length).toBe(1);

        // Done event should include usage
        expect(doneEvents[0].usage).toBeDefined();
      });

      providers.forEach((p) => p.destroy());
    });

    it('should handle streaming errors consistently', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
        supportsStreaming: true,
      });

      await provider.initialize();

      provider.setMockError(new Error('Streaming error'));

      await expect(async () => {
        for await (const event of provider.streamComplete(createTestRequest())) {
          // Should error before completing
        }
      }).rejects.toThrow('Streaming error');

      provider.destroy();
    });

    it('should reject streaming when not supported', async () => {
      const provider = new MockProvider('ollama', {
        supportedModels: ['llama3.2'],
        supportsStreaming: false,
      });

      await provider.initialize();

      await expect(async () => {
        for await (const event of provider.streamComplete(createTestRequest())) {
          // Should error
        }
      }).rejects.toThrow('Streaming not supported');

      provider.destroy();
    });
  });

  describe('Load Balancing', () => {
    it('should distribute requests across providers (round-robin)', async () => {
      const p1 = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });
      const p2 = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });

      await p1.initialize();
      await p2.initialize();

      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
            { provider: 'openai', model: 'gpt-4o' },
          ],
          loadBalancing: {
            enabled: true,
            strategy: 'round-robin',
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', p1);
      (manager as any).providers.set('openai', p2);

      p1.setMockResponse({ provider: 'anthropic' });
      p2.setMockResponse({ provider: 'openai' });

      // Make multiple requests
      const responses = await Promise.all([
        manager.complete(createTestRequest()),
        manager.complete(createTestRequest()),
        manager.complete(createTestRequest()),
        manager.complete(createTestRequest()),
      ]);

      const providers = responses.map((r) => r.provider);

      // Should alternate between providers
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');

      manager.destroy();
      p1.destroy();
      p2.destroy();
    });

    it('should balance by latency when configured', async () => {
      const slowProvider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });
      const fastProvider = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });

      await slowProvider.initialize();
      await fastProvider.initialize();

      slowProvider.setResponseDelay(500);
      fastProvider.setResponseDelay(50);

      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
            { provider: 'openai', model: 'gpt-4o' },
          ],
          loadBalancing: {
            enabled: true,
            strategy: 'latency-based',
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', slowProvider);
      (manager as any).providers.set('openai', fastProvider);

      // After warming up metrics, should prefer faster provider
      await manager.complete(createTestRequest());
      await manager.complete(createTestRequest());

      const metrics = manager.getMetrics();
      const anthropicMetrics = metrics.get('anthropic');
      const openaiMetrics = metrics.get('openai');

      expect(anthropicMetrics?.latency).toBeGreaterThan(openaiMetrics?.latency || 0);

      manager.destroy();
      slowProvider.destroy();
      fastProvider.destroy();
    });
  });

  describe('Request Caching', () => {
    it('should cache identical requests', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const manager = new ProviderManager(
        {
          providers: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-latest' }],
          cache: {
            enabled: true,
            ttl: 60000,
            maxSize: 100,
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', provider);

      provider.setMockResponse({ content: 'Cached response' });

      const request = createTestRequest('Same prompt');

      const timer = new Timer();
      const response1 = await manager.complete(request);
      const time1 = timer.elapsed();

      timer.reset();
      const response2 = await manager.complete(request);
      const time2 = timer.elapsed();

      // Second request should be faster (cached)
      expect(time2).toBeLessThan(time1);
      expect(response1.content).toBe(response2.content);

      manager.destroy();
      provider.destroy();
    });

    it('should respect cache TTL', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const manager = new ProviderManager(
        {
          providers: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-latest' }],
          cache: {
            enabled: true,
            ttl: 100, // 100ms TTL
            maxSize: 100,
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', provider);

      const request = createTestRequest();

      await manager.complete(request);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should make new request
      await manager.complete(request);

      manager.destroy();
      provider.destroy();
    });
  });
});
