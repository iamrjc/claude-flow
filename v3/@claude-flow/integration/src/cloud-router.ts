/**
 * Cloud Router for WP02
 *
 * Selects optimal cloud provider for Tier 3 tasks:
 * - Gemini-3-Pro: Data analysis, search, summaries (2M tokens/day FREE)
 * - Claude Sonnet: General coding, moderate complexity
 * - Claude Opus: Complex architecture, security, nuanced reasoning
 *
 * @module @claude-flow/integration/cloud-router
 */

import {
  TaskContext,
  ProviderType,
  ProviderHealth,
  ProviderSelectionConfig,
} from './types/routing.js';

interface CloudRouterResult {
  provider: ProviderType;
  model: string;
  reason: string;
  confidence: number;
}

// Keywords indicating Gemini strength (data/analysis/speed)
const GEMINI_KEYWORDS = [
  'analyze',
  'data',
  'search',
  'list',
  'extract',
  'summary',
  'summarize',
  'benchmark',
  'performance',
  'metrics',
  'statistics',
  'compare',
  'table',
  'csv',
  'json',
];

// Keywords indicating Claude strength (creative/architecture/nuance)
const CLAUDE_KEYWORDS = [
  'architect',
  'design',
  'pattern',
  'refactor',
  'security',
  'audit',
  'creative',
  'story',
  'write',
  'compose',
  'nuance',
  'subtle',
  'complex reasoning',
  'edge case',
];

// Keywords indicating need for Opus (highest capability)
const OPUS_KEYWORDS = [
  'critical',
  'production',
  'security audit',
  'architecture review',
  'system design',
  'comprehensive',
  'enterprise',
  'mission-critical',
];

/**
 * Select optimal cloud provider for a task
 */
export function selectCloudProvider(
  task: TaskContext,
  config?: Partial<ProviderSelectionConfig>,
  health?: Map<ProviderType, ProviderHealth>
): CloudRouterResult {
  const prompt = task.prompt.toLowerCase();

  // Check provider availability if health info provided
  const isAvailable = (provider: ProviderType): boolean => {
    if (!health) return true;
    const h = health.get(provider);
    return h?.available ?? true;
  };

  // Check Gemini token budget
  const geminiConfig = config?.providers?.gemini;
  const geminiAvailable = isAvailable('gemini') &&
    (!geminiConfig || geminiConfig.tokensUsedToday < geminiConfig.dailyTokenLimit);

  // Score each provider
  let geminiScore = 0;
  let claudeScore = 0;
  let opusScore = 0;

  // Check Gemini keywords
  for (const keyword of GEMINI_KEYWORDS) {
    if (prompt.includes(keyword)) {
      geminiScore += 1;
    }
  }

  // Check Claude keywords
  for (const keyword of CLAUDE_KEYWORDS) {
    if (prompt.includes(keyword)) {
      claudeScore += 1;
    }
  }

  // Check Opus keywords
  for (const keyword of OPUS_KEYWORDS) {
    if (prompt.includes(keyword)) {
      opusScore += 2; // Opus keywords have higher weight
    }
  }

  // Decision logic
  if (opusScore >= 2 && isAvailable('opus')) {
    return {
      provider: 'opus',
      model: 'claude-3-opus',
      reason: 'High-stakes task requiring maximum capability',
      confidence: 0.9,
    };
  }

  if (geminiScore > claudeScore && geminiAvailable) {
    return {
      provider: 'gemini',
      model: 'gemini-3-pro',
      reason: 'Task aligns with Gemini strengths (analysis/data/speed)',
      confidence: 0.85,
    };
  }

  if (claudeScore > 0 && isAvailable('sonnet')) {
    return {
      provider: 'sonnet',
      model: 'claude-3.5-sonnet',
      reason: 'Task aligns with Claude strengths (architecture/nuance)',
      confidence: 0.85,
    };
  }

  // Default to Gemini if available (free tier), otherwise Sonnet
  if (geminiAvailable) {
    return {
      provider: 'gemini',
      model: 'gemini-3-pro',
      reason: 'Default cloud provider (free 2M tokens/day)',
      confidence: 0.7,
    };
  }

  return {
    provider: 'sonnet',
    model: 'claude-3.5-sonnet',
    reason: 'Fallback to Claude Sonnet',
    confidence: 0.7,
  };
}

/**
 * CloudRouter class for stateful routing with health tracking
 */
export class CloudRouter {
  private health: Map<ProviderType, ProviderHealth>;
  private config: Partial<ProviderSelectionConfig>;
  private geminiTokensUsed: number;

  constructor(config: Partial<ProviderSelectionConfig> = {}) {
    this.health = new Map();
    this.config = config;
    this.geminiTokensUsed = 0;
  }

  /**
   * Select cloud provider for a task
   */
  select(task: TaskContext): CloudRouterResult {
    // Update config with current token usage
    const configWithUsage: Partial<ProviderSelectionConfig> = {
      ...this.config,
      providers: {
        ...this.config.providers,
        gemini: {
          dailyTokenLimit: this.config.providers?.gemini?.dailyTokenLimit ?? 2000000,
          tokensUsedToday: this.geminiTokensUsed,
        },
      },
    };

    return selectCloudProvider(task, configWithUsage, this.health);
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

    this.health.set(provider, {
      ...existing,
      ...status,
      lastCheck: new Date(),
    });
  }

  /**
   * Record Gemini token usage
   */
  recordGeminiUsage(tokens: number): void {
    this.geminiTokensUsed += tokens;
  }

  /**
   * Reset daily Gemini token count
   */
  resetGeminiUsage(): void {
    this.geminiTokensUsed = 0;
  }

  /**
   * Get current Gemini usage
   */
  getGeminiUsage(): { used: number; limit: number; remaining: number } {
    const limit = this.config.providers?.gemini?.dailyTokenLimit ?? 2000000;
    return {
      used: this.geminiTokensUsed,
      limit,
      remaining: Math.max(0, limit - this.geminiTokensUsed),
    };
  }

  /**
   * Check if a provider is available
   */
  isAvailable(provider: ProviderType): boolean {
    const h = this.health.get(provider);
    if (!h) return true; // Assume available if no health info

    // Check rate limits
    if (h.rateLimitStatus && h.rateLimitStatus.remaining === 0) {
      if (new Date() < h.rateLimitStatus.resetAt) {
        return false;
      }
    }

    return h.available;
  }
}
