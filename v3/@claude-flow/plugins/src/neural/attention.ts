/**
 * Attention Manager
 *
 * Implements attention mechanisms for context prioritization,
 * relevance scoring, and focus management.
 */

import type { AttentionWeights, AttentionConfig } from './types.js';

/**
 * Context item with attention metadata
 */
interface ContextItem {
  id: string;
  embedding: Float32Array;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
  importance: number;
}

/**
 * Attention Manager
 *
 * Manages attention weights for context items
 */
export class AttentionManager {
  private config: AttentionConfig;
  private items: Map<string, ContextItem> = new Map();
  private currentFocus: Set<string> = new Set();

  constructor(config: Partial<AttentionConfig> = {}) {
    this.config = {
      maxItems: config.maxItems || 100,
      minWeight: config.minWeight || 0.01,
      decayRate: config.decayRate || 0.95,
      temperature: config.temperature || 1.0,
    };
  }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  /**
   * Add context item
   */
  addContext(id: string, embedding: Float32Array, importance: number = 0.5): void {
    const item: ContextItem = {
      id,
      embedding,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now(),
      importance,
    };

    this.items.set(id, item);

    // Prune if over capacity
    if (this.items.size > this.config.maxItems) {
      this.pruneItems();
    }
  }

  /**
   * Remove context item
   */
  removeContext(id: string): void {
    this.items.delete(id);
    this.currentFocus.delete(id);
  }

  /**
   * Clear all context
   */
  clearContext(): void {
    this.items.clear();
    this.currentFocus.clear();
  }

  // ==========================================================================
  // Attention Computation
  // ==========================================================================

  /**
   * Compute attention weights for query
   */
  computeAttention(queryEmbedding: Float32Array, k?: number): AttentionWeights {
    const startTime = performance.now();

    if (this.items.size === 0) {
      return {
        items: [],
        total: 0,
        computeTimeMs: performance.now() - startTime,
      };
    }

    // Compute relevance scores
    const scores: Array<{ id: string; relevance: number }> = [];

    for (const [id, item] of this.items) {
      const relevance = this.computeRelevance(queryEmbedding, item);
      scores.push({ id, relevance });
    }

    // Sort by relevance
    scores.sort((a, b) => b.relevance - a.relevance);

    // Take top k
    const topK = k ? scores.slice(0, k) : scores;

    // Softmax to get weights
    const weights = this.softmax(topK.map(s => s.relevance));

    // Build result
    const items = topK
      .map((s, i) => ({
        id: s.id,
        weight: weights[i],
        relevance: s.relevance,
      }))
      .filter(item => item.weight >= this.config.minWeight);

    const total = items.reduce((sum, item) => sum + item.weight, 0);

    return {
      items,
      total,
      computeTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Compute context-aware attention
   * Uses recency, frequency, and importance in addition to similarity
   */
  computeContextAwareAttention(
    queryEmbedding: Float32Array,
    k?: number
  ): AttentionWeights {
    const startTime = performance.now();

    if (this.items.size === 0) {
      return {
        items: [],
        total: 0,
        computeTimeMs: performance.now() - startTime,
      };
    }

    const now = Date.now();
    const scores: Array<{ id: string; score: number; relevance: number }> = [];

    for (const [id, item] of this.items) {
      // Similarity score
      const similarity = this.cosineSimilarity(queryEmbedding, item.embedding);

      // Recency score (decay over time)
      const ageSec = (now - item.lastAccess) / 1000;
      const recency = Math.exp(-ageSec / 3600); // 1 hour half-life

      // Frequency score (normalized access count)
      const frequency = Math.min(item.accessCount / 10, 1);

      // Combine scores
      const score =
        similarity * 0.5 +
        recency * 0.2 +
        frequency * 0.15 +
        item.importance * 0.15;

      scores.push({ id, score, relevance: similarity });
    }

    // Sort by combined score
    scores.sort((a, b) => b.score - a.score);

    // Take top k
    const topK = k ? scores.slice(0, k) : scores;

    // Softmax to get weights
    const weights = this.softmax(topK.map(s => s.score));

    // Build result
    const items = topK
      .map((s, i) => ({
        id: s.id,
        weight: weights[i],
        relevance: s.relevance,
      }))
      .filter(item => item.weight >= this.config.minWeight);

    const total = items.reduce((sum, item) => sum + item.weight, 0);

    return {
      items,
      total,
      computeTimeMs: performance.now() - startTime,
    };
  }

  // ==========================================================================
  // Focus Management
  // ==========================================================================

  /**
   * Set focus on specific items
   */
  setFocus(itemIds: string[]): void {
    this.currentFocus.clear();

    for (const id of itemIds) {
      if (this.items.has(id)) {
        this.currentFocus.add(id);

        // Update access metadata
        const item = this.items.get(id)!;
        item.accessCount++;
        item.lastAccess = Date.now();
      }
    }
  }

  /**
   * Get current focus
   */
  getFocus(): string[] {
    return Array.from(this.currentFocus);
  }

  /**
   * Clear focus
   */
  clearFocus(): void {
    this.currentFocus.clear();
  }

  // ==========================================================================
  // Attention-Based Retrieval
  // ==========================================================================

  /**
   * Retrieve items using attention weights
   */
  retrieve(queryEmbedding: Float32Array, k: number = 5): Array<{
    id: string;
    embedding: Float32Array;
    weight: number;
  }> {
    const attention = this.computeContextAwareAttention(queryEmbedding, k);

    return attention.items.map(item => ({
      id: item.id,
      embedding: this.items.get(item.id)!.embedding,
      weight: item.weight,
    }));
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get attention statistics
   */
  getStats(): Record<string, number> {
    const items = Array.from(this.items.values());

    return {
      totalItems: this.items.size,
      focusedItems: this.currentFocus.size,
      avgAccessCount: items.length > 0
        ? items.reduce((s, i) => s + i.accessCount, 0) / items.length
        : 0,
      avgImportance: items.length > 0
        ? items.reduce((s, i) => s + i.importance, 0) / items.length
        : 0,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private computeRelevance(query: Float32Array, item: ContextItem): number {
    return this.cosineSimilarity(query, item.embedding);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;

    let dot = 0,
      normA = 0,
      normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
  }

  private softmax(scores: number[]): number[] {
    if (scores.length === 0) return [];

    const temp = this.config.temperature;
    let maxScore = -Infinity;

    for (const score of scores) {
      if (score > maxScore) maxScore = score;
    }

    const expScores = scores.map(s => Math.exp((s - maxScore) / temp));
    const sum = expScores.reduce((a, b) => a + b, 0);

    return expScores.map(e => e / sum);
  }

  private pruneItems(): void {
    const items = Array.from(this.items.entries());

    // Score items by age and access
    const now = Date.now();
    const scored = items.map(([id, item]) => {
      const ageSec = (now - item.lastAccess) / 1000;
      const score = item.accessCount * Math.exp(-ageSec / 3600) + item.importance;
      return { id, score };
    });

    // Sort by score (ascending - lower scores removed first)
    scored.sort((a, b) => a.score - b.score);

    // Remove lowest scoring items
    const toRemove = scored.length - Math.floor(this.config.maxItems * 0.8);

    for (let i = 0; i < toRemove; i++) {
      this.items.delete(scored[i].id);
      this.currentFocus.delete(scored[i].id);
    }
  }

  /**
   * Decay item weights over time
   */
  decayWeights(): void {
    for (const item of this.items.values()) {
      item.importance *= this.config.decayRate;
    }
  }
}

/**
 * Factory function
 */
export function createAttentionManager(config?: Partial<AttentionConfig>): AttentionManager {
  return new AttentionManager(config);
}
