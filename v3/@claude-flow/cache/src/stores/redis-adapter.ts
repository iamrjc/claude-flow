/**
 * Redis adapter with connection pooling, cluster support, and pub/sub invalidation
 * WP27: Caching Layer - Redis Store
 */

import { EventEmitter } from 'events';

// Optional Redis support - gracefully degrade if not available
let Redis: any;
let Cluster: any;

try {
  const ioredis = await import('ioredis');
  Redis = ioredis.default;
  Cluster = ioredis.Cluster;
} catch {
  // Redis not available
}

export interface RedisAdapterOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  cluster?: boolean;
  clusterNodes?: Array<{ host: string; port: number }>;
  keyPrefix?: string;
  ttl?: number; // milliseconds
  maxRetries?: number;
  retryDelay?: number;
  enablePubSub?: boolean;
  pubSubChannel?: string;
  lazyConnect?: boolean;
}

export interface RedisStats {
  connected: boolean;
  mode: 'standalone' | 'cluster' | 'unavailable';
  keyCount: number;
  memoryUsed?: number;
  uptime?: number;
}

/**
 * Redis cache adapter with cluster and pub/sub support
 */
export class RedisAdapter extends EventEmitter {
  private client: any;
  private subscriber?: any;
  private options: Required<Omit<RedisAdapterOptions, 'clusterNodes'>> & {
    clusterNodes?: Array<{ host: string; port: number }>;
  };
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;

  constructor(options: RedisAdapterOptions = {}) {
    super();

    if (!Redis) {
      throw new Error(
        'Redis (ioredis) is not available. Install it with: npm install ioredis'
      );
    }

    this.options = {
      host: options.host ?? 'localhost',
      port: options.port ?? 6379,
      password: options.password ?? '',
      db: options.db ?? 0,
      cluster: options.cluster ?? false,
      clusterNodes: options.clusterNodes,
      keyPrefix: options.keyPrefix ?? 'cf:cache:',
      ttl: options.ttl ?? 0,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      enablePubSub: options.enablePubSub ?? false,
      pubSubChannel: options.pubSubChannel ?? 'cache:invalidate',
      lazyConnect: options.lazyConnect ?? false,
    };

    this.initializeClient();
  }

  /**
   * Initialize Redis client
   */
  private initializeClient(): void {
    const baseOptions = {
      password: this.options.password || undefined,
      db: this.options.db,
      keyPrefix: this.options.keyPrefix,
      lazyConnect: this.options.lazyConnect,
      retryStrategy: (times: number) => {
        if (times > this.options.maxRetries) {
          this.emit('error', new Error('Max retry attempts reached'));
          return null;
        }
        return Math.min(times * this.options.retryDelay, 3000);
      },
    };

    if (this.options.cluster && this.options.clusterNodes) {
      this.client = new Cluster(this.options.clusterNodes, {
        redisOptions: baseOptions,
      });
    } else {
      this.client = new Redis({
        ...baseOptions,
        host: this.options.host,
        port: this.options.port,
      });
    }

    this.setupEventHandlers();

    if (this.options.enablePubSub) {
      this.setupPubSub();
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connect');
    });

    this.client.on('ready', () => {
      this.emit('ready');
    });

    this.client.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.client.on('close', () => {
      this.isConnected = false;
      this.emit('close');
    });

    this.client.on('reconnecting', () => {
      this.reconnectAttempts++;
      this.emit('reconnecting', this.reconnectAttempts);
    });
  }

  /**
   * Setup pub/sub for cache invalidation
   */
  private setupPubSub(): void {
    const subOptions = this.options.cluster
      ? { redisOptions: { password: this.options.password || undefined } }
      : {
          host: this.options.host,
          port: this.options.port,
          password: this.options.password || undefined,
          db: this.options.db,
        };

    this.subscriber = this.options.cluster
      ? new Cluster(this.options.clusterNodes!, subOptions)
      : new Redis(subOptions);

    this.subscriber.subscribe(this.options.pubSubChannel, (err: Error) => {
      if (err) {
        this.emit('error', err);
      }
    });

    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel === this.options.pubSubChannel) {
        try {
          const data = JSON.parse(message);
          this.emit('invalidate', data.key, data.pattern);
        } catch (err) {
          this.emit('error', err);
        }
      }
    });
  }

  /**
   * Connect to Redis (if lazy connect is enabled)
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | undefined> {
    try {
      const value = await this.client.get(key);
      if (value === null) {
        this.emit('miss', key);
        return undefined;
      }
      this.emit('hit', key);
      return JSON.parse(value) as T;
    } catch (err) {
      this.emit('error', err);
      return undefined;
    }
  }

  /**
   * Set value in cache
   */
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const effectiveTtl = ttl ?? this.options.ttl;

      if (effectiveTtl > 0) {
        await this.client.set(key, serialized, 'PX', effectiveTtl);
      } else {
        await this.client.set(key, serialized);
      }

      this.emit('set', key, value);
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Delete entry from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      if (result > 0) {
        this.emit('delete', key);
        this.publishInvalidation(key);
        return true;
      }
      return false;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Clear cache with pattern
   */
  async clear(pattern: string = '*'): Promise<number> {
    try {
      const keys = await this.scanKeys(pattern);
      if (keys.length === 0) return 0;

      const result = await this.client.del(...keys);
      this.emit('clear', keys.length);
      return result;
    } catch (err) {
      this.emit('error', err);
      return 0;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string = '*'): Promise<string[]> {
    try {
      return await this.scanKeys(pattern);
    } catch (err) {
      this.emit('error', err);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<RedisStats> {
    try {
      const info = await this.client.info('stats');
      const memory = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');

      const parseInfo = (str: string, key: string): string | undefined => {
        const match = str.match(new RegExp(`${key}:([^\r\n]+)`));
        return match?.[1];
      };

      const dbKeys = parseInfo(keyspace, `db${this.options.db}`);
      const keyCount = dbKeys
        ? parseInt(dbKeys.split(',')[0].split('=')[1])
        : 0;

      return {
        connected: this.isConnected,
        mode: this.options.cluster ? 'cluster' : 'standalone',
        keyCount,
        memoryUsed: parseInt(parseInfo(memory, 'used_memory') ?? '0'),
        uptime: parseInt(parseInfo(info, 'uptime_in_seconds') ?? '0'),
      };
    } catch (err) {
      this.emit('error', err);
      return {
        connected: this.isConnected,
        mode: 'unavailable',
        keyCount: 0,
      };
    }
  }

  /**
   * Get multiple entries
   */
  async mget<T = any>(keys: string[]): Promise<Map<string, T>> {
    try {
      const values = await this.client.mget(...keys);
      const result = new Map<string, T>();

      for (let i = 0; i < keys.length; i++) {
        if (values[i] !== null) {
          result.set(keys[i], JSON.parse(values[i]) as T);
        }
      }

      return result;
    } catch (err) {
      this.emit('error', err);
      return new Map();
    }
  }

  /**
   * Set multiple entries
   */
  async mset<T = any>(
    entries: Map<string, T> | Record<string, T>,
    ttl?: number
  ): Promise<void> {
    try {
      const entriesMap =
        entries instanceof Map ? entries : new Map(Object.entries(entries));

      const pipeline = this.client.pipeline();
      const effectiveTtl = ttl ?? this.options.ttl;

      for (const [key, value] of entriesMap) {
        const serialized = JSON.stringify(value);
        if (effectiveTtl > 0) {
          pipeline.set(key, serialized, 'PX', effectiveTtl);
        } else {
          pipeline.set(key, serialized);
        }
      }

      await pipeline.exec();
      this.emit('mset', entriesMap.size);
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * Increment value
   */
  async incr(key: string, by: number = 1): Promise<number> {
    try {
      const result = await this.client.incrby(key, by);
      this.emit('incr', key, by);
      return result;
    } catch (err) {
      this.emit('error', err);
      return 0;
    }
  }

  /**
   * Set expiration on key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.client.pexpire(key, ttl);
      return result === 1;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Publish cache invalidation
   */
  private async publishInvalidation(
    key: string,
    pattern?: string
  ): Promise<void> {
    if (!this.options.enablePubSub) return;

    try {
      await this.client.publish(
        this.options.pubSubChannel,
        JSON.stringify({ key, pattern, timestamp: Date.now() })
      );
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * Scan keys with pattern (cursor-based)
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, foundKeys] = await this.client.scan(
        cursor,
        'MATCH',
        this.options.keyPrefix + pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;
      keys.push(
        ...foundKeys.map((k: string) => k.replace(this.options.keyPrefix, ''))
      );
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Get cache size
   */
  async size(): Promise<number> {
    const stats = await this.getStats();
    return stats.keyCount;
  }

  /**
   * Destroy cache and cleanup
   */
  async destroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    await this.client.quit();
    this.removeAllListeners();
  }

  /**
   * Check if Redis is available
   */
  static isAvailable(): boolean {
    return !!Redis;
  }
}
