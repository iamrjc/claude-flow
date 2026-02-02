/**
 * In-memory LRU cache with TTL, eviction policies, and statistics
 * WP27: Caching Layer - Memory Store
 */

import { EventEmitter } from 'events';

export interface MemoryCacheOptions {
  maxSize: number;
  ttl?: number; // milliseconds
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
  onEvict?: (key: string, value: any) => void;
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  expiresAt?: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

/**
 * LRU/LFU/FIFO in-memory cache with TTL support
 */
export class MemoryCache extends EventEmitter {
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[]; // For LRU
  private stats: CacheStats;
  private options: Required<MemoryCacheOptions>;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: MemoryCacheOptions) {
    super();
    this.cache = new Map();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      size: 0,
      maxSize: options.maxSize,
      hitRate: 0,
    };
    this.options = {
      maxSize: options.maxSize,
      ttl: options.ttl ?? 0,
      evictionPolicy: options.evictionPolicy ?? 'lru',
      onEvict: options.onEvict ?? (() => {}),
    };

    // Start cleanup interval for expired entries
    if (this.options.ttl > 0) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, Math.max(1000, this.options.ttl / 10));
    }
  }

  /**
   * Get value from cache
   */
  get<T = any>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      this.emit('miss', key);
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      this.emit('miss', key);
      return undefined;
    }

    // Update access info
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    // Update access order for LRU
    if (this.options.evictionPolicy === 'lru') {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.accessOrder.push(key);
    }

    this.stats.hits++;
    this.updateHitRate();
    this.emit('hit', key);

    return entry.value as T;
  }

  /**
   * Set value in cache
   */
  set<T = any>(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    const now = Date.now();
    const effectiveTtl = ttl ?? this.options.ttl;
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: now,
      expiresAt: effectiveTtl > 0 ? now + effectiveTtl : undefined,
      accessCount: 0,
      lastAccessed: now,
    };

    this.cache.set(key, entry);
    this.accessOrder.push(key);
    this.stats.sets++;
    this.stats.size = this.cache.size;
    this.emit('set', key, value);
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }

    this.stats.size = this.cache.size;
    this.emit('delete', key);
    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats.size = 0;
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
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.sets = 0;
    this.stats.evictions = 0;
    this.updateHitRate();
  }

  /**
   * Get multiple entries
   */
  mget<T = any>(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const value = this.get<T>(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }
    return result;
  }

  /**
   * Set multiple entries
   */
  mset<T = any>(entries: Map<string, T> | Record<string, T>, ttl?: number): void {
    const entriesMap = entries instanceof Map ? entries : new Map(Object.entries(entries));
    for (const [key, value] of entriesMap) {
      this.set(key, value, ttl);
    }
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.delete(key);
      }
    }
  }

  /**
   * Evict entry based on policy
   */
  private evict(): void {
    let keyToEvict: string | undefined;

    switch (this.options.evictionPolicy) {
      case 'lru':
        keyToEvict = this.accessOrder[0];
        break;
      case 'lfu': {
        let minAccess = Infinity;
        for (const [key, entry] of this.cache.entries()) {
          if (entry.accessCount < minAccess) {
            minAccess = entry.accessCount;
            keyToEvict = key;
          }
        }
        break;
      }
      case 'fifo':
        keyToEvict = this.cache.keys().next().value;
        break;
    }

    if (keyToEvict) {
      const entry = this.cache.get(keyToEvict);
      this.options.onEvict(keyToEvict, entry?.value);
      this.delete(keyToEvict);
      this.stats.evictions++;
      this.emit('evict', keyToEvict);
    }
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
    this.removeAllListeners();
  }
}
