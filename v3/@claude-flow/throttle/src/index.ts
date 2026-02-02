/**
 * @claude-flow/throttle
 *
 * Rate Limiting & Throttling for Claude Flow V3 (WP28)
 *
 * Features:
 * - Token bucket, sliding window, and leaky bucket algorithms
 * - Per-provider rate limits (RPM, TPM, concurrent, cost)
 * - Per-agent limits (tasks, memory ops, messages)
 * - Global system limits with emergency throttling
 * - Priority queue with backpressure and circuit breaker
 * - Graceful degradation strategies
 *
 * @module @claude-flow/throttle
 */

// Export limiters
export { TokenBucket } from './limiters/token-bucket.js';
export type { TokenBucketConfig } from './limiters/token-bucket.js';

export { SlidingWindow } from './limiters/sliding-window.js';
export type { SlidingWindowConfig } from './limiters/sliding-window.js';

export { LeakyBucket } from './limiters/leaky-bucket.js';
export type { LeakyBucketConfig } from './limiters/leaky-bucket.js';

// Export provider policies
export { ProviderRateLimiter, DEFAULT_PROVIDER_LIMITS } from './policies/provider-limits.js';
export type {
  ProviderType,
  ProviderLimitConfig,
  RequestMetrics,
} from './policies/provider-limits.js';

// Export agent policies
export { AgentRateLimiter, DEFAULT_AGENT_LIMITS } from './policies/agent-limits.js';
export type {
  AgentLimitConfig,
  AgentMetrics,
} from './policies/agent-limits.js';

// Export global policies
export { GlobalRateLimiter, DEFAULT_GLOBAL_LIMITS } from './policies/global-limits.js';
export type {
  GlobalLimitConfig,
  ThrottleMode,
  SystemMetrics,
} from './policies/global-limits.js';

// Export queue manager
export { QueueManager } from './backpressure/queue-manager.js';
export type {
  Priority,
  QueueConfig,
  CircuitBreakerConfig,
  CircuitState,
} from './backpressure/queue-manager.js';
