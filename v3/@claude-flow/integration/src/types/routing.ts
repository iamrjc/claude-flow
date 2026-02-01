/**
 * Routing Types for WP02: Provider Selection Algorithm
 *
 * Defines the 3-tier routing system:
 * - Tier 1: Agent Booster (WASM) - <1ms, $0
 * - Tier 2: Local Models / Haiku - ~500-600ms, FREE/$0.0002
 * - Tier 3: Cloud (Gemini/Claude) - 1-5s, varies
 *
 * @module @claude-flow/integration/types/routing
 */

// ===== Routing Tier Types =====

export type RoutingTier = 1 | 2 | 3;

export type ProviderType =
  | 'agent-booster'   // Tier 1: WASM transforms
  | 'ollama'          // Tier 2A: Local models
  | 'haiku'           // Tier 2B: Claude Haiku
  | 'gemini'          // Tier 3A: Gemini-3-Pro
  | 'sonnet'          // Tier 3B: Claude Sonnet
  | 'opus'            // Tier 3B: Claude Opus
  | 'network';        // Network agent (remote Ollama)

// ===== Task Context Types =====

export interface TaskContext {
  /** The prompt/task description */
  prompt: string;
  /** Estimated context size in tokens */
  contextSize: number;
  /** Whether task requires tool/function calling */
  requiresTools?: boolean;
  /** Whether task is long-running */
  longRunning?: boolean;
  /** Explicit model request (overrides routing) */
  model?: string;
  /** Task type hint */
  taskType?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ===== Routing Preferences =====

export interface RoutingPreferences {
  /** Prioritize local models over cloud */
  preferLocal?: boolean;
  /** Only use local, no cloud (offline mode) */
  offline?: boolean;
  /** Keep data on-device (privacy mode) */
  privacyMode?: boolean;
  /** Minimize cloud spend */
  costOptimize?: boolean;
  /** Maximum acceptable latency in ms */
  maxLatency?: number;
  /** Minimum capability threshold (0-1) */
  minCapability?: number;
}

// ===== Provider Selection Result =====

export interface ProviderSelection {
  /** Selected provider */
  provider: ProviderType;
  /** Recommended model for the provider */
  model: string;
  /** Routing tier used */
  tier: RoutingTier;
  /** Reason for selection */
  reason?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Alternative providers if primary unavailable */
  alternatives?: ProviderType[];
}

// ===== Complexity Analysis Types =====

export interface ComplexityScore {
  /** Overall complexity score (0-1) */
  score: number;
  /** Human-readable reasoning */
  reasoning: string;
  /** Individual factor scores */
  factors: ComplexityFactors;
}

export interface ComplexityFactors {
  /** Prompt length factor (0-1) */
  promptLength: number;
  /** Code/architecture keywords factor (0-1) */
  codeKeywords: number;
  /** Multi-step signals factor (0-1) */
  multiStepSignals: number;
  /** Tool requirements factor (0-1) */
  toolRequirements: number;
  /** Context size factor (0-1) */
  contextSize: number;
}

// ===== Agent Booster Types =====

export type AgentBoosterIntent =
  | 'var-to-const'
  | 'add-types'
  | 'add-error-handling'
  | 'async-await'
  | 'add-logging'
  | 'remove-console'
  | 'format-code'
  | 'simple-rename';

export interface AgentBoosterDetectionResult {
  /** Whether task can be handled by Agent Booster */
  isBooster: boolean;
  /** Detected intent type */
  intent?: AgentBoosterIntent;
  /** Detection confidence (0-1) */
  confidence: number;
  /** Reason for detection */
  reason?: string;
}

// ===== Provider Health Types =====

export interface ProviderHealth {
  /** Provider identifier */
  provider: ProviderType;
  /** Whether provider is available */
  available: boolean;
  /** Current latency in ms */
  latencyMs?: number;
  /** Rate limit status */
  rateLimitStatus?: {
    remaining: number;
    resetAt: Date;
  };
  /** Last health check timestamp */
  lastCheck: Date;
}

// ===== Configuration Types =====

export interface ProviderSelectionConfig {
  /** Enable Tier 1 (Agent Booster) */
  enableTier1: boolean;
  /** Enable Tier 2 (Local/Haiku) */
  enableTier2: boolean;
  /** Enable Tier 3 (Cloud) */
  enableTier3: boolean;
  /** Default provider when routing fails */
  defaultProvider: ProviderType;
  /** Complexity thresholds for tier selection */
  complexityThresholds: {
    /** Max score for Tier 1 (Agent Booster) */
    tier1Max: number;
    /** Max score for Tier 2 (Local) */
    tier2Max: number;
  };
  /** Provider-specific configurations */
  providers?: {
    gemini?: {
      dailyTokenLimit: number;
      tokensUsedToday: number;
    };
    ollama?: {
      host: string;
      preferredModels: string[];
    };
  };
}

// ===== Default Configuration =====

export const DEFAULT_PROVIDER_SELECTION_CONFIG: ProviderSelectionConfig = {
  enableTier1: true,
  enableTier2: true,
  enableTier3: true,
  defaultProvider: 'ollama',
  complexityThresholds: {
    tier1Max: 0.15,  // Very simple tasks
    tier2Max: 0.35,  // Moderate tasks (>0.35 goes to cloud)
  },
  providers: {
    gemini: {
      dailyTokenLimit: 2000000,
      tokensUsedToday: 0,
    },
    ollama: {
      host: 'http://localhost:11434',
      preferredModels: ['qwen2.5:7b', 'llama3.2:3b'],
    },
  },
};
