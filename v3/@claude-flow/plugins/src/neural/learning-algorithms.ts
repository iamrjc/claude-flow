/**
 * Learning Algorithms
 *
 * Implements Q-Learning, SARSA, and simple policy gradient algorithms
 * with experience buffer management.
 */

import { QLearning, SARSAAlgorithm } from '@claude-flow/neural';
import type {
  Trajectory,
  LearningAlgorithm,
  Experience,
  ExperienceBuffer,
  RLAlgorithm,
} from './types.js';

// ============================================================================
// Experience Buffer Implementation
// ============================================================================

/**
 * Simple experience replay buffer
 */
export class SimpleExperienceBuffer implements ExperienceBuffer {
  private buffer: Experience[] = [];
  private capacity: number;

  constructor(capacity: number = 10000) {
    this.capacity = capacity;
  }

  /**
   * Add experience to buffer
   */
  add(exp: Experience): void {
    this.buffer.push(exp);

    // Remove oldest if over capacity
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  /**
   * Sample batch from buffer
   */
  sample(batchSize: number): Experience[] {
    if (this.buffer.length === 0) return [];

    const batch: Experience[] = [];
    const n = Math.min(batchSize, this.buffer.length);

    // Random sampling without replacement
    const indices = new Set<number>();
    while (indices.size < n) {
      indices.add(Math.floor(Math.random() * this.buffer.length));
    }

    for (const idx of indices) {
      batch.push(this.buffer[idx]);
    }

    return batch;
  }

  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer = [];
  }
}

// ============================================================================
// Q-Learning Wrapper
// ============================================================================

/**
 * Q-Learning algorithm wrapper
 */
export class QLearningAlgorithm implements LearningAlgorithm {
  readonly name: RLAlgorithm = 'q-learning';
  private algorithm: QLearning;

  constructor(config?: {
    learningRate?: number;
    gamma?: number;
    explorationInitial?: number;
    explorationFinal?: number;
    explorationDecay?: number;
  }) {
    this.algorithm = new QLearning({
      algorithm: 'q-learning',
      learningRate: config?.learningRate || 0.1,
      gamma: config?.gamma || 0.99,
      entropyCoef: 0,
      valueLossCoef: 1,
      maxGradNorm: 1,
      epochs: 1,
      miniBatchSize: 1,
      explorationInitial: config?.explorationInitial || 1.0,
      explorationFinal: config?.explorationFinal || 0.01,
      explorationDecay: config?.explorationDecay || 10000,
      maxStates: 10000,
      useEligibilityTraces: false,
      traceDecay: 0.9,
    });
  }

  /**
   * Update from trajectory
   */
  async update(trajectory: Trajectory): Promise<{ tdError: number }> {
    return this.algorithm.update(trajectory);
  }

  /**
   * Get action for state
   */
  getAction(state: Float32Array, explore: boolean = true): number {
    return this.algorithm.getAction(state, explore);
  }

  /**
   * Get statistics
   */
  getStats(): Record<string, number> {
    return this.algorithm.getStats();
  }

  /**
   * Reset algorithm state
   */
  reset(): void {
    this.algorithm.reset();
  }

  /**
   * Get Q-values for state
   */
  getQValues(state: Float32Array): Float32Array {
    return this.algorithm.getQValues(state);
  }
}

// ============================================================================
// SARSA Wrapper
// ============================================================================

/**
 * SARSA algorithm wrapper
 */
export class SARSALearningAlgorithm implements LearningAlgorithm {
  readonly name: RLAlgorithm = 'sarsa';
  private algorithm: SARSAAlgorithm;

  constructor(config?: {
    learningRate?: number;
    gamma?: number;
    explorationInitial?: number;
    explorationFinal?: number;
    explorationDecay?: number;
    useExpectedSARSA?: boolean;
  }) {
    this.algorithm = new SARSAAlgorithm({
      algorithm: 'sarsa',
      learningRate: config?.learningRate || 0.1,
      gamma: config?.gamma || 0.99,
      entropyCoef: 0,
      valueLossCoef: 1,
      maxGradNorm: 1,
      epochs: 1,
      miniBatchSize: 1,
      explorationInitial: config?.explorationInitial || 1.0,
      explorationFinal: config?.explorationFinal || 0.01,
      explorationDecay: config?.explorationDecay || 10000,
      maxStates: 10000,
      useExpectedSARSA: config?.useExpectedSARSA || false,
      useEligibilityTraces: false,
      traceDecay: 0.9,
    });
  }

  /**
   * Update from trajectory
   */
  async update(trajectory: Trajectory): Promise<{ tdError: number }> {
    return this.algorithm.update(trajectory);
  }

  /**
   * Get action for state
   */
  getAction(state: Float32Array, explore: boolean = true): number {
    return this.algorithm.getAction(state, explore);
  }

  /**
   * Get statistics
   */
  getStats(): Record<string, number> {
    return this.algorithm.getStats();
  }

  /**
   * Reset algorithm state
   */
  reset(): void {
    this.algorithm.reset();
  }

  /**
   * Get Q-values for state
   */
  getQValues(state: Float32Array): Float32Array {
    return this.algorithm.getQValues(state);
  }

  /**
   * Get action probabilities
   */
  getActionProbabilities(state: Float32Array): Float32Array {
    return this.algorithm.getActionProbabilities(state);
  }
}

// ============================================================================
// Simple Policy Gradient
// ============================================================================

/**
 * Simple policy gradient algorithm
 */
export class PolicyGradientAlgorithm implements LearningAlgorithm {
  readonly name: RLAlgorithm = 'ppo'; // Use PPO as category
  private learningRate: number;
  private gamma: number;

  // Policy network parameters (simplified)
  private policyWeights: Map<string, Float32Array> = new Map();
  private updateCount = 0;
  private avgReturn = 0;

  constructor(config?: {
    learningRate?: number;
    gamma?: number;
  }) {
    this.learningRate = config?.learningRate || 0.001;
    this.gamma = config?.gamma || 0.99;
  }

  /**
   * Update from trajectory
   */
  async update(trajectory: Trajectory): Promise<{ tdError: number }> {
    if (trajectory.steps.length === 0) {
      return { tdError: 0 };
    }

    // Compute returns
    const returns = this.computeReturns(trajectory);

    // Compute policy gradient (simplified)
    let totalLoss = 0;

    for (let i = 0; i < trajectory.steps.length; i++) {
      const step = trajectory.steps[i];
      const stateKey = this.hashState(step.stateBefore);
      const actionIdx = this.hashAction(step.action);
      const ret = returns[i];

      // Get or initialize policy weights
      let weights = this.policyWeights.get(stateKey);
      if (!weights) {
        weights = new Float32Array(4); // 4 actions
        for (let a = 0; a < 4; a++) {
          weights[a] = (Math.random() - 0.5) * 0.1;
        }
        this.policyWeights.set(stateKey, weights);
      }

      // Simple gradient update
      const advantage = ret - this.avgReturn;
      weights[actionIdx] += this.learningRate * advantage;

      totalLoss += Math.abs(advantage);
    }

    // Update average return
    this.avgReturn = returns[0];
    this.updateCount++;

    return { tdError: totalLoss / trajectory.steps.length };
  }

  /**
   * Get action for state
   */
  getAction(state: Float32Array, explore: boolean = true): number {
    const stateKey = this.hashState(state);
    const weights = this.policyWeights.get(stateKey);

    if (!weights) {
      return Math.floor(Math.random() * 4);
    }

    // Softmax policy
    const probs = this.softmax(weights);

    if (explore) {
      // Sample from distribution
      return this.sampleFromDistribution(probs);
    } else {
      // Greedy
      return this.argmax(probs);
    }
  }

  /**
   * Get statistics
   */
  getStats(): Record<string, number> {
    return {
      updateCount: this.updateCount,
      policySize: this.policyWeights.size,
      avgReturn: this.avgReturn,
    };
  }

  /**
   * Reset algorithm state
   */
  reset(): void {
    this.policyWeights.clear();
    this.updateCount = 0;
    this.avgReturn = 0;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private computeReturns(trajectory: Trajectory): number[] {
    const returns: number[] = new Array(trajectory.steps.length);
    let runningReturn = 0;

    for (let i = trajectory.steps.length - 1; i >= 0; i--) {
      runningReturn = trajectory.steps[i].reward + this.gamma * runningReturn;
      returns[i] = runningReturn;
    }

    return returns;
  }

  private hashState(state: Float32Array): string {
    const bins = 10;
    const parts: number[] = [];

    for (let i = 0; i < Math.min(8, state.length); i++) {
      const normalized = (state[i] + 1) / 2;
      const bin = Math.floor(Math.max(0, Math.min(bins - 1, normalized * bins)));
      parts.push(bin);
    }

    return parts.join(',');
  }

  private hashAction(action: string): number {
    let hash = 0;
    for (let i = 0; i < action.length; i++) {
      hash = (hash * 31 + action.charCodeAt(i)) % 4;
    }
    return hash;
  }

  private softmax(logits: Float32Array): Float32Array {
    const probs = new Float32Array(logits.length);
    let maxLogit = -Infinity;

    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxLogit) maxLogit = logits[i];
    }

    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      probs[i] = Math.exp(logits[i] - maxLogit);
      sum += probs[i];
    }

    for (let i = 0; i < logits.length; i++) {
      probs[i] /= sum;
    }

    return probs;
  }

  private sampleFromDistribution(probs: Float32Array): number {
    const r = Math.random();
    let cumulative = 0;

    for (let i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (r < cumulative) return i;
    }

    return probs.length - 1;
  }

  private argmax(values: Float32Array): number {
    let maxIdx = 0;
    let maxVal = values[0];

    for (let i = 1; i < values.length; i++) {
      if (values[i] > maxVal) {
        maxVal = values[i];
        maxIdx = i;
      }
    }

    return maxIdx;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create learning algorithm by name
 */
export function createLearningAlgorithm(
  algorithm: RLAlgorithm,
  config?: any
): LearningAlgorithm {
  switch (algorithm) {
    case 'q-learning':
      return new QLearningAlgorithm(config);
    case 'sarsa':
      return new SARSALearningAlgorithm(config);
    case 'ppo':
    case 'a2c':
    case 'dqn':
    case 'decision-transformer':
    case 'curiosity':
      return new PolicyGradientAlgorithm(config);
    default:
      return new QLearningAlgorithm(config);
  }
}

/**
 * Create experience buffer
 */
export function createExperienceBuffer(capacity?: number): ExperienceBuffer {
  return new SimpleExperienceBuffer(capacity);
}
