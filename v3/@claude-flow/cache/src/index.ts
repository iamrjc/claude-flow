/**
 * @claude-flow/cache - Caching Layer for Claude Flow V3
 * WP27: Comprehensive caching with memory, disk, and Redis support
 */

// Store exports
export { MemoryCache } from './stores/memory-cache.js';
export type {
  MemoryCacheOptions,
  CacheEntry,
  CacheStats,
} from './stores/memory-cache.js';

export { DiskCache } from './stores/disk-cache.js';
export type {
  DiskCacheOptions,
  DiskCacheEntry,
  DiskCacheStats,
} from './stores/disk-cache.js';

export { RedisAdapter } from './stores/redis-adapter.js';
export type {
  RedisAdapterOptions,
  RedisStats,
} from './stores/redis-adapter.js';

// Strategy exports
export { ResponseCache } from './strategies/response-cache.js';
export type {
  ResponseCacheOptions,
  CachedResponse,
  ResponseCacheStats,
} from './strategies/response-cache.js';

export { EmbeddingCache } from './strategies/embedding-cache.js';
export type {
  EmbeddingCacheOptions,
  CachedEmbedding,
  EmbeddingCacheStats,
} from './strategies/embedding-cache.js';

export { ToolResultCache } from './strategies/tool-result-cache.js';
export type {
  ToolResultCacheOptions,
  CachedToolResult,
  ToolCacheStats,
} from './strategies/tool-result-cache.js';

// Invalidation exports
export { CacheInvalidator } from './invalidation/cache-invalidator.js';
export type {
  InvalidationRule,
  InvalidationOptions,
  InvalidationStats,
} from './invalidation/cache-invalidator.js';
