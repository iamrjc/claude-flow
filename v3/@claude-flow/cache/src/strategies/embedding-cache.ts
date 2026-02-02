/**
 * Vector embedding cache with batch retrieval and cache warming
 * WP27: Caching Layer - Embedding Cache Strategy
 */

import { EventEmitter } from 'events';

export interface EmbeddingCacheOptions {
  ttl?: number; // milliseconds
  maxVectors?: number;
  dimensions?: number;
  enableWarming?: boolean;
  warmingThreshold?: number; // Access count threshold for warming
  batchSize?: number;
}

export interface CachedEmbedding {
  key: string;
  vector: number[];
  dimensions: number;
  model?: string;
  timestamp: number;
  accessCount: number;
  metadata?: Record<string, any>;
}

export interface EmbeddingCacheStats {
  vectors: number;
  maxVectors: number;
  totalSize: number; // bytes
  avgDimensions: number;
  hits: number;
  misses: number;
  hitRate: number;
  warmingActive: boolean;
}

/**
 * Vector embedding cache with warming and batch operations
 */
export class EmbeddingCache extends EventEmitter {
  private cache: Map<string, CachedEmbedding>;
  private stats: EmbeddingCacheStats;
  private options: Required<EmbeddingCacheOptions>;
  private warmingQueue: Set<string>;

  constructor(options: EmbeddingCacheOptions = {}) {
    super();
    this.cache = new Map();
    this.warmingQueue = new Set();
    this.stats = {
      vectors: 0,
      maxVectors: options.maxVectors ?? 10000,
      totalSize: 0,
      avgDimensions: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      warmingActive: false,
    };
    this.options = {
      ttl: options.ttl ?? 3600000, // 1 hour default
      maxVectors: options.maxVectors ?? 10000,
      dimensions: options.dimensions ?? 0, // 0 = any dimension
      enableWarming: options.enableWarming ?? true,
      warmingThreshold: options.warmingThreshold ?? 10,
      batchSize: options.batchSize ?? 100,
    };
  }

  /**
   * Get cached embedding
   */
  get(key: string): number[] | undefined {
    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.misses++;
      this.updateHitRate();
      this.emit('miss', key);

      // Add to warming queue if enabled
      if (this.options.enableWarming) {
        this.warmingQueue.add(key);
        this.emit('warming-candidate', key);
      }

      return undefined;
    }

    // Check TTL
    if (this.options.ttl > 0 && Date.now() - cached.timestamp > this.options.ttl) {
      this.cache.delete(key);
      this.stats.vectors = this.cache.size;
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    cached.accessCount++;
    this.stats.hits++;
    this.updateHitRate();
    this.emit('hit', key);

    // Check if should be warmed
    if (
      this.options.enableWarming &&
      cached.accessCount >= this.options.warmingThreshold
    ) {
      this.emit('warming-hot', key, cached.accessCount);
    }

    return cached.vector;
  }

  /**
   * Set cached embedding
   */
  set(
    key: string,
    vector: number[],
    metadata?: {
      model?: string;
      metadata?: Record<string, any>;
    }
  ): void {
    // Validate dimensions if specified
    if (this.options.dimensions > 0 && vector.length !== this.options.dimensions) {
      throw new Error(
        `Vector dimensions (${vector.length}) don't match expected (${this.options.dimensions})`
      );
    }

    // Evict if at capacity
    if (this.cache.size >= this.options.maxVectors && !this.cache.has(key)) {
      this.evictLRU();
    }

    const cached: CachedEmbedding = {
      key,
      vector,
      dimensions: vector.length,
      model: metadata?.model,
      timestamp: Date.now(),
      accessCount: 0,
      metadata: metadata?.metadata,
    };

    this.cache.set(key, cached);
    this.stats.vectors = this.cache.size;
    this.updateTotalSize();
    this.updateAvgDimensions();
    this.emit('set', key, vector.length);

    // Remove from warming queue if present
    this.warmingQueue.delete(key);
  }

  /**
   * Get multiple embeddings (batch retrieval)
   */
  mget(keys: string[]): Map<string, number[]> {
    const result = new Map<string, number[]>();

    for (const key of keys) {
      const vector = this.get(key);
      if (vector) {
        result.set(key, vector);
      }
    }

    this.emit('batch-get', keys.length, result.size);
    return result;
  }

  /**
   * Set multiple embeddings (batch storage)
   */
  mset(
    entries: Map<string, number[]> | Record<string, number[]>,
    metadata?: {
      model?: string;
      metadata?: Record<string, any>;
    }
  ): void {
    const entriesMap =
      entries instanceof Map ? entries : new Map(Object.entries(entries));

    for (const [key, vector] of entriesMap) {
      this.set(key, vector, metadata);
    }

    this.emit('batch-set', entriesMap.size);
  }

  /**
   * Check if embedding is cached
   */
  has(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;

    // Check TTL
    if (this.options.ttl > 0 && Date.now() - cached.timestamp > this.options.ttl) {
      this.cache.delete(key);
      this.stats.vectors = this.cache.size;
      return false;
    }

    return true;
  }

  /**
   * Delete cached embedding
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.vectors = this.cache.size;
      this.updateTotalSize();
      this.updateAvgDimensions();
      this.emit('delete', key);
    }
    return deleted;
  }

  /**
   * Clear all cached embeddings
   */
  clear(): void {
    this.cache.clear();
    this.warmingQueue.clear();
    this.stats.vectors = 0;
    this.stats.totalSize = 0;
    this.stats.avgDimensions = 0;
    this.emit('clear');
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   */
  getStats(): EmbeddingCacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.hitRate = 0;
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get warming queue
   */
  getWarmingQueue(): string[] {
    return Array.from(this.warmingQueue);
  }

  /**
   * Warm cache with embeddings
   */
  async warm(
    embeddings: Map<string, number[]> | Record<string, number[]>,
    metadata?: {
      model?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<number> {
    this.stats.warmingActive = true;
    const entriesMap =
      embeddings instanceof Map
        ? embeddings
        : new Map(Object.entries(embeddings));

    let warmed = 0;
    const batchSize = this.options.batchSize;

    const batches: string[][] = [];
    const keys = Array.from(entriesMap.keys());
    for (let i = 0; i < keys.length; i += batchSize) {
      batches.push(keys.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      for (const key of batch) {
        const vector = entriesMap.get(key);
        if (vector) {
          this.set(key, vector, metadata);
          warmed++;
        }
      }
      await new Promise((resolve) => setImmediate(resolve)); // Yield
    }

    this.stats.warmingActive = false;
    this.emit('warmed', warmed);
    return warmed;
  }

  /**
   * Evict least recently used embedding
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    let lowestAccess = Infinity;

    for (const [key, cached] of this.cache.entries()) {
      // Prioritize evicting least accessed
      if (cached.accessCount < lowestAccess) {
        lowestAccess = cached.accessCount;
        oldestTime = cached.timestamp;
        oldestKey = key;
      } else if (
        cached.accessCount === lowestAccess &&
        cached.timestamp < oldestTime
      ) {
        oldestTime = cached.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.emit('evict', oldestKey);
    }
  }

  /**
   * Update total cache size
   */
  private updateTotalSize(): void {
    let totalSize = 0;
    for (const cached of this.cache.values()) {
      // Each float64 = 8 bytes
      totalSize += cached.dimensions * 8;
    }
    this.stats.totalSize = totalSize;
  }

  /**
   * Update average dimensions
   */
  private updateAvgDimensions(): void {
    if (this.cache.size === 0) {
      this.stats.avgDimensions = 0;
      return;
    }

    let totalDims = 0;
    for (const cached of this.cache.values()) {
      totalDims += cached.dimensions;
    }
    this.stats.avgDimensions = totalDims / this.cache.size;
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Get hot vectors (most accessed)
   */
  getHotVectors(limit: number = 10): CachedEmbedding[] {
    return Array.from(this.cache.values())
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    if (this.options.ttl === 0) return 0;

    const now = Date.now();
    let pruned = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.options.ttl) {
        this.cache.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      this.stats.vectors = this.cache.size;
      this.updateTotalSize();
      this.updateAvgDimensions();
      this.emit('prune', pruned);
    }

    return pruned;
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage(): { bytes: number; mb: number } {
    const bytes = this.stats.totalSize;
    return {
      bytes,
      mb: bytes / (1024 * 1024),
    };
  }
}
