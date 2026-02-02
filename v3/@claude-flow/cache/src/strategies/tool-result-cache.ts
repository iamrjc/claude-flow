/**
 * MCP tool result caching with idempotent detection and per-tool TTL
 * WP27: Caching Layer - Tool Result Cache Strategy
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';

export interface ToolResultCacheOptions {
  defaultTtl?: number; // milliseconds
  toolTtls?: Map<string, number>; // Per-tool TTL overrides
  idempotentTools?: Set<string>; // Tools safe to cache
  nonIdempotentTools?: Set<string>; // Tools never to cache
  includeArgs?: boolean; // Include args in cache key
  maxCacheSize?: number;
}

export interface CachedToolResult<T = any> {
  tool: string;
  args: Record<string, any>;
  result: T;
  hash: string;
  timestamp: number;
  expiresAt?: number;
  hitCount: number;
  idempotent: boolean;
}

export interface ToolCacheStats {
  hits: number;
  misses: number;
  skipped: number; // Non-idempotent skipped
  hitRate: number;
  toolStats: Map<string, { hits: number; misses: number }>;
}

/**
 * Default idempotent MCP tools (read-only operations)
 */
const DEFAULT_IDEMPOTENT_TOOLS = new Set([
  'read_file',
  'read_multiple_files',
  'list_directory',
  'search_files',
  'get_file_info',
  'list_allowed_directories',
  'memory_search',
  'memory_retrieve',
  'agent_status',
  'agent_list',
  'config_get',
  'session_get',
]);

/**
 * Default non-idempotent tools (write/modify operations)
 */
const DEFAULT_NON_IDEMPOTENT_TOOLS = new Set([
  'write_file',
  'edit_file',
  'create_directory',
  'move_file',
  'memory_store',
  'memory_update',
  'agent_spawn',
  'agent_stop',
  'config_set',
  'session_update',
]);

/**
 * MCP tool result cache with idempotent detection
 */
export class ToolResultCache extends EventEmitter {
  private cache: Map<string, CachedToolResult>;
  private stats: ToolCacheStats;
  private options: Required<Omit<ToolResultCacheOptions, 'toolTtls'>> & {
    toolTtls: Map<string, number>;
  };

  constructor(options: ToolResultCacheOptions = {}) {
    super();
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      skipped: 0,
      hitRate: 0,
      toolStats: new Map(),
    };
    this.options = {
      defaultTtl: options.defaultTtl ?? 300000, // 5 minutes default
      toolTtls: options.toolTtls ?? new Map(),
      idempotentTools:
        options.idempotentTools ?? new Set(DEFAULT_IDEMPOTENT_TOOLS),
      nonIdempotentTools:
        options.nonIdempotentTools ?? new Set(DEFAULT_NON_IDEMPOTENT_TOOLS),
      includeArgs: options.includeArgs ?? true,
      maxCacheSize: options.maxCacheSize ?? 1000,
    };
  }

  /**
   * Generate hash for tool call
   */
  private generateHash(tool: string, args: Record<string, any>): string {
    const data = this.options.includeArgs
      ? JSON.stringify({ tool, args })
      : tool;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Check if tool is idempotent
   */
  private isIdempotent(tool: string): boolean {
    // Explicit non-idempotent takes precedence
    if (this.options.nonIdempotentTools.has(tool)) {
      return false;
    }

    // Explicit idempotent
    if (this.options.idempotentTools.has(tool)) {
      return true;
    }

    // Heuristics: read/get/list/search are usually idempotent
    const idempotentPatterns = [
      /^read/i,
      /^get/i,
      /^list/i,
      /^search/i,
      /^find/i,
      /^query/i,
      /^fetch/i,
      /^retrieve/i,
    ];

    return idempotentPatterns.some((pattern) => pattern.test(tool));
  }

  /**
   * Get TTL for tool
   */
  private getTtl(tool: string): number {
    return this.options.toolTtls.get(tool) ?? this.options.defaultTtl;
  }

  /**
   * Get cached tool result
   */
  get<T = any>(tool: string, args: Record<string, any> = {}): T | undefined {
    // Check if tool is cacheable
    if (!this.isIdempotent(tool)) {
      this.stats.skipped++;
      this.emit('skip', tool, 'non-idempotent');
      return undefined;
    }

    const hash = this.generateHash(tool, args);
    const cached = this.cache.get(hash);

    // Update tool stats
    const toolStat = this.stats.toolStats.get(tool) ?? { hits: 0, misses: 0 };

    if (!cached) {
      this.stats.misses++;
      toolStat.misses++;
      this.stats.toolStats.set(tool, toolStat);
      this.updateHitRate();
      this.emit('miss', tool, args);
      return undefined;
    }

    // Check expiration
    if (cached.expiresAt && Date.now() > cached.expiresAt) {
      this.cache.delete(hash);
      this.stats.misses++;
      toolStat.misses++;
      this.stats.toolStats.set(tool, toolStat);
      this.updateHitRate();
      return undefined;
    }

    cached.hitCount++;
    this.stats.hits++;
    toolStat.hits++;
    this.stats.toolStats.set(tool, toolStat);
    this.updateHitRate();
    this.emit('hit', tool, args);

    return cached.result as T;
  }

  /**
   * Set cached tool result
   */
  set<T = any>(
    tool: string,
    args: Record<string, any> = {},
    result: T,
    ttl?: number
  ): void {
    // Check if tool is cacheable
    if (!this.isIdempotent(tool)) {
      this.stats.skipped++;
      this.emit('skip', tool, 'non-idempotent');
      return;
    }

    // Evict if at capacity
    if (this.cache.size >= this.options.maxCacheSize && !this.has(tool, args)) {
      this.evictLRU();
    }

    const hash = this.generateHash(tool, args);
    const effectiveTtl = ttl ?? this.getTtl(tool);
    const now = Date.now();

    const cached: CachedToolResult<T> = {
      tool,
      args,
      result,
      hash,
      timestamp: now,
      expiresAt: effectiveTtl > 0 ? now + effectiveTtl : undefined,
      hitCount: 0,
      idempotent: this.isIdempotent(tool),
    };

    this.cache.set(hash, cached);
    this.emit('set', tool, args);
  }

  /**
   * Check if tool result is cached
   */
  has(tool: string, args: Record<string, any> = {}): boolean {
    if (!this.isIdempotent(tool)) {
      return false;
    }

    const hash = this.generateHash(tool, args);
    const cached = this.cache.get(hash);

    if (!cached) return false;

    // Check expiration
    if (cached.expiresAt && Date.now() > cached.expiresAt) {
      this.cache.delete(hash);
      return false;
    }

    return true;
  }

  /**
   * Delete cached tool result
   */
  delete(tool: string, args: Record<string, any> = {}): boolean {
    const hash = this.generateHash(tool, args);
    const deleted = this.cache.delete(hash);
    if (deleted) {
      this.emit('delete', tool, args);
    }
    return deleted;
  }

  /**
   * Invalidate all results for a tool
   */
  invalidateTool(tool: string): number {
    let invalidated = 0;
    for (const [hash, cached] of this.cache.entries()) {
      if (cached.tool === tool) {
        this.cache.delete(hash);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.emit('invalidate-tool', tool, invalidated);
    }

    return invalidated;
  }

  /**
   * Clear all cached results
   */
  clear(): void {
    this.cache.clear();
    this.emit('clear');
  }

  /**
   * Get cache statistics
   */
  getStats(): ToolCacheStats {
    return {
      ...this.stats,
      toolStats: new Map(this.stats.toolStats),
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      skipped: 0,
      hitRate: 0,
      toolStats: new Map(),
    };
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all cached tools
   */
  getCachedTools(): string[] {
    const tools = new Set<string>();
    for (const cached of this.cache.values()) {
      tools.add(cached.tool);
    }
    return Array.from(tools);
  }

  /**
   * Get results for specific tool
   */
  getToolResults(tool: string): CachedToolResult[] {
    const results: CachedToolResult[] = [];
    for (const cached of this.cache.values()) {
      if (cached.tool === tool) {
        results.push(cached);
      }
    }
    return results;
  }

  /**
   * Add idempotent tool
   */
  addIdempotentTool(tool: string): void {
    this.options.idempotentTools.add(tool);
    this.options.nonIdempotentTools.delete(tool);
    this.emit('config-change', 'idempotent-add', tool);
  }

  /**
   * Add non-idempotent tool
   */
  addNonIdempotentTool(tool: string): void {
    this.options.nonIdempotentTools.add(tool);
    this.options.idempotentTools.delete(tool);
    this.emit('config-change', 'non-idempotent-add', tool);
  }

  /**
   * Set TTL for specific tool
   */
  setToolTtl(tool: string, ttl: number): void {
    this.options.toolTtls.set(tool, ttl);
    this.emit('config-change', 'ttl-set', tool, ttl);
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [hash, cached] of this.cache.entries()) {
      if (cached.expiresAt && now > cached.expiresAt) {
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
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    let lowestHits = Infinity;

    for (const [hash, cached] of this.cache.entries()) {
      if (cached.hitCount < lowestHits) {
        lowestHits = cached.hitCount;
        oldestTime = cached.timestamp;
        oldestKey = hash;
      } else if (cached.hitCount === lowestHits && cached.timestamp < oldestTime) {
        oldestTime = cached.timestamp;
        oldestKey = hash;
      }
    }

    if (oldestKey) {
      const cached = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.emit('evict', cached?.tool, cached?.args);
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
   * Get most used tools
   */
  getPopularTools(limit: number = 10): Array<{ tool: string; hits: number }> {
    return Array.from(this.stats.toolStats.entries())
      .map(([tool, stats]) => ({ tool, hits: stats.hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);
  }
}
