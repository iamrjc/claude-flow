/**
 * Memory Performance Benchmarks
 *
 * Benchmarks for vector search and memory operations:
 * - HNSW search (150x-12,500x faster target)
 * - Memory operations at 10K/100K/1M entries
 * - Vector similarity search
 * - Index building performance
 *
 * @module @claude-flow/testing/benchmarks/memory-benchmarks
 */

import { describe, bench } from 'vitest';
import { HNSWIndex } from '@claude-flow/memory';
import { runBenchmarkSuite } from './utils/benchmark-runner.js';

/**
 * Generate random vector
 */
function generateVector(dimensions: number = 1536): Float32Array {
  const vector = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    vector[i] = Math.random() * 2 - 1; // Random value between -1 and 1
  }
  return vector;
}

/**
 * HNSW index creation benchmark
 */
export async function benchHNSWIndexCreation(): Promise<HNSWIndex> {
  const index = new HNSWIndex({
    dimensions: 1536,
    M: 16,
    efConstruction: 200,
    maxElements: 10000,
    metric: 'cosine',
  });

  return index;
}

/**
 * HNSW single vector insert benchmark
 */
export async function benchHNSWInsert(index: HNSWIndex): Promise<void> {
  const vector = generateVector();
  await index.addPoint(`vector-${Date.now()}`, vector);
}

/**
 * HNSW search benchmark (small index - 1K vectors)
 * Target: 150x-12,500x faster than brute force
 */
export async function benchHNSWSearchSmall(): Promise<void> {
  const index = new HNSWIndex({
    dimensions: 1536,
    M: 16,
    efConstruction: 200,
    maxElements: 10000,
    metric: 'cosine',
  });

  // Build index with 1K vectors
  for (let i = 0; i < 1000; i++) {
    await index.addPoint(`vec-${i}`, generateVector());
  }

  // Search
  const query = generateVector();
  await index.search(query, 10);
}

/**
 * HNSW search benchmark (medium index - 10K vectors)
 */
export async function benchHNSWSearchMedium(): Promise<void> {
  const index = new HNSWIndex({
    dimensions: 1536,
    M: 16,
    efConstruction: 200,
    maxElements: 100000,
    metric: 'cosine',
  });

  // Build index with 10K vectors
  for (let i = 0; i < 10000; i++) {
    await index.addPoint(`vec-${i}`, generateVector());
  }

  // Search
  const query = generateVector();
  await index.search(query, 10);
}

/**
 * HNSW search benchmark (large index - 100K vectors)
 */
export async function benchHNSWSearchLarge(): Promise<void> {
  const index = new HNSWIndex({
    dimensions: 1536,
    M: 16,
    efConstruction: 200,
    maxElements: 1000000,
    metric: 'cosine',
  });

  // Build index with 100K vectors
  for (let i = 0; i < 100000; i++) {
    await index.addPoint(`vec-${i}`, generateVector());

    // Progress indicator
    if (i % 10000 === 0 && i > 0) {
      console.log(`   Indexed ${i} vectors...`);
    }
  }

  // Search
  const query = generateVector();
  await index.search(query, 10);
}

/**
 * HNSW batch insert benchmark
 */
export async function benchHNSWBatchInsert(count: number = 1000): Promise<void> {
  const index = new HNSWIndex({
    dimensions: 1536,
    M: 16,
    efConstruction: 200,
    maxElements: 100000,
    metric: 'cosine',
  });

  for (let i = 0; i < count; i++) {
    await index.addPoint(`vec-${i}`, generateVector());
  }
}

/**
 * HNSW rebuild benchmark
 */
export async function benchHNSWRebuild(): Promise<void> {
  const index = new HNSWIndex({
    dimensions: 1536,
    M: 16,
    efConstruction: 200,
    maxElements: 10000,
    metric: 'cosine',
  });

  // Generate vectors
  const entries = Array.from({ length: 1000 }, (_, i) => ({
    id: `vec-${i}`,
    vector: generateVector(),
  }));

  // Rebuild
  await index.rebuild(entries);
}

/**
 * HNSW remove point benchmark
 */
export async function benchHNSWRemove(): Promise<void> {
  const index = new HNSWIndex({
    dimensions: 1536,
    M: 16,
    efConstruction: 200,
    maxElements: 10000,
    metric: 'cosine',
  });

  // Add vectors
  for (let i = 0; i < 100; i++) {
    await index.addPoint(`vec-${i}`, generateVector());
  }

  // Remove
  await index.removePoint('vec-50');
}

/**
 * HNSW search with filters benchmark
 */
export async function benchHNSWSearchWithFilters(): Promise<void> {
  const index = new HNSWIndex({
    dimensions: 1536,
    M: 16,
    efConstruction: 200,
    maxElements: 10000,
    metric: 'cosine',
  });

  // Build index
  for (let i = 0; i < 1000; i++) {
    await index.addPoint(`vec-${i}`, generateVector());
  }

  // Search with filter
  const query = generateVector();
  await index.searchWithFilters(
    query,
    10,
    (id) => parseInt(id.split('-')[1]) % 2 === 0 // Even IDs only
  );
}

/**
 * Different distance metrics benchmark
 */
export async function benchDistanceMetrics(): Promise<void> {
  const metrics = ['cosine', 'euclidean', 'dot', 'manhattan'] as const;

  for (const metric of metrics) {
    const index = new HNSWIndex({
      dimensions: 1536,
      M: 16,
      efConstruction: 200,
      maxElements: 10000,
      metric,
    });

    // Build small index
    for (let i = 0; i < 100; i++) {
      await index.addPoint(`vec-${i}`, generateVector());
    }

    // Search
    const query = generateVector();
    await index.search(query, 10);
  }
}

/**
 * HNSW quantization benchmark
 */
export async function benchHNSWQuantization(): Promise<void> {
  const index = new HNSWIndex({
    dimensions: 1536,
    M: 16,
    efConstruction: 200,
    maxElements: 10000,
    metric: 'cosine',
    quantization: {
      type: 'scalar',
      bits: 8,
    },
  });

  // Build index with quantization
  for (let i = 0; i < 1000; i++) {
    await index.addPoint(`vec-${i}`, generateVector());
  }

  // Search
  const query = generateVector();
  await index.search(query, 10);
}

/**
 * Run all memory benchmarks
 */
export async function runMemoryBenchmarks() {
  return runBenchmarkSuite('Memory Performance', [
    {
      name: 'HNSW Index Creation',
      fn: benchHNSWIndexCreation,
      options: { iterations: 100 },
    },
    {
      name: 'HNSW Search (1K vectors) - target: 150x+ faster',
      fn: benchHNSWSearchSmall,
      options: { iterations: 10, warmup: 2 },
    },
    {
      name: 'HNSW Search (10K vectors) - target: 1,000x+ faster',
      fn: benchHNSWSearchMedium,
      options: { iterations: 5, warmup: 1 },
    },
    {
      name: 'HNSW Batch Insert (1K vectors)',
      fn: () => benchHNSWBatchInsert(1000),
      options: { iterations: 10 },
    },
    {
      name: 'HNSW Batch Insert (10K vectors)',
      fn: () => benchHNSWBatchInsert(10000),
      options: { iterations: 3 },
    },
    {
      name: 'HNSW Rebuild (1K vectors)',
      fn: benchHNSWRebuild,
      options: { iterations: 10 },
    },
    {
      name: 'HNSW Remove Point',
      fn: benchHNSWRemove,
      options: { iterations: 50 },
    },
    {
      name: 'HNSW Search with Filters',
      fn: benchHNSWSearchWithFilters,
      options: { iterations: 10 },
    },
    {
      name: 'Distance Metrics Comparison',
      fn: benchDistanceMetrics,
      options: { iterations: 5 },
    },
    {
      name: 'HNSW with Quantization',
      fn: benchHNSWQuantization,
      options: { iterations: 10 },
    },
  ]);
}

// Vitest benchmarks
describe('Memory Benchmarks', () => {
  bench('HNSW index creation', async () => {
    await benchHNSWIndexCreation();
  });

  bench('HNSW search (1K)', async () => {
    await benchHNSWSearchSmall();
  });

  bench('HNSW batch insert (1K)', async () => {
    await benchHNSWBatchInsert(1000);
  });

  bench('HNSW rebuild', async () => {
    await benchHNSWRebuild();
  });

  bench('HNSW remove point', async () => {
    await benchHNSWRemove();
  });

  bench('HNSW search with filters', async () => {
    await benchHNSWSearchWithFilters();
  });

  bench('HNSW with quantization', async () => {
    await benchHNSWQuantization();
  });
});
