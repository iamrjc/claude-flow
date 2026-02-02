# @claude-flow/cache

Comprehensive caching layer for Claude Flow V3 with multiple storage backends and intelligent caching strategies.

## Features

### Storage Backends

- **Memory Cache** - In-memory LRU/LFU/FIFO cache with TTL support
- **Disk Cache** - SQLite-backed persistent cache with compression
- **Redis Adapter** - Redis/Cluster support with pub/sub invalidation

### Caching Strategies

- **Response Cache** - LLM response caching with semantic matching
- **Embedding Cache** - Vector embedding storage with batch operations
- **Tool Result Cache** - MCP tool result caching with idempotent detection

### Invalidation

- **Cache Invalidator** - Pattern-based, event-driven, and cascade invalidation

## Installation

```bash
npm install @claude-flow/cache
```

Optional dependencies:
```bash
npm install ioredis        # For Redis support
npm install better-sqlite3 # For disk cache (already included)
```

## Usage

### Memory Cache

```typescript
import { MemoryCache } from '@claude-flow/cache';

const cache = new MemoryCache({
  maxSize: 1000,
  ttl: 3600000, // 1 hour
  evictionPolicy: 'lru', // 'lru' | 'lfu' | 'fifo'
});

// Set value
cache.set('key', 'value');

// Get value
const value = cache.get('key');

// Batch operations
cache.mset({ key1: 'value1', key2: 'value2' });
const results = cache.mget(['key1', 'key2']);

// Statistics
const stats = cache.getStats();
console.log(`Hit rate: ${stats.hitRate * 100}%`);
```

### Disk Cache

```typescript
import { DiskCache } from '@claude-flow/cache';

const cache = new DiskCache({
  dbPath: './cache.db',
  maxSize: 1024 * 1024 * 1024, // 1GB
  compression: true,
  compressionLevel: 6,
});

// Async operations
await cache.set('key', { data: 'value' });
const value = await cache.get('key');

// Cleanup
await cache.vacuum();
```

### Redis Adapter

```typescript
import { RedisAdapter } from '@claude-flow/cache';

const cache = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  keyPrefix: 'cf:cache:',
  enablePubSub: true,
});

await cache.connect();

// Set with TTL
await cache.set('key', 'value', 60000); // 1 minute

// Get value
const value = await cache.get('key');

// Pattern invalidation
await cache.clear('user:*');
```

### Response Cache (LLM)

```typescript
import { ResponseCache } from '@claude-flow/cache';

const cache = new ResponseCache({
  ttl: 3600000,
  semanticThreshold: 0.85,
  normalizeWhitespace: true,
});

// Cache response
const prompt = 'What is TypeScript?';
const response = 'TypeScript is a typed superset of JavaScript...';
cache.set(prompt, response);

// Get cached response (exact match)
const cached = cache.get(prompt);

// Semantic matching
const similar = cache.get('What is Typescript?'); // Also matches!

// Popular prompts
const popular = cache.getPopular(10);
```

### Embedding Cache

```typescript
import { EmbeddingCache } from '@claude-flow/cache';

const cache = new EmbeddingCache({
  maxVectors: 10000,
  dimensions: 384,
  enableWarming: true,
});

// Cache embedding
const vector = new Array(384).fill(0.5);
cache.set('text1', vector);

// Batch operations
cache.mset({
  text1: vector1,
  text2: vector2,
  text3: vector3,
});

// Cache warming
await cache.warm(embeddings);

// Hot vectors
const hot = cache.getHotVectors(10);
```

### Tool Result Cache

```typescript
import { ToolResultCache } from '@claude-flow/cache';

const cache = new ToolResultCache({
  defaultTtl: 300000, // 5 minutes
});

// Cache tool result (automatically detects if idempotent)
cache.set('read_file', { path: '/test' }, { content: 'test' });

// Get cached result
const result = cache.get('read_file', { path: '/test' });

// Per-tool TTL
cache.setToolTtl('search_files', 600000); // 10 minutes

// Invalidate tool results
cache.invalidateTool('read_file');

// Popular tools
const popular = cache.getPopularTools(10);
```

### Cache Invalidation

```typescript
import { CacheInvalidator } from '@claude-flow/cache';

const invalidator = new CacheInvalidator({
  enableCascade: true,
  maxCascadeDepth: 5,
});

// Manual invalidation
invalidator.invalidate('user:123');

// Pattern-based
invalidator.addPatternRule(/user:.*/);
invalidator.invalidatePattern(/user:.*/);

// Event-driven
invalidator.addEventRule('user:updated', /user:.*/);
eventBus.emit('user:updated', { id: 123 });

// Cascade invalidation
invalidator.addCascadeRule(/user:.*/, ['session:*', 'cache:*']);
invalidator.invalidate('user:123'); // Also invalidates session and cache

// Statistics
const stats = invalidator.getStats();
```

## Multi-Layer Caching

```typescript
import { MemoryCache, DiskCache } from '@claude-flow/cache';

// L1: Memory cache (fast)
const l1 = new MemoryCache({ maxSize: 100, ttl: 60000 });

// L2: Disk cache (persistent)
const l2 = new DiskCache({ dbPath: './cache.db' });

// Write-through
async function set(key: string, value: any) {
  l1.set(key, value);
  await l2.set(key, value);
}

// Read with fallback
async function get(key: string) {
  let value = l1.get(key);
  if (value !== undefined) {
    return value;
  }

  value = await l2.get(key);
  if (value !== undefined) {
    l1.set(key, value); // Promote to L1
  }
  return value;
}
```

## Events

All caches emit events for monitoring:

```typescript
cache.on('hit', (key) => console.log('Cache hit:', key));
cache.on('miss', (key) => console.log('Cache miss:', key));
cache.on('set', (key, value) => console.log('Cache set:', key));
cache.on('evict', (key) => console.log('Cache evict:', key));
cache.on('clear', () => console.log('Cache cleared'));
```

## Performance Targets

- **Hit Rate**: >80% for repeated queries
- **Memory Cache**: <1ms access time
- **Disk Cache**: <10ms access time
- **Redis**: <5ms access time (network dependent)
- **Semantic Matching**: <50ms comparison time

## License

MIT
