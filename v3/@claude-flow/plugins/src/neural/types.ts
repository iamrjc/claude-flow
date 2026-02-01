/**
 * Neural Plugin Types
 *
 * Type definitions for SONA, ReasoningBank, pattern recognition,
 * and learning algorithms.
 */

import type {
  SONAMode,
  SONAModeConfig,
  ModeOptimizations,
  Trajectory,
  TrajectoryStep,
  TrajectoryVerdict,
  DistilledMemory,
  Pattern,
  PatternMatch,
  PatternEvolution,
  RLAlgorithm,
  RLConfig,
  LoRAConfig,
  LoRAWeights,
  EWCConfig,
  EWCState,
  NeuralStats,
  NeuralEvent,
  NeuralEventListener,
} from '@claude-flow/neural';

// Re-export core types
export type {
  SONAMode,
  SONAModeConfig,
  ModeOptimizations,
  Trajectory,
  TrajectoryStep,
  TrajectoryVerdict,
  DistilledMemory,
  Pattern,
  PatternMatch,
  PatternEvolution,
  RLAlgorithm,
  RLConfig,
  LoRAConfig,
  LoRAWeights,
  EWCConfig,
  EWCState,
  NeuralStats,
  NeuralEvent,
  NeuralEventListener,
};

// ============================================================================
// Plugin Configuration
// ============================================================================

/**
 * Neural plugin configuration
 */
export interface NeuralPluginConfig {
  /** SONA mode to start in */
  defaultMode: SONAMode;

  /** Enable ReasoningBank */
  enableReasoningBank: boolean;

  /** Enable pattern recognition */
  enablePatternRecognition: boolean;

  /** Enable learning algorithms */
  enableLearning: boolean;

  /** Enable attention mechanisms */
  enableAttention: boolean;

  /** RL algorithm to use */
  algorithm: RLAlgorithm;

  /** Vector dimension for embeddings */
  vectorDimension: number;

  /** Maximum trajectories to store */
  maxTrajectories: number;

  /** Maximum patterns to store */
  maxPatterns: number;

  /** Enable MCP tools */
  enableMCPTools: boolean;

  /** Enable lifecycle hooks */
  enableHooks: boolean;
}

/**
 * Default plugin configuration
 */
export const DEFAULT_NEURAL_PLUGIN_CONFIG: NeuralPluginConfig = {
  defaultMode: 'balanced',
  enableReasoningBank: true,
  enablePatternRecognition: true,
  enableLearning: true,
  enableAttention: true,
  algorithm: 'q-learning',
  vectorDimension: 768,
  maxTrajectories: 5000,
  maxPatterns: 1000,
  enableMCPTools: true,
  enableHooks: true,
};

// ============================================================================
// Learning Algorithm Types
// ============================================================================

/**
 * Learning algorithm interface
 */
export interface LearningAlgorithm {
  /** Algorithm name */
  readonly name: RLAlgorithm;

  /** Update from trajectory */
  update(trajectory: Trajectory): Promise<{ tdError: number }>;

  /** Get action for state */
  getAction(state: Float32Array, explore?: boolean): number;

  /** Get statistics */
  getStats(): Record<string, number>;

  /** Reset algorithm state */
  reset(): void;
}

/**
 * Experience buffer entry
 */
export interface Experience {
  state: Float32Array;
  action: number;
  reward: number;
  nextState: Float32Array;
  done: boolean;
  timestamp: number;
}

/**
 * Experience buffer for replay
 */
export interface ExperienceBuffer {
  /** Add experience to buffer */
  add(exp: Experience): void;

  /** Sample batch from buffer */
  sample(batchSize: number): Experience[];

  /** Get buffer size */
  size(): number;

  /** Clear buffer */
  clear(): void;
}

// ============================================================================
// Attention Types
// ============================================================================

/**
 * Attention weights for context
 */
export interface AttentionWeights {
  /** Context items with weights */
  items: Array<{
    id: string;
    weight: number;
    relevance: number;
  }>;

  /** Total attention mass */
  total: number;

  /** Computation time in ms */
  computeTimeMs: number;
}

/**
 * Attention manager configuration
 */
export interface AttentionConfig {
  /** Maximum context items to track */
  maxItems: number;

  /** Minimum weight threshold */
  minWeight: number;

  /** Decay rate for old items */
  decayRate: number;

  /** Temperature for softmax */
  temperature: number;
}

// ============================================================================
// Pattern Recognition Types
// ============================================================================

/**
 * Pattern type classification
 */
export type PatternType = 'code' | 'workflow' | 'error' | 'success' | 'optimization';

/**
 * Detected pattern with metadata
 */
export interface DetectedPattern {
  /** Pattern ID */
  id: string;

  /** Pattern type */
  type: PatternType;

  /** Pattern name */
  name: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Context where pattern was found */
  context: string;

  /** Pattern embedding */
  embedding: Float32Array;

  /** Detection timestamp */
  timestamp: number;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Pattern similarity result
 */
export interface PatternSimilarity {
  /** Pattern 1 */
  pattern1: DetectedPattern;

  /** Pattern 2 */
  pattern2: DetectedPattern;

  /** Similarity score (0-1) */
  similarity: number;

  /** Comparison method */
  method: 'cosine' | 'jaccard' | 'edit-distance';
}

// ============================================================================
// Neural Plugin State
// ============================================================================

/**
 * Plugin state snapshot
 */
export interface NeuralPluginState {
  /** Current SONA mode */
  mode: SONAMode;

  /** Active trajectories */
  activeTrajectories: number;

  /** Total patterns learned */
  totalPatterns: number;

  /** Total memories distilled */
  totalMemories: number;

  /** Learning cycles completed */
  learningCycles: number;

  /** Average adaptation time (ms) */
  avgAdaptationTime: number;

  /** Current learning algorithm */
  algorithm: RLAlgorithm;

  /** Plugin uptime (ms) */
  uptime: number;
}

// ============================================================================
// MCP Tool Types
// ============================================================================

/**
 * SONA control tool parameters
 */
export interface SONAControlParams {
  action: 'setMode' | 'getMode' | 'getStats' | 'adapt';
  mode?: SONAMode;
  input?: number[];
  domain?: string;
}

/**
 * ReasoningBank tool parameters
 */
export interface ReasoningBankParams {
  action: 'store' | 'retrieve' | 'judge' | 'distill' | 'consolidate';
  trajectoryId?: string;
  query?: string;
  k?: number;
}

/**
 * Pattern recognition tool parameters
 */
export interface PatternRecognitionParams {
  action: 'detect' | 'match' | 'similarity';
  context?: string;
  patternType?: PatternType;
  pattern1?: string;
  pattern2?: string;
}

/**
 * Learning tool parameters
 */
export interface LearningParams {
  action: 'train' | 'predict' | 'stats' | 'reset';
  trajectoryId?: string;
  state?: number[];
  explore?: boolean;
}
