/**
 * Queue Manager with Backpressure
 *
 * Priority queue with timeout, retry with exponential backoff,
 * and circuit breaker integration for handling rate limit failures.
 *
 * @module @claude-flow/throttle/backpressure/queue-manager
 */

export type Priority = 'low' | 'normal' | 'high' | 'critical';

export interface QueueConfig {
  /**
   * Maximum queue size
   */
  maxSize: number;

  /**
   * Default timeout for queued requests (ms)
   * @default 30000
   */
  defaultTimeoutMs?: number;

  /**
   * Enable retry on failure
   * @default true
   */
  enableRetry?: boolean;

  /**
   * Maximum retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial backoff delay (ms)
   * @default 1000
   */
  initialBackoffMs?: number;

  /**
   * Backoff multiplier
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Maximum backoff delay (ms)
   * @default 60000
   */
  maxBackoffMs?: number;

  /**
   * Circuit breaker config
   */
  circuitBreaker?: CircuitBreakerConfig;
}

interface ResolvedCircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  openTimeoutMs: number;
}

export interface CircuitBreakerConfig {
  /**
   * Failure threshold to open circuit
   * @default 5
   */
  failureThreshold?: number;

  /**
   * Success threshold to close circuit
   * @default 2
   */
  successThreshold?: number;

  /**
   * Timeout before trying to close circuit (ms)
   * @default 60000
   */
  openTimeoutMs?: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

interface QueuedRequest<T> {
  id: string;
  priority: Priority;
  request: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeoutMs: number;
  retries: number;
  timeoutHandle?: NodeJS.Timeout;
}

const PRIORITY_WEIGHTS: Record<Priority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export class QueueManager<T = unknown> {
  private readonly maxSize: number;
  private readonly defaultTimeoutMs: number;
  private readonly enableRetry: boolean;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly backoffMultiplier: number;
  private readonly maxBackoffMs: number;
  private readonly circuitBreaker: ResolvedCircuitBreakerConfig;
  private queue: QueuedRequest<T>[] = [];
  private processing: boolean = false;
  private requestCounter: number = 0;
  private circuitState: CircuitState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private circuitOpenTime?: number;
  private stats = {
    totalQueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    totalRetried: 0,
    totalTimeout: 0,
    circuitOpenCount: 0,
  };

  constructor(config: QueueConfig) {
    this.maxSize = config.maxSize;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
    this.enableRetry = config.enableRetry ?? true;
    this.maxRetries = config.maxRetries ?? 3;
    this.initialBackoffMs = config.initialBackoffMs ?? 1000;
    this.backoffMultiplier = config.backoffMultiplier ?? 2;
    this.maxBackoffMs = config.maxBackoffMs ?? 60_000;
    this.circuitBreaker = {
      failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
      successThreshold: config.circuitBreaker?.successThreshold ?? 2,
      openTimeoutMs: config.circuitBreaker?.openTimeoutMs ?? 60_000,
    };
  }

  /**
   * Enqueue a request
   */
  async enqueue(
    request: () => Promise<T>,
    priority: Priority = 'normal',
    timeoutMs?: number
  ): Promise<T> {
    // Check circuit breaker
    if (this.circuitState === 'open') {
      const elapsed = Date.now() - (this.circuitOpenTime ?? 0);
      if (elapsed < this.circuitBreaker.openTimeoutMs) {
        throw new Error('Circuit breaker is open');
      }
      // Try half-open
      this.circuitState = 'half-open';
      this.successCount = 0;
    }

    // Check queue size
    if (this.queue.length >= this.maxSize) {
      throw new Error(`Queue is full (${this.maxSize})`);
    }

    return new Promise<T>((resolve, reject) => {
      const queuedRequest: QueuedRequest<T> = {
        id: `req-${++this.requestCounter}`,
        priority,
        request,
        resolve,
        reject,
        timestamp: Date.now(),
        timeoutMs: timeoutMs ?? this.defaultTimeoutMs,
        retries: 0,
      };

      // Set timeout
      queuedRequest.timeoutHandle = setTimeout(() => {
        this.handleTimeout(queuedRequest.id);
      }, queuedRequest.timeoutMs);

      this.queue.push(queuedRequest);
      this.stats.totalQueued++;

      // Sort by priority (stable sort to maintain FIFO within same priority)
      this.sortQueue();

      // Start processing if not already
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) {
        break;
      }

      // Clear timeout
      if (request.timeoutHandle) {
        clearTimeout(request.timeoutHandle);
      }

      try {
        const result = await request.request();
        this.handleSuccess(request, result);
      } catch (error) {
        this.handleFailure(request, error as Error);
      }
    }

    this.processing = false;
  }

  /**
   * Handle successful request
   */
  private handleSuccess(request: QueuedRequest<T>, result: T): void {
    this.stats.totalProcessed++;
    request.resolve(result);

    // Update circuit breaker
    if (this.circuitState === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.circuitBreaker.successThreshold) {
        this.closeCircuit();
      }
    } else if (this.circuitState === 'closed') {
      this.failureCount = 0; // Reset failure count on success
    }
  }

  /**
   * Handle failed request
   */
  private handleFailure(request: QueuedRequest<T>, error: Error): void {
    // Check if should retry
    if (this.enableRetry && request.retries < this.maxRetries) {
      this.retryRequest(request);
      return;
    }

    this.stats.totalFailed++;
    request.reject(error);

    // Update circuit breaker
    this.failureCount++;
    if (this.circuitState === 'half-open' ||
        this.failureCount >= this.circuitBreaker.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Retry a failed request with exponential backoff
   */
  private async retryRequest(request: QueuedRequest<T>): Promise<void> {
    this.stats.totalRetried++;
    request.retries++;

    // Calculate backoff delay
    const backoffMs = Math.min(
      this.initialBackoffMs * Math.pow(this.backoffMultiplier, request.retries - 1),
      this.maxBackoffMs
    );

    // Add jitter (±10%)
    const jitter = backoffMs * 0.1 * (Math.random() * 2 - 1);
    const delayMs = Math.max(0, backoffMs + jitter);

    // Wait before retrying
    await this.sleep(delayMs);

    // Re-enqueue with same priority
    this.queue.push(request);
    this.sortQueue();
  }

  /**
   * Handle request timeout
   */
  private handleTimeout(requestId: string): void {
    const index = this.queue.findIndex(r => r.id === requestId);
    if (index !== -1) {
      const request = this.queue.splice(index, 1)[0];
      this.stats.totalTimeout++;
      request.reject(new Error('Request timeout'));
    }
  }

  /**
   * Sort queue by priority
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First by priority weight
      const priorityDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      // Then by timestamp (FIFO within same priority)
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Open circuit breaker
   */
  private openCircuit(): void {
    this.circuitState = 'open';
    this.circuitOpenTime = Date.now();
    this.stats.circuitOpenCount++;
    this.failureCount = 0;

    // Reject all queued requests
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        if (request.timeoutHandle) {
          clearTimeout(request.timeoutHandle);
        }
        request.reject(new Error('Circuit breaker opened'));
      }
    }
  }

  /**
   * Close circuit breaker
   */
  private closeCircuit(): void {
    this.circuitState = 'closed';
    this.circuitOpenTime = undefined;
    this.successCount = 0;
    this.failureCount = 0;
  }

  /**
   * Get current state
   */
  getState() {
    return {
      queueSize: this.queue.length,
      maxSize: this.maxSize,
      processing: this.processing,
      circuitState: this.circuitState,
      stats: { ...this.stats },
      utilization: this.queue.length / this.maxSize,
    };
  }

  /**
   * Get queue size by priority
   */
  getQueueSizeByPriority(): Record<Priority, number> {
    const counts: Record<Priority, number> = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    };

    for (const request of this.queue) {
      counts[request.priority]++;
    }

    return counts;
  }

  /**
   * Clear queue
   */
  clear(): void {
    for (const request of this.queue) {
      if (request.timeoutHandle) {
        clearTimeout(request.timeoutHandle);
      }
      request.reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }

  /**
   * Reset stats and circuit breaker
   */
  reset(): void {
    this.clear();
    this.circuitState = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.circuitOpenTime = undefined;
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      totalRetried: 0,
      totalTimeout: 0,
      circuitOpenCount: 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
