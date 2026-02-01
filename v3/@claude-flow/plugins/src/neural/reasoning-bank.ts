/**
 * ReasoningBank Wrapper
 *
 * Wraps @claude-flow/neural ReasoningBank with plugin-specific functionality.
 * Implements 4-step learning pipeline: RETRIEVE, JUDGE, DISTILL, CONSOLIDATE.
 */

import { ReasoningBank, createInitializedReasoningBank } from '@claude-flow/neural';
import type { Trajectory, DistilledMemory, Pattern } from './types.js';

/**
 * ReasoningBank wrapper for plugin
 */
export class ReasoningBankWrapper {
  private bank: ReasoningBank | null = null;
  private initialized = false;

  constructor(
    private config: {
      maxTrajectories?: number;
      distillationThreshold?: number;
      retrievalK?: number;
      vectorDimension?: number;
    } = {}
  ) {}

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize ReasoningBank
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.bank = await createInitializedReasoningBank({
      maxTrajectories: this.config.maxTrajectories || 5000,
      distillationThreshold: this.config.distillationThreshold || 0.6,
      retrievalK: this.config.retrievalK || 3,
      vectorDimension: this.config.vectorDimension || 768,
      enableAgentDB: true,
    });

    this.initialized = true;
  }

  /**
   * Shutdown ReasoningBank
   */
  async shutdown(): Promise<void> {
    if (!this.initialized || !this.bank) return;

    await this.bank.shutdown();
    this.bank = null;
    this.initialized = false;
  }

  // ==========================================================================
  // STEP 1: RETRIEVE
  // ==========================================================================

  /**
   * Retrieve relevant memories using MMR
   * Target: <10ms with HNSW
   */
  async retrieve(queryEmbedding: Float32Array, k?: number) {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.retrieve(queryEmbedding, k);
  }

  /**
   * Retrieve by content string
   */
  async retrieveByContent(content: string, k?: number) {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.retrieveByContent(content, k);
  }

  // ==========================================================================
  // STEP 2: JUDGE
  // ==========================================================================

  /**
   * Judge trajectory quality
   * Returns verdict with strengths, weaknesses, improvements
   */
  async judge(trajectory: Trajectory) {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.judge(trajectory);
  }

  // ==========================================================================
  // STEP 3: DISTILL
  // ==========================================================================

  /**
   * Distill trajectory into reusable memory
   * Only distills successful trajectories above threshold
   */
  async distill(trajectory: Trajectory): Promise<DistilledMemory | null> {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.distill(trajectory);
  }

  /**
   * Batch distill multiple trajectories
   */
  async distillBatch(trajectories: Trajectory[]): Promise<DistilledMemory[]> {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.distillBatch(trajectories);
  }

  // ==========================================================================
  // STEP 4: CONSOLIDATE
  // ==========================================================================

  /**
   * Consolidate memories: dedup, detect contradictions, prune
   * Target: <100ms
   */
  async consolidate() {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.consolidate();
  }

  // ==========================================================================
  // Pattern Management
  // ==========================================================================

  /**
   * Convert memory to pattern
   */
  memoryToPattern(memory: DistilledMemory): Pattern {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.memoryToPattern(memory);
  }

  /**
   * Evolve pattern based on new experience
   */
  evolvePattern(patternId: string, newExperience: Trajectory): void {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    this.bank.evolvePattern(patternId, newExperience);
  }

  /**
   * Get all patterns
   */
  getPatterns(): Pattern[] {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.getPatterns();
  }

  /**
   * Find patterns by embedding
   */
  async findPatterns(queryEmbedding: Float32Array, k?: number): Promise<Pattern[]> {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.findPatterns(queryEmbedding, k);
  }

  // ==========================================================================
  // Trajectory Management
  // ==========================================================================

  /**
   * Store trajectory
   */
  storeTrajectory(trajectory: Trajectory): void {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    this.bank.storeTrajectory(trajectory);
  }

  /**
   * Get trajectory by ID
   */
  getTrajectory(trajectoryId: string): Trajectory | undefined {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.getTrajectory(trajectoryId);
  }

  /**
   * Get all trajectories
   */
  getTrajectories(): Trajectory[] {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.getTrajectories();
  }

  /**
   * Get successful trajectories
   */
  getSuccessfulTrajectories(): Trajectory[] {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.getSuccessfulTrajectories();
  }

  /**
   * Get failed trajectories
   */
  getFailedTrajectories(): Trajectory[] {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.getFailedTrajectories();
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get ReasoningBank statistics
   */
  getStats(): Record<string, number> {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.getStats();
  }

  /**
   * Get detailed metrics
   */
  getDetailedMetrics() {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    return this.bank.getDetailedMetrics();
  }

  /**
   * Check if AgentDB is available
   */
  isAgentDBAvailable(): boolean {
    if (!this.bank) return false;
    return this.bank.isAgentDBAvailable();
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  /**
   * Add event listener
   */
  addEventListener(listener: (event: any) => void): void {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    this.bank.addEventListener(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: any) => void): void {
    if (!this.bank) throw new Error('ReasoningBank not initialized');
    this.bank.removeEventListener(listener);
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Check ReasoningBank health
   */
  healthCheck(): { healthy: boolean; issues: string[]; stats: Record<string, number> } {
    if (!this.bank) {
      return {
        healthy: false,
        issues: ['ReasoningBank not initialized'],
        stats: {},
      };
    }

    const stats = this.getStats();
    const issues: string[] = [];

    // Check performance targets
    if (stats.avgRetrievalTimeMs > 10) {
      issues.push(`Retrieval time exceeds target: ${stats.avgRetrievalTimeMs.toFixed(2)}ms > 10ms`);
    }

    if (stats.avgConsolidationTimeMs > 100) {
      issues.push(`Consolidation time exceeds target: ${stats.avgConsolidationTimeMs.toFixed(2)}ms > 100ms`);
    }

    // Check capacity
    if (stats.trajectoryCount > (this.config.maxTrajectories || 5000) * 0.9) {
      issues.push(`Trajectory capacity high: ${stats.trajectoryCount}`);
    }

    // Check AgentDB
    if (!this.isAgentDBAvailable()) {
      issues.push('AgentDB not available - using fallback');
    }

    return {
      healthy: issues.length === 0,
      issues,
      stats,
    };
  }
}

/**
 * Factory function
 */
export function createReasoningBankWrapper(config?: {
  maxTrajectories?: number;
  distillationThreshold?: number;
  retrievalK?: number;
  vectorDimension?: number;
}): ReasoningBankWrapper {
  return new ReasoningBankWrapper(config);
}
