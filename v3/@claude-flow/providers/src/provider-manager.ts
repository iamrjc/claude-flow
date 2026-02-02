/**
 * V3 Provider Manager
 *
 * Orchestrates multiple LLM providers with:
 * - Load balancing (round-robin, latency-based, cost-based)
 * - Automatic failover
 * - Request caching
 * - Cost optimization
 *
 * @module @claude-flow/providers/provider-manager
 */

import { EventEmitter } from 'events';
import {
  ILLMProvider,
  LLMProvider,
  LLMProviderConfig,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  LLMModel,
  ProviderManagerConfig,
  LoadBalancingStrategy,
  HealthCheckResult,
  CostEstimate,
  UsageStats,
  UsagePeriod,
  LLMProviderError,
  isLLMProviderError,
} from './types.js';
import { BaseProviderOptions, ILogger, consoleLogger } from './base-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { GoogleProvider } from './google-provider.js';
import { CohereProvider } from './cohere-provider.js';
import { OllamaProvider } from './ollama-provider.js';
import { RuVectorProvider } from './ruvector-provider.js';

/**
 * Cache entry for request caching
 */
interface CacheEntry {
  response: LLMResponse;
  timestamp: number;
  hits: number;
}

/**
 * Provider metrics for load balancing
 */
interface ProviderMetrics {
  latency: number;
  errorRate: number;
  cost: number;
  lastUsed: number;
  requestCount: number;
  successCount: number;
  failureCount: number;
}

/**
 * Provider pool configuration
 */
interface ProviderPool {
  providers: ILLMProvider[];
  strategy: LoadBalancingStrategy;
  maxConcurrentRequests: number;
  currentRequests: number;
}

/**
 * Enhanced provider manager configuration
 */
export interface EnhancedProviderManagerConfig extends ProviderManagerConfig {
  // Provider priority (higher = preferred)
  providerPriority?: Map<LLMProvider, number>;

  // Concurrent request limits per provider
  concurrentLimits?: Map<LLMProvider, number>;

  // Health check configuration
  healthCheck?: {
    enabled: boolean;
    interval: number;
    failureThreshold: number;
  };

  // Cost optimization settings
  costOptimization?: {
    enabled: boolean;
    maxCostPerRequest?: number;
    preferCheaper: boolean;
  };

  // Failover configuration
  failover?: {
    enabled: boolean;
    maxAttempts: number;
    retryableErrors: string[];
  };
}

/**
 * Provider Manager - Orchestrates multiple LLM providers
 */
export class ProviderManager extends EventEmitter {
  private providers: Map<LLMProvider, ILLMProvider> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private metrics: Map<LLMProvider, ProviderMetrics> = new Map();
  private roundRobinIndex = 0;
  private logger: ILogger;
  private providerPriority: Map<LLMProvider, number> = new Map();
  private concurrentLimits: Map<LLMProvider, number> = new Map();
  private activeRequests: Map<LLMProvider, number> = new Map();
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private providerHealth: Map<LLMProvider, boolean> = new Map();

  constructor(
    private config: ProviderManagerConfig,
    logger?: ILogger
  ) {
    super();
    this.logger = logger || consoleLogger;

    // Initialize enhanced configuration
    const enhancedConfig = config as EnhancedProviderManagerConfig;
    if (enhancedConfig.providerPriority) {
      this.providerPriority = new Map(enhancedConfig.providerPriority);
    }
    if (enhancedConfig.concurrentLimits) {
      this.concurrentLimits = new Map(enhancedConfig.concurrentLimits);
    }
  }

  /**
   * Initialize all configured providers
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing provider manager', {
      providerCount: this.config.providers.length,
    });

    const initPromises = this.config.providers.map(async (providerConfig) => {
      try {
        const provider = this.createProvider(providerConfig);
        await provider.initialize();
        this.providers.set(providerConfig.provider, provider);
        this.metrics.set(providerConfig.provider, {
          latency: 0,
          errorRate: 0,
          cost: 0,
          lastUsed: 0,
          requestCount: 0,
          successCount: 0,
          failureCount: 0,
        });
        this.activeRequests.set(providerConfig.provider, 0);
        this.providerHealth.set(providerConfig.provider, true);
        this.logger.info(`Provider ${providerConfig.provider} initialized`);
      } catch (error) {
        this.logger.error(`Failed to initialize ${providerConfig.provider}`, error);
        this.providerHealth.set(providerConfig.provider, false);
      }
    });

    await Promise.all(initPromises);

    // Start health monitoring if enabled
    const enhancedConfig = this.config as EnhancedProviderManagerConfig;
    if (enhancedConfig.healthCheck?.enabled) {
      this.startHealthMonitoring();
    }

    this.logger.info('Provider manager initialized', {
      activeProviders: Array.from(this.providers.keys()),
    });
  }

  /**
   * Create a provider instance
   */
  private createProvider(config: LLMProviderConfig): ILLMProvider {
    const options: BaseProviderOptions = {
      config,
      logger: this.logger,
    };

    switch (config.provider) {
      case 'anthropic':
        return new AnthropicProvider(options);
      case 'openai':
        return new OpenAIProvider(options);
      case 'google':
        return new GoogleProvider(options);
      case 'cohere':
        return new CohereProvider(options);
      case 'ollama':
        return new OllamaProvider(options);
      case 'ruvector':
        return new RuVectorProvider(options);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  /**
   * Complete a request with automatic provider selection
   */
  async complete(request: LLMRequest, preferredProvider?: LLMProvider): Promise<LLMResponse> {
    // Check cache first
    if (this.config.cache?.enabled) {
      const cached = this.getCached(request);
      if (cached) {
        this.logger.debug('Cache hit', { requestId: request.requestId });
        return cached;
      }
    }

    // Select provider
    const provider = preferredProvider
      ? this.providers.get(preferredProvider)
      : await this.selectProvider(request);

    if (!provider) {
      throw new Error('No available providers');
    }

    // Check concurrent request limit
    if (!this.canAcceptRequest(provider.name)) {
      // Try to find alternative provider
      const alternative = await this.selectProvider(request, [provider.name]);
      if (alternative) {
        return this.complete(request, alternative.name);
      }
      throw new Error(`Provider ${provider.name} at concurrent request limit`);
    }

    this.incrementActiveRequests(provider.name);
    const startTime = Date.now();

    try {
      const response = await provider.complete(request);
      this.updateMetrics(provider.name, Date.now() - startTime, false, response.cost?.totalCost || 0);

      // Cache response
      if (this.config.cache?.enabled) {
        this.setCached(request, response);
      }

      this.emit('complete', { provider: provider.name, response });
      return response;
    } catch (error) {
      this.updateMetrics(provider.name, Date.now() - startTime, true, 0);

      // Try fallback
      const enhancedConfig = this.config as EnhancedProviderManagerConfig;
      if (enhancedConfig.failover?.enabled && isLLMProviderError(error)) {
        return this.completWithFallback(request, provider.name, error);
      }

      throw error;
    } finally {
      this.decrementActiveRequests(provider.name);
    }
  }

  /**
   * Stream complete with automatic provider selection
   */
  async *streamComplete(
    request: LLMRequest,
    preferredProvider?: LLMProvider
  ): AsyncIterable<LLMStreamEvent> {
    const provider = preferredProvider
      ? this.providers.get(preferredProvider)
      : await this.selectProvider(request);

    if (!provider) {
      throw new Error('No available providers');
    }

    const startTime = Date.now();

    try {
      for await (const event of provider.streamComplete(request)) {
        yield event;
      }

      this.updateMetrics(provider.name, Date.now() - startTime, false, 0);
    } catch (error) {
      this.updateMetrics(provider.name, Date.now() - startTime, true, 0);
      throw error;
    }
  }

  /**
   * Select provider based on load balancing strategy
   */
  private async selectProvider(
    request: LLMRequest,
    excludeProviders: LLMProvider[] = []
  ): Promise<ILLMProvider | undefined> {
    // Filter available and healthy providers
    const availableProviders = Array.from(this.providers.values()).filter(
      (p) =>
        p.getStatus().available &&
        this.providerHealth.get(p.name) !== false &&
        !excludeProviders.includes(p.name) &&
        this.canAcceptRequest(p.name)
    );

    if (availableProviders.length === 0) {
      // Try to use any provider as fallback
      const fallbackProviders = Array.from(this.providers.values()).filter(
        (p) => !excludeProviders.includes(p.name)
      );
      return fallbackProviders[0];
    }

    // Apply priority filtering
    const prioritizedProviders = this.applyPriority(availableProviders);

    const strategy = this.config.loadBalancing?.strategy || 'round-robin';

    switch (strategy) {
      case 'round-robin':
        return this.selectRoundRobin(prioritizedProviders);
      case 'least-loaded':
        return this.selectLeastLoaded(prioritizedProviders);
      case 'latency-based':
        return this.selectByLatency(prioritizedProviders);
      case 'cost-based':
        return this.selectByCost(prioritizedProviders, request);
      default:
        return prioritizedProviders[0];
    }
  }

  /**
   * Apply provider priority filtering
   */
  private applyPriority(providers: ILLMProvider[]): ILLMProvider[] {
    if (this.providerPriority.size === 0) {
      return providers;
    }

    // Sort by priority (higher first)
    return providers.sort((a, b) => {
      const priorityA = this.providerPriority.get(a.name) || 0;
      const priorityB = this.providerPriority.get(b.name) || 0;
      return priorityB - priorityA;
    });
  }

  /**
   * Check if provider can accept new request
   */
  private canAcceptRequest(provider: LLMProvider): boolean {
    const limit = this.concurrentLimits.get(provider);
    if (!limit) return true;

    const current = this.activeRequests.get(provider) || 0;
    return current < limit;
  }

  /**
   * Increment active request count
   */
  private incrementActiveRequests(provider: LLMProvider): void {
    const current = this.activeRequests.get(provider) || 0;
    this.activeRequests.set(provider, current + 1);
  }

  /**
   * Decrement active request count
   */
  private decrementActiveRequests(provider: LLMProvider): void {
    const current = this.activeRequests.get(provider) || 0;
    this.activeRequests.set(provider, Math.max(0, current - 1));
  }

  private selectRoundRobin(providers: ILLMProvider[]): ILLMProvider {
    const provider = providers[this.roundRobinIndex % providers.length];
    this.roundRobinIndex++;
    return provider;
  }

  private selectLeastLoaded(providers: ILLMProvider[]): ILLMProvider {
    return providers.reduce((best, current) =>
      current.getStatus().currentLoad < best.getStatus().currentLoad ? current : best
    );
  }

  private selectByLatency(providers: ILLMProvider[]): ILLMProvider {
    return providers.reduce((best, current) => {
      const bestMetrics = this.metrics.get(best.name);
      const currentMetrics = this.metrics.get(current.name);
      return (currentMetrics?.latency || Infinity) < (bestMetrics?.latency || Infinity)
        ? current
        : best;
    });
  }

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
   * Complete with fallback on failure
   */
  private async completWithFallback(
    request: LLMRequest,
    failedProvider: LLMProvider,
    originalError: LLMProviderError
  ): Promise<LLMResponse> {
    const maxAttempts = this.config.fallback?.maxAttempts || 2;
    let attempts = 0;
    let lastError = originalError;

    const remainingProviders = Array.from(this.providers.values()).filter(
      (p) => p.name !== failedProvider
    );

    for (const provider of remainingProviders) {
      if (attempts >= maxAttempts) break;
      attempts++;

      this.logger.info(`Attempting fallback to ${provider.name}`, {
        attempt: attempts,
        originalProvider: failedProvider,
      });

      try {
        const response = await provider.complete(request);
        this.emit('fallback_success', {
          originalProvider: failedProvider,
          fallbackProvider: provider.name,
          attempts,
        });
        return response;
      } catch (error) {
        if (isLLMProviderError(error)) {
          lastError = error;
        }
      }
    }

    this.emit('fallback_exhausted', {
      originalProvider: failedProvider,
      attempts,
    });

    throw lastError;
  }

  /**
   * Update provider metrics
   */
  private updateMetrics(
    provider: LLMProvider,
    latency: number,
    error: boolean,
    cost: number
  ): void {
    const current = this.metrics.get(provider) || {
      latency: 0,
      errorRate: 0,
      cost: 0,
      lastUsed: 0,
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
    };

    // Exponential moving average for latency
    const alpha = 0.3;
    const newLatency = current.latency === 0 ? latency : alpha * latency + (1 - alpha) * current.latency;

    // Update error rate
    const errorWeight = error ? 1 : 0;
    const newErrorRate = alpha * errorWeight + (1 - alpha) * current.errorRate;

    // Update health status based on error rate
    const enhancedConfig = this.config as EnhancedProviderManagerConfig;
    if (enhancedConfig.healthCheck?.enabled) {
      const threshold = enhancedConfig.healthCheck.failureThreshold || 0.5;
      if (newErrorRate > threshold) {
        this.providerHealth.set(provider, false);
        this.emit('provider_unhealthy', { provider, errorRate: newErrorRate });
      }
    }

    this.metrics.set(provider, {
      latency: newLatency,
      errorRate: newErrorRate,
      cost: current.cost + cost,
      lastUsed: Date.now(),
      requestCount: current.requestCount + 1,
      successCount: error ? current.successCount : current.successCount + 1,
      failureCount: error ? current.failureCount + 1 : current.failureCount,
    });
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    const enhancedConfig = this.config as EnhancedProviderManagerConfig;
    const interval = enhancedConfig.healthCheck?.interval || 60000;

    this.healthCheckInterval = setInterval(async () => {
      for (const [name, provider] of this.providers.entries()) {
        try {
          const result = await provider.healthCheck();
          const wasHealthy = this.providerHealth.get(name);
          this.providerHealth.set(name, result.healthy);

          if (!wasHealthy && result.healthy) {
            this.emit('provider_recovered', { provider: name });
            this.logger.info(`Provider ${name} recovered`);
          } else if (wasHealthy && !result.healthy) {
            this.emit('provider_failed', { provider: name, error: result.error });
            this.logger.warn(`Provider ${name} failed health check: ${result.error}`);
          }
        } catch (error) {
          this.providerHealth.set(name, false);
          this.logger.error(`Health check failed for ${name}`, error);
        }
      }
    }, interval);
  }

  /**
   * Get provider health status
   */
  getProviderHealth(): Map<LLMProvider, boolean> {
    return new Map(this.providerHealth);
  }

  /**
   * Set provider priority
   */
  setProviderPriority(provider: LLMProvider, priority: number): void {
    this.providerPriority.set(provider, priority);
    this.logger.info(`Set priority for ${provider} to ${priority}`);
  }

  /**
   * Set concurrent request limit for provider
   */
  setConcurrentLimit(provider: LLMProvider, limit: number): void {
    this.concurrentLimits.set(provider, limit);
    this.logger.info(`Set concurrent limit for ${provider} to ${limit}`);
  }

  /**
   * Get active request count for provider
   */
  getActiveRequests(provider?: LLMProvider): number | Map<LLMProvider, number> {
    if (provider) {
      return this.activeRequests.get(provider) || 0;
    }
    return new Map(this.activeRequests);
  }

  /**
   * Route request to optimal provider based on requirements
   */
  async routeRequest(request: LLMRequest): Promise<ILLMProvider> {
    // Check cost constraints
    const enhancedConfig = this.config as EnhancedProviderManagerConfig;
    if (enhancedConfig.costOptimization?.enabled && request.costConstraints?.maxCost) {
      return this.routeByCost(request, request.costConstraints.maxCost);
    }

    // Use standard selection
    const provider = await this.selectProvider(request);
    if (!provider) {
      throw new Error('No available providers for routing');
    }
    return provider;
  }

  /**
   * Route by cost constraint
   */
  private async routeByCost(request: LLMRequest, maxCost: number): Promise<ILLMProvider> {
    const estimates: Array<{ provider: ILLMProvider; cost: number }> = [];

    for (const provider of this.providers.values()) {
      if (!this.providerHealth.get(provider.name)) continue;
      if (!this.canAcceptRequest(provider.name)) continue;

      try {
        const estimate = await provider.estimateCost(request);
        if (estimate.estimatedCost.total <= maxCost) {
          estimates.push({
            provider,
            cost: estimate.estimatedCost.total,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to estimate cost for ${provider.name}`, { error });
      }
    }

    if (estimates.length === 0) {
      throw new Error(`No providers available within cost constraint of ${maxCost}`);
    }

    // Sort by cost (cheapest first)
    estimates.sort((a, b) => a.cost - b.cost);
    return estimates[0].provider;
  }

  /**
   * Find providers capable of handling a specific model
   */
  findCapableProviders(model: LLMModel): ILLMProvider[] {
    return Array.from(this.providers.values()).filter((provider) =>
      provider.validateModel(model)
    );
  }

  /**
   * Get cached response
   */
  private getCached(request: LLMRequest): LLMResponse | undefined {
    const key = this.getCacheKey(request);
    const entry = this.cache.get(key);

    if (!entry) return undefined;

    const ttl = this.config.cache?.ttl || 300000;
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return undefined;
    }

    entry.hits++;
    return entry.response;
  }

  /**
   * Set cached response
   */
  private setCached(request: LLMRequest, response: LLMResponse): void {
    const key = this.getCacheKey(request);

    // Enforce max size
    const maxSize = this.config.cache?.maxSize || 1000;
    if (this.cache.size >= maxSize) {
      // Remove oldest entry
      const oldest = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0];
      if (oldest) this.cache.delete(oldest[0]);
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Generate cache key
   */
  private getCacheKey(request: LLMRequest): string {
    return JSON.stringify({
      messages: request.messages,
      model: request.model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });
  }

  /**
   * Get a specific provider
   */
  getProvider(name: LLMProvider): ILLMProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * List all available providers
   */
  listProviders(): LLMProvider[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Health check all providers
   */
  async healthCheck(): Promise<Map<LLMProvider, HealthCheckResult>> {
    const results = new Map<LLMProvider, HealthCheckResult>();

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([name, provider]) => {
        const result = await provider.healthCheck();
        results.set(name, result);
      })
    );

    return results;
  }

  /**
   * Estimate cost across providers
   */
  async estimateCost(request: LLMRequest): Promise<Map<LLMProvider, CostEstimate>> {
    const estimates = new Map<LLMProvider, CostEstimate>();

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([name, provider]) => {
        const estimate = await provider.estimateCost(request);
        estimates.set(name, estimate);
      })
    );

    return estimates;
  }

  /**
   * Get aggregated usage statistics
   */
  async getUsage(period: UsagePeriod = 'day'): Promise<UsageStats> {
    let totalRequests = 0;
    let totalTokens = { prompt: 0, completion: 0, total: 0 };
    let totalCost = { prompt: 0, completion: 0, total: 0 };
    let totalErrors = 0;
    let totalLatency = 0;
    let count = 0;

    for (const provider of this.providers.values()) {
      const usage = await provider.getUsage(period);
      totalRequests += usage.requests;
      totalTokens.prompt += usage.tokens.prompt;
      totalTokens.completion += usage.tokens.completion;
      totalTokens.total += usage.tokens.total;
      totalCost.prompt += usage.cost.prompt;
      totalCost.completion += usage.cost.completion;
      totalCost.total += usage.cost.total;
      totalErrors += usage.errors;
      totalLatency += usage.averageLatency;
      count++;
    }

    const now = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 1);

    return {
      period: { start, end: now },
      requests: totalRequests,
      tokens: totalTokens,
      cost: { ...totalCost, currency: 'USD' },
      errors: totalErrors,
      averageLatency: count > 0 ? totalLatency / count : 0,
      modelBreakdown: {},
    };
  }

  /**
   * Get provider metrics
   */
  getMetrics(): Map<LLMProvider, ProviderMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  /**
   * Destroy all providers
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    for (const provider of this.providers.values()) {
      provider.destroy();
    }
    this.providers.clear();
    this.cache.clear();
    this.metrics.clear();
    this.activeRequests.clear();
    this.providerHealth.clear();
    this.providerPriority.clear();
    this.concurrentLimits.clear();
    this.removeAllListeners();
    this.logger.info('Provider manager destroyed');
  }
}

/**
 * Create and initialize a provider manager
 */
export async function createProviderManager(
  config: ProviderManagerConfig,
  logger?: ILogger
): Promise<ProviderManager> {
  const manager = new ProviderManager(config, logger);
  await manager.initialize();
  return manager;
}
