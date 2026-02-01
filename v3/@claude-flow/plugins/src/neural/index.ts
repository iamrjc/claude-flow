/**
 * Neural Plugin
 *
 * Self-Optimizing Neural Architecture (SONA), ReasoningBank,
 * pattern recognition, and adaptive learning.
 */

// Plugin
export { NeuralPlugin, createNeuralPlugin } from './plugin.js';
export { default } from './plugin.js';

// Core components
export { SONAController, createSONAController } from './sona.js';
export { ReasoningBankWrapper, createReasoningBankWrapper } from './reasoning-bank.js';
export { PatternRecognizer, createPatternRecognizer } from './pattern-recognition.js';
export { AttentionManager, createAttentionManager } from './attention.js';

// Learning algorithms
export {
  QLearningAlgorithm,
  SARSALearningAlgorithm,
  PolicyGradientAlgorithm,
  SimpleExperienceBuffer,
  createLearningAlgorithm,
  createExperienceBuffer,
} from './learning-algorithms.js';

// Types
export type {
  NeuralPluginConfig,
  LearningAlgorithm,
  Experience,
  ExperienceBuffer,
  AttentionWeights,
  AttentionConfig,
  PatternType,
  DetectedPattern,
  PatternSimilarity,
  NeuralPluginState,
  SONAControlParams,
  ReasoningBankParams,
  PatternRecognitionParams,
  LearningParams,
} from './types.js';

// Re-export core neural types
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
} from './types.js';

export { DEFAULT_NEURAL_PLUGIN_CONFIG } from './types.js';
