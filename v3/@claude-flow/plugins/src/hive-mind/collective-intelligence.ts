/**
 * Collective Intelligence
 * Shared knowledge, consensus building, knowledge aggregation, and pattern emergence
 */

import { EventEmitter } from 'events';
import type {
  CollectiveMemory,
  MemoryEntry,
  Pattern,
  CollectiveDecision,
  DecisionResult,
  Vote,
  ConsensusType,
} from './types.js';

// ============================================================================
// Collective Memory
// ============================================================================

export class CollectiveMemoryStore extends EventEmitter {
  private memory: CollectiveMemory;

  constructor(namespace: string) {
    super();

    this.memory = {
      id: `cm_${namespace}_${Date.now()}`,
      namespace,
      entries: new Map(),
      patterns: new Map(),
      createdAt: new Date(),
      lastUpdated: new Date(),
    };
  }

  // ===== MEMORY OPERATIONS =====

  async store(
    key: string,
    value: unknown,
    contributorId: string,
    confidence: number = 1.0,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const existing = this.memory.entries.get(key);

    if (existing) {
      // Update existing entry
      existing.value = value;
      existing.contributors.push(contributorId);
      existing.confidence = (existing.confidence + confidence) / 2;
      existing.version++;
      existing.updatedAt = new Date();
      existing.metadata = { ...existing.metadata, ...metadata };
    } else {
      // Create new entry
      const entry: MemoryEntry = {
        key,
        value,
        contributors: [contributorId],
        confidence,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata,
      };
      this.memory.entries.set(key, entry);
    }

    this.memory.lastUpdated = new Date();
    this.emit('memory.stored', { key, contributorId, confidence });
  }

  async retrieve(key: string): Promise<MemoryEntry | undefined> {
    return this.memory.entries.get(key);
  }

  async search(query: string, minConfidence: number = 0.5): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];

    for (const entry of this.memory.entries.values()) {
      if (entry.confidence >= minConfidence) {
        // Simple keyword search in key and stringified value
        const searchText = `${entry.key} ${JSON.stringify(entry.value)}`.toLowerCase();
        if (searchText.includes(query.toLowerCase())) {
          results.push(entry);
        }
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  async merge(otherId: string, otherValue: unknown, confidence: number): Promise<void> {
    // Merge strategy: average confidence, combine values
    const existing = this.memory.entries.get(otherId);

    if (existing) {
      // Average the confidence
      existing.confidence = (existing.confidence + confidence) / 2;

      // Merge values if they're objects
      if (typeof existing.value === 'object' && typeof otherValue === 'object') {
        existing.value = { ...existing.value as any, ...otherValue as any };
      } else {
        // Otherwise, keep higher confidence value
        if (confidence > existing.confidence) {
          existing.value = otherValue;
        }
      }

      existing.updatedAt = new Date();
    }

    this.emit('memory.merged', { key: otherId, confidence });
  }

  getStats(): {
    totalEntries: number;
    avgConfidence: number;
    uniqueContributors: number;
    totalPatterns: number;
  } {
    const entries = Array.from(this.memory.entries.values());
    const avgConfidence = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
      : 0;

    const contributors = new Set<string>();
    for (const entry of entries) {
      entry.contributors.forEach(c => contributors.add(c));
    }

    return {
      totalEntries: entries.length,
      avgConfidence,
      uniqueContributors: contributors.size,
      totalPatterns: this.memory.patterns.size,
    };
  }

  // ===== PATTERN DETECTION =====

  async detectPattern(
    type: string,
    description: string,
    detectorId: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const patternId = `pattern_${type}_${Date.now()}`;

    const pattern: Pattern = {
      id: patternId,
      type,
      description,
      occurrences: 1,
      confidence: 1.0,
      detectedBy: [detectorId],
      firstSeen: new Date(),
      lastSeen: new Date(),
      metadata,
    };

    this.memory.patterns.set(patternId, pattern);
    this.emit('pattern.detected', { patternId, type, detectorId });

    return patternId;
  }

  async recordPatternOccurrence(patternId: string, detectorId: string): Promise<void> {
    const pattern = this.memory.patterns.get(patternId);
    if (!pattern) {
      return;
    }

    pattern.occurrences++;
    pattern.lastSeen = new Date();

    if (!pattern.detectedBy.includes(detectorId)) {
      pattern.detectedBy.push(detectorId);
    }

    // Increase confidence with more detections
    pattern.confidence = Math.min(1.0, pattern.confidence + 0.05);

    this.emit('pattern.occurrence', { patternId, occurrences: pattern.occurrences });
  }

  async getPatterns(minConfidence: number = 0.5): Promise<Pattern[]> {
    return Array.from(this.memory.patterns.values())
      .filter(p => p.confidence >= minConfidence)
      .sort((a, b) => b.occurrences - a.occurrences);
  }
}

// ============================================================================
// Consensus Builder
// ============================================================================

export class ConsensusBuilder extends EventEmitter {
  private decisions: Map<string, CollectiveDecision> = new Map();

  async proposeDecision(
    question: string,
    proposerId: string,
    consensusType: ConsensusType,
    timeout: number = 30000
  ): Promise<string> {
    const decisionId = `decision_${Date.now()}`;

    const decision: CollectiveDecision = {
      id: decisionId,
      question,
      proposedBy: proposerId,
      votes: new Map(),
      consensusType,
      startedAt: new Date(),
      timeout,
    };

    this.decisions.set(decisionId, decision);

    this.emit('decision.proposed', { decisionId, question, consensusType });

    // Set timeout
    setTimeout(() => {
      this.finalizeDecision(decisionId);
    }, timeout);

    return decisionId;
  }

  async vote(decisionId: string, vote: Vote): Promise<void> {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    if (decision.completedAt) {
      throw new Error(`Decision ${decisionId} already completed`);
    }

    decision.votes.set(vote.voterId, vote);

    this.emit('vote.received', {
      decisionId,
      voterId: vote.voterId,
      totalVotes: decision.votes.size
    });
  }

  private finalizeDecision(decisionId: string): void {
    const decision = this.decisions.get(decisionId);
    if (!decision || decision.completedAt) {
      return;
    }

    const result = this.calculateResult(decision);
    decision.result = result;
    decision.completedAt = new Date();

    this.emit('decision.finalized', { decisionId, result });
  }

  private calculateResult(decision: CollectiveDecision): DecisionResult {
    const votes = Array.from(decision.votes.values());
    const totalVoters = votes.length;

    if (totalVoters === 0) {
      return {
        consensus: false,
        finalChoice: null,
        approvalRate: 0,
        participationRate: 0,
        confidenceScore: 0,
      };
    }

    // Count votes by choice
    const choiceCounts = new Map<unknown, number>();
    const choiceConfidences = new Map<unknown, number>();

    for (const vote of votes) {
      const count = choiceCounts.get(vote.choice) || 0;
      const confidence = choiceConfidences.get(vote.choice) || 0;

      choiceCounts.set(vote.choice, count + 1);
      choiceConfidences.set(vote.choice, confidence + vote.confidence);
    }

    // Find winning choice
    let winningChoice: unknown = null;
    let maxCount = 0;
    let maxConfidence = 0;

    for (const [choice, count] of choiceCounts) {
      if (count > maxCount || (count === maxCount && (choiceConfidences.get(choice) || 0) > maxConfidence)) {
        winningChoice = choice;
        maxCount = count;
        maxConfidence = choiceConfidences.get(choice) || 0;
      }
    }

    const approvalRate = maxCount / totalVoters;
    const confidenceScore = maxConfidence / totalVoters;

    // Determine consensus based on type
    let consensus = false;

    switch (decision.consensusType) {
      case 'majority':
        consensus = approvalRate > 0.5;
        break;
      case 'supermajority':
        consensus = approvalRate >= 0.67;
        break;
      case 'unanimous':
        consensus = approvalRate === 1.0;
        break;
      case 'weighted':
        consensus = confidenceScore >= 0.67;
        break;
      case 'byzantine':
        // Byzantine requires 2f+1 agreement where f < n/3
        const f = Math.floor((totalVoters - 1) / 3);
        consensus = maxCount >= 2 * f + 1;
        break;
    }

    return {
      consensus,
      finalChoice: winningChoice,
      approvalRate,
      participationRate: 1.0, // All who voted participated
      confidenceScore,
    };
  }

  async getDecision(decisionId: string): Promise<CollectiveDecision | undefined> {
    return this.decisions.get(decisionId);
  }

  async awaitResult(decisionId: string): Promise<DecisionResult> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const decision = this.decisions.get(decisionId);

        if (!decision) {
          clearInterval(checkInterval);
          reject(new Error(`Decision ${decisionId} not found`));
          return;
        }

        if (decision.result) {
          clearInterval(checkInterval);
          resolve(decision.result);
        }
      }, 100);
    });
  }
}

// ============================================================================
// Knowledge Aggregator
// ============================================================================

export class KnowledgeAggregator extends EventEmitter {
  /**
   * Aggregate insights from multiple workers
   */
  async aggregateInsights(insights: Array<{
    workerId: string;
    data: unknown;
    confidence: number;
  }>): Promise<{
    aggregated: unknown;
    confidence: number;
    contributors: string[];
  }> {
    if (insights.length === 0) {
      return {
        aggregated: null,
        confidence: 0,
        contributors: [],
      };
    }

    // Calculate weighted average confidence
    const totalWeight = insights.reduce((sum, i) => sum + i.confidence, 0);
    const avgConfidence = totalWeight / insights.length;

    // Aggregate data (simple merge for objects, majority vote for primitives)
    let aggregated: unknown;

    if (insights.every(i => typeof i.data === 'object' && i.data !== null)) {
      // Merge objects
      let merged: Record<string, unknown> = {};
      for (const insight of insights) {
        merged = { ...merged, ...(insight.data as Record<string, unknown>) };
      }
      aggregated = merged;
    } else {
      // Majority vote for primitives
      const counts = new Map<unknown, number>();
      for (const insight of insights) {
        const count = counts.get(insight.data) || 0;
        counts.set(insight.data, count + insight.confidence);
      }

      let maxCount = 0;
      for (const [data, count] of counts) {
        if (count > maxCount) {
          maxCount = count;
          aggregated = data;
        }
      }
    }

    this.emit('insights.aggregated', {
      count: insights.length,
      confidence: avgConfidence
    });

    return {
      aggregated,
      confidence: avgConfidence,
      contributors: insights.map(i => i.workerId),
    };
  }

  /**
   * Combine multiple worker results with conflict resolution
   */
  async combineResults(results: Array<{
    workerId: string;
    result: unknown;
    confidence: number;
  }>): Promise<{
    final: unknown;
    agreements: number;
    conflicts: number;
  }> {
    // Group by result value
    const resultGroups = new Map<string, typeof results>();

    for (const result of results) {
      const key = JSON.stringify(result.result);
      const group = resultGroups.get(key) || [];
      group.push(result);
      resultGroups.set(key, group);
    }

    // Find highest confidence group
    let bestGroup: typeof results = [];
    let bestScore = 0;

    for (const group of resultGroups.values()) {
      const score = group.reduce((sum, r) => sum + r.confidence, 0);
      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
      }
    }

    const agreements = bestGroup.length;
    const conflicts = results.length - agreements;

    return {
      final: bestGroup[0]?.result,
      agreements,
      conflicts,
    };
  }
}

// ============================================================================
// Pattern Emergence Detector
// ============================================================================

export class PatternEmergence extends EventEmitter {
  private observedBehaviors: Map<string, Array<{
    timestamp: Date;
    data: unknown;
    source: string;
  }>> = new Map();

  /**
   * Observe a behavior for pattern detection
   */
  async observe(behaviorType: string, data: unknown, sourceId: string): Promise<void> {
    if (!this.observedBehaviors.has(behaviorType)) {
      this.observedBehaviors.set(behaviorType, []);
    }

    const observations = this.observedBehaviors.get(behaviorType)!;
    observations.push({
      timestamp: new Date(),
      data,
      source: sourceId,
    });

    // Keep only recent observations (last 100)
    if (observations.length > 100) {
      observations.shift();
    }

    // Check for emergent patterns
    await this.detectEmergentPatterns(behaviorType);
  }

  private async detectEmergentPatterns(behaviorType: string): Promise<void> {
    const observations = this.observedBehaviors.get(behaviorType) || [];

    if (observations.length < 5) {
      return; // Need minimum observations
    }

    // Detect repeating patterns
    const pattern = this.findRepeatingPattern(observations);
    if (pattern) {
      this.emit('pattern.emerged', {
        behaviorType,
        pattern,
        occurrences: pattern.count,
        confidence: pattern.confidence
      });
    }

    // Detect temporal patterns
    const temporalPattern = this.findTemporalPattern(observations);
    if (temporalPattern) {
      this.emit('temporal.pattern', {
        behaviorType,
        interval: temporalPattern.avgInterval,
        regularity: temporalPattern.regularity
      });
    }
  }

  private findRepeatingPattern(observations: Array<{ data: unknown }>): {
    data: unknown;
    count: number;
    confidence: number;
  } | null {
    const dataCounts = new Map<string, number>();

    for (const obs of observations) {
      const key = JSON.stringify(obs.data);
      dataCounts.set(key, (dataCounts.get(key) || 0) + 1);
    }

    let maxCount = 0;
    let maxData: unknown = null;

    for (const [dataStr, count] of dataCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxData = JSON.parse(dataStr);
      }
    }

    if (maxCount >= 3) {
      return {
        data: maxData,
        count: maxCount,
        confidence: maxCount / observations.length,
      };
    }

    return null;
  }

  private findTemporalPattern(observations: Array<{ timestamp: Date }>): {
    avgInterval: number;
    regularity: number;
  } | null {
    if (observations.length < 3) {
      return null;
    }

    const intervals: number[] = [];
    for (let i = 1; i < observations.length; i++) {
      const interval = observations[i].timestamp.getTime() - observations[i - 1].timestamp.getTime();
      intervals.push(interval);
    }

    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;

    // Calculate variance
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Regularity is inverse of coefficient of variation
    const regularity = avgInterval > 0 ? 1 - (stdDev / avgInterval) : 0;

    return {
      avgInterval,
      regularity: Math.max(0, Math.min(1, regularity)),
    };
  }

  getPatternStats(): {
    totalBehaviorTypes: number;
    totalObservations: number;
    avgObservationsPerType: number;
  } {
    const totalBehaviorTypes = this.observedBehaviors.size;
    let totalObservations = 0;

    for (const observations of this.observedBehaviors.values()) {
      totalObservations += observations.length;
    }

    return {
      totalBehaviorTypes,
      totalObservations,
      avgObservationsPerType: totalBehaviorTypes > 0 ? totalObservations / totalBehaviorTypes : 0,
    };
  }
}
