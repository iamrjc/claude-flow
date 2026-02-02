/**
 * Global Rate Limit Policies
 *
 * System-wide caps and emergency throttling:
 * - Total system request limits
 * - Emergency throttling modes
 * - Graceful degradation strategies
 * - Circuit breaker integration
 *
 * @module @claude-flow/throttle/policies/global-limits
 */

import { TokenBucket } from '../limiters/token-bucket.js';
import { SlidingWindow } from '../limiters/sliding-window.js';

export interface GlobalLimitConfig {
  /**
   * Maximum total requests per minute (all providers)
   */
  totalRPM?: number;

  /**
   * Maximum total tokens per minute (all providers)
   */
  totalTPM?: number;

  /**
   * Maximum total concurrent requests
   */
  totalConcurrent?: number;

  /**
   * Maximum total cost per hour (USD)
   */
  totalCostPerHour?: number;

  /**
   * Maximum total cost per day (USD)
   */
  totalCostPerDay?: number;

  /**
   * Enable emergency throttling
   * @default true
   */
  enableEmergencyThrottle?: boolean;

  /**
   * Emergency throttle threshold (0-1, system load)
   * @default 0.9
   */
  emergencyThreshold?: number;

  /**
   * Graceful degradation mode
   * @default 'queue'
   */
  degradationMode?: 'queue' | 'reject' | 'shed' | 'priority';
}

export const DEFAULT_GLOBAL_LIMITS: GlobalLimitConfig = {
  totalRPM: 500,
  totalTPM: 1_000_000,
  totalConcurrent: 50,
  totalCostPerHour: 100.0,
  totalCostPerDay: 2000.0,
  enableEmergencyThrottle: true,
  emergencyThreshold: 0.9,
  degradationMode: 'queue',
};

export type ThrottleMode = 'normal' | 'emergency' | 'critical';

export interface SystemMetrics {
  totalRequests: number;
  totalTokens: number;
  activeConcurrent: number;
  totalCost: number;
  throttleMode: ThrottleMode;
  timestamp: number;
}

export class GlobalRateLimiter {
  private readonly config: GlobalLimitConfig;
  private readonly rpmLimiter?: SlidingWindow;
  private readonly tpmLimiter?: TokenBucket;
  private readonly costPerHourLimiter?: SlidingWindow;
  private readonly costPerDayLimiter?: SlidingWindow;
  private activeConcurrent: number = 0;
  private throttleMode: ThrottleMode = 'normal';
  private metrics: SystemMetrics;
  private costHistory: Array<{ cost: number; timestamp: number }> = [];

  constructor(config?: Partial<GlobalLimitConfig>) {
    this.config = { ...DEFAULT_GLOBAL_LIMITS, ...config };

    // Initialize RPM limiter
    if (this.config.totalRPM) {
      this.rpmLimiter = new SlidingWindow({
        maxRequests: this.config.totalRPM,
        windowMs: 60_000,
        buckets: 12,
      });
    }

    // Initialize TPM limiter
    if (this.config.totalTPM) {
      this.tpmLimiter = new TokenBucket({
        capacity: this.config.totalTPM,
        refillRate: this.config.totalTPM / 60,
        initialTokens: this.config.totalTPM,
      });
    }

    // Initialize cost limiters
    if (this.config.totalCostPerHour) {
      this.costPerHourLimiter = new SlidingWindow({
        maxRequests: Number.MAX_SAFE_INTEGER,
        windowMs: 3_600_000,
        buckets: 60,
      });
    }

    if (this.config.totalCostPerDay) {
      this.costPerDayLimiter = new SlidingWindow({
        maxRequests: Number.MAX_SAFE_INTEGER,
        windowMs: 86_400_000,
        buckets: 24,
      });
    }

    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      activeConcurrent: 0,
      totalCost: 0,
      throttleMode: 'normal',
      timestamp: Date.now(),
    };
  }

  /**
   * Check if a request can be made globally
   */
  async canMakeRequest(tokens: number = 1000, cost: number = 0): Promise<{
    allowed: boolean;
    reason?: string;
    waitTimeMs?: number;
    degraded?: boolean;
  }> {
    // Check emergency throttle
    if (this.config.enableEmergencyThrottle && this.throttleMode === 'critical') {
      return {
        allowed: false,
        reason: 'System in critical state',
        degraded: true,
      };
    }

    // Check concurrent limit
    if (this.config.totalConcurrent &&
        this.activeConcurrent >= this.config.totalConcurrent) {
      return this.handleConcurrentLimit();
    }

    // Check RPM limit
    if (this.rpmLimiter && !this.rpmLimiter.tryAcquire()) {
      const waitTime = this.rpmLimiter.getWaitTime();
      return this.handleRateLimit('RPM', waitTime);
    }

    // Check TPM limit
    if (this.tpmLimiter && !this.tpmLimiter.consume(tokens)) {
      const waitTime = this.tpmLimiter.getWaitTime(tokens);
      return this.handleRateLimit('TPM', waitTime);
    }

    // Check cost limits
    const costCheck = this.checkCostLimits(cost);
    if (!costCheck.allowed) {
      return costCheck;
    }

    // Apply emergency throttle if needed
    if (this.throttleMode === 'emergency') {
      return {
        allowed: true,
        degraded: true,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a completed request
   */
  recordRequest(tokens: number, cost: number): void {
    this.metrics.totalRequests++;
    this.metrics.totalTokens += tokens;
    this.metrics.totalCost += cost;

    // Track cost history
    this.costHistory.push({ cost, timestamp: Date.now() });

    // Cleanup old cost history (keep last day)
    const cutoff = Date.now() - 86_400_000;
    this.costHistory = this.costHistory.filter(h => h.timestamp > cutoff);

    // Update throttle mode based on system load
    this.updateThrottleMode();
  }

  /**
   * Acquire a concurrent request slot
   */
  acquireConcurrentSlot(): boolean {
    if (this.config.totalConcurrent &&
        this.activeConcurrent >= this.config.totalConcurrent) {
      return false;
    }
    this.activeConcurrent++;
    this.metrics.activeConcurrent = this.activeConcurrent;
    return true;
  }

  /**
   * Release a concurrent request slot
   */
  releaseConcurrentSlot(): void {
    this.activeConcurrent = Math.max(0, this.activeConcurrent - 1);
    this.metrics.activeConcurrent = this.activeConcurrent;
  }

  /**
   * Get current system metrics
   */
  getMetrics(): SystemMetrics {
    return {
      ...this.metrics,
      timestamp: Date.now(),
    };
  }

  /**
   * Get current throttle mode
   */
  getThrottleMode(): ThrottleMode {
    return this.throttleMode;
  }

  /**
   * Manually set throttle mode
   */
  setThrottleMode(mode: ThrottleMode): void {
    this.throttleMode = mode;
    this.metrics.throttleMode = mode;
  }

  /**
   * Get system load (0-1)
   */
  getSystemLoad(): number {
    let load = 0;
    let factors = 0;

    if (this.config.totalConcurrent) {
      load += this.activeConcurrent / this.config.totalConcurrent;
      factors++;
    }

    if (this.rpmLimiter) {
      load += this.rpmLimiter.getState().utilization;
      factors++;
    }

    if (this.tpmLimiter) {
      load += this.tpmLimiter.getState().utilization;
      factors++;
    }

    const costs = this.getCurrentCosts();
    if (this.config.totalCostPerHour && costs.perHour > 0) {
      load += costs.perHour / this.config.totalCostPerHour;
      factors++;
    }

    return factors > 0 ? load / factors : 0;
  }

  /**
   * Get current state
   */
  getState() {
    const costs = this.getCurrentCosts();
    const systemLoad = this.getSystemLoad();

    return {
      limits: this.config,
      current: {
        rpm: this.rpmLimiter?.getState().currentCount ?? 0,
        tpm: this.tpmLimiter
          ? this.config.totalTPM! - this.tpmLimiter.getState().tokens
          : 0,
        concurrent: this.activeConcurrent,
        costs,
        systemLoad,
      },
      throttleMode: this.throttleMode,
      metrics: this.getMetrics(),
    };
  }

  /**
   * Reset all limiters
   */
  reset(): void {
    this.rpmLimiter?.reset();
    this.tpmLimiter?.reset();
    this.costPerHourLimiter?.reset();
    this.costPerDayLimiter?.reset();
    this.activeConcurrent = 0;
    this.throttleMode = 'normal';
    this.costHistory = [];
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      activeConcurrent: 0,
      totalCost: 0,
      throttleMode: 'normal',
      timestamp: Date.now(),
    };
  }

  /**
   * Handle concurrent limit based on degradation mode
   */
  private handleConcurrentLimit(): {
    allowed: boolean;
    reason?: string;
    degraded?: boolean;
  } {
    switch (this.config.degradationMode) {
      case 'queue':
        return {
          allowed: true,
          reason: 'Request queued due to concurrent limit',
          degraded: true,
        };
      case 'shed':
        return {
          allowed: Math.random() > 0.5, // Shed 50% of requests
          reason: 'Load shedding active',
          degraded: true,
        };
      case 'reject':
      default:
        return {
          allowed: false,
          reason: `Global concurrent limit reached (${this.config.totalConcurrent})`,
        };
    }
  }

  /**
   * Handle rate limit based on degradation mode
   */
  private handleRateLimit(limitType: string, waitTime: number): {
    allowed: boolean;
    reason?: string;
    waitTimeMs?: number;
    degraded?: boolean;
  } {
    switch (this.config.degradationMode) {
      case 'queue':
        return {
          allowed: true,
          reason: `${limitType} limit reached, request queued`,
          waitTimeMs: waitTime,
          degraded: true,
        };
      case 'priority':
        return {
          allowed: true,
          reason: `${limitType} limit reached, priority scheduling active`,
          degraded: true,
        };
      default:
        return {
          allowed: false,
          reason: `Global ${limitType} limit reached`,
          waitTimeMs: waitTime,
        };
    }
  }

  /**
   * Check cost limits
   */
  private checkCostLimits(estimatedCost: number): {
    allowed: boolean;
    reason?: string;
  } {
    const costs = this.getCurrentCosts();

    if (this.config.totalCostPerHour &&
        costs.perHour + estimatedCost > this.config.totalCostPerHour) {
      return {
        allowed: false,
        reason: `Global hourly cost limit reached ($${this.config.totalCostPerHour})`,
      };
    }

    if (this.config.totalCostPerDay &&
        costs.perDay + estimatedCost > this.config.totalCostPerDay) {
      return {
        allowed: false,
        reason: `Global daily cost limit reached ($${this.config.totalCostPerDay})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get current cost totals
   */
  private getCurrentCosts(): {
    perHour: number;
    perDay: number;
  } {
    const now = Date.now();
    const hour = now - 3_600_000;
    const day = now - 86_400_000;

    return {
      perHour: this.costHistory
        .filter(h => h.timestamp >= hour)
        .reduce((sum, h) => sum + h.cost, 0),
      perDay: this.costHistory
        .filter(h => h.timestamp >= day)
        .reduce((sum, h) => sum + h.cost, 0),
    };
  }

  /**
   * Update throttle mode based on system load
   */
  private updateThrottleMode(): void {
    if (!this.config.enableEmergencyThrottle) {
      return;
    }

    const systemLoad = this.getSystemLoad();
    const threshold = this.config.emergencyThreshold ?? 0.9;

    if (systemLoad >= threshold * 1.1) {
      this.throttleMode = 'critical';
    } else if (systemLoad >= threshold) {
      this.throttleMode = 'emergency';
    } else if (systemLoad < threshold * 0.8) {
      this.throttleMode = 'normal';
    }

    this.metrics.throttleMode = this.throttleMode;
  }
}
