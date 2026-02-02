/**
 * LLM response caching with request hashing and semantic matching
 * WP27: Caching Layer - Response Cache Strategy
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';

export interface ResponseCacheOptions {
  ttl?: number; // milliseconds
  semanticThreshold?: number; // 0-1, similarity threshold
  includeMetadata?: boolean;
  normalizeWhitespace?: boolean;
  caseInsensitive?: boolean;
  ignoreFields?: string[];
}

export interface CachedResponse<T = any> {
  response: T;
  hash: string;
  prompt: string;
  metadata?: Record<string, any>;
  timestamp: number;
  hitCount: number;
}

export interface ResponseCacheStats {
  hits: number;
  misses: number;
  semanticMatches: number;
  hitRate: number;
  averageResponseTime: number;
}

/**
 * LLM response cache with semantic matching
 */
export class ResponseCache extends EventEmitter {
  private cache: Map<string, CachedResponse>;
  private stats: ResponseCacheStats;
  private options: Required<ResponseCacheOptions>;

  constructor(options: ResponseCacheOptions = {}) {
    super();
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      semanticMatches: 0,
      hitRate: 0,
      averageResponseTime: 0,
    };
    this.options = {
      ttl: options.ttl ?? 3600000, // 1 hour default
      semanticThreshold: options.semanticThreshold ?? 0.85,
      includeMetadata: options.includeMetadata ?? true,
      normalizeWhitespace: options.normalizeWhitespace ?? true,
      caseInsensitive: options.caseInsensitive ?? false,
      ignoreFields: options.ignoreFields ?? [],
    };
  }

  /**
   * Generate hash for request
   */
  private generateHash(
    prompt: string,
    context?: Record<string, any>
  ): string {
    let normalized = prompt;

    if (this.options.normalizeWhitespace) {
      normalized = normalized.replace(/\s+/g, ' ').trim();
    }

    if (this.options.caseInsensitive) {
      normalized = normalized.toLowerCase();
    }

    const data = context
      ? JSON.stringify({ prompt: normalized, context: this.filterContext(context) })
      : normalized;

    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Filter context by removing ignored fields
   */
  private filterContext(context: Record<string, any>): Record<string, any> {
    const filtered = { ...context };
    for (const field of this.options.ignoreFields) {
      delete filtered[field];
    }
    return filtered;
  }

  /**
   * Calculate semantic similarity (simple token-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(str2.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Find semantically similar cached response
   */
  private findSimilar(prompt: string): CachedResponse | undefined {
    let bestMatch: CachedResponse | undefined;
    let bestSimilarity = 0;

    for (const cached of this.cache.values()) {
      const similarity = this.calculateSimilarity(prompt, cached.prompt);
      if (
        similarity >= this.options.semanticThreshold &&
        similarity > bestSimilarity
      ) {
        bestSimilarity = similarity;
        bestMatch = cached;
      }
    }

    if (bestMatch) {
      this.stats.semanticMatches++;
      this.emit('semantic-match', prompt, bestMatch.prompt, bestSimilarity);
    }

    return bestMatch;
  }

  /**
   * Get cached response
   */
  get<T = any>(
    prompt: string,
    context?: Record<string, any>
  ): T | undefined {
    const hash = this.generateHash(prompt, context);
    const cached = this.cache.get(hash);

    if (cached) {
      // Check TTL
      if (Date.now() - cached.timestamp > this.options.ttl) {
        this.cache.delete(hash);
        this.stats.misses++;
        this.updateHitRate();
        return undefined;
      }

      cached.hitCount++;
      this.stats.hits++;
      this.updateHitRate();
      this.emit('hit', hash, prompt);
      return cached.response as T;
    }

    // Try semantic matching
    const similar = this.findSimilar(prompt);
    if (similar) {
      // Check TTL on semantic match
      if (Date.now() - similar.timestamp > this.options.ttl) {
        this.cache.delete(similar.hash);
        this.stats.misses++;
        this.updateHitRate();
        return undefined;
      }

      similar.hitCount++;
      this.stats.hits++;
      this.updateHitRate();
      this.emit('hit', similar.hash, prompt, 'semantic');
      return similar.response as T;
    }

    this.stats.misses++;
    this.updateHitRate();
    this.emit('miss', hash, prompt);
    return undefined;
  }

  /**
   * Set cached response
   */
  set<T = any>(
    prompt: string,
    response: T,
    context?: Record<string, any>,
    metadata?: Record<string, any>
  ): void {
    const hash = this.generateHash(prompt, context);
    const cached: CachedResponse<T> = {
      response,
      hash,
      prompt,
      metadata: this.options.includeMetadata ? metadata : undefined,
      timestamp: Date.now(),
      hitCount: 0,
    };

    this.cache.set(hash, cached);
    this.emit('set', hash, prompt);
  }

  /**
   * Check if response is cached
   */
  has(prompt: string, context?: Record<string, any>): boolean {
    const hash = this.generateHash(prompt, context);
    const cached = this.cache.get(hash);

    if (!cached) return false;

    // Check TTL
    if (Date.now() - cached.timestamp > this.options.ttl) {
      this.cache.delete(hash);
      return false;
    }

    return true;
  }

  /**
   * Delete cached response
   */
  delete(prompt: string, context?: Record<string, any>): boolean {
    const hash = this.generateHash(prompt, context);
    const deleted = this.cache.delete(hash);
    if (deleted) {
      this.emit('delete', hash, prompt);
    }
    return deleted;
  }

  /**
   * Clear all cached responses
   */
  clear(): void {
    this.cache.clear();
    this.emit('clear');
  }

  /**
   * Get cache statistics
   */
  getStats(): ResponseCacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      semanticMatches: 0,
      hitRate: 0,
      averageResponseTime: 0,
    };
  }

  /**
   * Get all cached prompts
   */
  getPrompts(): string[] {
    return Array.from(this.cache.values()).map((c) => c.prompt);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get entries by hit count
   */
  getPopular(limit: number = 10): CachedResponse[] {
    return Array.from(this.cache.values())
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, limit);
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [hash, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.options.ttl) {
        this.cache.delete(hash);
        pruned++;
      }
    }

    if (pruned > 0) {
      this.emit('prune', pruned);
    }

    return pruned;
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Export cache to JSON
   */
  export(): string {
    const data = Array.from(this.cache.entries()).map(([, cached]) => ({
      ...cached,
    }));
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import cache from JSON
   */
  import(json: string): number {
    try {
      const data = JSON.parse(json) as Array<
        CachedResponse & { hash: string }
      >;
      let imported = 0;

      for (const item of data) {
        this.cache.set(item.hash, item);
        imported++;
      }

      this.emit('import', imported);
      return imported;
    } catch (err) {
      this.emit('error', err);
      return 0;
    }
  }
}
