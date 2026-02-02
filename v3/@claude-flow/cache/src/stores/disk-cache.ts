/**
 * SQLite/file-based disk cache with compression and size limits
 * WP27: Caching Layer - Disk Store
 */

import { EventEmitter } from 'events';
import Database from 'better-sqlite3';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface DiskCacheOptions {
  dbPath: string;
  maxSize?: number; // bytes
  compression?: boolean;
  compressionLevel?: number; // 1-9
  ttl?: number; // milliseconds
  cleanupInterval?: number; // milliseconds
}

export interface DiskCacheEntry {
  key: string;
  value: Buffer;
  compressed: boolean;
  timestamp: number;
  expiresAt?: number;
  size: number;
}

export interface DiskCacheStats {
  entries: number;
  totalSize: number;
  maxSize: number;
  compressionRatio: number;
  oldestEntry?: number;
  newestEntry?: number;
}

/**
 * SQLite-backed disk cache with compression
 */
export class DiskCache extends EventEmitter {
  private db: Database.Database;
  private options: Required<DiskCacheOptions>;
  private cleanupInterval?: NodeJS.Timeout;
  private currentSize: number = 0;

  constructor(options: DiskCacheOptions) {
    super();
    this.options = {
      dbPath: options.dbPath,
      maxSize: options.maxSize ?? 1024 * 1024 * 1024, // 1GB default
      compression: options.compression ?? true,
      compressionLevel: options.compressionLevel ?? 6,
      ttl: options.ttl ?? 0,
      cleanupInterval: options.cleanupInterval ?? 60000, // 1 minute
    };

    this.db = new Database(this.options.dbPath);
    this.initialize();
    this.calculateCurrentSize();

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value BLOB NOT NULL,
        compressed INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        expiresAt INTEGER,
        size INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expiresAt ON cache(expiresAt);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON cache(timestamp);
    `);
  }

  /**
   * Calculate current cache size
   */
  private calculateCurrentSize(): void {
    const stmt = this.db.prepare('SELECT SUM(size) as total FROM cache');
    const result = stmt.get() as { total: number | null };
    this.currentSize = result.total ?? 0;
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | undefined> {
    const stmt = this.db.prepare(
      'SELECT value, compressed, expiresAt FROM cache WHERE key = ?'
    );
    const row = stmt.get(key) as DiskCacheEntry | undefined;

    if (!row) {
      this.emit('miss', key);
      return undefined;
    }

    // Check expiration
    if (row.expiresAt && Date.now() > row.expiresAt) {
      this.delete(key);
      this.emit('miss', key);
      return undefined;
    }

    // Decompress if needed
    let buffer = row.value;
    if (row.compressed) {
      buffer = await gunzipAsync(buffer);
    }

    this.emit('hit', key);
    return JSON.parse(buffer.toString('utf-8')) as T;
  }

  /**
   * Set value in cache
   */
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    // Serialize value
    let buffer = Buffer.from(JSON.stringify(value), 'utf-8');
    let compressed = false;
    const originalSize = buffer.length;

    // Compress if enabled and beneficial
    if (this.options.compression && originalSize > 1024) {
      const compressedBuffer = await gzipAsync(buffer, {
        level: this.options.compressionLevel,
      });
      if (compressedBuffer.length < originalSize) {
        buffer = compressedBuffer;
        compressed = true;
      }
    }

    const size = buffer.length;
    const now = Date.now();
    const effectiveTtl = ttl ?? this.options.ttl;
    const expiresAt = effectiveTtl > 0 ? now + effectiveTtl : null;

    // Check if we need to evict
    await this.ensureSpace(size);

    // Insert or update
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache (key, value, compressed, timestamp, expiresAt, size)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const existingStmt = this.db.prepare('SELECT size FROM cache WHERE key = ?');
    const existing = existingStmt.get(key) as { size: number } | undefined;
    const oldSize = existing?.size ?? 0;

    stmt.run(key, buffer, compressed ? 1 : 0, now, expiresAt, size);
    this.currentSize = this.currentSize - oldSize + size;
    this.emit('set', key, size);
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const stmt = this.db.prepare('SELECT expiresAt FROM cache WHERE key = ?');
    const row = stmt.get(key) as { expiresAt: number | null } | undefined;

    if (!row) return false;

    // Check expiration
    if (row.expiresAt && Date.now() > row.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const stmt = this.db.prepare('SELECT size FROM cache WHERE key = ?');
    const row = stmt.get(key) as { size: number } | undefined;

    if (!row) return false;

    const deleteStmt = this.db.prepare('DELETE FROM cache WHERE key = ?');
    deleteStmt.run(key);
    this.currentSize -= row.size;
    this.emit('delete', key);
    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.db.exec('DELETE FROM cache');
    this.currentSize = 0;
    this.emit('clear');
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    const stmt = this.db.prepare('SELECT key FROM cache');
    const rows = stmt.all() as { key: string }[];
    return rows.map((row) => row.key);
  }

  /**
   * Get cache statistics
   */
  getStats(): DiskCacheStats {
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM cache');
    const sizeStmt = this.db.prepare(
      'SELECT SUM(size) as total, SUM(CASE WHEN compressed = 1 THEN size ELSE 0 END) as compressed FROM cache'
    );
    const timeStmt = this.db.prepare(
      'SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM cache'
    );

    const countRow = countStmt.get() as { count: number };
    const sizeRow = sizeStmt.get() as {
      total: number | null;
      compressed: number | null;
    };
    const timeRow = timeStmt.get() as {
      oldest: number | null;
      newest: number | null;
    };

    const total = sizeRow.total ?? 0;
    const compressed = sizeRow.compressed ?? 0;

    return {
      entries: countRow.count,
      totalSize: this.currentSize,
      maxSize: this.options.maxSize,
      compressionRatio: total > 0 ? compressed / total : 0,
      oldestEntry: timeRow.oldest ?? undefined,
      newestEntry: timeRow.newest ?? undefined,
    };
  }

  /**
   * Get multiple entries
   */
  async mget<T = any>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    const placeholders = keys.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT key, value, compressed, expiresAt FROM cache WHERE key IN (${placeholders})
    `);
    const rows = stmt.all(...keys) as DiskCacheEntry[];

    const now = Date.now();
    for (const row of rows) {
      if (row.expiresAt && now > row.expiresAt) continue;

      let buffer = row.value;
      if (row.compressed) {
        buffer = await gunzipAsync(buffer);
      }
      result.set(row.key, JSON.parse(buffer.toString('utf-8')) as T);
    }

    return result;
  }

  /**
   * Set multiple entries
   */
  async mset<T = any>(
    entries: Map<string, T> | Record<string, T>,
    ttl?: number
  ): Promise<void> {
    const entriesMap =
      entries instanceof Map ? entries : new Map(Object.entries(entries));

    const transaction = this.db.transaction(() => {
      for (const [key, value] of entriesMap) {
        // Note: This is synchronous for transaction, compression happens outside
        this.set(key, value, ttl);
      }
    });

    transaction();
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const stmt = this.db.prepare('DELETE FROM cache WHERE expiresAt < ?');
    const info = stmt.run(now);
    if (info.changes > 0) {
      this.calculateCurrentSize();
      this.emit('cleanup', info.changes);
    }
  }

  /**
   * Ensure there's space for new entry
   */
  private async ensureSpace(requiredSize: number): Promise<void> {
    while (this.currentSize + requiredSize > this.options.maxSize) {
      // Evict oldest entry
      const stmt = this.db.prepare(
        'SELECT key, size FROM cache ORDER BY timestamp ASC LIMIT 1'
      );
      const row = stmt.get() as { key: string; size: number } | undefined;

      if (!row) break;

      this.delete(row.key);
      this.emit('evict', row.key, row.size);
    }
  }

  /**
   * Get cache size
   */
  size(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM cache');
    const row = stmt.get() as { count: number };
    return row.count;
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.db.close();
    this.removeAllListeners();
  }

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    this.db.exec('VACUUM');
    this.emit('vacuum');
  }
}
