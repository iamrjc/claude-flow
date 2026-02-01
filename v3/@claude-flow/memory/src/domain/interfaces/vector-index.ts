/**
 * Vector Index Interface - Domain Layer
 *
 * Defines the contract for vector similarity search indexes.
 * Supports HNSW and other index types.
 *
 * @module v3/memory/domain/interfaces
 */

import { DistanceMetric, HNSWConfig, HNSWStats } from '../../types.js';

/**
 * Vector search result
 */
export interface VectorSearchResult {
  /** Entry ID */
  id: string;

  /** Distance from query */
  distance: number;

  /** Similarity score (0-1, higher is better) */
  similarity: number;
}

/**
 * Vector index interface
 *
 * Defines operations for efficient vector similarity search.
 * Implementations can use HNSW, Annoy, FAISS, or other algorithms.
 */
export interface IVectorIndex {
  /**
   * Add a vector to the index
   */
  add(id: string, vector: Float32Array): Promise<void>;

  /**
   * Add multiple vectors in batch
   */
  addBatch(entries: Array<{ id: string; vector: Float32Array }>): Promise<void>;

  /**
   * Search for k nearest neighbors
   */
  search(
    query: Float32Array,
    k: number,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]>;

  /**
   * Remove a vector from the index
   */
  remove(id: string): Promise<boolean>;

  /**
   * Remove multiple vectors
   */
  removeBatch(ids: string[]): Promise<number>;

  /**
   * Check if an ID exists in the index
   */
  has(id: string): boolean;

  /**
   * Get the number of vectors in the index
   */
  size(): number;

  /**
   * Clear the entire index
   */
  clear(): void;

  /**
   * Rebuild the index from entries
   */
  rebuild(entries: Array<{ id: string; vector: Float32Array }>): Promise<void>;

  /**
   * Get index statistics
   */
  getStats(): IndexStats;

  /**
   * Optimize the index (e.g., rebalance, compact)
   */
  optimize(): Promise<void>;
}

/**
 * Vector search options
 */
export interface VectorSearchOptions {
  /** Search expansion factor (HNSW ef parameter) */
  ef?: number;

  /** Minimum similarity threshold */
  threshold?: number;

  /** Distance metric to use */
  metric?: DistanceMetric;

  /** Filter function to apply post-search */
  filter?: (id: string) => boolean;

  /** Include vector data in results */
  includeVectors?: boolean;
}

/**
 * Index statistics
 */
export interface IndexStats {
  /** Number of vectors in index */
  vectorCount: number;

  /** Memory usage in bytes */
  memoryUsage: number;

  /** Average search time in milliseconds */
  avgSearchTime: number;

  /** Index build time in milliseconds */
  buildTime: number;

  /** Compression ratio (if quantization is used) */
  compressionRatio?: number;

  /** Index type (e.g., 'hnsw', 'annoy', 'flat') */
  indexType: string;
}

/**
 * HNSW-specific index interface
 *
 * Extends base vector index with HNSW-specific parameters.
 */
export interface IHNSWIndex extends IVectorIndex {
  /**
   * Get HNSW configuration
   */
  getConfig(): HNSWConfig;

  /**
   * Get HNSW statistics
   */
  getHNSWStats(): HNSWStats;

  /**
   * Set search parameters
   */
  setSearchParams(ef: number): void;

  /**
   * Get the number of layers in the graph
   */
  getLayerCount(): number;
}

/**
 * Index builder for creating optimized indexes
 */
export class VectorIndexBuilder {
  private config: Partial<HNSWConfig> = {};

  setDimensions(dimensions: number): this {
    this.config.dimensions = dimensions;
    return this;
  }

  setMaxConnections(M: number): this {
    this.config.M = M;
    return this;
  }

  setConstructionDepth(efConstruction: number): this {
    this.config.efConstruction = efConstruction;
    return this;
  }

  setMaxElements(maxElements: number): this {
    this.config.maxElements = maxElements;
    return this;
  }

  setMetric(metric: DistanceMetric): this {
    this.config.metric = metric;
    return this;
  }

  enableQuantization(type: 'binary' | 'scalar' | 'product', bits?: number): this {
    this.config.quantization = {
      type,
      bits: bits || 8,
    };
    return this;
  }

  build(): HNSWConfig {
    // Validate required fields
    if (!this.config.dimensions) {
      throw new Error('Dimensions must be specified');
    }

    // Set defaults
    return {
      dimensions: this.config.dimensions,
      M: this.config.M || 16,
      efConstruction: this.config.efConstruction || 200,
      maxElements: this.config.maxElements || 1000000,
      metric: this.config.metric || 'cosine',
      quantization: this.config.quantization,
    };
  }
}
