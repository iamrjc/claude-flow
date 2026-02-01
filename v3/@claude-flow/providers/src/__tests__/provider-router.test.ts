/**
 * Provider Router Unit Tests
 *
 * Tests for WP11: Provider Router
 * Coverage target: >80%
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRouter, RouteRequirements, ProviderPoolConfig, ABTestConfig } from '../provider-router.js';
import { ILLMProvider, LLMProvider, LLMRequest } from '../types.js';
import { EventEmitter } from 'events';

// Mock provider for testing
class MockProvider extends EventEmitter implements ILLMProvider {
  readonly name: LLMProvider;
  readonly capabilities: any;
  config: any;
  private available = true;
  private currentLoad = 0;

  constructor(name: LLMProvider, options?: { load?: number; models?: string[] }) {
    super();
    this.name = name;
    this.config = { provider: name, model: 'test-model' };
    this.currentLoad = options?.load || 0;
    this.capabilities = {
      supportedModels: options?.models || ['test-model'],
      maxContextLength: { 'test-model': 4096 },
      maxOutputTokens: { 'test-model': 2048 },
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsSystemMessages: true,
      supportsVision: false,
      supportsAudio: false,
      supportsFineTuning: false,
      supportsEmbeddings: false,
      supportsBatching: false,
      pricing: {
        'test-model': {
          promptCostPer1k: 0.001,
          completionCostPer1k: 0.002,
          currency: 'USD',
        },
      },
    };
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  setCurrentLoad(load: number): void {
    this.currentLoad = load;
  }

  async initialize(): Promise<void> {}

  async complete(request: LLMRequest): Promise<any> {
    return {
      id: 'test',
      model: 'test-model',
      provider: this.name,
      content: 'response',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
  }

  async *streamComplete(request: LLMRequest): AsyncIterable<any> {
    yield { type: 'content', delta: { content: 'test' } };
  }

  async listModels(): Promise<any[]> {
    return ['test-model'];
  }

  async getModelInfo(model: string): Promise<any> {
    return { model, name: model, description: 'Test', contextLength: 4096, maxOutputTokens: 2048, supportedFeatures: [] };
  }

  validateModel(model: string): boolean {
    return this.capabilities.supportedModels.includes(model);
  }

  async healthCheck(): Promise<any> {
    return { healthy: true, latency: 100, timestamp: new Date() };
  }

  getStatus(): any {
    return {
      available: this.available,
      currentLoad: this.currentLoad,
      queueLength: 0,
      activeRequests: 0,
    };
  }

  async estimateCost(request: LLMRequest): Promise<any> {
    return {
      estimatedPromptTokens: 10,
      estimatedCompletionTokens: 20,
      estimatedTotalTokens: 30,
      estimatedCost: { prompt: 0.01, completion: 0.02, total: 0.03, currency: 'USD' },
      confidence: 0.8,
    };
  }

  async getUsage(): Promise<any> {
    return {
      period: { start: new Date(), end: new Date() },
      requests: 0,
      tokens: { prompt: 0, completion: 0, total: 0 },
      cost: { prompt: 0, completion: 0, total: 0, currency: 'USD' },
      errors: 0,
      averageLatency: 0,
      modelBreakdown: {},
    };
  }

  destroy(): void {
    this.removeAllListeners();
  }
}

describe('ProviderRouter', () => {
  let router: ProviderRouter;
  let providers: Map<LLMProvider, ILLMProvider>;

  beforeEach(() => {
    providers = new Map([
      ['anthropic', new MockProvider('anthropic')],
      ['openai', new MockProvider('openai')],
      ['google', new MockProvider('google')],
    ]);
    router = new ProviderRouter(providers);
  });

  describe('basic routing', () => {
    it('should route request to available provider', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const result = await router.route(request);

      expect(result.provider).toBeDefined();
      expect(result.reason).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return alternatives in route result', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const result = await router.route(request);

      expect(result.alternatives).toBeDefined();
      expect(Array.isArray(result.alternatives)).toBe(true);
    });

    it('should throw error when no providers available', async () => {
      // Make all providers unavailable
      (providers.get('anthropic') as MockProvider).setAvailable(false);
      (providers.get('openai') as MockProvider).setAvailable(false);
      (providers.get('google') as MockProvider).setAvailable(false);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      await expect(router.route(request)).rejects.toThrow('No providers available');
    });
  });

  describe('model-based routing', () => {
    it('should route to provider supporting specific model', async () => {
      const specialProvider = new MockProvider('anthropic', { models: ['special-model'] });
      providers.set('anthropic', specialProvider);
      router = new ProviderRouter(providers);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'special-model',
      };

      const result = await router.route(request);

      expect(result.provider.name).toBe('anthropic');
    });

    it('should filter out providers not supporting model', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'unsupported-model',
      };

      await expect(router.route(request)).rejects.toThrow();
    });
  });

  describe('cost-based routing', () => {
    it('should route to provider within cost constraint', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const requirements: RouteRequirements = {
        maxCost: 0.05,
      };

      const result = await router.route(request, requirements);

      expect(result.provider).toBeDefined();
    });

    it('should throw error when no provider meets cost constraint', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const requirements: RouteRequirements = {
        maxCost: 0.001, // Too low
      };

      await expect(router.route(request, requirements)).rejects.toThrow();
    });
  });

  describe('latency-based routing', () => {
    it('should route to provider within latency constraint', async () => {
      (providers.get('anthropic') as MockProvider).setCurrentLoad(0.1);
      (providers.get('openai') as MockProvider).setCurrentLoad(0.9);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const requirements: RouteRequirements = {
        maxLatency: 2000,
      };

      const result = await router.route(request, requirements);

      expect(result.provider).toBeDefined();
    });
  });

  describe('capability-based routing', () => {
    it('should route to provider with required capabilities', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const requirements: RouteRequirements = {
        requireCapabilities: ['streaming', 'tools'],
      };

      const result = await router.route(request, requirements);

      expect(result.provider).toBeDefined();
      expect(result.provider.capabilities.supportsStreaming).toBe(true);
      expect(result.provider.capabilities.supportsToolCalling).toBe(true);
    });

    it('should filter out providers without required capabilities', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const requirements: RouteRequirements = {
        requireCapabilities: ['vision'], // Not supported by mock
      };

      await expect(router.route(request, requirements)).rejects.toThrow();
    });
  });

  describe('provider preferences', () => {
    it('should prefer specified providers', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const requirements: RouteRequirements = {
        preferredProviders: ['openai', 'google'],
      };

      const result = await router.route(request, requirements);

      expect(['openai', 'google']).toContain(result.provider.name);
    });

    it('should exclude specified providers', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const requirements: RouteRequirements = {
        excludeProviders: ['anthropic', 'openai'],
      };

      const result = await router.route(request, requirements);

      expect(result.provider.name).toBe('google');
    });
  });

  describe('provider pools', () => {
    it('should create provider pool', () => {
      const config: ProviderPoolConfig = {
        name: 'production',
        providers: ['anthropic', 'openai'],
        strategy: 'round-robin',
      };

      router.createPool(config);

      // Pool should be created internally
      expect((router as any).pools.has('production')).toBe(true);
    });

    it('should get provider from pool', async () => {
      const config: ProviderPoolConfig = {
        name: 'test-pool',
        providers: ['anthropic', 'openai'],
        strategy: 'least-loaded',
      };

      router.createPool(config);

      const provider = await router.getFromPool('test-pool');

      expect(provider).toBeDefined();
      expect(['anthropic', 'openai']).toContain(provider!.name);
    });

    it('should throw error for non-existent pool', async () => {
      await expect(router.getFromPool('non-existent')).rejects.toThrow('Pool non-existent not found');
    });

    it('should return undefined when pool has no available providers', async () => {
      const config: ProviderPoolConfig = {
        name: 'empty-pool',
        providers: ['anthropic'],
        strategy: 'round-robin',
      };

      router.createPool(config);

      // Make provider unavailable
      (providers.get('anthropic') as MockProvider).setAvailable(false);

      const provider = await router.getFromPool('empty-pool');

      expect(provider).toBeUndefined();
    });

    it('should use least-loaded strategy in pool', async () => {
      (providers.get('anthropic') as MockProvider).setCurrentLoad(0.8);
      (providers.get('openai') as MockProvider).setCurrentLoad(0.2);

      const config: ProviderPoolConfig = {
        name: 'test-pool',
        providers: ['anthropic', 'openai'],
        strategy: 'least-loaded',
      };

      router.createPool(config);

      const provider = await router.getFromPool('test-pool');

      expect(provider?.name).toBe('openai'); // Lower load
    });

    it('should use cost-based strategy in pool', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const config: ProviderPoolConfig = {
        name: 'cost-pool',
        providers: ['anthropic', 'openai'],
        strategy: 'cost-based',
      };

      router.createPool(config);

      const provider = await router.getFromPool('cost-pool', request);

      expect(provider).toBeDefined();
    });
  });

  describe('A/B testing', () => {
    it('should setup A/B test', () => {
      const config: ABTestConfig = {
        name: 'test-ab',
        variantA: 'anthropic',
        variantB: 'openai',
        splitRatio: 0.5,
        metrics: {
          variantA: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
          variantB: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
        },
      };

      router.setupABTest(config);

      expect((router as any).abTests.has('test-ab')).toBe(true);
    });

    it('should get provider for A/B test', () => {
      const config: ABTestConfig = {
        name: 'test-ab',
        variantA: 'anthropic',
        variantB: 'openai',
        splitRatio: 0.5,
        metrics: {
          variantA: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
          variantB: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
        },
      };

      router.setupABTest(config);

      const provider = router.getForABTest('test-ab');

      expect(provider).toBeDefined();
      expect(['anthropic', 'openai']).toContain(provider!.name);
    });

    it('should record A/B test metrics', () => {
      const config: ABTestConfig = {
        name: 'test-ab',
        variantA: 'anthropic',
        variantB: 'openai',
        splitRatio: 0.5,
        metrics: {
          variantA: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
          variantB: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
        },
      };

      router.setupABTest(config);

      router.recordABTestMetrics('test-ab', 'A', {
        latency: 100,
        cost: 0.01,
        error: false,
      });

      const results = router.getABTestResults('test-ab');

      expect(results).toBeDefined();
      expect(results!.variantA.requests).toBe(1);
      expect(results!.variantA.avgLatency).toBe(100);
    });

    it('should calculate running averages for A/B test metrics', () => {
      const config: ABTestConfig = {
        name: 'test-ab',
        variantA: 'anthropic',
        variantB: 'openai',
        splitRatio: 0.5,
        metrics: {
          variantA: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
          variantB: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
        },
      };

      router.setupABTest(config);

      router.recordABTestMetrics('test-ab', 'A', { latency: 100, cost: 0.01, error: false });
      router.recordABTestMetrics('test-ab', 'A', { latency: 200, cost: 0.02, error: false });

      const results = router.getABTestResults('test-ab');

      expect(results!.variantA.requests).toBe(2);
      expect(results!.variantA.avgLatency).toBe(150); // (100 + 200) / 2
      expect(results!.variantA.avgCost).toBe(0.015); // (0.01 + 0.02) / 2
    });

    it('should track error rate in A/B test', () => {
      const config: ABTestConfig = {
        name: 'test-ab',
        variantA: 'anthropic',
        variantB: 'openai',
        splitRatio: 0.5,
        metrics: {
          variantA: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
          variantB: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
        },
      };

      router.setupABTest(config);

      router.recordABTestMetrics('test-ab', 'B', { latency: 100, cost: 0.01, error: true });
      router.recordABTestMetrics('test-ab', 'B', { latency: 100, cost: 0.01, error: false });

      const results = router.getABTestResults('test-ab');

      expect(results!.variantB.errorRate).toBe(0.5); // 1 error out of 2 requests
    });

    it('should throw error for non-existent A/B test', () => {
      expect(() => router.getForABTest('non-existent')).toThrow('A/B test non-existent not found');
    });
  });

  describe('caching', () => {
    it('should cache routing results', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const result1 = await router.route(request);
      const result2 = await router.route(request);

      // Should return same result from cache
      expect(result1.provider.name).toBe(result2.provider.name);
    });

    it('should clear route cache', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      await router.route(request);
      router.clearCache();

      const cacheSize = (router as any).routeCache.size;
      expect(cacheSize).toBe(0);
    });
  });

  describe('complex routing scenarios', () => {
    it('should handle multiple filters', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const requirements: RouteRequirements = {
        maxCost: 0.1,
        maxLatency: 5000,
        requireCapabilities: ['streaming'],
        excludeProviders: ['google'],
      };

      const result = await router.route(request, requirements);

      expect(result.provider).toBeDefined();
      expect(result.provider.name).not.toBe('google');
    });

    it('should prioritize preferred providers over others', async () => {
      (providers.get('anthropic') as MockProvider).setCurrentLoad(0.9);
      (providers.get('openai') as MockProvider).setCurrentLoad(0.1);
      (providers.get('google') as MockProvider).setCurrentLoad(0.2);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const requirements: RouteRequirements = {
        preferredProviders: ['openai', 'google'], // Prefer openai and google
      };

      const result = await router.route(request, requirements);

      // Should select from preferred providers (openai has lowest load among preferred)
      expect(['openai', 'google']).toContain(result.provider.name);
    });
  });
});
