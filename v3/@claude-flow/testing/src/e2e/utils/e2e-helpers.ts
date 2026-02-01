/**
 * E2E Test Helpers
 *
 * Utilities for end-to-end integration testing including:
 * - System bootstrap/teardown
 * - Wait for conditions
 * - Assert eventual consistency
 * - Cleanup helpers
 */

import { setTimeout as sleep } from 'timers/promises';

// Re-export mock agent for E2E tests
export { Agent, AgentId, AgentStatus, TaskId, AgentMetrics, AgentHealth } from './mock-agent.js';
export type { AgentTemplate } from './mock-agent.js';

/**
 * Options for waiting for conditions
 */
export interface WaitForOptions {
  timeout?: number;
  interval?: number;
  message?: string;
}

/**
 * Wait for a condition to be true
 */
export async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  options: WaitForOptions = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, message = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await Promise.resolve(predicate());
    if (result) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`${message} (timeout: ${timeout}ms)`);
}

/**
 * Wait for a value to change
 */
export async function waitForValueChange<T>(
  getValue: () => T | Promise<T>,
  initialValue: T,
  options: WaitForOptions = {}
): Promise<T> {
  const { timeout = 5000, interval = 100, message = 'Value did not change' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const currentValue = await Promise.resolve(getValue());
    if (currentValue !== initialValue) {
      return currentValue;
    }
    await sleep(interval);
  }

  throw new Error(`${message} (timeout: ${timeout}ms)`);
}

/**
 * Wait for eventual consistency
 */
export async function assertEventuallyEquals<T>(
  getValue: () => T | Promise<T>,
  expectedValue: T,
  options: WaitForOptions = {}
): Promise<void> {
  await waitForCondition(
    async () => {
      const value = await Promise.resolve(getValue());
      return value === expectedValue;
    },
    {
      ...options,
      message: options.message || `Expected value to eventually equal ${expectedValue}`,
    }
  );
}

/**
 * Wait for count to reach expected value
 */
export async function assertEventuallyHasCount(
  getCollection: () => { length: number } | Promise<{ length: number }>,
  expectedCount: number,
  options: WaitForOptions = {}
): Promise<void> {
  await waitForCondition(
    async () => {
      const collection = await Promise.resolve(getCollection());
      return collection.length === expectedCount;
    },
    {
      ...options,
      message: options.message || `Expected count to reach ${expectedCount}`,
    }
  );
}

/**
 * System bootstrap helper
 */
export interface SystemBootstrapOptions {
  enableMemory?: boolean;
  enableSwarm?: boolean;
  enablePlugins?: boolean;
  maxAgents?: number;
  topology?: 'hierarchical' | 'mesh' | 'centralized';
}

export interface SystemContext {
  cleanup: () => Promise<void>;
  [key: string]: unknown;
}

/**
 * Bootstrap a test system
 */
export async function bootstrapSystem(
  options: SystemBootstrapOptions = {}
): Promise<SystemContext> {
  const cleanupFunctions: Array<() => Promise<void>> = [];

  const context: SystemContext = {
    cleanup: async () => {
      for (const cleanup of cleanupFunctions.reverse()) {
        await cleanup();
      }
    },
  };

  // Setup based on options
  if (options.enableMemory) {
    // Memory system would be initialized here
    context.memory = { initialized: true };
    cleanupFunctions.push(async () => {
      // Cleanup memory
    });
  }

  if (options.enableSwarm) {
    context.swarm = {
      topology: options.topology || 'hierarchical',
      maxAgents: options.maxAgents || 15,
    };
    cleanupFunctions.push(async () => {
      // Cleanup swarm
    });
  }

  return context;
}

/**
 * Cleanup helper
 */
export class ResourceManager {
  private resources: Array<() => Promise<void>> = [];

  register(cleanup: () => Promise<void>): void {
    this.resources.push(cleanup);
  }

  async cleanup(): Promise<void> {
    const errors: Error[] = [];

    for (const cleanup of this.resources.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error as Error);
      }
    }

    this.resources = [];

    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} cleanup errors occurred`);
    }
  }
}

/**
 * Retry helper for flaky operations
 */
export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: boolean;
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 100, backoff = true } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Parallel execution with limit
 */
export async function parallelLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<unknown>
): Promise<void> {
  const executing: Promise<unknown>[] = [];

  for (const item of items) {
    const promise = fn(item).then(() => {
      executing.splice(executing.indexOf(promise), 1);
    });

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

/**
 * Assert no errors in collection
 */
export function assertNoErrors(errors: unknown[]): void {
  if (errors.length > 0) {
    throw new AggregateError(
      errors.map(e => (e instanceof Error ? e : new Error(String(e)))),
      `Expected no errors but found ${errors.length}`
    );
  }
}

/**
 * Generate unique test ID
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Measure execution time
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Assert execution time is within bounds
 */
export async function assertExecutionTime<T>(
  fn: () => Promise<T>,
  maxMs: number,
  message?: string
): Promise<T> {
  const { result, durationMs } = await measureExecutionTime(fn);

  if (durationMs > maxMs) {
    throw new Error(
      message || `Execution took ${durationMs}ms, expected < ${maxMs}ms`
    );
  }

  return result;
}

/**
 * Create a deferred promise
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Wait for event
 */
export async function waitForEvent<T>(
  emitter: { once: (event: string, handler: (data: T) => void) => void },
  eventName: string,
  timeout: number = 5000
): Promise<T> {
  const deferred = createDeferred<T>();

  const timer = setTimeout(() => {
    deferred.reject(new Error(`Event ${eventName} not emitted within ${timeout}ms`));
  }, timeout);

  emitter.once(eventName, (data: T) => {
    clearTimeout(timer);
    deferred.resolve(data);
  });

  return deferred.promise;
}

/**
 * Collect items until condition met
 */
export async function collectUntil<T>(
  iterator: AsyncIterable<T>,
  predicate: (items: T[]) => boolean,
  options: WaitForOptions = {}
): Promise<T[]> {
  const { timeout = 5000 } = options;
  const items: T[] = [];
  const startTime = Date.now();

  for await (const item of iterator) {
    items.push(item);

    if (predicate(items)) {
      return items;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(`Collection timeout after ${timeout}ms`);
    }
  }

  throw new Error('Iterator exhausted before predicate met');
}
