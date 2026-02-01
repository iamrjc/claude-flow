/**
 * V3 Provider Router
 *
 * Intelligent routing system for provider selection based on:
 * - Model capabilities
 * - Cost requirements
 * - Latency requirements
 * - Provider pools
 * - A/B testing
 *
 * @module @claude-flow/providers/provider-router
 */

import {
  ILLMProvider,
  LLMProvider,
  LLMModel,
  LLMRequest,
  LoadBalancingStrategy,
} from './types.js';

/**
 * Routing requirements
 */
export interface RouteRequirements {
  model?: LLMModel;
  maxCost?: number;
  maxLatency?: number;
  preferredProviders?: LLMProvider[];
  excludeProviders?: LLMProvider[];
  requireCapabilities?: string[];
}

/**
 * Provider pool configuration
 */
export interface ProviderPoolConfig {
  name: string;
  providers: LLMProvider[];
  strategy: LoadBalancingStrategy;
  weights?: Map<LLMProvider, number>;
}

/**
 * A/B test configuration
 */
export interface ABTestConfig {
  name: string;
  variantA: LLMProvider;
  variantB: LLMProvider;
  splitRatio: number; // 0-1, percentage for variant A
  metrics: ABTestMetrics;
}

/**
 * A/B test metrics
 */
export interface ABTestMetrics {
  variantA: {
    requests: number;
    avgLatency: number;
    avgCost: number;
    errorRate: number;
  };
  variantB: {
    requests: number;
    avgLatency: number;
    avgCost: number;
    errorRate: number;
  };
}

/**
 * Route result
 */
export interface RouteResult {
  provider: ILLMProvider;
  reason: string;
  confidence: number;
  alternatives?: ILLMProvider[];
}

/**
 * Provider Router - Intelligent provider selection
 */
export class ProviderRouter {
  private pools: Map<string, ProviderPoolConfig> = new Map();
  private abTests: Map<string, ABTestConfig> = new Map();
  private routeCache: Map<string, RouteResult> = new Map();

  constructor(
    private providers: Map<LLMProvider, ILLMProvider>
  ) {}

  /**
   * Route request to optimal provider
   */
  async route(
    request: LLMRequest,
    requirements?: RouteRequirements
  ): Promise<RouteResult> {
    // Check cache
    const cacheKey = this.getCacheKey(request, requirements);
    const cached = this.routeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Filter capable providers
    let candidates = await this.findCapableProviders(request, requirements);

    if (candidates.length === 0) {
      throw new Error('No providers available matching requirements');
    }

    // Apply cost filtering
    if (requirements?.maxCost) {
      candidates = await this.filterByCost(candidates, request, requirements.maxCost);
    }

    // Apply latency filtering
    if (requirements?.maxLatency) {
      candidates = this.filterByLatency(candidates, requirements.maxLatency);
    }

    // Apply provider preferences
    if (requirements?.preferredProviders) {
      candidates = this.applyPreferences(candidates, requirements.preferredProviders);
    }

    // Exclude providers
    if (requirements?.excludeProviders) {
      candidates = candidates.filter(
        (p) => !requirements.excludeProviders?.includes(p.name)
      );
    }

    if (candidates.length === 0) {
      throw new Error('No providers available after applying filters');
    }

    // Select best provider
    const result = this.selectBest(candidates, request);

    // Cache result
    this.routeCache.set(cacheKey, result);

    return result;
  }

  /**
   * Find providers capable of handling request
   */
  private async findCapableProviders(
    request: LLMRequest,
    requirements?: RouteRequirements
  ): Promise<ILLMProvider[]> {
    const candidates: ILLMProvider[] = [];

    for (const provider of this.providers.values()) {
      // Check model support
      if (request.model && !provider.validateModel(request.model)) {
        continue;
      }

      // Check availability
      if (!provider.getStatus().available) {
        continue;
      }

      // Check required capabilities
      if (requirements?.requireCapabilities) {
        const hasAllCapabilities = requirements.requireCapabilities.every(
          (cap) => this.hasCapability(provider, cap)
        );
        if (!hasAllCapabilities) {
          continue;
        }
      }

      candidates.push(provider);
    }

    return candidates;
  }

  /**
   * Check if provider has capability
   */
  private hasCapability(provider: ILLMProvider, capability: string): boolean {
    const caps = provider.capabilities;

    switch (capability) {
      case 'streaming':
        return caps.supportsStreaming;
      case 'tools':
        return caps.supportsToolCalling;
      case 'vision':
        return caps.supportsVision;
      case 'audio':
        return caps.supportsAudio;
      default:
        return false;
    }
  }

  /**
   * Filter providers by cost constraint
   */
  private async filterByCost(
    providers: ILLMProvider[],
    request: LLMRequest,
    maxCost: number
  ): Promise<ILLMProvider[]> {
    const filtered: ILLMProvider[] = [];

    for (const provider of providers) {
      try {
        const estimate = await provider.estimateCost(request);
        if (estimate.estimatedCost.total <= maxCost) {
          filtered.push(provider);
        }
      } catch (error) {
        // Skip providers that fail cost estimation
        continue;
      }
    }

    return filtered;
  }

  /**
   * Filter providers by latency
   */
  private filterByLatency(
    providers: ILLMProvider[],
    maxLatency: number
  ): ILLMProvider[] {
    // This is a heuristic based on provider status
    return providers.filter((provider) => {
      const status = provider.getStatus();
      // Estimate latency from current load
      const estimatedLatency = 1000 * (1 + status.currentLoad * 2);
      return estimatedLatency <= maxLatency;
    });
  }

  /**
   * Apply provider preferences
   */
  private applyPreferences(
    providers: ILLMProvider[],
    preferred: LLMProvider[]
  ): ILLMProvider[] {
    // Sort by preference order
    return providers.sort((a, b) => {
      const indexA = preferred.indexOf(a.name);
      const indexB = preferred.indexOf(b.name);

      // Preferred providers first
      if (indexA !== -1 && indexB === -1) return -1;
      if (indexA === -1 && indexB !== -1) return 1;
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;

      return 0;
    });
  }

  /**
   * Select best provider from candidates
   */
  private selectBest(
    candidates: ILLMProvider[],
    request: LLMRequest
  ): RouteResult {
    // Use least loaded as default selection strategy
    const sorted = candidates.sort((a, b) => {
      const loadA = a.getStatus().currentLoad;
      const loadB = b.getStatus().currentLoad;
      return loadA - loadB;
    });

    const selected = sorted[0];
    const alternatives = sorted.slice(1, 4); // Top 3 alternatives

    return {
      provider: selected,
      reason: 'Least loaded provider',
      confidence: 0.8,
      alternatives,
    };
  }

  /**
   * Create provider pool
   */
  createPool(config: ProviderPoolConfig): void {
    this.pools.set(config.name, config);
  }

  /**
   * Get provider from pool
   */
  async getFromPool(
    poolName: string,
    request?: LLMRequest
  ): Promise<ILLMProvider | undefined> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Pool ${poolName} not found`);
    }

    const poolProviders = pool.providers
      .map((name) => this.providers.get(name))
      .filter((p): p is ILLMProvider => p !== undefined && p.getStatus().available);

    if (poolProviders.length === 0) {
      return undefined;
    }

    // Select based on pool strategy
    switch (pool.strategy) {
      case 'round-robin':
        return this.selectRoundRobinFromPool(poolProviders);
      case 'least-loaded':
        return this.selectLeastLoaded(poolProviders);
      case 'cost-based':
        if (request) {
          return this.selectByCost(poolProviders, request);
        }
        return poolProviders[0];
      default:
        return poolProviders[0];
    }
  }

  /**
   * Round-robin selection from pool
   */
  private selectRoundRobinFromPool(providers: ILLMProvider[]): ILLMProvider {
    const index = Math.floor(Math.random() * providers.length);
    return providers[index];
  }

  /**
   * Least loaded selection
   */
  private selectLeastLoaded(providers: ILLMProvider[]): ILLMProvider {
    return providers.reduce((best, current) =>
      current.getStatus().currentLoad < best.getStatus().currentLoad ? current : best
    );
  }

  /**
   * Cost-based selection
   */
  private async selectByCost(
    providers: ILLMProvider[],
    request: LLMRequest
  ): Promise<ILLMProvider> {
    const estimates = await Promise.all(
      providers.map(async (p) => ({
        provider: p,
        cost: (await p.estimateCost(request)).estimatedCost.total,
      }))
    );

    return estimates.reduce((best, current) =>
      current.cost < best.cost ? current : best
    ).provider;
  }

  /**
   * Setup A/B test
   */
  setupABTest(config: ABTestConfig): void {
    this.abTests.set(config.name, {
      ...config,
      metrics: {
        variantA: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
        variantB: { requests: 0, avgLatency: 0, avgCost: 0, errorRate: 0 },
      },
    });
  }

  /**
   * Get provider for A/B test
   */
  getForABTest(testName: string): ILLMProvider | undefined {
    const test = this.abTests.get(testName);
    if (!test) {
      throw new Error(`A/B test ${testName} not found`);
    }

    // Random selection based on split ratio
    const random = Math.random();
    const providerName = random < test.splitRatio ? test.variantA : test.variantB;

    return this.providers.get(providerName);
  }

  /**
   * Record A/B test metrics
   */
  recordABTestMetrics(
    testName: string,
    variant: 'A' | 'B',
    metrics: { latency: number; cost: number; error: boolean }
  ): void {
    const test = this.abTests.get(testName);
    if (!test) return;

    const variantMetrics = variant === 'A' ? test.metrics.variantA : test.metrics.variantB;

    // Update running averages
    const n = variantMetrics.requests;
    variantMetrics.avgLatency = (variantMetrics.avgLatency * n + metrics.latency) / (n + 1);
    variantMetrics.avgCost = (variantMetrics.avgCost * n + metrics.cost) / (n + 1);
    variantMetrics.errorRate =
      (variantMetrics.errorRate * n + (metrics.error ? 1 : 0)) / (n + 1);
    variantMetrics.requests++;
  }

  /**
   * Get A/B test results
   */
  getABTestResults(testName: string): ABTestMetrics | undefined {
    return this.abTests.get(testName)?.metrics;
  }

  /**
   * Generate cache key for routing
   */
  private getCacheKey(request: LLMRequest, requirements?: RouteRequirements): string {
    return JSON.stringify({
      model: request.model,
      requirements,
    });
  }

  /**
   * Clear route cache
   */
  clearCache(): void {
    this.routeCache.clear();
  }
}
