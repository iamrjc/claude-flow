/**
 * Sliding Window Rate Limiter
 *
 * Sliding window counter algorithm that tracks requests in time buckets.
 * More accurate than fixed windows, prevents bursts at window boundaries.
 * Supports both sliding and fixed window variants.
 *
 * @module @claude-flow/throttle/limiters/sliding-window
 */

export interface SlidingWindowConfig {
  /**
   * Maximum number of requests allowed in the window
   */
  maxRequests: number;

  /**
   * Window size in milliseconds
   */
  windowMs: number;

  /**
   * Number of sub-windows (buckets) to divide the window into
   * Higher values = more accurate but more memory
   * @default 10
   */
  buckets?: number;

  /**
   * Use fixed window variant (resets at window boundaries)
   * @default false (sliding window)
   */
  fixedWindow?: boolean;
}

interface Bucket {
  timestamp: number;
  count: number;
}

export class SlidingWindow {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly buckets: Bucket[];
  private readonly bucketCount: number;
  private readonly bucketSizeMs: number;
  private readonly fixedWindow: boolean;
  private currentBucketIndex: number;
  private windowStartTime: number;

  constructor(config: SlidingWindowConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
    this.bucketCount = config.buckets ?? 10;
    this.fixedWindow = config.fixedWindow ?? false;
    this.bucketSizeMs = this.windowMs / this.bucketCount;
    this.currentBucketIndex = 0;
    this.windowStartTime = Date.now();

    if (this.maxRequests <= 0) {
      throw new Error('Max requests must be positive');
    }
    if (this.windowMs <= 0) {
      throw new Error('Window size must be positive');
    }
    if (this.bucketCount <= 0) {
      throw new Error('Bucket count must be positive');
    }

    // Initialize buckets
    this.buckets = Array.from({ length: this.bucketCount }, () => ({
      timestamp: this.windowStartTime,
      count: 0,
    }));
  }

  /**
   * Attempt to record a request
   * @param count Number of requests to record
   * @returns true if within limit, false if limit exceeded
   */
  tryAcquire(count: number = 1): boolean {
    const now = Date.now();
    this.updateBuckets(now);

    const currentCount = this.getCurrentCount(now);

    if (currentCount + count <= this.maxRequests) {
      this.recordRequest(now, count);
      return true;
    }

    return false;
  }

  /**
   * Attempt to acquire with async wait
   * @param count Number of requests
   * @param maxWaitMs Maximum time to wait
   * @returns true if acquired, false if timeout
   */
  async tryAcquireAsync(count: number = 1, maxWaitMs: number = 0): Promise<boolean> {
    if (this.tryAcquire(count)) {
      return true;
    }

    if (maxWaitMs <= 0) {
      return false;
    }

    const waitTime = this.getWaitTime();
    if (waitTime > maxWaitMs) {
      return false;
    }

    await this.sleep(waitTime);
    return this.tryAcquire(count);
  }

  /**
   * Get time until next request can be made
   * @returns Wait time in milliseconds
   */
  getWaitTime(): number {
    const now = Date.now();
    this.updateBuckets(now);

    if (this.getCurrentCount(now) < this.maxRequests) {
      return 0;
    }

    // Find oldest bucket with requests
    const oldestBucket = this.findOldestBucket();
    if (!oldestBucket) {
      return this.windowMs;
    }

    const timeUntilExpiry = (oldestBucket.timestamp + this.windowMs) - now;
    return Math.max(0, timeUntilExpiry);
  }

  /**
   * Get current request count in window
   */
  private getCurrentCount(now: number): number {
    if (this.fixedWindow) {
      // Fixed window: only count current window
      const elapsed = now - this.windowStartTime;
      if (elapsed >= this.windowMs) {
        return 0;
      }
      return this.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    } else {
      // Sliding window: count all requests in the window
      let total = 0;
      const windowStart = now - this.windowMs;

      for (const bucket of this.buckets) {
        if (bucket.timestamp >= windowStart && bucket.count > 0) {
          total += bucket.count;
        }
      }

      return total;
    }
  }

  /**
   * Record a request in the current bucket
   */
  private recordRequest(now: number, count: number): void {
    const bucketIndex = this.getBucketIndex(now);
    this.buckets[bucketIndex].count += count;
  }

  /**
   * Update buckets, resetting expired ones
   */
  private updateBuckets(now: number): void {
    if (this.fixedWindow) {
      // Reset all buckets if window expired
      const elapsed = now - this.windowStartTime;
      if (elapsed >= this.windowMs) {
        this.windowStartTime = now;
        this.buckets.forEach(bucket => {
          bucket.timestamp = now;
          bucket.count = 0;
        });
        this.currentBucketIndex = 0;
      }
    } else {
      // Reset expired buckets in sliding window
      const windowStart = now - this.windowMs;
      for (let i = 0; i < this.buckets.length; i++) {
        if (this.buckets[i].timestamp < windowStart) {
          this.buckets[i].timestamp = now;
          this.buckets[i].count = 0;
        }
      }
    }
  }

  /**
   * Get bucket index for timestamp
   */
  private getBucketIndex(now: number): number {
    const elapsed = now - this.windowStartTime;
    const bucketIndex = Math.floor((elapsed / this.windowMs) * this.bucketCount) % this.bucketCount;
    return bucketIndex;
  }

  /**
   * Find oldest bucket with requests
   */
  private findOldestBucket(): Bucket | null {
    let oldest: Bucket | null = null;
    for (const bucket of this.buckets) {
      if (bucket.count > 0) {
        if (!oldest || bucket.timestamp < oldest.timestamp) {
          oldest = bucket;
        }
      }
    }
    return oldest;
  }

  /**
   * Get current state
   */
  getState(): {
    currentCount: number;
    maxRequests: number;
    windowMs: number;
    utilization: number;
    buckets: number;
  } {
    const now = Date.now();
    this.updateBuckets(now);
    const currentCount = this.getCurrentCount(now);

    return {
      currentCount,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      utilization: currentCount / this.maxRequests,
      buckets: this.bucketCount,
    };
  }

  /**
   * Reset limiter to initial state
   */
  reset(): void {
    const now = Date.now();
    this.windowStartTime = now;
    this.currentBucketIndex = 0;
    this.buckets.forEach(bucket => {
      bucket.timestamp = now;
      bucket.count = 0;
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
