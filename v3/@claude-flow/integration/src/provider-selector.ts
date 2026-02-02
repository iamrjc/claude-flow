/**
 * Provider Selector for WP02
 *
 * Main entry point for the 3-tier provider selection algorithm:
 *
 * Tier 1: Agent Booster (WASM)
 *   - <1ms execution, $0 cost
 *   - Simple transforms: var→const, add-types, format-code
 *
 * Tier 2: Local Models / Haiku
 *   - 2A: Ollama (qwen2.5, llama3.2) - ~600ms, FREE
 *   - 2B: Claude Haiku - ~500ms, $0.0002
 *   - Low-medium complexity tasks
 *
 * Tier 3: Cloud (Gemini / Claude)
 *   - 3A: Gemini-3-Pro - 1-3s, FREE (2M/day)
 *   - 3B: Sonnet/Opus - 2-5s, $0.003-0.015
 *   - High complexity, architecture, security
 *
 * @module @claude-flow/integration/provider-selector
 */

import {
  TaskContext,
  RoutingPreferences,
  ProviderSelection,
  ProviderType,
  ProviderHealth,
  ProviderSelectionConfig,
  DEFAULT_PROVIDER_SELECTION_CONFIG,
} from './types/routing.js';

import {
  AgentBoosterDetector,
  detectAgentBoosterIntent,
} from './agent-booster-detector.js';

import {
  ComplexityAnalyzer,
  analyzeComplexity,
} from './complexity-analyzer.js';

import {
  CloudRouter,
  selectCloudProvider,
} from './cloud-router.js';

// Model recommendations by provider
const PROVIDER_MODELS: Record<ProviderType, string> = {
  'agent-booster': 'wasm-transform',
  'ollama': 'qwen2.5:7b',
  'haiku': 'claude-haiku-4-5-20251101',
  'gemini': 'gemini-3-pro-preview',
  'sonnet': 'claude-sonnet-4-5-20251101',
  'opus': 'claude-opus-4-5-20251101',
  'o1': 'o1',
  'network': 'qwen2.5:7b',
};

/**
 * Select the optimal provider for a task
 */
export async function selectProvider(
  task: TaskContext,
  preferences: RoutingPreferences = {}
): Promise<ProviderSelection> {
  const config = DEFAULT_PROVIDER_SELECTION_CONFIG;

  // Handle explicit model request
  if (task.model) {
    return {
      provider: inferProviderFromModel(task.model),
      model: task.model,
      tier: 3,
      reason: 'Explicit model requested',
      confidence: 1.0,
    };
  }

  // Handle offline mode
  if (preferences.offline || preferences.privacyMode) {
    return selectOfflineProvider(task, preferences);
  }

  // === TIER 1: Agent Booster ===
  if (config.enableTier1) {
    const boosterResult = detectAgentBoosterIntent(task);
    if (boosterResult.isBooster && boosterResult.confidence > 0.8) {
      return {
        provider: 'agent-booster',
        model: 'wasm-transform',
        tier: 1,
        reason: boosterResult.reason || 'Simple transform detected',
        confidence: boosterResult.confidence,
        alternatives: ['ollama', 'haiku'],
      };
    }
  }

  // === TIER 2: Complexity Analysis ===
  const complexity = analyzeComplexity(task);

  // Low complexity → Local
  if (config.enableTier2 && complexity.score <= config.complexityThresholds.tier2Max) {
    // Prefer local if requested or for low complexity
    if (preferences.preferLocal || complexity.score <= config.complexityThresholds.tier1Max) {
      return {
        provider: 'ollama',
        model: config.providers?.ollama?.preferredModels?.[0] || 'qwen2.5:7b',
        tier: 2,
        reason: `${complexity.reasoning}. Local model sufficient.`,
        confidence: 1.0 - complexity.score,
        alternatives: ['haiku', 'gemini'],
      };
    }

    // Medium complexity → Haiku or local depending on preference
    if (complexity.score <= 0.5) {
      const provider = preferences.costOptimize ? 'ollama' : 'haiku';
      return {
        provider,
        model: provider === 'ollama' ? 'qwen2.5:7b' : 'claude-3-haiku',
        tier: 2,
        reason: `${complexity.reasoning}. ${provider === 'ollama' ? 'Cost-optimized local' : 'Fast cloud'}.`,
        confidence: 0.8,
        alternatives: provider === 'ollama' ? ['haiku', 'gemini'] : ['ollama', 'sonnet'],
      };
    }
  }

  // === TIER 3: Cloud ===
  if (config.enableTier3) {
    const cloudResult = selectCloudProvider(task, config);
    return {
      provider: cloudResult.provider,
      model: cloudResult.model,
      tier: 3,
      reason: `${complexity.reasoning}. ${cloudResult.reason}`,
      confidence: cloudResult.confidence,
      alternatives: getCloudAlternatives(cloudResult.provider),
    };
  }

  // Fallback
  return {
    provider: config.defaultProvider,
    model: PROVIDER_MODELS[config.defaultProvider],
    tier: 2,
    reason: 'Fallback to default provider',
    confidence: 0.5,
  };
}

/**
 * Select provider for offline/privacy mode
 */
function selectOfflineProvider(
  task: TaskContext,
  preferences: RoutingPreferences
): ProviderSelection {
  // Check for booster intent first
  const boosterResult = detectAgentBoosterIntent(task);
  if (boosterResult.isBooster) {
    return {
      provider: 'agent-booster',
      model: 'wasm-transform',
      tier: 1,
      reason: 'Offline mode - using Agent Booster',
      confidence: boosterResult.confidence,
    };
  }

  // Use local Ollama
  return {
    provider: 'ollama',
    model: 'qwen2.5:7b',
    tier: 2,
    reason: 'Offline mode - using local model',
    confidence: 0.9,
    alternatives: ['network'],
  };
}

/**
 * Infer provider from model name
 */
function inferProviderFromModel(model: string): ProviderType {
  const lowerModel = model.toLowerCase();

  if (lowerModel.includes('claude-3-opus') || lowerModel.includes('opus')) {
    return 'opus';
  }
  if (lowerModel.includes('claude-3.5-sonnet') || lowerModel.includes('sonnet')) {
    return 'sonnet';
  }
  if (lowerModel.includes('claude-3-haiku') || lowerModel.includes('haiku')) {
    return 'haiku';
  }
  if (lowerModel.includes('gemini')) {
    return 'gemini';
  }
  if (lowerModel.includes('qwen') || lowerModel.includes('llama') || lowerModel.includes('mistral')) {
    return 'ollama';
  }

  return 'sonnet'; // Default to Sonnet for unknown models
}

/**
 * Get alternative cloud providers
 */
function getCloudAlternatives(primary: ProviderType): ProviderType[] {
  switch (primary) {
    case 'gemini':
      return ['sonnet', 'haiku'];
    case 'sonnet':
      return ['gemini', 'opus'];
    case 'opus':
      return ['sonnet', 'gemini'];
    default:
      return ['sonnet', 'gemini'];
  }
}

/**
 * ProviderSelector class for stateful selection with health tracking
 */
export class ProviderSelector {
  private boosterDetector: AgentBoosterDetector;
  private complexityAnalyzer: ComplexityAnalyzer;
  private cloudRouter: CloudRouter;
  private config: ProviderSelectionConfig;
  private health: Map<ProviderType, ProviderHealth>;

  constructor(config: Partial<ProviderSelectionConfig> = {}) {
    this.config = { ...DEFAULT_PROVIDER_SELECTION_CONFIG, ...config };
    this.boosterDetector = new AgentBoosterDetector();
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.cloudRouter = new CloudRouter(this.config);
    this.health = new Map();
  }

  /**
   * Select provider with full state awareness
   */
  async select(
    task: TaskContext,
    preferences: RoutingPreferences = {}
  ): Promise<ProviderSelection> {
    // Check explicit model
    if (task.model) {
      return {
        provider: inferProviderFromModel(task.model),
        model: task.model,
        tier: 3,
        reason: 'Explicit model requested',
        confidence: 1.0,
      };
    }

    // Offline mode
    if (preferences.offline || preferences.privacyMode) {
      return selectOfflineProvider(task, preferences);
    }

    // Tier 1: Agent Booster
    if (this.config.enableTier1) {
      const boosterResult = this.boosterDetector.detect(task);
      if (boosterResult.isBooster && boosterResult.confidence > 0.8) {
        return {
          provider: 'agent-booster',
          model: 'wasm-transform',
          tier: 1,
          reason: boosterResult.reason || 'Simple transform detected',
          confidence: boosterResult.confidence,
          alternatives: ['ollama'],
        };
      }
    }

    // Tier 2: Complexity analysis
    const complexity = this.complexityAnalyzer.analyze(task);

    if (this.config.enableTier2 && complexity.score <= this.config.complexityThresholds.tier2Max) {
      // Check local provider health
      const ollamaHealth = this.health.get('ollama');
      const ollamaAvailable = !ollamaHealth || ollamaHealth.available;

      if ((preferences.preferLocal || complexity.score <= 0.3) && ollamaAvailable) {
        return {
          provider: 'ollama',
          model: this.config.providers?.ollama?.preferredModels?.[0] || 'qwen2.5:7b',
          tier: 2,
          reason: `${complexity.reasoning}. Local model sufficient.`,
          confidence: 1.0 - complexity.score,
          alternatives: ['haiku'],
        };
      }

      if (complexity.score <= 0.5) {
        return {
          provider: preferences.costOptimize ? 'ollama' : 'haiku',
          model: preferences.costOptimize ? 'qwen2.5:7b' : 'claude-3-haiku',
          tier: 2,
          reason: complexity.reasoning,
          confidence: 0.8,
        };
      }
    }

    // Tier 3: Cloud
    if (this.config.enableTier3) {
      const cloudResult = this.cloudRouter.select(task);
      return {
        provider: cloudResult.provider,
        model: cloudResult.model,
        tier: 3,
        reason: `${complexity.reasoning}. ${cloudResult.reason}`,
        confidence: cloudResult.confidence,
        alternatives: getCloudAlternatives(cloudResult.provider),
      };
    }

    // Fallback
    return {
      provider: this.config.defaultProvider,
      model: PROVIDER_MODELS[this.config.defaultProvider],
      tier: 2,
      reason: 'Fallback to default',
      confidence: 0.5,
    };
  }

  /**
   * Update provider health status
   */
  updateHealth(provider: ProviderType, status: Partial<ProviderHealth>): void {
    const existing = this.health.get(provider) || {
      provider,
      available: true,
      lastCheck: new Date(),
    };
    this.health.set(provider, { ...existing, ...status, lastCheck: new Date() });

    // Also update cloud router health
    this.cloudRouter.updateHealth(provider, status);
  }

  /**
   * Record Gemini token usage
   */
  recordGeminiUsage(tokens: number): void {
    this.cloudRouter.recordGeminiUsage(tokens);
  }

  /**
   * Get Gemini usage stats
   */
  getGeminiUsage(): { used: number; limit: number; remaining: number } {
    return this.cloudRouter.getGeminiUsage();
  }
}

// Re-export types and utilities
export type {
  TaskContext,
  RoutingPreferences,
  ProviderSelection,
  ProviderType,
  ProviderHealth,
  ProviderSelectionConfig,
} from './types/routing.js';

export { DEFAULT_PROVIDER_SELECTION_CONFIG } from './types/routing.js';

export { detectAgentBoosterIntent, AgentBoosterDetector } from './agent-booster-detector.js';
export { analyzeComplexity, ComplexityAnalyzer } from './complexity-analyzer.js';
export { selectCloudProvider, CloudRouter } from './cloud-router.js';
