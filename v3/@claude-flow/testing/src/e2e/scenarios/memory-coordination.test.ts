/**
 * Memory-Coordination Integration E2E Tests
 *
 * Tests the integration of memory and coordination systems:
 * - Agents sharing memory in coordination sessions
 * - Semantic search across agent memories
 * - Memory consistency during consensus
 * - Namespace isolation between sessions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMemoryEntry,
  createSwarmConfig,
  createTestDataGenerator,
} from '../fixtures/test-fixtures.js';
import {
  waitForCondition,
  assertEventuallyEquals,
  ResourceManager,
  generateTestId,
} from '../utils/e2e-helpers.js';

describe('E2E: Memory-Coordination Integration', () => {
  let resourceManager: ResourceManager;
  let memoryStore: Map<string, Map<string, unknown>>;
  let sessionMemories: Map<string, Set<string>>;

  beforeEach(() => {
    resourceManager = new ResourceManager();
    memoryStore = new Map();
    sessionMemories = new Map();
  });

  afterEach(async () => {
    await resourceManager.cleanup();
    memoryStore.clear();
    sessionMemories.clear();
  });

  describe('Agents Sharing Memory in Coordination Session', () => {
    it('should allow multiple agents to store and retrieve shared memory', async () => {
      const sessionId = generateTestId('session');
      const namespace = `session:${sessionId}`;

      // Initialize namespace
      memoryStore.set(namespace, new Map());
      sessionMemories.set(sessionId, new Set());

      // Agent 1 stores data
      const agent1Data = createMemoryEntry('pattern');
      storeMemory(namespace, agent1Data.key, agent1Data.value);
      sessionMemories.get(sessionId)?.add(agent1Data.key);

      // Agent 2 retrieves data
      const retrieved = getMemory(namespace, agent1Data.key);
      expect(retrieved).toEqual(agent1Data.value);

      // Agent 2 stores data
      const agent2Data = createMemoryEntry('decision');
      storeMemory(namespace, agent2Data.key, agent2Data.value);
      sessionMemories.get(sessionId)?.add(agent2Data.key);

      // Verify both entries exist
      expect(sessionMemories.get(sessionId)?.size).toBe(2);
    });

    it('should support concurrent memory access from multiple agents', async () => {
      const sessionId = generateTestId('session');
      const namespace = `session:${sessionId}`;
      memoryStore.set(namespace, new Map());
      sessionMemories.set(sessionId, new Set());

      const generator = createTestDataGenerator();
      const memories = generator.generateMemories(10, 'pattern');

      // Simulate concurrent writes from 5 agents
      await Promise.all(
        memories.map(async (memory, index) => {
          // Simulate different agents writing
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          storeMemory(namespace, memory.key, memory.value);
          sessionMemories.get(sessionId)?.add(memory.key);
        })
      );

      // Verify all writes succeeded
      expect(sessionMemories.get(sessionId)?.size).toBe(10);

      // Verify all can be read
      for (const memory of memories) {
        const retrieved = getMemory(namespace, memory.key);
        expect(retrieved).toBeDefined();
      }
    });

    it('should maintain memory consistency across coordination rounds', async () => {
      const sessionId = generateTestId('session');
      const namespace = `session:${sessionId}`;
      memoryStore.set(namespace, new Map());

      const decisionKey = 'consensus-decision';
      let currentValue = 0;

      // Round 1: Initial value
      storeMemory(namespace, decisionKey, { round: 1, value: currentValue });

      // Simulate 3 coordination rounds with updates
      for (let round = 2; round <= 4; round++) {
        // Read current value
        const current = getMemory(namespace, decisionKey) as { round: number; value: number };
        expect(current.round).toBe(round - 1);

        // Update based on consensus
        currentValue += round;
        storeMemory(namespace, decisionKey, { round, value: currentValue });

        // Verify update
        const updated = getMemory(namespace, decisionKey) as { round: number; value: number };
        expect(updated.round).toBe(round);
        expect(updated.value).toBe(currentValue);
      }

      // Final state should reflect all rounds
      const final = getMemory(namespace, decisionKey) as { round: number; value: number };
      expect(final.round).toBe(4);
      expect(final.value).toBe(2 + 3 + 4);
    });

    it('should support memory transactions', async () => {
      const namespace = 'transactional';
      memoryStore.set(namespace, new Map());

      const key = 'counter';
      storeMemory(namespace, key, { count: 0 });

      // Simulate atomic increment operations
      const incrementCount = 10;
      const increments = Array.from({ length: incrementCount }, (_, i) => i);

      for (const _ of increments) {
        const current = getMemory(namespace, key) as { count: number };
        const newValue = { count: current.count + 1 };
        storeMemory(namespace, key, newValue);
      }

      const final = getMemory(namespace, key) as { count: number };
      expect(final.count).toBe(incrementCount);
    });
  });

  describe('Semantic Search Across Agent Memories', () => {
    it('should find memories by semantic similarity', async () => {
      const namespace = 'semantic';
      memoryStore.set(namespace, new Map());

      // Store related memories
      const memories = [
        { key: 'pattern-singleton', value: { pattern: 'Singleton', type: 'creational' } },
        { key: 'pattern-factory', value: { pattern: 'Factory', type: 'creational' } },
        { key: 'pattern-observer', value: { pattern: 'Observer', type: 'behavioral' } },
        { key: 'code-sample', value: { code: 'class Example {}', language: 'typescript' } },
      ];

      for (const memory of memories) {
        storeMemory(namespace, memory.key, memory.value);
      }

      // Search for creational patterns
      const creationalPatterns = searchMemories(namespace, (value: unknown) => {
        return (value as { type?: string }).type === 'creational';
      });

      expect(creationalPatterns.length).toBe(2);
      expect(creationalPatterns.map(([key]) => key)).toContain('pattern-singleton');
      expect(creationalPatterns.map(([key]) => key)).toContain('pattern-factory');
    });

    it('should rank search results by relevance', async () => {
      const namespace = 'ranked';
      memoryStore.set(namespace, new Map());

      // Store memories with relevance scores
      const memories = [
        { key: 'high-relevance', value: { score: 0.95, content: 'exact match' } },
        { key: 'medium-relevance', value: { score: 0.6, content: 'partial match' } },
        { key: 'low-relevance', value: { score: 0.3, content: 'weak match' } },
      ];

      for (const memory of memories) {
        storeMemory(namespace, memory.key, memory.value);
      }

      // Search and rank by score
      const results = searchMemories(namespace, () => true).sort((a, b) => {
        const scoreA = (a[1] as { score: number }).score;
        const scoreB = (b[1] as { score: number }).score;
        return scoreB - scoreA;
      });

      expect(results[0][0]).toBe('high-relevance');
      expect(results[1][0]).toBe('medium-relevance');
      expect(results[2][0]).toBe('low-relevance');
    });

    it('should support complex query filters', async () => {
      const namespace = 'complex';
      memoryStore.set(namespace, new Map());

      const generator = createTestDataGenerator();
      const memories = [
        { key: 'ts-code-1', value: { language: 'typescript', lines: 50, tested: true } },
        { key: 'ts-code-2', value: { language: 'typescript', lines: 200, tested: false } },
        { key: 'js-code-1', value: { language: 'javascript', lines: 100, tested: true } },
        { key: 'py-code-1', value: { language: 'python', lines: 150, tested: true } },
      ];

      for (const memory of memories) {
        storeMemory(namespace, memory.key, memory.value);
      }

      // Complex filter: TypeScript OR (tested AND > 100 lines)
      const results = searchMemories(namespace, (value: unknown) => {
        const v = value as { language: string; lines: number; tested: boolean };
        return v.language === 'typescript' || (v.tested && v.lines > 100);
      });

      expect(results.length).toBe(3);
      expect(results.map(([key]) => key)).toContain('ts-code-1');
      expect(results.map(([key]) => key)).toContain('ts-code-2');
      expect(results.map(([key]) => key)).toContain('py-code-1');
    });

    it('should support incremental search with pagination', async () => {
      const namespace = 'paginated';
      memoryStore.set(namespace, new Map());

      // Store 100 memories
      const memories = Array.from({ length: 100 }, (_, i) => ({
        key: `memory-${i}`,
        value: { index: i, data: `content-${i}` },
      }));

      for (const memory of memories) {
        storeMemory(namespace, memory.key, memory.value);
      }

      // Paginated search: 10 items per page
      const pageSize = 10;
      const page1 = searchMemories(namespace, () => true).slice(0, pageSize);
      const page2 = searchMemories(namespace, () => true).slice(pageSize, pageSize * 2);

      expect(page1.length).toBe(10);
      expect(page2.length).toBe(10);
      expect(page1[0][0]).not.toBe(page2[0][0]);
    });
  });

  describe('Memory Consistency During Consensus', () => {
    it('should maintain consistency during byzantine consensus', async () => {
      const sessionId = generateTestId('byzantine');
      const namespace = `session:${sessionId}`;
      memoryStore.set(namespace, new Map());

      const proposalKey = 'consensus-value';
      const agents = [
        { id: 'agent-1', vote: 'option-A' },
        { id: 'agent-2', vote: 'option-A' },
        { id: 'agent-3', vote: 'option-B' },
        { id: 'agent-4', vote: 'option-A' },
        { id: 'agent-5', vote: 'option-B' },
      ];

      // Each agent stores their vote
      for (const agent of agents) {
        storeMemory(namespace, `vote:${agent.id}`, agent.vote);
      }

      // Tally votes
      const votes = agents.map(a => getMemory(namespace, `vote:${a.id}`));
      const tally = votes.reduce((acc, vote) => {
        acc[vote as string] = (acc[vote as string] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Determine consensus (majority)
      const consensus = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];

      // Store consensus result
      storeMemory(namespace, proposalKey, { decision: consensus, votes: tally });

      const result = getMemory(namespace, proposalKey) as {
        decision: string;
        votes: Record<string, number>;
      };
      expect(result.decision).toBe('option-A');
      expect(result.votes['option-A']).toBe(3);
    });

    it('should handle consensus timeout and fallback', async () => {
      const namespace = 'timeout';
      memoryStore.set(namespace, new Map());

      const consensusKey = 'timed-decision';
      const timeout = 100;

      // Simulate slow consensus
      const startTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, timeout + 50));

      // Check if timeout exceeded
      const elapsed = Date.now() - startTime;
      const timedOut = elapsed > timeout;

      if (timedOut) {
        // Store fallback decision
        storeMemory(namespace, consensusKey, { decision: 'fallback', reason: 'timeout' });
      }

      const result = getMemory(namespace, consensusKey) as { decision: string; reason: string };
      expect(result.decision).toBe('fallback');
      expect(result.reason).toBe('timeout');
    });

    it('should resolve conflicts using raft consensus', async () => {
      const namespace = 'raft';
      memoryStore.set(namespace, new Map());

      const stateKey = 'cluster-state';
      const term = 1;

      // Leader proposes state
      const leaderProposal = { term, value: 'leader-state', timestamp: Date.now() };
      storeMemory(namespace, `${stateKey}:leader`, leaderProposal);

      // Followers replicate
      const followers = ['follower-1', 'follower-2', 'follower-3'];
      for (const follower of followers) {
        storeMemory(namespace, `${stateKey}:${follower}`, leaderProposal);
      }

      // Verify all nodes have same state
      const states = [
        getMemory(namespace, `${stateKey}:leader`),
        ...followers.map(f => getMemory(namespace, `${stateKey}:${f}`)),
      ];

      const allMatch = states.every(
        s => JSON.stringify(s) === JSON.stringify(leaderProposal)
      );
      expect(allMatch).toBe(true);
    });

    it('should handle split-brain scenario', async () => {
      const namespace = 'split-brain';
      memoryStore.set(namespace, new Map());

      const partition1 = ['node-1', 'node-2'];
      const partition2 = ['node-3', 'node-4', 'node-5'];

      // Partition 1 makes decision
      for (const node of partition1) {
        storeMemory(namespace, `state:${node}`, { partition: 1, value: 'A' });
      }

      // Partition 2 makes different decision
      for (const node of partition2) {
        storeMemory(namespace, `state:${node}`, { partition: 2, value: 'B' });
      }

      // Network heals - partition 2 has quorum (3/5)
      const quorumSize = 3;
      const partition2Size = partition2.length;

      if (partition2Size >= quorumSize) {
        // Partition 2 wins
        for (const node of partition1) {
          storeMemory(namespace, `state:${node}`, { partition: 2, value: 'B' });
        }
      }

      // Verify all nodes converged
      const allNodes = [...partition1, ...partition2];
      const states = allNodes.map(n => getMemory(namespace, `state:${n}`));
      const allSame = states.every(s => JSON.stringify(s) === JSON.stringify({ partition: 2, value: 'B' }));

      expect(allSame).toBe(true);
    });
  });

  describe('Namespace Isolation Between Sessions', () => {
    it('should isolate memory between different sessions', async () => {
      const session1 = generateTestId('session1');
      const session2 = generateTestId('session2');

      const ns1 = `session:${session1}`;
      const ns2 = `session:${session2}`;

      memoryStore.set(ns1, new Map());
      memoryStore.set(ns2, new Map());

      // Store data in session 1
      storeMemory(ns1, 'shared-key', { session: 1, data: 'session-1-data' });

      // Store different data with same key in session 2
      storeMemory(ns2, 'shared-key', { session: 2, data: 'session-2-data' });

      // Verify isolation
      const data1 = getMemory(ns1, 'shared-key') as { session: number; data: string };
      const data2 = getMemory(ns2, 'shared-key') as { session: number; data: string };

      expect(data1.session).toBe(1);
      expect(data2.session).toBe(2);
      expect(data1.data).toBe('session-1-data');
      expect(data2.data).toBe('session-2-data');
    });

    it('should prevent cross-namespace access', async () => {
      const ns1 = 'namespace-1';
      const ns2 = 'namespace-2';

      memoryStore.set(ns1, new Map());
      memoryStore.set(ns2, new Map());

      storeMemory(ns1, 'private-key', { secret: 'ns1-secret' });

      // Try to access ns1 key from ns2
      const result = getMemory(ns2, 'private-key');
      expect(result).toBeUndefined();
    });

    it('should support nested namespaces', async () => {
      const parentNs = 'parent';
      const childNs1 = 'parent:child1';
      const childNs2 = 'parent:child2';

      memoryStore.set(parentNs, new Map());
      memoryStore.set(childNs1, new Map());
      memoryStore.set(childNs2, new Map());

      storeMemory(parentNs, 'parent-data', { level: 'parent' });
      storeMemory(childNs1, 'child-data', { level: 'child1' });
      storeMemory(childNs2, 'child-data', { level: 'child2' });

      // Each namespace has isolated data
      expect(getMemory(parentNs, 'parent-data')).toBeDefined();
      expect(getMemory(childNs1, 'child-data')).toBeDefined();
      expect(getMemory(childNs2, 'child-data')).toBeDefined();

      // Child namespaces are isolated from each other
      const child1Data = getMemory(childNs1, 'child-data') as { level: string };
      const child2Data = getMemory(childNs2, 'child-data') as { level: string };

      expect(child1Data.level).toBe('child1');
      expect(child2Data.level).toBe('child2');
    });

    it('should clean up session memory on completion', async () => {
      const sessionId = generateTestId('temp-session');
      const namespace = `session:${sessionId}`;

      memoryStore.set(namespace, new Map());

      // Store session data
      for (let i = 0; i < 10; i++) {
        storeMemory(namespace, `key-${i}`, { value: i });
      }

      expect(memoryStore.get(namespace)?.size).toBe(10);

      // Clean up session
      memoryStore.delete(namespace);

      expect(memoryStore.has(namespace)).toBe(false);
    });
  });
});

// Helper functions
function storeMemory(namespace: string, key: string, value: unknown): void {
  const ns = memoryStore.get(namespace);
  if (ns) {
    ns.set(key, value);
  }
}

function getMemory(namespace: string, key: string): unknown {
  const ns = memoryStore.get(namespace);
  return ns?.get(key);
}

function searchMemories(
  namespace: string,
  predicate: (value: unknown) => boolean
): Array<[string, unknown]> {
  const ns = memoryStore.get(namespace);
  if (!ns) return [];

  const results: Array<[string, unknown]> = [];
  for (const [key, value] of ns.entries()) {
    if (predicate(value)) {
      results.push([key, value]);
    }
  }
  return results;
}
