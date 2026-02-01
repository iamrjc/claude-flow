/**
 * Complexity Analyzer for WP02
 *
 * Analyzes task complexity to determine routing tier:
 * - Low complexity (0-0.3): Local models sufficient
 * - Medium complexity (0.3-0.7): May need cloud
 * - High complexity (0.7-1.0): Requires cloud (Sonnet/Opus)
 *
 * Scoring Weights:
 * - Prompt length: 0.2
 * - Code keywords: 0.2
 * - Multi-step signals: 0.3
 * - Tool requirements: 0.2
 * - Context size: 0.1
 *
 * @module @claude-flow/integration/complexity-analyzer
 */

import {
  TaskContext,
  ComplexityScore,
  ComplexityFactors,
} from './types/routing.js';

// Scoring weights per WP02 specification
const WEIGHTS = {
  promptLength: 0.2,
  codeKeywords: 0.2,
  multiStepSignals: 0.3,
  toolRequirements: 0.2,
  contextSize: 0.1,
};

// Keywords that indicate high complexity
const HIGH_COMPLEXITY_KEYWORDS = [
  'architect',
  'architecture',
  'design',
  'system',
  'refactor',
  'security',
  'audit',
  'comprehensive',
  'multi-file',
  'cross-module',
  'integration',
  'migration',
  'optimization',
  'performance',
  'scalability',
  'microservices',
  'distributed',
  'enterprise',
];

// Keywords that indicate moderate complexity
const MEDIUM_COMPLEXITY_KEYWORDS = [
  'implement',
  'feature',
  'fix',
  'bug',
  'debug',
  'test',
  'review',
  'analyze',
  'update',
  'modify',
];

// Multi-step signal patterns
const MULTI_STEP_PATTERNS = [
  /\bthen\b/i,
  /\bafter\s+that\b/i,
  /\bfinally\b/i,
  /\bfirst\b.*\bthen\b/i,
  /\bstep\s*\d+/i,
  /\b\d+\.\s+\w+.*\n\s*\d+\./m,
  /\band\s+then\b/i,
  /\bfollowed\s+by\b/i,
  /\bnext\b/i,
];

/**
 * Analyze task complexity and return a score
 */
export function analyzeComplexity(task: TaskContext): ComplexityScore {
  const factors = calculateFactors(task);

  // Calculate weighted score
  const score = Math.min(1.0,
    factors.promptLength * WEIGHTS.promptLength +
    factors.codeKeywords * WEIGHTS.codeKeywords +
    factors.multiStepSignals * WEIGHTS.multiStepSignals +
    factors.toolRequirements * WEIGHTS.toolRequirements +
    factors.contextSize * WEIGHTS.contextSize
  );

  const reasoning = generateReasoning(score, factors);

  return {
    score,
    reasoning,
    factors,
  };
}

/**
 * Calculate individual complexity factors
 */
function calculateFactors(task: TaskContext): ComplexityFactors {
  const prompt = task.prompt.toLowerCase();

  // 1. Prompt length factor (normalize to 0-1, cap at 2000 chars)
  const promptLength = Math.min(1.0, task.prompt.length / 2000);

  // 2. Code keywords factor
  let keywordScore = 0;
  for (const keyword of HIGH_COMPLEXITY_KEYWORDS) {
    if (prompt.includes(keyword)) {
      keywordScore += 0.25; // High complexity keywords have more weight
    }
  }
  for (const keyword of MEDIUM_COMPLEXITY_KEYWORDS) {
    if (prompt.includes(keyword)) {
      keywordScore += 0.12;
    }
  }
  const codeKeywords = Math.min(1.0, keywordScore);

  // 3. Multi-step signals factor
  let multiStepScore = 0;
  for (const pattern of MULTI_STEP_PATTERNS) {
    if (pattern.test(task.prompt)) {
      multiStepScore += 0.2;
    }
  }
  const multiStepSignals = Math.min(1.0, multiStepScore);

  // 4. Tool requirements factor
  let toolScore = 0;
  if (task.requiresTools) {
    toolScore = 0.7;
  }
  // Detect implicit tool needs
  if (/\bread\s+(file|code)\b/i.test(prompt)) toolScore += 0.2;
  if (/\bwrite\s+(to\s+)?(file|code)\b/i.test(prompt)) toolScore += 0.2;
  if (/\bexecute\b|\brun\b|\bcommand\b/i.test(prompt)) toolScore += 0.2;
  if (/\bsearch\b|\bfind\b|\bgrep\b/i.test(prompt)) toolScore += 0.15;
  const toolRequirements = Math.min(1.0, toolScore);

  // 5. Context size factor (normalize to 0-1, cap at 100K tokens)
  const contextSize = Math.min(1.0, task.contextSize / 100000);

  return {
    promptLength,
    codeKeywords,
    multiStepSignals,
    toolRequirements,
    contextSize,
  };
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(score: number, factors: ComplexityFactors): string {
  const parts: string[] = [];

  if (score < 0.3) {
    parts.push('Low complexity task');
  } else if (score < 0.7) {
    parts.push('Medium complexity task');
  } else {
    parts.push('High complexity task');
  }

  parts.push(`(score: ${score.toFixed(2)})`);

  // Add dominant factors
  const dominantFactors: string[] = [];
  if (factors.promptLength > 0.5) dominantFactors.push('long prompt');
  if (factors.codeKeywords > 0.5) dominantFactors.push('complex keywords');
  if (factors.multiStepSignals > 0.5) dominantFactors.push('multi-step');
  if (factors.toolRequirements > 0.5) dominantFactors.push('tool usage');
  if (factors.contextSize > 0.5) dominantFactors.push('large context');

  if (dominantFactors.length > 0) {
    parts.push(`- ${dominantFactors.join(', ')}`);
  }

  return parts.join(' ');
}

/**
 * ComplexityAnalyzer class for stateful analysis with caching
 */
export class ComplexityAnalyzer {
  private cache: Map<string, ComplexityScore>;
  private cacheMaxSize: number;

  constructor(options: { cacheMaxSize?: number } = {}) {
    this.cache = new Map();
    this.cacheMaxSize = options.cacheMaxSize ?? 1000;
  }

  /**
   * Analyze task complexity with caching
   */
  analyze(task: TaskContext): ComplexityScore {
    // Generate cache key from prompt hash
    const cacheKey = this.hashPrompt(task.prompt);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Calculate complexity
    const result = analyzeComplexity(task);

    // Cache result
    if (this.cache.size >= this.cacheMaxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Simple hash function for caching
   */
  private hashPrompt(prompt: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(prompt.length, 500); i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
}
