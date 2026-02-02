/**
 * Comprehensive tests for @claude-flow/cache
 * WP27: 35+ tests with >80% coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCache } from '../stores/memory-cache.js';
import { DiskCache } from '../stores/disk-cache.js';
import { RedisAdapter } from '../stores/redis-adapter.js';
import { ResponseCache } from '../strategies/response-cache.js';
import { EmbeddingCache } from '../strategies/embedding-cache.js';
import { ToolResultCache } from '../strategies/tool-result-cache.js';
import { CacheInvalidator } from '../invalidation/cache-invalidator.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache({ maxSize: 100, ttl: 1000 });
  });

  afterEach(() => {
    cache.destroy();
  });

  it('should set and get values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should respect TTL', async () => {
    cache.set('key1', 'value1', 100);
    expect(cache.get('key1')).toBe('value1');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should track cache statistics', () => {
    cache.set('key1', 'value1');
    cache.get('key1');
    cache.get('missing');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.sets).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should evict entries when at capacity (LRU)', () => {
    const smallCache = new MemoryCache({ maxSize: 3, evictionPolicy: 'lru' });

    smallCache.set('key1', 'value1');
    smallCache.set('key2', 'value2');
    smallCache.set('key3', 'value3');

    // Access key1 to make it recently used
    smallCache.get('key1');

    // Add key4, should evict key2 (least recently used)
    smallCache.set('key4', 'value4');

    expect(smallCache.has('key1')).toBe(true);
    expect(smallCache.has('key2')).toBe(false);
    expect(smallCache.has('key3')).toBe(true);
    expect(smallCache.has('key4')).toBe(true);

    smallCache.destroy();
  });

  it('should support LFU eviction', () => {
    const lfuCache = new MemoryCache({ maxSize: 3, evictionPolicy: 'lfu' });

    lfuCache.set('key1', 'value1');
    lfuCache.set('key2', 'value2');
    lfuCache.set('key3', 'value3');

    // Access key1 multiple times
    lfuCache.get('key1');
    lfuCache.get('key1');
    lfuCache.get('key2');

    // Add key4, should evict key3 (least frequently used)
    lfuCache.set('key4', 'value4');

    expect(lfuCache.has('key1')).toBe(true);
    expect(lfuCache.has('key2')).toBe(true);
    expect(lfuCache.has('key3')).toBe(false);
    expect(lfuCache.has('key4')).toBe(true);

    lfuCache.destroy();
  });

  it('should support FIFO eviction', () => {
    const fifoCache = new MemoryCache({ maxSize: 3, evictionPolicy: 'fifo' });

    fifoCache.set('key1', 'value1');
    fifoCache.set('key2', 'value2');
    fifoCache.set('key3', 'value3');

    // Add key4, should evict key1 (first in)
    fifoCache.set('key4', 'value4');

    expect(fifoCache.has('key1')).toBe(false);
    expect(fifoCache.has('key2')).toBe(true);
    expect(fifoCache.has('key3')).toBe(true);
    expect(fifoCache.has('key4')).toBe(true);

    fifoCache.destroy();
  });

  it('should support batch operations', () => {
    cache.mset({ key1: 'value1', key2: 'value2', key3: 'value3' });

    const result = cache.mget(['key1', 'key2', 'key3']);
    expect(result.get('key1')).toBe('value1');
    expect(result.get('key2')).toBe('value2');
    expect(result.get('key3')).toBe('value3');
  });

  it('should delete entries', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.has('key1')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('should emit events', () => {
    const hitSpy = vi.fn();
    const missSpy = vi.fn();
    const setSpy = vi.fn();

    cache.on('hit', hitSpy);
    cache.on('miss', missSpy);
    cache.on('set', setSpy);

    cache.set('key1', 'value1');
    cache.get('key1');
    cache.get('missing');

    expect(setSpy).toHaveBeenCalledWith('key1', 'value1');
    expect(hitSpy).toHaveBeenCalled();
    expect(missSpy).toHaveBeenCalled();
  });
});

describe('DiskCache', () => {
  let cache: DiskCache;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-cache-${Date.now()}.db`);
    cache = new DiskCache({ dbPath, compression: true });
  });

  afterEach(() => {
    cache.destroy();
    try {
      unlinkSync(dbPath);
    } catch {
      // Ignore
    }
  });

  it('should set and get values', async () => {
    await cache.set('key1', { data: 'value1' });
    const value = await cache.get<{ data: string }>('key1');
    expect(value?.data).toBe('value1');
  });

  it('should compress large values', async () => {
    const largeData = 'x'.repeat(10000);
    await cache.set('large', { data: largeData });

    const stats = cache.getStats();
    expect(stats.compressionRatio).toBeGreaterThan(0);
  });

  it('should respect TTL', async () => {
    await cache.set('key1', 'value1', 100);
    expect(await cache.get('key1')).toBe('value1');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await cache.get('key1')).toBeUndefined();
  });

  it('should handle batch operations', async () => {
    await cache.mset({ key1: 'value1', key2: 'value2', key3: 'value3' });
    const result = await cache.mget(['key1', 'key2', 'key3']);

    expect(result.get('key1')).toBe('value1');
    expect(result.get('key2')).toBe('value2');
    expect(result.get('key3')).toBe('value3');
  });

  it('should evict oldest entries when full', async () => {
    const smallCache = new DiskCache({
      dbPath: join(tmpdir(), `small-cache-${Date.now()}.db`),
      maxSize: 1024,
    });

    const data = 'x'.repeat(500);
    await smallCache.set('key1', data);
    await smallCache.set('key2', data);
    await smallCache.set('key3', data);

    expect(smallCache.has('key1')).toBe(false);

    smallCache.destroy();
  });

  it('should return cache statistics', () => {
    const stats = cache.getStats();
    expect(stats).toHaveProperty('entries');
    expect(stats).toHaveProperty('totalSize');
    expect(stats).toHaveProperty('maxSize');
    expect(stats).toHaveProperty('compressionRatio');
  });
});

describe('RedisAdapter', () => {
  it('should throw error when Redis is unavailable', () => {
    // Redis is optional dependency, so this test checks graceful handling
    if (!RedisAdapter.isAvailable()) {
      expect(() => new RedisAdapter()).toThrow(
        'Redis (ioredis) is not available'
      );
    }
  });

  // Note: Additional Redis tests would require a running Redis instance
  // Skipping integration tests in unit test suite
});

describe('ResponseCache', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = new ResponseCache({ ttl: 1000, semanticThreshold: 0.8 });
  });

  it('should cache LLM responses', () => {
    const prompt = 'What is the capital of France?';
    const response = 'The capital of France is Paris.';

    cache.set(prompt, response);
    expect(cache.get(prompt)).toBe(response);
  });

  it('should match semantically similar prompts', () => {
    const semanticCache = new ResponseCache({
      semanticThreshold: 0.6,
      normalizeWhitespace: true
    });
    const prompt1 = 'What is the capital of France';
    const prompt2 = 'What is the France capital'; // Very similar tokens
    const response = 'Paris';

    semanticCache.set(prompt1, response);

    // Should find semantic match
    const result = semanticCache.get(prompt2);
    expect(result).toBe(response);
  });

  it('should respect TTL', async () => {
    const ttlCache = new ResponseCache({ ttl: 100 });
    ttlCache.set('prompt', 'response');
    expect(ttlCache.get('prompt')).toBe('response');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(ttlCache.get('prompt')).toBeUndefined();
  });

  it('should track statistics', () => {
    cache.set('prompt1', 'response1');
    cache.get('prompt1');
    cache.get('missing');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should normalize whitespace', () => {
    const prompt1 = 'What  is   the    capital?';
    const prompt2 = 'What is the capital?';

    cache.set(prompt1, 'Paris');
    expect(cache.get(prompt2)).toBe('Paris');
  });

  it('should support case-insensitive matching', () => {
    const caseCache = new ResponseCache({ caseInsensitive: true });

    caseCache.set('Hello World', 'response');
    expect(caseCache.get('hello world')).toBe('response');
  });

  it('should track popular prompts', () => {
    cache.set('prompt1', 'response1');
    cache.set('prompt2', 'response2');
    cache.set('prompt3', 'response3');

    cache.get('prompt1');
    cache.get('prompt1');
    cache.get('prompt2');

    const popular = cache.getPopular(2);
    expect(popular[0].hitCount).toBe(2);
    expect(popular[0].prompt).toBe('prompt1');
  });

  it('should prune expired entries', async () => {
    const pruneCache = new ResponseCache({ ttl: 50 });
    pruneCache.set('prompt1', 'response1');

    const longCache = new ResponseCache({ ttl: 1000 });
    longCache.set('prompt2', 'response2');

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test pruning on the short-TTL cache
    const pruned = pruneCache.prune();
    expect(pruned).toBe(1);
    expect(pruneCache.has('prompt1')).toBe(false);

    // Long cache should still have its entry
    expect(longCache.has('prompt2')).toBe(true);
  });

  it('should export and import cache', () => {
    cache.set('prompt1', 'response1');
    cache.set('prompt2', 'response2');

    const exported = cache.export();
    const newCache = new ResponseCache();
    const imported = newCache.import(exported);

    expect(imported).toBe(2);
    expect(newCache.get('prompt1')).toBe('response1');
  });
});

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache({ maxVectors: 100, dimensions: 384 });
  });

  it('should cache embeddings', () => {
    const vector = new Array(384).fill(0.5);
    cache.set('text1', vector);
    expect(cache.get('text1')).toEqual(vector);
  });

  it('should validate dimensions', () => {
    const wrongVector = new Array(512).fill(0.5);
    expect(() => cache.set('text1', wrongVector)).toThrow();
  });

  it('should handle batch operations', () => {
    const vectors = {
      text1: new Array(384).fill(0.1),
      text2: new Array(384).fill(0.2),
      text3: new Array(384).fill(0.3),
    };

    cache.mset(vectors);
    const result = cache.mget(['text1', 'text2', 'text3']);

    expect(result.size).toBe(3);
    expect(result.get('text1')).toEqual(vectors.text1);
  });

  it('should track cache statistics', () => {
    const vector = new Array(384).fill(0.5);
    cache.set('text1', vector);
    cache.get('text1');
    cache.get('missing');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.vectors).toBe(1);
    expect(stats.avgDimensions).toBe(384);
  });

  it('should calculate memory usage', () => {
    const vector = new Array(384).fill(0.5);
    cache.set('text1', vector);

    const usage = cache.getMemoryUsage();
    expect(usage.bytes).toBe(384 * 8); // float64 = 8 bytes
    expect(usage.mb).toBeGreaterThan(0);
  });

  it('should identify hot vectors', () => {
    const vector = new Array(384).fill(0.5);
    cache.set('text1', vector);
    cache.set('text2', vector);

    cache.get('text1');
    cache.get('text1');
    cache.get('text2');

    const hot = cache.getHotVectors(1);
    expect(hot[0].key).toBe('text1');
    expect(hot[0].accessCount).toBe(2);
  });

  it('should support cache warming', async () => {
    const vectors = new Map<string, number[]>();
    for (let i = 0; i < 10; i++) {
      vectors.set(`text${i}`, new Array(384).fill(i));
    }

    const warmed = await cache.warm(vectors);
    expect(warmed).toBe(10);
    expect(cache.size()).toBe(10);
  });

  it('should evict LRU when full', () => {
    const smallCache = new EmbeddingCache({ maxVectors: 3, dimensions: 2 });

    smallCache.set('v1', [1, 1]);
    smallCache.set('v2', [2, 2]);
    smallCache.set('v3', [3, 3]);

    // Access v1 to make it recently used
    smallCache.get('v1');

    // Add v4, should evict v2
    smallCache.set('v4', [4, 4]);

    expect(smallCache.has('v1')).toBe(true);
    expect(smallCache.has('v2')).toBe(false);
    expect(smallCache.has('v4')).toBe(true);
  });
});

describe('ToolResultCache', () => {
  let cache: ToolResultCache;

  beforeEach(() => {
    cache = new ToolResultCache({ defaultTtl: 1000 });
  });

  it('should cache idempotent tool results', () => {
    cache.set('read_file', { path: '/test' }, { content: 'test' });
    const result = cache.get('read_file', { path: '/test' });
    expect(result).toEqual({ content: 'test' });
  });

  it('should not cache non-idempotent tools', () => {
    cache.set('write_file', { path: '/test' }, { success: true });
    const result = cache.get('write_file', { path: '/test' });
    expect(result).toBeUndefined();

    const stats = cache.getStats();
    expect(stats.skipped).toBe(2); // set + get
  });

  it('should detect idempotent tools by pattern', () => {
    // read/get/list patterns should be idempotent
    expect(cache.has('read_data', {})).toBe(false);
    cache.set('read_data', {}, { data: 'test' });
    expect(cache.has('read_data', {})).toBe(true);

    expect(cache.has('get_info', {})).toBe(false);
    cache.set('get_info', {}, { info: 'test' });
    expect(cache.has('get_info', {})).toBe(true);
  });

  it('should support per-tool TTL', () => {
    cache.setToolTtl('read_file', 5000);
    cache.set('read_file', {}, { content: 'test' });

    // Should use custom TTL
    expect(cache.has('read_file', {})).toBe(true);
  });

  it('should invalidate tool results', () => {
    cache.set('read_file', { path: '/test1' }, { content: 'test1' });
    cache.set('read_file', { path: '/test2' }, { content: 'test2' });

    const invalidated = cache.invalidateTool('read_file');
    expect(invalidated).toBe(2);
    expect(cache.size()).toBe(0);
  });

  it('should track per-tool statistics', () => {
    cache.set('read_file', {}, { content: 'test' });
    cache.get('read_file', {});
    cache.get('read_file', {});
    cache.get('list_directory', {});

    const stats = cache.getStats();
    const readStats = stats.toolStats.get('read_file');
    expect(readStats?.hits).toBe(2);
  });

  it('should identify popular tools', () => {
    cache.set('read_file', {}, 'test1');
    cache.set('list_directory', {}, 'test2');

    cache.get('read_file', {});
    cache.get('read_file', {});
    cache.get('list_directory', {});

    const popular = cache.getPopularTools(1);
    expect(popular[0].tool).toBe('read_file');
    expect(popular[0].hits).toBe(2);
  });

  it('should support custom idempotent tools', () => {
    cache.addIdempotentTool('custom_read_tool');
    cache.set('custom_read_tool', {}, 'result');
    expect(cache.get('custom_read_tool', {})).toBe('result');
  });
});

describe('CacheInvalidator', () => {
  let invalidator: CacheInvalidator;

  beforeEach(() => {
    invalidator = new CacheInvalidator();
  });

  afterEach(() => {
    invalidator.destroy();
  });

  it('should add invalidation rules', () => {
    const id = invalidator.addRule({
      id: 'rule1',
      type: 'manual',
      enabled: true,
    });

    expect(id).toBe('rule1');
    expect(invalidator.getRules()).toHaveLength(1);
  });

  it('should trigger manual invalidation', () => {
    const spy = vi.fn();
    invalidator.on('invalidate', spy);

    invalidator.invalidate('key1');
    expect(spy).toHaveBeenCalledWith('key1', 'manual');
  });

  it('should trigger pattern-based invalidation', () => {
    const spy = vi.fn();
    invalidator.on('invalidate-pattern', spy);

    invalidator.invalidatePattern(/user:.*/);
    expect(spy).toHaveBeenCalled();
  });

  it('should add pattern rules', () => {
    const id = invalidator.addPatternRule(/cache:.*/);
    const rule = invalidator.getRule(id);

    expect(rule?.type).toBe('pattern');
    expect(rule?.pattern).toBeInstanceOf(RegExp);
  });

  it('should add event-based rules', () => {
    const id = invalidator.addEventRule('user:updated', /user:.*/);
    const rule = invalidator.getRule(id);

    expect(rule?.type).toBe('event');
    expect(rule?.event).toBe('user:updated');
  });

  it('should add cascade rules', () => {
    const id = invalidator.addCascadeRule(/user:.*/, [
      'session:*',
      'cache:*',
    ]);
    const rule = invalidator.getRule(id);

    expect(rule?.type).toBe('cascade');
    expect(rule?.cascadeTo).toHaveLength(2);
  });

  it('should process cascade invalidation', () => {
    const spy = vi.fn();
    invalidator.on('invalidate', spy);

    invalidator.addCascadeRule(/user:.*/, ['session:123', 'cache:123']);
    invalidator.invalidate('user:123');

    // Should invalidate user:123 and cascade to session and cache
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('should prevent infinite cascade loops', () => {
    const spy = vi.fn();
    invalidator.on('invalidate', spy);

    // Create circular cascade
    invalidator.addCascadeRule(/a/, ['b']);
    invalidator.addCascadeRule(/b/, ['a']);

    invalidator.invalidate('a');

    // Should stop after max depth
    expect(spy).toHaveBeenCalled();
  });

  it('should enable/disable rules', () => {
    const id = invalidator.addRule({
      id: 'rule1',
      type: 'manual',
      enabled: true,
    });

    invalidator.setRuleEnabled(id, false);
    const rule = invalidator.getRule(id);
    expect(rule?.enabled).toBe(false);
  });

  it('should remove rules', () => {
    const id = invalidator.addRule({
      id: 'rule1',
      type: 'manual',
      enabled: true,
    });

    expect(invalidator.removeRule(id)).toBe(true);
    expect(invalidator.getRules()).toHaveLength(0);
  });

  it('should track invalidation statistics', () => {
    invalidator.invalidate('key1');
    invalidator.invalidatePattern(/test/);

    const stats = invalidator.getStats();
    expect(stats.totalInvalidations).toBe(2);
    expect(stats.manualInvalidations).toBe(1);
    expect(stats.patternInvalidations).toBe(1);
  });

  it('should export and import rules', () => {
    invalidator.addPatternRule(/test:.*/);
    invalidator.addEventRule('user:updated');

    const exported = invalidator.export();
    const newInvalidator = new CacheInvalidator();
    const imported = newInvalidator.import(exported);

    expect(imported).toBe(2);
    expect(newInvalidator.getRules()).toHaveLength(2);

    newInvalidator.destroy();
  });

  it('should clear all rules', () => {
    invalidator.addRule({ id: 'rule1', type: 'manual', enabled: true });
    invalidator.addRule({ id: 'rule2', type: 'manual', enabled: true });

    invalidator.clearRules();
    expect(invalidator.getRules()).toHaveLength(0);
  });
});

describe('Cache Integration', () => {
  it('should achieve >80% hit rate for repeated queries', () => {
    const cache = new ResponseCache();

    // Warm up cache
    const prompts = [
      'What is TypeScript?',
      'Explain async/await',
      'How does caching work?',
    ];

    for (const prompt of prompts) {
      cache.set(prompt, `Answer to: ${prompt}`);
    }

    // Simulate repeated queries
    for (let i = 0; i < 100; i++) {
      const prompt = prompts[i % prompts.length];
      cache.get(prompt);
    }

    const stats = cache.getStats();
    expect(stats.hitRate).toBeGreaterThan(0.8);
  });

  it('should support multi-layer caching strategy', async () => {
    const l1 = new MemoryCache({ maxSize: 10, ttl: 1000 });
    const l2Path = join(tmpdir(), `l2-cache-${Date.now()}.db`);
    const l2 = new DiskCache({ dbPath: l2Path });

    // Write-through pattern
    const key = 'data';
    const value = { important: 'data' };

    l1.set(key, value);
    await l2.set(key, value);

    // Read from L1 first
    let result = l1.get(key);
    expect(result).toEqual(value);

    // Simulate L1 miss, fallback to L2
    l1.clear();
    result = await l2.get(key);
    expect(result).toEqual(value);

    l1.destroy();
    l2.destroy();
    try {
      unlinkSync(l2Path);
    } catch {
      // Ignore
    }
  });
});
