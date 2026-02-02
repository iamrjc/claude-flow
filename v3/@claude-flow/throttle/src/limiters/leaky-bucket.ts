/**
 * Leaky Bucket Rate Limiter
 *
 * Queue-based rate limiter with constant output rate.
 * Requests are queued and processed at a fixed rate.
 * Smooths bursts and enforces strict rate limiting.
 *
 * @module @claude-flow/throttle/limiters/leaky-bucket
 */

export interface LeakyBucketConfig {
  /**
   * Maximum queue size (bucket capacity)
   */
  capacity: number;

  /**
   * Rate at which requests leak from the bucket (requests per second)
   */
  leakRate: number;

  /**
   * Maximum time a request can wait in queue (ms)
   * @default Infinity
   */
  maxWaitMs?: number;

  /**
   * Enable auto-processing of queued requests
   * @default true
   */
  autoProcess?: boolean;
}

interface QueuedRequest {
  id: string;
  timestamp: number;
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
  timeoutHandle?: NodeJS.Timeout;
}

export class LeakyBucket {
  private readonly capacity: number;
  private readonly leakRate: number;
  private readonly maxWaitMs: number;
  private readonly autoProcess: boolean;
  private queue: QueuedRequest[] = [];
  private lastLeakTime: number;
  private processing: boolean = false;
  private processingInterval?: NodeJS.Timeout;
  private requestCounter: number = 0;

  constructor(config: LeakyBucketConfig) {
    this.capacity = config.capacity;
    this.leakRate = config.leakRate;
    this.maxWaitMs = config.maxWaitMs ?? Infinity;
    this.autoProcess = config.autoProcess ?? true;
    this.lastLeakTime = Date.now();

    if (this.capacity <= 0) {
      throw new Error('Capacity must be positive');
    }
    if (this.leakRate <= 0) {
      throw new Error('Leak rate must be positive');
    }

    if (this.autoProcess) {
      this.startProcessing();
    }
  }

  /**
   * Attempt to add request to queue (non-blocking)
   * @returns true if added, false if queue is full
   */
  tryAdd(): boolean {
    if (this.queue.length >= this.capacity) {
      return false;
    }

    // Create a no-op queued request for synchronous operation
    const request: QueuedRequest = {
      id: `req-${++this.requestCounter}`,
      timestamp: Date.now(),
      resolve: () => {},
      reject: () => {},
    };

    this.queue.push(request);
    return true;
  }

  /**
   * Add request to queue with async wait
   * @returns Promise that resolves when request can be processed
   */
  async add(): Promise<boolean> {
    // Check if queue is full
    if (this.queue.length >= this.capacity) {
      return false;
    }

    return new Promise<boolean>((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req-${++this.requestCounter}`,
        timestamp: Date.now(),
        resolve,
        reject,
      };

      // Set timeout if maxWaitMs is finite
      if (this.maxWaitMs !== Infinity) {
        request.timeoutHandle = setTimeout(() => {
          this.removeRequest(request.id);
          resolve(false);
        }, this.maxWaitMs);
      }

      this.queue.push(request);

      // If auto-processing is disabled, resolve immediately
      if (!this.autoProcess) {
        resolve(true);
      }
    });
  }

  /**
   * Process next request from queue (manual mode)
   * @returns true if request was processed, false if queue is empty
   */
  processNext(): boolean {
    if (this.queue.length === 0) {
      return false;
    }

    const now = Date.now();
    const elapsed = (now - this.lastLeakTime) / 1000;
    const requestsToLeak = Math.floor(elapsed * this.leakRate);

    if (requestsToLeak >= 1) {
      const request = this.queue.shift();
      if (request) {
        this.clearTimeout(request);
        request.resolve(true);
        this.lastLeakTime = now;
        return true;
      }
    }

    return false;
  }

  /**
   * Start automatic processing of queued requests
   */
  startProcessing(): void {
    if (this.processing) {
      return;
    }

    this.processing = true;
    const intervalMs = Math.max(10, 1000 / this.leakRate);

    this.processingInterval = setInterval(() => {
      this.processNext();
    }, intervalMs);
  }

  /**
   * Stop automatic processing
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.processing = false;
  }

  /**
   * Get time until next request can be processed
   */
  getWaitTime(): number {
    if (this.queue.length === 0) {
      return 0;
    }

    const now = Date.now();
    const elapsed = (now - this.lastLeakTime) / 1000;
    const timeUntilNext = (1 / this.leakRate) - elapsed;

    return Math.max(0, Math.ceil(timeUntilNext * 1000));
  }

  /**
   * Get current state
   */
  getState(): {
    queueSize: number;
    capacity: number;
    leakRate: number;
    utilization: number;
    processing: boolean;
  } {
    return {
      queueSize: this.queue.length,
      capacity: this.capacity,
      leakRate: this.leakRate,
      utilization: this.queue.length / this.capacity,
      processing: this.processing,
    };
  }

  /**
   * Clear queue and reset
   */
  reset(): void {
    // Reject all pending requests
    for (const request of this.queue) {
      this.clearTimeout(request);
      request.reject(new Error('Queue reset'));
    }
    this.queue = [];
    this.lastLeakTime = Date.now();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopProcessing();
    this.reset();
  }

  private removeRequest(id: string): void {
    const index = this.queue.findIndex(r => r.id === id);
    if (index !== -1) {
      const request = this.queue.splice(index, 1)[0];
      this.clearTimeout(request);
    }
  }

  private clearTimeout(request: QueuedRequest): void {
    if (request.timeoutHandle) {
      clearTimeout(request.timeoutHandle);
      request.timeoutHandle = undefined;
    }
  }
}
