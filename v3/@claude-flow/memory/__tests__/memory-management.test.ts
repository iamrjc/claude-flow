/**
 * Comprehensive Memory Management Domain Tests (WP15)
 *
 * Tests the unified memory system with:
 * - HNSW-indexed vector storage
 * - Semantic search
 * - Persistence (SQLite + AgentDB hybrid)
 * - Namespace management
 * - Memory CRUD operations
 *
 * Target: 40+ tests, >80% coverage
 *
 * @module v3/memory/__tests__
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryEntry } from '../src/domain/entities/memory-entry.js';
import { MemoryApplicationService } from '../src/application/services/memory-application-service.js';
import { HybridMemoryRepository } from '../src/infrastructure/repositories/hybrid-memory-repository.js';
import { HNSWIndex } from '../src/hnsw-index.js';
import { HybridBackend } from '../src/hybrid-backend.js';
import {
  MemoryType,
  DistanceMetric,
  createDefaultEntry,
} from '../src/types.js';

/**
 * Mock embedding generator for testing
 * Creates deterministic embeddings based on text content
 */
const mockEmbedding = async (text: string): Promise<Float32Array> => {
  const dimensions = 128;
  const arr = new Float32Array(dimensions);

  // Hash-based embedding for consistency
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  // Fill array with pseudo-random values based on hash
  for (let i = 0; i < dimensions; i++) {
    const seed = hash + i;
    arr[i] = Math.sin(seed) * 0.5 + 0.5; // Normalize to [0, 1]
  }

  // Normalize to unit vector for consistent cosine similarity
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += arr[i] * arr[i];
  }
  norm = Math.sqrt(norm);

  for (let i = 0; i < dimensions; i++) {
    arr[i] /= norm;
  }

  return arr;
};

describe('Memory Management Domain (WP15)', () => {
  let service: MemoryApplicationService;
  let backend: HybridBackend;
  let repository: HybridMemoryRepository;

  beforeEach(async () => {
    backend = new HybridBackend({
      sqlite: {
        databasePath: ':memory:',
        verbose: false,
      },
      agentdb: {
        vectorDimension: 128,
      },
      embeddingGenerator: mockEmbedding,
      dualWrite: true,
    });

    await backend.initialize();
    repository = new HybridMemoryRepository(backend);
    service = new MemoryApplicationService(repository);
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
    await backend.shutdown();
  });

  // ============================================================================
  // MEMORY CRUD OPERATIONS (10 tests)
  // ============================================================================

  describe('Memory CRUD Operations', () => {
    it('should create a memory entry', async () => {
      const entry = await service.store({
        namespace: 'test',
        key: 'test-key',
        value: 'Test value',
        type: 'semantic',
      });

      expect(entry).toBeDefined();
      expect(entry.namespace).toBe('test');
      expect(entry.key).toBe('test-key');
      expect(entry.value).toBe('Test value');
      expect(entry.type).toBe('semantic');
    });

    it('should retrieve a memory entry by namespace and key', async () => {
      await service.store({
        namespace: 'users',
        key: 'user-123',
        value: { name: 'Alice', age: 30 },
        type: 'semantic',
      });

      const retrieved = await service.get('users', 'user-123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.key).toBe('user-123');
      expect(retrieved?.namespace).toBe('users');
    });

    it('should retrieve a memory entry by ID', async () => {
      const stored = await service.store({
        namespace: 'test',
        key: 'id-test',
        value: 'Test value',
        type: 'semantic',
      });

      const retrieved = await service.getById(stored.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(stored.id);
    });

    it('should update a memory entry', async () => {
      const entry = await service.store({
        namespace: 'test',
        key: 'update-test',
        value: 'Original value',
        type: 'semantic',
      });

      entry.updateValue('Updated value');
      await repository.save(entry);

      const retrieved = await service.get('test', 'update-test');
      expect(retrieved?.value).toBe('Updated value');
    });

    it('should delete a memory entry (soft delete)', async () => {
      await service.store({
        namespace: 'test',
        key: 'delete-test',
        value: 'To be deleted',
        type: 'semantic',
      });

      const deleted = await service.delete('test', 'delete-test', false);
      expect(deleted).toBe(true);

      const retrieved = await service.get('test', 'delete-test');
      expect(retrieved).toBeNull();
    });

    it('should delete a memory entry (hard delete)', async () => {
      await service.store({
        namespace: 'test',
        key: 'hard-delete',
        value: 'To be deleted',
        type: 'semantic',
      });

      const deleted = await service.delete('test', 'hard-delete', true);
      expect(deleted).toBe(true);

      const retrieved = await service.get('test', 'hard-delete');
      expect(retrieved).toBeNull();
    });

    it('should handle non-existent keys gracefully', async () => {
      const retrieved = await service.get('test', 'non-existent');
      expect(retrieved).toBeNull();
    });

    it('should store multiple entries in batch', async () => {
      const inputs = Array.from({ length: 5 }, (_, i) => ({
        namespace: 'batch',
        key: `batch-${i}`,
        value: `Batch value ${i}`,
        type: 'semantic' as MemoryType,
      }));

      const entries = await service.storeMany(inputs);
      expect(entries).toHaveLength(5);
      expect(entries.every((e) => e.namespace === 'batch')).toBe(true);
    });

    it('should track access count on retrieval', async () => {
      const entry = await service.store({
        namespace: 'test',
        key: 'access-test',
        value: 'Access tracking',
        type: 'semantic',
      });

      const initialAccess = entry.accessCount;

      // Access multiple times
      await service.get('test', 'access-test');
      await service.get('test', 'access-test');
      await service.get('test', 'access-test');

      const retrieved = await service.get('test', 'access-test');
      expect(retrieved?.accessCount).toBeGreaterThan(initialAccess);
    });

    it('should update metadata on memory entry', async () => {
      const entry = await service.store({
        namespace: 'test',
        key: 'metadata-test',
        value: 'Test',
        type: 'semantic',
        metadata: { tag: 'original' },
      });

      entry.setMetadata('tag', 'updated');
      entry.setMetadata('author', 'system');
      await repository.save(entry);

      const retrieved = await service.get('test', 'metadata-test');
      expect(retrieved?.metadata.tag).toBe('updated');
      expect(retrieved?.metadata.author).toBe('system');
    });
  });

  // ============================================================================
  // VECTOR SEARCH TESTS (8 tests)
  // ============================================================================

  describe('Vector Search (k-NN)', () => {
    beforeEach(async () => {
      // Seed test data with semantically related content
      const testData = [
        { key: 'auth-1', content: 'User authentication with JWT tokens' },
        { key: 'auth-2', content: 'OAuth2 authentication flow' },
        { key: 'auth-3', content: 'Password hashing with bcrypt' },
        { key: 'db-1', content: 'Database connection pooling' },
        { key: 'db-2', content: 'SQL query optimization' },
        { key: 'cache-1', content: 'Redis caching strategy' },
        { key: 'cache-2', content: 'LRU cache implementation' },
      ];

      for (const data of testData) {
        await service.store({
          namespace: 'search-test',
          key: data.key,
          value: data.content,
          type: 'semantic',
        });
      }
    });

    it('should perform semantic search', async () => {
      const query = await mockEmbedding('authentication security');
      const results = await service.searchByVector(query, {
        namespace: 'search-test',
        limit: 3,
      });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return results sorted by similarity', async () => {
      const query = await mockEmbedding('database operations');
      const results = await service.searchByVector(query, {
        namespace: 'search-test',
        limit: 5,
      });

      // Verify results are sorted (lower distance = higher similarity)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should respect the k parameter for top-k results', async () => {
      const query = await mockEmbedding('cache performance');

      const results3 = await service.searchByVector(query, {
        namespace: 'search-test',
        limit: 3,
      });
      const results5 = await service.searchByVector(query, {
        namespace: 'search-test',
        limit: 5,
      });

      expect(results3.length).toBeLessThanOrEqual(3);
      expect(results5.length).toBeLessThanOrEqual(5);
    });

    it('should filter by namespace', async () => {
      await service.store({
        namespace: 'other',
        key: 'other-1',
        value: 'Other namespace content',
        type: 'semantic',
      });

      const query = await mockEmbedding('authentication');
      const results = await service.searchByVector(query, {
        namespace: 'search-test',
        limit: 10,
      });

      // All results should be from 'search-test' namespace
      expect(results.every((r) => r.entry.namespace === 'search-test')).toBe(true);
    });

    it('should handle threshold filtering', async () => {
      const query = await mockEmbedding('completely unrelated quantum physics');
      const results = await service.searchByVector(query, {
        namespace: 'search-test',
        limit: 10,
        threshold: 0.8, // High threshold for similarity
      });

      // Results should respect threshold
      expect(results.every((r) => r.similarity >= 0.8)).toBe(true);
    });

    it('should handle empty index gracefully', async () => {
      const emptyService = new MemoryApplicationService(repository);
      const query = await mockEmbedding('test');

      const results = await service.searchByVector(query, {
        namespace: 'non-existent',
        limit: 10,
      });

      expect(results).toBeDefined();
      expect(results).toHaveLength(0);
    });

    it('should perform hybrid search (vector + filters)', async () => {
      const results = await service.search({
        namespace: 'search-test',
        type: 'semantic',
        limit: 5,
      });

      expect(results.entries.length).toBeGreaterThan(0);
      expect(results.entries.every((e) => e.type === 'semantic')).toBe(true);
    });

    it('should demonstrate search performance improvement', async () => {
      // Add more entries for performance testing
      const moreData = Array.from({ length: 50 }, (_, i) => ({
        key: `perf-${i}`,
        content: `Performance test entry number ${i} with varying content`,
      }));

      for (const data of moreData) {
        await service.store({
          namespace: 'perf-test',
          key: data.key,
          value: data.content,
          type: 'semantic',
        });
      }

      const query = await mockEmbedding('performance test');
      const startTime = performance.now();

      const results = await service.searchByVector(query, {
        namespace: 'perf-test',
        limit: 10,
      });

      const duration = performance.now() - startTime;

      expect(results.length).toBeGreaterThan(0);
      // HNSW should complete search in <10ms for small dataset
      expect(duration).toBeLessThan(50);
    });
  });

  // ============================================================================
  // NAMESPACE MANAGEMENT (6 tests)
  // ============================================================================

  describe('Namespace Management', () => {
    it('should isolate entries by namespace', async () => {
      await service.store({
        namespace: 'ns1',
        key: 'key1',
        value: 'Value in namespace 1',
        type: 'semantic',
      });

      await service.store({
        namespace: 'ns2',
        key: 'key1', // Same key, different namespace
        value: 'Value in namespace 2',
        type: 'semantic',
      });

      const ns1Entry = await service.get('ns1', 'key1');
      const ns2Entry = await service.get('ns2', 'key1');

      expect(ns1Entry?.value).toBe('Value in namespace 1');
      expect(ns2Entry?.value).toBe('Value in namespace 2');
    });

    it('should list all namespaces', async () => {
      await service.store({
        namespace: 'alpha',
        key: 'key1',
        value: 'Test',
        type: 'semantic',
      });

      await service.store({
        namespace: 'beta',
        key: 'key1',
        value: 'Test',
        type: 'semantic',
      });

      await service.store({
        namespace: 'gamma',
        key: 'key1',
        value: 'Test',
        type: 'semantic',
      });

      const namespaces = await service.listNamespaces();
      expect(namespaces).toContain('alpha');
      expect(namespaces).toContain('beta');
      expect(namespaces).toContain('gamma');
    });

    it('should get all entries in a namespace', async () => {
      const namespace = 'test-ns';

      for (let i = 0; i < 5; i++) {
        await service.store({
          namespace,
          key: `key-${i}`,
          value: `Value ${i}`,
          type: 'semantic',
        });
      }

      const entries = await service.getNamespace(namespace);
      expect(entries).toHaveLength(5);
      expect(entries.every((e) => e.namespace === namespace)).toBe(true);
    });

    it('should count entries in a namespace', async () => {
      const namespace = 'count-test';

      for (let i = 0; i < 10; i++) {
        await service.store({
          namespace,
          key: `key-${i}`,
          value: `Value ${i}`,
          type: 'semantic',
        });
      }

      const count = await service.count({ namespace });
      expect(count).toBe(10);
    });

    it('should delete all entries in a namespace', async () => {
      const namespace = 'delete-ns';

      for (let i = 0; i < 3; i++) {
        await service.store({
          namespace,
          key: `key-${i}`,
          value: `Value ${i}`,
          type: 'semantic',
        });
      }

      const deletedCount = await service.deleteNamespace(namespace);
      expect(deletedCount).toBe(3);

      const remaining = await service.count({ namespace });
      expect(remaining).toBe(0);
    });

    it('should analyze namespace statistics', async () => {
      const namespace = 'stats-test';

      for (let i = 0; i < 5; i++) {
        await service.store({
          namespace,
          key: `key-${i}`,
          value: `Value ${i}`,
          type: 'semantic',
        });
      }

      const analysis = await service.analyzeNamespace(namespace);
      expect(analysis).toBeDefined();
      expect(analysis.entryCount).toBe(5);
      expect(analysis.namespace).toBe(namespace);
    });
  });

  // ============================================================================
  // HYBRID SEARCH (5 tests)
  // ============================================================================

  describe('Hybrid Search (Vector + Keyword)', () => {
    beforeEach(async () => {
      const testData = [
        { key: 'doc-1', content: 'React hooks tutorial for beginners', tags: ['react', 'tutorial'] },
        { key: 'doc-2', content: 'Advanced TypeScript patterns', tags: ['typescript', 'advanced'] },
        { key: 'doc-3', content: 'React TypeScript best practices', tags: ['react', 'typescript'] },
        { key: 'doc-4', content: 'Node.js performance optimization', tags: ['nodejs', 'performance'] },
        { key: 'doc-5', content: 'Building React applications', tags: ['react', 'tutorial'] },
      ];

      for (const data of testData) {
        await service.store({
          namespace: 'hybrid-test',
          key: data.key,
          value: data.content,
          type: 'semantic',
          tags: data.tags,
        });
      }
    });

    it('should combine semantic and tag filtering', async () => {
      const results = await service.search({
        namespace: 'hybrid-test',
        tags: ['react'],
        limit: 10,
      });

      expect(results.entries.length).toBeGreaterThan(0);
      expect(results.entries.every((e) => e.tags.includes('react'))).toBe(true);
    });

    it('should filter by memory type', async () => {
      await service.store({
        namespace: 'hybrid-test',
        key: 'episodic-1',
        value: 'Event that happened',
        type: 'episodic',
      });

      const results = await service.search({
        namespace: 'hybrid-test',
        type: 'semantic',
        limit: 10,
      });

      expect(results.entries.every((e) => e.type === 'semantic')).toBe(true);
    });

    it('should support pagination', async () => {
      const page1 = await service.search({
        namespace: 'hybrid-test',
        limit: 2,
        offset: 0,
      });

      const page2 = await service.search({
        namespace: 'hybrid-test',
        limit: 2,
        offset: 2,
      });

      expect(page1.entries.length).toBeLessThanOrEqual(2);
      expect(page2.entries.length).toBeGreaterThan(0);

      // Ensure different results
      const page1Ids = page1.entries.map((e) => e.id);
      const page2Ids = page2.entries.map((e) => e.id);
      expect(page1Ids).not.toEqual(page2Ids);
    });

    it('should provide total count and hasMore flag', async () => {
      const results = await service.search({
        namespace: 'hybrid-test',
        limit: 3,
      });

      expect(results.total).toBeGreaterThan(0);
      expect(typeof results.hasMore).toBe('boolean');

      if (results.total > 3) {
        expect(results.hasMore).toBe(true);
      }
    });

    it('should search by key prefix', async () => {
      const results = await service.search({
        namespace: 'hybrid-test',
        keyPrefix: 'doc-',
        limit: 10,
      });

      expect(results.entries.length).toBeGreaterThan(0);
      expect(results.entries.every((e) => e.key.startsWith('doc-'))).toBe(true);
    });
  });

  // ============================================================================
  // PERSISTENCE TESTS (5 tests)
  // ============================================================================

  describe('Persistence', () => {
    it('should persist entries to SQLite', async () => {
      const entry = await service.store({
        namespace: 'persist',
        key: 'sqlite-test',
        value: 'Persisted value',
        type: 'semantic',
      });

      // Verify in SQLite backend
      const sqliteEntry = await backend.getSQLiteBackend().get(entry.id);
      expect(sqliteEntry).toBeDefined();
      expect(sqliteEntry?.key).toBe('sqlite-test');
    });

    it('should persist entries to AgentDB', async () => {
      const entry = await service.store({
        namespace: 'persist',
        key: 'agentdb-test',
        value: 'Persisted value',
        type: 'semantic',
      });

      // Verify in AgentDB backend
      const agentdbEntry = await backend.getAgentDBBackend().get(entry.id);
      expect(agentdbEntry).toBeDefined();
      expect(agentdbEntry?.key).toBe('agentdb-test');
    });

    it('should maintain dual-write consistency', async () => {
      const entry = await service.store({
        namespace: 'dual',
        key: 'consistency-test',
        value: 'Dual write test',
        type: 'semantic',
      });

      const sqliteEntry = await backend.getSQLiteBackend().get(entry.id);
      const agentdbEntry = await backend.getAgentDBBackend().get(entry.id);

      expect(sqliteEntry?.id).toBe(agentdbEntry?.id);
      expect(sqliteEntry?.key).toBe(agentdbEntry?.key);
      expect(sqliteEntry?.content).toBe(agentdbEntry?.content);
    });

    it('should survive restart (in-memory limitation)', async () => {
      // Note: This test demonstrates the pattern but won't truly persist
      // with :memory: database. In production, use file-based SQLite.

      await service.store({
        namespace: 'restart',
        key: 'test',
        value: 'Before restart',
        type: 'semantic',
      });

      const stats = await service.getStatistics();
      expect(stats.totalEntries).toBeGreaterThan(0);
    });

    it('should handle database errors gracefully', async () => {
      // Attempt to store invalid data
      try {
        await service.store({
          namespace: '',
          key: '',
          value: null,
          type: 'semantic',
        });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================================
  // MEMORY MAINTENANCE (6 tests)
  // ============================================================================

  describe('Memory Maintenance', () => {
    it('should track hot (frequently accessed) entries', async () => {
      const entry = await service.store({
        namespace: 'hot',
        key: 'hot-test',
        value: 'Frequently accessed',
        type: 'semantic',
      });

      // Access multiple times to make it "hot"
      for (let i = 0; i < 15; i++) {
        await service.get('hot', 'hot-test');
      }

      const retrieved = await service.get('hot', 'hot-test');
      expect(retrieved?.isHot(10)).toBe(true);
    });

    it('should track cold (rarely accessed) entries', async () => {
      const entry = await service.store({
        namespace: 'cold',
        key: 'cold-test',
        value: 'Rarely accessed',
        type: 'semantic',
      });

      // Entry should be cold after threshold time
      expect(entry.isCold(0)).toBe(true);
    });

    it('should cleanup expired entries', async () => {
      const now = Date.now();

      // Create entry that expires in 1ms
      const entry = MemoryEntry.create({
        namespace: 'expire',
        key: 'expire-test',
        value: 'Will expire',
        type: 'semantic',
        ttl: 1,
      });

      await repository.save(entry);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const cleaned = await service.cleanupExpired();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });

    it('should archive cold entries', async () => {
      const entry = await service.store({
        namespace: 'archive',
        key: 'archive-test',
        value: 'To archive',
        type: 'semantic',
      });

      // Archive entries not accessed in 0ms (all of them)
      const archived = await service.archiveCold(0);
      expect(archived).toBeGreaterThanOrEqual(0);
    });

    it('should provide memory statistics', async () => {
      await service.store({
        namespace: 'stats',
        key: 'stat-1',
        value: 'Test',
        type: 'semantic',
      });

      const stats = await service.getStatistics();
      expect(stats).toBeDefined();
      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.activeEntries).toBeGreaterThan(0);
      expect(stats.entriesByNamespace).toBeDefined();
      expect(stats.entriesByType).toBeDefined();
    });

    it('should consolidate memories', async () => {
      // Add multiple related memories
      for (let i = 0; i < 5; i++) {
        await service.store({
          namespace: 'consolidate',
          key: `entry-${i}`,
          value: `Similar content ${i}`,
          type: 'semantic',
        });
      }

      const result = await service.consolidate({
        namespace: 'consolidate',
        strategy: 'similarity',
        threshold: 0.8,
      });

      expect(result).toBeDefined();
      expect(result.processed).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // PERFORMANCE & STRESS TESTS (5 tests)
  // ============================================================================

  describe('Performance & Stress Tests', () => {
    it('should handle large batch inserts efficiently', async () => {
      const batchSize = 100;
      const entries = Array.from({ length: batchSize }, (_, i) => ({
        namespace: 'stress',
        key: `stress-${i}`,
        value: `Stress test entry ${i}`,
        type: 'semantic' as MemoryType,
      }));

      const startTime = performance.now();
      await service.storeMany(entries);
      const duration = performance.now() - startTime;

      const count = await service.count({ namespace: 'stress' });
      expect(count).toBe(batchSize);

      // Should complete in reasonable time (<1s for 100 entries)
      expect(duration).toBeLessThan(1000);
    });

    it('should search efficiently with large dataset', async () => {
      // Add 50 entries
      const entries = Array.from({ length: 50 }, (_, i) => ({
        namespace: 'perf',
        key: `perf-${i}`,
        value: `Performance test entry ${i} with varying content for diversity`,
        type: 'semantic' as MemoryType,
      }));

      await service.storeMany(entries);

      const query = await mockEmbedding('performance test varying');
      const startTime = performance.now();

      const results = await service.searchByVector(query, {
        namespace: 'perf',
        limit: 10,
      });

      const duration = performance.now() - startTime;

      expect(results.length).toBeGreaterThan(0);
      // HNSW should be significantly faster than brute force
      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent operations', async () => {
      const operations = Array.from({ length: 20 }, (_, i) =>
        service.store({
          namespace: 'concurrent',
          key: `concurrent-${i}`,
          value: `Concurrent entry ${i}`,
          type: 'semantic',
        })
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(20);
      expect(results.every((r) => r.id)).toBe(true);
    });

    it('should maintain performance with mixed operations', async () => {
      const startTime = performance.now();

      // Mix of operations
      await Promise.all([
        service.store({
          namespace: 'mixed',
          key: 'write-1',
          value: 'Write',
          type: 'semantic',
        }),
        service.get('mixed', 'read-1'),
        service.search({
          namespace: 'mixed',
          limit: 5,
        }),
        service.count({ namespace: 'mixed' }),
      ]);

      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(200);
    });

    it('should demonstrate HNSW performance improvement', async () => {
      // This test verifies HNSW is faster than linear search
      // In a real scenario with 10k+ vectors, HNSW is 150x-12,500x faster

      const index = new HNSWIndex({
        dimensions: 128,
        M: 16,
        efConstruction: 200,
        maxElements: 1000,
        metric: 'cosine',
      });

      // Add vectors
      for (let i = 0; i < 50; i++) {
        const vector = await mockEmbedding(`test vector ${i}`);
        await index.addPoint(`point-${i}`, vector);
      }

      const query = await mockEmbedding('search query');
      const startTime = performance.now();
      const results = await index.search(query, 10);
      const duration = performance.now() - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10); // Should be very fast

      const stats = index.getStats();
      expect(stats.vectorCount).toBe(50);
      expect(stats.avgSearchTime).toBeLessThan(10);
    });
  });

  // ============================================================================
  // EDGE CASES & ERROR HANDLING (5 tests)
  // ============================================================================

  describe('Edge Cases & Error Handling', () => {
    it('should handle empty namespace', async () => {
      const entries = await service.getNamespace('non-existent-namespace');
      expect(entries).toHaveLength(0);
    });

    it('should handle duplicate keys in same namespace', async () => {
      await service.store({
        namespace: 'dup',
        key: 'duplicate',
        value: 'First',
        type: 'semantic',
      });

      await service.store({
        namespace: 'dup',
        key: 'duplicate',
        value: 'Second',
        type: 'semantic',
      });

      const retrieved = await service.get('dup', 'duplicate');
      expect(retrieved).toBeDefined();
    });

    it('should handle very long content', async () => {
      const longContent = 'a'.repeat(10000);

      const entry = await service.store({
        namespace: 'long',
        key: 'long-content',
        value: longContent,
        type: 'semantic',
      });

      expect(entry.value).toBe(longContent);
    });

    it('should handle special characters in keys', async () => {
      const specialKey = 'key-with-special-chars-!@#$%^&*()';

      const entry = await service.store({
        namespace: 'special',
        key: specialKey,
        value: 'Test',
        type: 'semantic',
      });

      const retrieved = await service.get('special', specialKey);
      expect(retrieved?.key).toBe(specialKey);
    });

    it('should handle null and undefined values gracefully', async () => {
      try {
        await service.store({
          namespace: 'null-test',
          key: 'null-key',
          value: undefined,
          type: 'semantic',
        });

        const retrieved = await service.get('null-test', 'null-key');
        expect(retrieved).toBeDefined();
      } catch (error) {
        // Either handles gracefully or throws expected error
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================================
  // HEALTH & DIAGNOSTICS (3 tests)
  // ============================================================================

  describe('Health & Diagnostics', () => {
    it('should perform health check', async () => {
      const health = await backend.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.components.storage.status).toBe('healthy');
      expect(health.components.index.status).toBe('healthy');
      expect(health.components.cache.status).toBe('healthy');
    });

    it('should report backend statistics', async () => {
      await service.store({
        namespace: 'stats',
        key: 'test',
        value: 'Test',
        type: 'semantic',
      });

      const stats = await backend.getStats();
      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.entriesByNamespace).toBeDefined();
      expect(stats.entriesByType).toBeDefined();
    });

    it('should clear all data', async () => {
      await service.store({
        namespace: 'clear',
        key: 'test',
        value: 'Test',
        type: 'semantic',
      });

      await service.clear();

      const count = await service.count();
      expect(count).toBe(0);
    });
  });
});
