/**
 * Basic usage examples for @claude-flow/cache
 */

import {
  MemoryCache,
  DiskCache,
  ResponseCache,
  EmbeddingCache,
  ToolResultCache,
  CacheInvalidator,
} from '@claude-flow/cache';

// Example 1: Memory Cache with LRU eviction
async function memoryExample() {
  const cache = new MemoryCache({
    maxSize: 100,
    ttl: 60000, // 1 minute
    evictionPolicy: 'lru',
  });

  // Store values
  cache.set('user:123', { name: 'Alice', role: 'admin' });
  cache.set('user:456', { name: 'Bob', role: 'user' });

  // Retrieve values
  const user = cache.get('user:123');
  console.log('User:', user);

  // Batch operations
  cache.mset({
    'session:abc': { userId: 123, expires: Date.now() + 3600000 },
    'session:def': { userId: 456, expires: Date.now() + 3600000 },
  });

  const sessions = cache.mget(['session:abc', 'session:def']);
  console.log('Sessions:', sessions);

  // Statistics
  const stats = cache.getStats();
  console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);

  cache.destroy();
}

// Example 2: Disk Cache with compression
async function diskExample() {
  const cache = new DiskCache({
    dbPath: './examples/cache.db',
    maxSize: 1024 * 1024 * 100, // 100MB
    compression: true,
  });

  // Store large data
  const largeData = { data: 'x'.repeat(10000) };
  await cache.set('large:data', largeData);

  // Retrieve
  const retrieved = await cache.get('large:data');
  console.log('Data size:', JSON.stringify(retrieved).length);

  // Stats show compression ratio
  const stats = cache.getStats();
  console.log(`Compression ratio: ${(stats.compressionRatio * 100).toFixed(2)}%`);

  cache.destroy();
}

// Example 3: LLM Response Cache with semantic matching
async function responseExample() {
  const cache = new ResponseCache({
    ttl: 3600000, // 1 hour
    semanticThreshold: 0.8,
    normalizeWhitespace: true,
  });

  // Cache LLM response
  const prompt = 'What is TypeScript?';
  const response = 'TypeScript is a typed superset of JavaScript...';
  cache.set(prompt, response);

  // Exact match
  console.log('Exact match:', cache.get('What is TypeScript?'));

  // Semantic match
  console.log('Semantic match:', cache.get('What is Typescript'));

  // Popular prompts
  const popular = cache.getPopular(5);
  console.log('Popular prompts:', popular.map(p => p.prompt));
}

// Example 4: Embedding Cache with warming
async function embeddingExample() {
  const cache = new EmbeddingCache({
    maxVectors: 1000,
    dimensions: 384,
    enableWarming: true,
  });

  // Cache embeddings
  const vector1 = new Array(384).fill(0.1);
  const vector2 = new Array(384).fill(0.2);

  cache.set('text:hello', vector1);
  cache.set('text:world', vector2);

  // Batch storage
  const embeddings = {
    'text:foo': new Array(384).fill(0.3),
    'text:bar': new Array(384).fill(0.4),
  };
  cache.mset(embeddings);

  // Cache warming
  const warmData = new Map<string, number[]>();
  for (let i = 0; i < 100; i++) {
    warmData.set(`text:warm${i}`, new Array(384).fill(i / 100));
  }
  await cache.warm(warmData);

  // Memory usage
  const usage = cache.getMemoryUsage();
  console.log(`Memory usage: ${usage.mb.toFixed(2)} MB`);

  // Hot vectors
  const hot = cache.getHotVectors(5);
  console.log('Hot vectors:', hot.map(v => v.key));
}

// Example 5: Tool Result Cache
async function toolExample() {
  const cache = new ToolResultCache({
    defaultTtl: 300000, // 5 minutes
  });

  // Cache read operation (idempotent)
  cache.set('read_file', { path: '/test.txt' }, { content: 'Hello' });

  // Retrieve cached result
  const result = cache.get('read_file', { path: '/test.txt' });
  console.log('Cached result:', result);

  // Non-idempotent operations are skipped
  cache.set('write_file', { path: '/test.txt' }, { success: true });
  const writeResult = cache.get('write_file', { path: '/test.txt' });
  console.log('Write result (should be undefined):', writeResult);

  // Per-tool TTL
  cache.setToolTtl('search_files', 600000); // 10 minutes

  // Popular tools
  const popular = cache.getPopularTools(5);
  console.log('Popular tools:', popular);

  // Tool statistics
  const stats = cache.getStats();
  console.log('Tool cache hit rate:', (stats.hitRate * 100).toFixed(2));
}

// Example 6: Cache Invalidation
async function invalidationExample() {
  const cache = new MemoryCache({ maxSize: 100 });
  const invalidator = new CacheInvalidator();

  // Setup invalidation rules
  invalidator.addPatternRule(/user:.*/);
  invalidator.addCascadeRule(/user:.*/, ['session:*', 'cache:*']);

  // Listen for invalidation events
  invalidator.on('invalidate', (key, type) => {
    console.log(`Invalidating ${key} (${type})`);
    cache.delete(key);
  });

  // Store data
  cache.set('user:123', { name: 'Alice' });
  cache.set('session:abc', { userId: 123 });

  // Invalidate with cascade
  invalidator.invalidate('user:123', true);

  // Pattern-based invalidation
  invalidator.invalidatePattern(/session:.*/);

  // Statistics
  const stats = invalidator.getStats();
  console.log('Invalidations:', stats);

  invalidator.destroy();
  cache.destroy();
}

// Example 7: Multi-layer caching
async function multiLayerExample() {
  // L1: Fast memory cache
  const l1 = new MemoryCache({ maxSize: 100, ttl: 60000 });

  // L2: Persistent disk cache
  const l2 = new DiskCache({ dbPath: './examples/l2-cache.db' });

  // Helper: Get with fallback
  async function get(key: string) {
    // Try L1 first
    let value = l1.get(key);
    if (value !== undefined) {
      console.log('L1 hit:', key);
      return value;
    }

    // Fallback to L2
    value = await l2.get(key);
    if (value !== undefined) {
      console.log('L2 hit:', key);
      // Promote to L1
      l1.set(key, value);
      return value;
    }

    console.log('Cache miss:', key);
    return undefined;
  }

  // Helper: Set in both layers
  async function set(key: string, value: any) {
    l1.set(key, value);
    await l2.set(key, value);
  }

  // Usage
  await set('data:123', { value: 'test' });
  const data1 = await get('data:123'); // L1 hit
  const data2 = await get('data:123'); // L1 hit

  l1.clear(); // Clear L1
  const data3 = await get('data:123'); // L2 hit, promotes to L1
  const data4 = await get('data:123'); // L1 hit

  l1.destroy();
  l2.destroy();
}

// Run examples
async function main() {
  console.log('=== Memory Cache Example ===');
  await memoryExample();

  console.log('\n=== Disk Cache Example ===');
  await diskExample();

  console.log('\n=== Response Cache Example ===');
  await responseExample();

  console.log('\n=== Embedding Cache Example ===');
  await embeddingExample();

  console.log('\n=== Tool Cache Example ===');
  await toolExample();

  console.log('\n=== Invalidation Example ===');
  await invalidationExample();

  console.log('\n=== Multi-Layer Cache Example ===');
  await multiLayerExample();
}

// Uncomment to run:
// main().catch(console.error);
