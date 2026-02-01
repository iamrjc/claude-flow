/**
 * Pattern Recognition
 *
 * Detects and matches patterns in code, workflows, errors, and successes.
 * Provides pattern similarity scoring for learning.
 */

import { PatternLearner } from '@claude-flow/neural';
import type {
  Pattern,
  PatternMatch,
  Trajectory,
  DetectedPattern,
  PatternType,
  PatternSimilarity,
} from './types.js';

/**
 * Pattern Recognizer
 *
 * Detects patterns and computes similarity scores
 */
export class PatternRecognizer {
  private learner: PatternLearner;
  private detectedPatterns: Map<string, DetectedPattern> = new Map();

  constructor(config: {
    maxPatterns?: number;
    matchThreshold?: number;
    qualityThreshold?: number;
  } = {}) {
    this.learner = new PatternLearner({
      maxPatterns: config.maxPatterns || 1000,
      matchThreshold: config.matchThreshold || 0.7,
      qualityThreshold: config.qualityThreshold || 0.5,
      enableClustering: true,
      numClusters: 50,
      evolutionLearningRate: 0.1,
    });
  }

  // ==========================================================================
  // Pattern Detection
  // ==========================================================================

  /**
   * Detect code patterns
   */
  detectCodePattern(context: string, embedding: Float32Array): DetectedPattern {
    const pattern: DetectedPattern = {
      id: `code_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: 'code',
      name: this.generateCodePatternName(context),
      confidence: this.computeCodeConfidence(context),
      context,
      embedding,
      timestamp: Date.now(),
      metadata: {
        language: this.detectLanguage(context),
        complexity: this.estimateComplexity(context),
      },
    };

    this.detectedPatterns.set(pattern.id, pattern);
    return pattern;
  }

  /**
   * Detect workflow patterns
   */
  detectWorkflowPattern(context: string, embedding: Float32Array): DetectedPattern {
    const pattern: DetectedPattern = {
      id: `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: 'workflow',
      name: this.generateWorkflowPatternName(context),
      confidence: this.computeWorkflowConfidence(context),
      context,
      embedding,
      timestamp: Date.now(),
      metadata: {
        steps: this.extractWorkflowSteps(context),
        cyclical: this.isCyclicalWorkflow(context),
      },
    };

    this.detectedPatterns.set(pattern.id, pattern);
    return pattern;
  }

  /**
   * Detect error patterns
   */
  detectErrorPattern(context: string, embedding: Float32Array): DetectedPattern {
    const pattern: DetectedPattern = {
      id: `error_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: 'error',
      name: this.generateErrorPatternName(context),
      confidence: this.computeErrorConfidence(context),
      context,
      embedding,
      timestamp: Date.now(),
      metadata: {
        errorType: this.classifyError(context),
        severity: this.estimateSeverity(context),
      },
    };

    this.detectedPatterns.set(pattern.id, pattern);
    return pattern;
  }

  /**
   * Detect success patterns
   */
  detectSuccessPattern(context: string, embedding: Float32Array): DetectedPattern {
    const pattern: DetectedPattern = {
      id: `success_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: 'success',
      name: this.generateSuccessPatternName(context),
      confidence: this.computeSuccessConfidence(context),
      context,
      embedding,
      timestamp: Date.now(),
      metadata: {
        impact: this.estimateImpact(context),
        reusability: this.estimateReusability(context),
      },
    };

    this.detectedPatterns.set(pattern.id, pattern);
    return pattern;
  }

  /**
   * Auto-detect pattern type from context
   */
  detectPattern(context: string, embedding: Float32Array): DetectedPattern {
    const type = this.inferPatternType(context);

    switch (type) {
      case 'code':
        return this.detectCodePattern(context, embedding);
      case 'workflow':
        return this.detectWorkflowPattern(context, embedding);
      case 'error':
        return this.detectErrorPattern(context, embedding);
      case 'success':
        return this.detectSuccessPattern(context, embedding);
      default:
        return this.detectCodePattern(context, embedding);
    }
  }

  // ==========================================================================
  // Pattern Matching
  // ==========================================================================

  /**
   * Find matching patterns using PatternLearner
   * Target: <1ms
   */
  findMatches(queryEmbedding: Float32Array, k: number = 3): PatternMatch[] {
    return this.learner.findMatches(queryEmbedding, k);
  }

  /**
   * Find best single match
   */
  findBestMatch(queryEmbedding: Float32Array): PatternMatch | null {
    return this.learner.findBestMatch(queryEmbedding);
  }

  // ==========================================================================
  // Pattern Similarity
  // ==========================================================================

  /**
   * Compute cosine similarity between patterns
   */
  cosineSimilarity(pattern1: DetectedPattern, pattern2: DetectedPattern): PatternSimilarity {
    const sim = this.computeCosineSimilarity(pattern1.embedding, pattern2.embedding);

    return {
      pattern1,
      pattern2,
      similarity: sim,
      method: 'cosine',
    };
  }

  /**
   * Compute Jaccard similarity based on context words
   */
  jaccardSimilarity(pattern1: DetectedPattern, pattern2: DetectedPattern): PatternSimilarity {
    const words1 = new Set(pattern1.context.toLowerCase().split(/\s+/));
    const words2 = new Set(pattern2.context.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    const sim = intersection.size / union.size;

    return {
      pattern1,
      pattern2,
      similarity: sim,
      method: 'jaccard',
    };
  }

  /**
   * Compute edit distance similarity
   */
  editDistanceSimilarity(pattern1: DetectedPattern, pattern2: DetectedPattern): PatternSimilarity {
    const distance = this.levenshteinDistance(pattern1.context, pattern2.context);
    const maxLen = Math.max(pattern1.context.length, pattern2.context.length);
    const sim = maxLen > 0 ? 1 - distance / maxLen : 0;

    return {
      pattern1,
      pattern2,
      similarity: sim,
      method: 'edit-distance',
    };
  }

  // ==========================================================================
  // Pattern Extraction
  // ==========================================================================

  /**
   * Extract pattern from trajectory
   * Target: <5ms
   */
  extractPattern(trajectory: Trajectory): Pattern | null {
    return this.learner.extractPattern(trajectory);
  }

  /**
   * Extract patterns from multiple trajectories
   */
  extractPatternsBatch(trajectories: Trajectory[]): Pattern[] {
    return this.learner.extractPatternsBatch(trajectories);
  }

  // ==========================================================================
  // Pattern Evolution
  // ==========================================================================

  /**
   * Evolve pattern based on new quality feedback
   * Target: <2ms
   */
  evolvePattern(patternId: string, quality: number, context?: string): void {
    this.learner.evolvePattern(patternId, quality, context);
  }

  // ==========================================================================
  // Pattern Access
  // ==========================================================================

  /**
   * Get all detected patterns
   */
  getDetectedPatterns(): DetectedPattern[] {
    return Array.from(this.detectedPatterns.values());
  }

  /**
   * Get detected pattern by ID
   */
  getDetectedPattern(id: string): DetectedPattern | undefined {
    return this.detectedPatterns.get(id);
  }

  /**
   * Get all learned patterns
   */
  getLearnedPatterns(): Pattern[] {
    return this.learner.getPatterns();
  }

  /**
   * Get pattern by ID
   */
  getPattern(patternId: string): Pattern | undefined {
    return this.learner.getPattern(patternId);
  }

  /**
   * Get patterns by domain
   */
  getPatternsByDomain(domain: string): Pattern[] {
    return this.learner.getPatternsByDomain(domain);
  }

  /**
   * Get stable patterns
   */
  getStablePatterns(): Pattern[] {
    return this.learner.getStablePatterns();
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get pattern statistics
   */
  getStats(): Record<string, number> {
    const learnerStats = this.learner.getStats();
    const detected = Array.from(this.detectedPatterns.values());

    return {
      ...learnerStats,
      detectedPatterns: detected.length,
      codePatterns: detected.filter(p => p.type === 'code').length,
      workflowPatterns: detected.filter(p => p.type === 'workflow').length,
      errorPatterns: detected.filter(p => p.type === 'error').length,
      successPatterns: detected.filter(p => p.type === 'success').length,
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private computeCosineSimilarity(a: Float32Array, b: Float32Array): number {
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

  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  private inferPatternType(context: string): PatternType {
    const lower = context.toLowerCase();

    if (lower.includes('error') || lower.includes('exception') || lower.includes('fail')) {
      return 'error';
    }
    if (lower.includes('success') || lower.includes('complete') || lower.includes('achieve')) {
      return 'success';
    }
    if (lower.includes('step') || lower.includes('process') || lower.includes('workflow')) {
      return 'workflow';
    }

    return 'code';
  }

  private detectLanguage(context: string): string {
    if (context.includes('function') || context.includes('=>')) return 'javascript';
    if (context.includes('def ') || context.includes('import ')) return 'python';
    if (context.includes('interface') || context.includes('type ')) return 'typescript';
    return 'unknown';
  }

  private estimateComplexity(context: string): number {
    const lines = context.split('\n').length;
    const nesting = (context.match(/{/g) || []).length;
    return Math.min(1, (lines * 0.01 + nesting * 0.05));
  }

  private extractWorkflowSteps(context: string): string[] {
    return context.split(/\n|->|=>/).filter(s => s.trim().length > 0).slice(0, 10);
  }

  private isCyclicalWorkflow(context: string): boolean {
    return context.toLowerCase().includes('loop') || context.toLowerCase().includes('repeat');
  }

  private classifyError(context: string): string {
    const lower = context.toLowerCase();
    if (lower.includes('syntax')) return 'syntax';
    if (lower.includes('type')) return 'type';
    if (lower.includes('runtime')) return 'runtime';
    if (lower.includes('logic')) return 'logic';
    return 'unknown';
  }

  private estimateSeverity(context: string): number {
    const lower = context.toLowerCase();
    if (lower.includes('critical') || lower.includes('fatal')) return 1.0;
    if (lower.includes('error')) return 0.7;
    if (lower.includes('warning')) return 0.4;
    return 0.2;
  }

  private estimateImpact(context: string): number {
    const lines = context.split('\n').length;
    return Math.min(1, lines * 0.02);
  }

  private estimateReusability(context: string): number {
    const lower = context.toLowerCase();
    if (lower.includes('generic') || lower.includes('util')) return 0.9;
    if (lower.includes('specific') || lower.includes('custom')) return 0.3;
    return 0.5;
  }

  private computeCodeConfidence(context: string): number {
    const hasKeywords = /\b(function|class|const|let|var|def|import)\b/.test(context);
    const hasStructure = /{|}|\(|\)|=>/.test(context);
    return hasKeywords && hasStructure ? 0.9 : 0.5;
  }

  private computeWorkflowConfidence(context: string): number {
    const hasSteps = context.split(/\n|->/).length > 2;
    const hasKeywords = /\b(step|process|stage|phase)\b/i.test(context);
    return hasSteps && hasKeywords ? 0.85 : 0.5;
  }

  private computeErrorConfidence(context: string): number {
    const hasErrorKeywords = /\b(error|exception|fail|crash)\b/i.test(context);
    return hasErrorKeywords ? 0.9 : 0.3;
  }

  private computeSuccessConfidence(context: string): number {
    const hasSuccessKeywords = /\b(success|complete|achieve|done)\b/i.test(context);
    return hasSuccessKeywords ? 0.85 : 0.4;
  }

  private generateCodePatternName(context: string): string {
    const words = context.split(/\s+/).slice(0, 3);
    return `code_${words.join('_').toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
  }

  private generateWorkflowPatternName(context: string): string {
    const steps = this.extractWorkflowSteps(context);
    return `workflow_${steps.length}_steps`;
  }

  private generateErrorPatternName(context: string): string {
    const errorType = this.classifyError(context);
    return `error_${errorType}`;
  }

  private generateSuccessPatternName(context: string): string {
    const impact = this.estimateImpact(context);
    const level = impact > 0.7 ? 'high' : impact > 0.4 ? 'med' : 'low';
    return `success_${level}_impact`;
  }
}

/**
 * Factory function
 */
export function createPatternRecognizer(config?: {
  maxPatterns?: number;
  matchThreshold?: number;
  qualityThreshold?: number;
}): PatternRecognizer {
  return new PatternRecognizer(config);
}
