/**
 * Embedding Service - Infrastructure Layer
 *
 * Interface for generating and managing vector embeddings.
 * Supports caching and batch operations for efficiency.
 *
 * @module v3/memory/infrastructure/embeddings
 */

/**
 * Embedding provider configuration
 */
export interface EmbeddingProviderConfig {
  /** Provider name (e.g., 'openai', 'cohere', 'local') */
  provider: string;

  /** Model name */
  model?: string;

  /** API key for remote providers */
  apiKey?: string;

  /** API endpoint URL */
  endpoint?: string;

  /** Expected embedding dimensions */
  dimensions: number;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Max retries on failure */
  maxRetries?: number;
}

/**
 * Embedding cache entry
 */
interface CachedEmbedding {
  text: string;
  embedding: Float32Array;
  timestamp: number;
  accessCount: number;
}

/**
 * Embedding service interface
 *
 * Provides embedding generation with caching and batch support.
 */
export interface IEmbeddingService {
  /**
   * Generate embedding for a single text
   */
  embed(text: string): Promise<Float32Array>;

  /**
   * Generate embeddings for multiple texts in batch
   */
  embedBatch(texts: string[]): Promise<Float32Array[]>;

  /**
   * Clear the embedding cache
   */
  clearCache(): void;

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/**
 * Embedding service implementation with caching
 */
export class EmbeddingService implements IEmbeddingService {
  private config: EmbeddingProviderConfig;
  private cache: Map<string, CachedEmbedding>;
  private maxCacheSize: number;
  private cacheHits: number;
  private cacheMisses: number;
  private embeddingGenerator: (text: string) => Promise<Float32Array>;

  constructor(
    config: EmbeddingProviderConfig,
    embeddingGenerator: (text: string) => Promise<Float32Array>,
    maxCacheSize: number = 10000
  ) {
    this.config = config;
    this.embeddingGenerator = embeddingGenerator;
    this.cache = new Map();
    this.maxCacheSize = maxCacheSize;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Generate embedding with caching
   */
  async embed(text: string): Promise<Float32Array> {
    // Check cache first
    const cached = this.cache.get(text);
    if (cached) {
      this.cacheHits++;
      cached.accessCount++;
      return cached.embedding;
    }

    this.cacheMisses++;

    // Generate new embedding
    const embedding = await this.embeddingGenerator(text);

    // Validate dimensions
    if (embedding.length !== this.config.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.config.dimensions}, got ${embedding.length}`
      );
    }

    // Cache the result
    this.addToCache(text, embedding);

    return embedding;
  }

  /**
   * Generate embeddings in batch
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const cached = this.cache.get(text);

      if (cached) {
        this.cacheHits++;
        cached.accessCount++;
        results[i] = cached.embedding;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      this.cacheMisses += uncachedTexts.length;

      // Process in batches for efficiency
      const batchSize = 10;
      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);
        const embeddings = await Promise.all(
          batch.map((text) => this.embeddingGenerator(text))
        );

        // Cache and assign results
        for (let j = 0; j < embeddings.length; j++) {
          const text = batch[j];
          const embedding = embeddings[j];
          this.addToCache(text, embedding);
          results[uncachedIndices[i + j]] = embedding;
        }
      }
    }

    return results;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? this.cacheHits / total : 0;

    return {
      size: this.cache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate,
    };
  }

  /**
   * Add embedding to cache with LRU eviction
   */
  private addToCache(text: string, embedding: Float32Array): void {
    // If cache is full, evict least recently accessed
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    this.cache.set(text, {
      text,
      embedding,
      timestamp: Date.now(),
      accessCount: 1,
    });
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

/**
 * Mock embedding service for testing
 */
export class MockEmbeddingService implements IEmbeddingService {
  private dimensions: number;

  constructor(dimensions: number = 128) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<Float32Array> {
    return this.generateMockEmbedding(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((text) => this.generateMockEmbedding(text)));
  }

  clearCache(): void {
    // No-op for mock
  }

  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    return { size: 0, hits: 0, misses: 0, hitRate: 0 };
  }

  private generateMockEmbedding(text: string): Float32Array {
    const arr = new Float32Array(this.dimensions);

    // Hash-based deterministic embedding
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }

    for (let i = 0; i < this.dimensions; i++) {
      const seed = hash + i;
      arr[i] = Math.sin(seed) * 0.5 + 0.5;
    }

    // Normalize
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += arr[i] * arr[i];
    }
    norm = Math.sqrt(norm);

    for (let i = 0; i < this.dimensions; i++) {
      arr[i] /= norm;
    }

    return arr;
  }
}
