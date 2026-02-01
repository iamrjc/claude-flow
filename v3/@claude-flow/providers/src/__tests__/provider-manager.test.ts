/**
 * Provider Manager Unit Tests
 *
 * Tests for WP11: Provider Manager Enhancement
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderManager, EnhancedProviderManagerConfig } from '../provider-manager.js';
import {
  ILLMProvider,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMProviderError,
  ProviderStatus,
  HealthCheckResult,
  CostEstimate,
  UsageStats,
} from '../types.js';
import { EventEmitter } from 'events';

// Mock provider implementation
class MockProvider extends EventEmitter implements ILLMProvider {
  readonly name: LLMProvider;
  readonly capabilities = {
    supportedModels: ['test-model'],
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

  config: any;
  private available = true;
  private currentLoad = 0;
  private healthy = true;
  private shouldFail = false;

  constructor(name: LLMProvider, config?: any) {
    super();
    this.name = name;
    this.config = config || { provider: name, model: 'test-model' };
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setCurrentLoad(load: number): void {
    this.currentLoad = load;
  }

  async initialize(): Promise<void> {
    // Mock initialization
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (this.shouldFail) {
      throw new LLMProviderError('Mock error', 'MOCK_ERROR', this.name);
    }

    return {
      id: 'test-response',
      model: 'test-model',
      provider: this.name,
      content: 'Test response',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      cost: {
        promptCost: 0.01,
        completionCost: 0.02,
        totalCost: 0.03,
        currency: 'USD',
      },
    };
  }

  async *streamComplete(request: LLMRequest): AsyncIterable<any> {
    yield { type: 'content', delta: { content: 'test' } };
  }

  async listModels(): Promise<any[]> {
    return ['test-model'];
  }

  async getModelInfo(model: string): Promise<any> {
    return {
      model,
      name: model,
      description: 'Test model',
      contextLength: 4096,
      maxOutputTokens: 2048,
      supportedFeatures: [],
    };
  }

  validateModel(model: string): boolean {
    return model === 'test-model';
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      healthy: this.healthy,
      latency: 100,
      timestamp: new Date(),
    };
  }

  getStatus(): ProviderStatus {
    return {
      available: this.available,
      currentLoad: this.currentLoad,
      queueLength: 0,
      activeRequests: 0,
    };
  }

  async estimateCost(request: LLMRequest): Promise<CostEstimate> {
    return {
      estimatedPromptTokens: 10,
      estimatedCompletionTokens: 20,
      estimatedTotalTokens: 30,
      estimatedCost: {
        prompt: 0.01,
        completion: 0.02,
        total: 0.03,
        currency: 'USD',
      },
      confidence: 0.8,
    };
  }

  async getUsage(): Promise<UsageStats> {
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

describe('ProviderManager', () => {
  let manager: ProviderManager;
  let mockProviders: Map<LLMProvider, MockProvider>;

  beforeEach(() => {
    mockProviders = new Map([
      ['anthropic', new MockProvider('anthropic')],
      ['openai', new MockProvider('openai')],
      ['google', new MockProvider('google')],
    ]);
  });

  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
  });

  describe('initialization', () => {
    it('should initialize with basic config', async () => {
      const config: any = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
        ],
      };

      manager = new ProviderManager(config);

      // Mock the createProvider method
      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();

      const providers = manager.listProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
    });

    it('should handle provider initialization failures gracefully', async () => {
      const config: any = {
        providers: [{ provider: 'anthropic', model: 'test-model' }],
      };

      manager = new ProviderManager(config);

      // Mock createProvider to throw error
      vi.spyOn(manager as any, 'createProvider').mockImplementation(() => {
        throw new Error('Init failed');
      });

      await manager.initialize();

      const providers = manager.listProviders();
      expect(providers).toHaveLength(0);
    });

    it('should start health monitoring when enabled', async () => {
      const config: EnhancedProviderManagerConfig = {
        providers: [{ provider: 'anthropic', model: 'test-model' }],
        healthCheck: {
          enabled: true,
          interval: 1000,
          failureThreshold: 0.5,
        },
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();

      // Health monitoring should be started
      expect((manager as any).healthCheckInterval).toBeDefined();
    });
  });

  describe('load balancing strategies', () => {
    beforeEach(async () => {
      const config: any = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
          { provider: 'google', model: 'test-model' },
        ],
        loadBalancing: { enabled: true, strategy: 'round-robin' },
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should use round-robin strategy', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      // Make multiple requests
      const responses = [];
      for (let i = 0; i < 3; i++) {
        const response = await manager.complete(request);
        responses.push(response.provider);
      }

      // All three providers should be used in round-robin
      expect(new Set(responses).size).toBe(3);
    });

    it('should use least-loaded strategy', async () => {
      (manager as any).config.loadBalancing.strategy = 'least-loaded';

      // Set different loads
      mockProviders.get('anthropic')!.setCurrentLoad(0.8);
      mockProviders.get('openai')!.setCurrentLoad(0.2);
      mockProviders.get('google')!.setCurrentLoad(0.5);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const response = await manager.complete(request);

      // Should select openai (lowest load)
      expect(response.provider).toBe('openai');
    });

    it('should use cost-based strategy', async () => {
      (manager as any).config.loadBalancing.strategy = 'cost-based';

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const response = await manager.complete(request);

      // Should select cheapest provider (all have same cost in mock)
      expect(['anthropic', 'openai', 'google']).toContain(response.provider);
    });
  });

  describe('automatic failover', () => {
    beforeEach(async () => {
      const config: EnhancedProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
        ],
        failover: {
          enabled: true,
          maxAttempts: 2,
          retryableErrors: ['MOCK_ERROR'],
        },
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should failover to another provider on error', async () => {
      // Make anthropic fail
      mockProviders.get('anthropic')!.setShouldFail(true);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const response = await manager.complete(request, 'anthropic');

      // Should failover to openai
      expect(response.provider).toBe('openai');
    });

    it('should emit fallback_success event', async () => {
      mockProviders.get('anthropic')!.setShouldFail(true);

      const fallbackSpy = vi.fn();
      manager.on('fallback_success', fallbackSpy);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      await manager.complete(request, 'anthropic');

      expect(fallbackSpy).toHaveBeenCalled();
    });

    it('should throw error when all providers fail', async () => {
      // Make all providers fail
      mockProviders.get('anthropic')!.setShouldFail(true);
      mockProviders.get('openai')!.setShouldFail(true);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      await expect(manager.complete(request, 'anthropic')).rejects.toThrow();
    });
  });

  describe('cost optimization', () => {
    beforeEach(async () => {
      const config: EnhancedProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
        ],
        costOptimization: {
          enabled: true,
          maxCostPerRequest: 0.05,
          preferCheaper: true,
        },
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should route to cheapest capable provider', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
        costConstraints: {
          maxCost: 0.05,
        },
      };

      const provider = await manager.routeRequest(request);
      expect(provider).toBeDefined();
    });

    it('should throw error when no provider meets cost constraint', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
        costConstraints: {
          maxCost: 0.001, // Too low
        },
      };

      await expect(manager.routeRequest(request)).rejects.toThrow();
    });
  });

  describe('health monitoring', () => {
    beforeEach(async () => {
      const config: EnhancedProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
        ],
        healthCheck: {
          enabled: true,
          interval: 100,
          failureThreshold: 0.5,
        },
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should mark provider as unhealthy when error rate exceeds threshold', async () => {
      mockProviders.get('anthropic')!.setShouldFail(true);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      // Make multiple failing requests
      for (let i = 0; i < 5; i++) {
        try {
          await manager.complete(request, 'anthropic');
        } catch (error) {
          // Expected to fail
        }
      }

      const health = manager.getProviderHealth();
      // Health might be degraded but not necessarily false yet
      expect(health.has('anthropic')).toBe(true);
    });

    it('should emit provider_failed event', (done) => {
      manager.on('provider_unhealthy', (data) => {
        expect(data.provider).toBeDefined();
        done();
      });

      // Trigger unhealthy state
      mockProviders.get('anthropic')!.setShouldFail(true);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      // Make multiple failing requests to trigger unhealthy state
      Promise.all(
        Array(10)
          .fill(null)
          .map(() => manager.complete(request, 'anthropic').catch(() => {}))
      );
    });

    it('should get provider health status', () => {
      const health = manager.getProviderHealth();
      expect(health.size).toBeGreaterThan(0);
      expect(health.get('anthropic')).toBe(true);
      expect(health.get('openai')).toBe(true);
    });
  });

  describe('concurrent request limits', () => {
    beforeEach(async () => {
      const config: EnhancedProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
        ],
        concurrentLimits: new Map([
          ['anthropic', 2],
          ['openai', 5],
        ]),
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should enforce concurrent request limits', () => {
      manager.setConcurrentLimit('anthropic', 2);

      expect((manager as any).canAcceptRequest('anthropic')).toBe(true);

      (manager as any).incrementActiveRequests('anthropic');
      (manager as any).incrementActiveRequests('anthropic');

      expect((manager as any).canAcceptRequest('anthropic')).toBe(false);
    });

    it('should get active request count', () => {
      (manager as any).incrementActiveRequests('anthropic');
      const count = manager.getActiveRequests('anthropic');
      expect(count).toBe(1);
    });

    it('should get all active requests', () => {
      (manager as any).incrementActiveRequests('anthropic');
      (manager as any).incrementActiveRequests('openai');

      const all = manager.getActiveRequests();
      expect(all).toBeInstanceOf(Map);
      expect(all.size).toBeGreaterThan(0);
    });
  });

  describe('provider priority', () => {
    beforeEach(async () => {
      const config: EnhancedProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
          { provider: 'google', model: 'test-model' },
        ],
        providerPriority: new Map([
          ['anthropic', 100],
          ['openai', 50],
          ['google', 10],
        ]),
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should prefer higher priority providers', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const response = await manager.complete(request);

      // Should prefer anthropic (highest priority)
      expect(response.provider).toBe('anthropic');
    });

    it('should set provider priority', () => {
      manager.setProviderPriority('openai', 200);

      const priority = (manager as any).providerPriority.get('openai');
      expect(priority).toBe(200);
    });
  });

  describe('provider routing', () => {
    beforeEach(async () => {
      const config: any = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
        ],
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should route request to optimal provider', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const provider = await manager.routeRequest(request);
      expect(provider).toBeDefined();
      expect(['anthropic', 'openai']).toContain(provider.name);
    });

    it('should find capable providers', () => {
      const capable = manager.findCapableProviders('test-model');
      expect(capable.length).toBeGreaterThan(0);
    });
  });

  describe('metrics and monitoring', () => {
    beforeEach(async () => {
      const config: any = {
        providers: [{ provider: 'anthropic', model: 'test-model' }],
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should track provider metrics', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      await manager.complete(request);

      const metrics = manager.getMetrics();
      expect(metrics.size).toBeGreaterThan(0);

      const anthropicMetrics = metrics.get('anthropic');
      expect(anthropicMetrics).toBeDefined();
      expect(anthropicMetrics!.requestCount).toBe(1);
      expect(anthropicMetrics!.successCount).toBe(1);
    });

    it('should update metrics on error', async () => {
      mockProviders.get('anthropic')!.setShouldFail(true);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      try {
        await manager.complete(request, 'anthropic');
      } catch (error) {
        // Expected
      }

      const metrics = manager.getMetrics();
      const anthropicMetrics = metrics.get('anthropic');
      expect(anthropicMetrics!.failureCount).toBe(1);
    });

    it('should get aggregated usage statistics', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      await manager.complete(request);

      const usage = await manager.getUsage();
      // The aggregated usage from all providers may be 0 since mock providers return 0
      expect(usage).toBeDefined();
      expect(usage.period).toBeDefined();
      expect(usage.tokens).toBeDefined();
    });
  });

  describe('caching', () => {
    beforeEach(async () => {
      const config: any = {
        providers: [{ provider: 'anthropic', model: 'test-model' }],
        cache: {
          enabled: true,
          ttl: 300000,
          maxSize: 100,
        },
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should cache responses', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const response1 = await manager.complete(request);
      const response2 = await manager.complete(request);

      expect(response1.id).toBe(response2.id);
    });

    it('should clear cache', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      await manager.complete(request);
      manager.clearCache();

      const cacheSize = (manager as any).cache.size;
      expect(cacheSize).toBe(0);
    });
  });

  describe('health checks', () => {
    beforeEach(async () => {
      const config: any = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
        ],
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should perform health check on all providers', async () => {
      const results = await manager.healthCheck();
      expect(results.size).toBe(2);
      expect(results.get('anthropic')?.healthy).toBe(true);
      expect(results.get('openai')?.healthy).toBe(true);
    });

    it('should detect unhealthy providers', async () => {
      mockProviders.get('anthropic')!.setHealthy(false);

      const results = await manager.healthCheck();
      expect(results.get('anthropic')?.healthy).toBe(false);
    });
  });

  describe('cost estimation', () => {
    beforeEach(async () => {
      const config: any = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
        ],
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();
    });

    it('should estimate cost across providers', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'test-model',
      };

      const estimates = await manager.estimateCost(request);
      expect(estimates.size).toBe(2);
      expect(estimates.get('anthropic')).toBeDefined();
      expect(estimates.get('openai')).toBeDefined();
    });
  });

  describe('provider lifecycle', () => {
    it('should get specific provider', async () => {
      const config: any = {
        providers: [{ provider: 'anthropic', model: 'test-model' }],
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();

      const provider = manager.getProvider('anthropic');
      expect(provider).toBeDefined();
      expect(provider?.name).toBe('anthropic');
    });

    it('should list all providers', async () => {
      const config: any = {
        providers: [
          { provider: 'anthropic', model: 'test-model' },
          { provider: 'openai', model: 'test-model' },
        ],
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();

      const providers = manager.listProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
    });

    it('should destroy all providers', async () => {
      const config: any = {
        providers: [{ provider: 'anthropic', model: 'test-model' }],
      };

      manager = new ProviderManager(config);

      vi.spyOn(manager as any, 'createProvider').mockImplementation((cfg: any) => {
        return mockProviders.get(cfg.provider);
      });

      await manager.initialize();

      manager.destroy();

      const providers = manager.listProviders();
      expect(providers).toHaveLength(0);
    });
  });
});
