/**
 * SONA Controller
 *
 * Self-Optimizing Neural Architecture for adaptive learning.
 * Provides mode switching, configuration management, and performance tracking.
 */

import { SONAManager, getModeConfig, getModeOptimizations } from '@claude-flow/neural';
import type {
  SONAMode,
  SONAModeConfig,
  ModeOptimizations,
  NeuralStats,
  NeuralEvent,
  NeuralEventListener,
} from './types.js';

/**
 * SONA Controller
 *
 * Wraps SONAManager with additional plugin-specific functionality
 */
export class SONAController {
  private manager: SONAManager;
  private initialized = false;
  private startTime = 0;

  constructor(initialMode: SONAMode = 'balanced') {
    this.manager = new SONAManager(initialMode);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize SONA controller
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.manager.initialize();
    this.startTime = Date.now();
    this.initialized = true;
  }

  /**
   * Shutdown SONA controller
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    await this.manager.cleanup();
    this.initialized = false;
  }

  // ==========================================================================
  // Mode Management
  // ==========================================================================

  /**
   * Set SONA mode
   *
   * @param mode - Mode to switch to
   */
  async setMode(mode: SONAMode): Promise<void> {
    await this.manager.setMode(mode);
  }

  /**
   * Get current mode and configuration
   */
  getConfig(): { mode: SONAMode; config: SONAModeConfig; optimizations: ModeOptimizations } {
    return this.manager.getConfig();
  }

  /**
   * Get mode-specific configuration
   */
  static getModeConfig(mode: SONAMode): SONAModeConfig {
    return getModeConfig(mode);
  }

  /**
   * Get mode-specific optimizations
   */
  static getModeOptimizations(mode: SONAMode): ModeOptimizations {
    return getModeOptimizations(mode);
  }

  // ==========================================================================
  // Trajectory Management
  // ==========================================================================

  /**
   * Begin a new trajectory
   */
  beginTrajectory(context: string, domain?: 'code' | 'creative' | 'reasoning' | 'chat' | 'math' | 'general'): string {
    return this.manager.beginTrajectory(context, domain);
  }

  /**
   * Record a step in trajectory
   */
  recordStep(
    trajectoryId: string,
    action: string,
    reward: number,
    stateEmbedding: Float32Array,
    metadata?: Record<string, unknown>
  ): void {
    this.manager.recordStep(trajectoryId, action, reward, stateEmbedding, metadata);
  }

  /**
   * Complete a trajectory
   */
  completeTrajectory(trajectoryId: string, finalQuality?: number) {
    return this.manager.completeTrajectory(trajectoryId, finalQuality);
  }

  /**
   * Get trajectory by ID
   */
  getTrajectory(trajectoryId: string) {
    return this.manager.getTrajectory(trajectoryId);
  }

  // ==========================================================================
  // Pattern Matching
  // ==========================================================================

  /**
   * Find similar patterns
   */
  async findSimilarPatterns(embedding: Float32Array, k: number = 3) {
    return this.manager.findSimilarPatterns(embedding, k);
  }

  /**
   * Store a new pattern
   */
  storePattern(pattern: {
    name: string;
    domain: string;
    embedding: Float32Array;
    strategy: string;
    successRate: number;
    usageCount: number;
    qualityHistory: number[];
    evolutionHistory: any[];
  }) {
    return this.manager.storePattern(pattern);
  }

  /**
   * Update pattern usage
   */
  updatePatternUsage(patternId: string, quality: number): void {
    this.manager.updatePatternUsage(patternId, quality);
  }

  // ==========================================================================
  // Learning
  // ==========================================================================

  /**
   * Trigger a learning cycle
   */
  async triggerLearning(reason: string = 'manual'): Promise<void> {
    await this.manager.triggerLearning(reason);
  }

  /**
   * Apply learned adaptations to input
   * Target: <0.05ms for real-time mode
   */
  async applyAdaptations(input: Float32Array, domain?: string): Promise<Float32Array> {
    return this.manager.applyAdaptations(input, domain);
  }

  // ==========================================================================
  // LoRA Management
  // ==========================================================================

  /**
   * Get LoRA configuration for current mode
   */
  getLoRAConfig() {
    return this.manager.getLoRAConfig();
  }

  /**
   * Initialize LoRA weights for a domain
   */
  initializeLoRAWeights(domain: string = 'default') {
    return this.manager.initializeLoRAWeights(domain);
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get neural system statistics
   */
  getStats(): NeuralStats {
    return this.manager.getStats();
  }

  /**
   * Get uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  /**
   * Add event listener
   */
  addEventListener(listener: NeuralEventListener): void {
    this.manager.addEventListener(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: NeuralEventListener): void {
    this.manager.removeEventListener(listener);
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Check SONA health
   */
  healthCheck(): { healthy: boolean; issues: string[]; stats: NeuralStats } {
    const stats = this.getStats();
    const issues: string[] = [];

    // Check performance targets
    if (stats.performance.avgLatencyMs > 0.05 && stats.config.mode === 'real-time') {
      issues.push(`Real-time adaptation exceeds target: ${stats.performance.avgLatencyMs.toFixed(3)}ms > 0.05ms`);
    }

    // Check memory utilization
    if (stats.memory.usedMb > stats.memory.budgetMb) {
      issues.push(`Memory usage exceeds budget: ${stats.memory.usedMb.toFixed(2)}MB > ${stats.memory.budgetMb}MB`);
    }

    // Check trajectory capacity
    if (stats.trajectories.utilization > 0.9) {
      issues.push(`Trajectory capacity high: ${(stats.trajectories.utilization * 100).toFixed(1)}%`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      stats,
    };
  }
}

/**
 * Factory function for creating SONA controller
 */
export function createSONAController(initialMode?: SONAMode): SONAController {
  return new SONAController(initialMode);
}
