/**
 * Provider Rate Limit Policies
 *
 * Per-provider rate limits for LLM APIs:
 * - RPM (Requests Per Minute)
 * - TPM (Tokens Per Minute)
 * - Concurrent request limits
 * - Cost limits per minute/hour/day
 *
 * @module @claude-flow/throttle/policies/provider-limits
 */

import { TokenBucket } from '../limiters/token-bucket.js';
import { SlidingWindow } from '../limiters/sliding-window.js';

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'cohere'
  | 'ollama'
  | 'custom';

export interface ProviderLimitConfig {
  /**
   * Requests per minute limit
   */
  rpm?: number;

  /**
   * Tokens per minute limit
   */
  tpm?: number;

  /**
   * Maximum concurrent requests
   */
  concurrentLimit?: number;

  /**
   * Cost limit per minute (USD)
   */
  costPerMinuteLimit?: number;

  /**
   * Cost limit per hour (USD)
   */
  costPerHourLimit?: number;

  /**
   * Cost limit per day (USD)
   */
  costPerDayLimit?: number;

  /**
   * Enable burst capacity (150% of base limit)
   * @default true
   */
  allowBurst?: boolean;
}

/**
 * Default provider limits based on typical tier limits
 */
export const DEFAULT_PROVIDER_LIMITS: Record<ProviderType, ProviderLimitConfig> = {
  anthropic: {
    rpm: 50,
    tpm: 100_000,
    concurrentLimit: 5,
    costPerMinuteLimit: 1.0,
    costPerHourLimit: 50.0,
    costPerDayLimit: 1000.0,
    allowBurst: true,
  },
  openai: {
    rpm: 60,
    tpm: 150_000,
    concurrentLimit: 10,
    costPerMinuteLimit: 2.0,
    costPerHourLimit: 100.0,
    costPerDayLimit: 2000.0,
    allowBurst: true,
  },
  google: {
    rpm: 60,
    tpm: 120_000,
    concurrentLimit: 10,
    costPerMinuteLimit: 1.5,
    costPerHourLimit: 75.0,
    costPerDayLimit: 1500.0,
    allowBurst: true,
  },
  cohere: {
    rpm: 40,
    tpm: 100_000,
    concurrentLimit: 5,
    costPerMinuteLimit: 1.0,
    costPerHourLimit: 50.0,
    costPerDayLimit: 1000.0,
    allowBurst: true,
  },
  ollama: {
    rpm: 1000, // Local, virtually unlimited
    tpm: 1_000_000,
    concurrentLimit: 50,
    allowBurst: false,
  },
  custom: {
    rpm: 60,
    tpm: 100_000,
    concurrentLimit: 10,
    allowBurst: true,
  },
};

export interface RequestMetrics {
  tokens: number;
  cost: number;
  timestamp: number;
}

export class ProviderRateLimiter {
  private readonly provider: ProviderType;
  private readonly config: ProviderLimitConfig;
  private readonly rpmLimiter?: SlidingWindow;
  private readonly tpmLimiter?: TokenBucket;
  private activeConcurrentRequests: number = 0;
  private costTracking: {
    perMinute: SlidingWindow;
    perHour: SlidingWindow;
    perDay: SlidingWindow;
  };
  private requestHistory: RequestMetrics[] = [];

  constructor(provider: ProviderType, config?: Partial<ProviderLimitConfig>) {
    this.provider = provider;
    const defaults = DEFAULT_PROVIDER_LIMITS[provider];
    this.config = { ...defaults, ...config };

    // Initialize RPM limiter
    if (this.config.rpm) {
      const capacity = this.config.allowBurst
        ? Math.ceil(this.config.rpm * 1.5)
        : this.config.rpm;

      this.rpmLimiter = new SlidingWindow({
        maxRequests: capacity,
        windowMs: 60_000, // 1 minute
        buckets: 12, // 5-second buckets
      });
    }

    // Initialize TPM limiter (token bucket allows natural bursts)
    if (this.config.tpm) {
      const capacity = this.config.allowBurst
        ? Math.ceil(this.config.tpm * 1.5)
        : this.config.tpm;

      this.tpmLimiter = new TokenBucket({
        capacity,
        refillRate: this.config.tpm / 60, // tokens per second
        initialTokens: capacity,
      });
    }

    // Initialize cost tracking windows
    this.costTracking = {
      perMinute: new SlidingWindow({
        maxRequests: Number.MAX_SAFE_INTEGER, // Track all, check against limit
        windowMs: 60_000,
        buckets: 12,
      }),
      perHour: new SlidingWindow({
        maxRequests: Number.MAX_SAFE_INTEGER,
        windowMs: 3_600_000,
        buckets: 60,
      }),
      perDay: new SlidingWindow({
        maxRequests: Number.MAX_SAFE_INTEGER,
        windowMs: 86_400_000,
        buckets: 24,
      }),
    };
  }

  /**
   * Check if a request can be made
   * @param tokens Estimated tokens for the request
   * @param estimatedCost Estimated cost in USD
   */
  async canMakeRequest(tokens: number = 1000, estimatedCost: number = 0): Promise<{
    allowed: boolean;
    reason?: string;
    waitTimeMs?: number;
  }> {
    // Check concurrent limit
    if (this.config.concurrentLimit &&
        this.activeConcurrentRequests >= this.config.concurrentLimit) {
      return {
        allowed: false,
        reason: `Concurrent limit reached (${this.config.concurrentLimit})`,
      };
    }

    // Check RPM limit
    if (this.rpmLimiter && !this.rpmLimiter.tryAcquire()) {
      const waitTime = this.rpmLimiter.getWaitTime();
      return {
        allowed: false,
        reason: `RPM limit reached (${this.config.rpm})`,
        waitTimeMs: waitTime,
      };
    }

    // Check TPM limit
    if (this.tpmLimiter && !this.tpmLimiter.consume(tokens)) {
      const waitTime = this.tpmLimiter.getWaitTime(tokens);
      return {
        allowed: false,
        reason: `TPM limit reached (${this.config.tpm})`,
        waitTimeMs: waitTime,
      };
    }

    // Check cost limits
    const costCheck = this.checkCostLimits(estimatedCost);
    if (!costCheck.allowed) {
      return costCheck;
    }

    return { allowed: true };
  }

  /**
   * Record a completed request
   */
  recordRequest(metrics: RequestMetrics): void {
    this.requestHistory.push(metrics);

    // Track cost (use count as proxy for cost in sliding windows)
    const costUnits = Math.ceil(metrics.cost * 1000); // Convert to integer units
    this.costTracking.perMinute.tryAcquire(costUnits);
    this.costTracking.perHour.tryAcquire(costUnits);
    this.costTracking.perDay.tryAcquire(costUnits);

    // Cleanup old history (keep last hour)
    const cutoff = Date.now() - 3_600_000;
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > cutoff);
  }

  /**
   * Acquire a slot for concurrent request
   */
  acquireConcurrentSlot(): boolean {
    if (this.config.concurrentLimit &&
        this.activeConcurrentRequests >= this.config.concurrentLimit) {
      return false;
    }
    this.activeConcurrentRequests++;
    return true;
  }

  /**
   * Release a concurrent request slot
   */
  releaseConcurrentSlot(): void {
    this.activeConcurrentRequests = Math.max(0, this.activeConcurrentRequests - 1);
  }

  /**
   * Check cost limits
   */
  private checkCostLimits(estimatedCost: number): {
    allowed: boolean;
    reason?: string;
  } {
    const costs = this.getCurrentCosts();

    if (this.config.costPerMinuteLimit &&
        costs.perMinute + estimatedCost > this.config.costPerMinuteLimit) {
      return {
        allowed: false,
        reason: `Cost per minute limit reached ($${this.config.costPerMinuteLimit})`,
      };
    }

    if (this.config.costPerHourLimit &&
        costs.perHour + estimatedCost > this.config.costPerHourLimit) {
      return {
        allowed: false,
        reason: `Cost per hour limit reached ($${this.config.costPerHourLimit})`,
      };
    }

    if (this.config.costPerDayLimit &&
        costs.perDay + estimatedCost > this.config.costPerDayLimit) {
      return {
        allowed: false,
        reason: `Cost per day limit reached ($${this.config.costPerDayLimit})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get current cost totals
   */
  getCurrentCosts(): {
    perMinute: number;
    perHour: number;
    perDay: number;
  } {
    const now = Date.now();
    const minute = now - 60_000;
    const hour = now - 3_600_000;
    const day = now - 86_400_000;

    return {
      perMinute: this.sumCosts(minute),
      perHour: this.sumCosts(hour),
      perDay: this.sumCosts(day),
    };
  }

  private sumCosts(since: number): number {
    return this.requestHistory
      .filter(r => r.timestamp >= since)
      .reduce((sum, r) => sum + r.cost, 0);
  }

  /**
   * Get current state
   */
  getState() {
    const costs = this.getCurrentCosts();
    return {
      provider: this.provider,
      limits: this.config,
      current: {
        rpm: this.rpmLimiter?.getState().currentCount ?? 0,
        tpm: this.tpmLimiter ? this.config.tpm! - this.tpmLimiter.getState().tokens : 0,
        concurrent: this.activeConcurrentRequests,
        costs,
      },
      utilization: {
        rpm: this.rpmLimiter ? this.rpmLimiter.getState().utilization : 0,
        tpm: this.tpmLimiter ? this.tpmLimiter.getState().utilization : 0,
        concurrent: this.config.concurrentLimit
          ? this.activeConcurrentRequests / this.config.concurrentLimit
          : 0,
      },
    };
  }

  /**
   * Reset all limiters
   */
  reset(): void {
    this.rpmLimiter?.reset();
    this.tpmLimiter?.reset();
    this.activeConcurrentRequests = 0;
    this.costTracking.perMinute.reset();
    this.costTracking.perHour.reset();
    this.costTracking.perDay.reset();
    this.requestHistory = [];
  }
}
