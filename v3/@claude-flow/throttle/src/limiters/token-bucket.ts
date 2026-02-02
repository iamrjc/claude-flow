/**
 * Token Bucket Rate Limiter
 *
 * Classic token bucket algorithm with configurable rate and burst capacity.
 * Tokens are added at a constant rate and requests consume tokens.
 * Allows bursts up to bucket capacity while maintaining average rate.
 *
 * @module @claude-flow/throttle/limiters/token-bucket
 */

export interface TokenBucketConfig {
  /**
   * Maximum number of tokens the bucket can hold (burst capacity)
   */
  capacity: number;

  /**
   * Rate at which tokens are replenished (tokens per second)
   */
  refillRate: number;

  /**
   * Initial number of tokens in the bucket
   * @default capacity
   */
  initialTokens?: number;

  /**
   * Minimum tokens required per request
   * @default 1
   */
  tokensPerRequest?: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly tokensPerRequest: number;

  constructor(config: TokenBucketConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.tokensPerRequest = config.tokensPerRequest ?? 1;
    this.tokens = config.initialTokens ?? config.capacity;
    this.lastRefillTime = Date.now();

    if (this.capacity <= 0) {
      throw new Error('Capacity must be positive');
    }
    if (this.refillRate <= 0) {
      throw new Error('Refill rate must be positive');
    }
    if (this.tokensPerRequest <= 0) {
      throw new Error('Tokens per request must be positive');
    }
  }

  /**
   * Attempt to consume tokens for a request
   * @param tokens Number of tokens to consume (defaults to tokensPerRequest)
   * @returns true if tokens were consumed, false if insufficient tokens
   */
  consume(tokens?: number): boolean {
    const tokensNeeded = tokens ?? this.tokensPerRequest;
    this.refill();

    if (this.tokens >= tokensNeeded) {
      this.tokens -= tokensNeeded;
      return true;
    }

    return false;
  }

  /**
   * Attempt to consume tokens, waiting if necessary
   * @param tokens Number of tokens to consume
   * @param maxWaitMs Maximum time to wait in milliseconds (0 = don't wait)
   * @returns true if tokens were consumed, false if timeout
   */
  async consumeAsync(tokens?: number, maxWaitMs: number = 0): Promise<boolean> {
    const tokensNeeded = tokens ?? this.tokensPerRequest;

    if (this.consume(tokensNeeded)) {
      return true;
    }

    if (maxWaitMs <= 0) {
      return false;
    }

    // Calculate wait time needed
    const waitTime = this.getWaitTime(tokensNeeded);
    if (waitTime > maxWaitMs) {
      return false;
    }

    await this.sleep(waitTime);
    return this.consume(tokensNeeded);
  }

  /**
   * Get time to wait until tokens are available
   * @param tokens Number of tokens needed
   * @returns Wait time in milliseconds
   */
  getWaitTime(tokens?: number): number {
    const tokensNeeded = tokens ?? this.tokensPerRequest;
    this.refill();

    if (this.tokens >= tokensNeeded) {
      return 0;
    }

    const tokensRequired = tokensNeeded - this.tokens;
    return Math.ceil((tokensRequired / this.refillRate) * 1000);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Get current state
   */
  getState(): {
    tokens: number;
    capacity: number;
    refillRate: number;
    utilization: number;
  } {
    this.refill();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      utilization: 1 - (this.tokens / this.capacity),
    };
  }

  /**
   * Reset bucket to initial state
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
