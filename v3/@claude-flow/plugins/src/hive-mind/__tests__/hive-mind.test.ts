/**
 * HiveMind Plugin Comprehensive Tests
 * Tests for queen leadership, worker coordination, Byzantine consensus, collective intelligence, and topology
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createQueenAgent, type QueenAgent } from '../queen.js';
import { createWorkerAgent, type WorkerAgent } from '../worker.js';
import { createByzantineFaultTolerant, type ByzantineFaultTolerant } from '../byzantine-consensus.js';
import { createTopologyManager, type TopologyManager } from '../topology.js';
import {
  CollectiveMemoryStore,
  ConsensusBuilder,
  KnowledgeAggregator,
  PatternEmergence,
} from '../collective-intelligence.js';
import { createHiveMindPlugin } from '../plugin.js';
import type { PluginContext, IEventBus, ILogger, ServiceContainer } from '../../types/index.js';

// ============================================================================
// Test Utilities
// ============================================================================

function createMockContext(): PluginContext {
  const eventHandlers: Map<string, Set<(data: unknown) => void>> = new Map();

  const eventBus: IEventBus = {
    emit: (event: string, data?: unknown) => {
      const handlers = eventHandlers.get(event);
      if (handlers) {
        handlers.forEach(handler => handler(data));
      }
    },
    on: (event: string, handler: (data?: unknown) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
      }
      eventHandlers.get(event)!.add(handler);
      return () => eventHandlers.get(event)?.delete(handler);
    },
    off: (event: string, handler: (data?: unknown) => void) => {
      eventHandlers.get(event)?.delete(handler);
    },
    once: (event: string, handler: (data?: unknown) => void) => {
      const wrappedHandler = (data?: unknown) => {
        handler(data);
        eventBus.off(event, wrappedHandler);
      };
      return eventBus.on(event, wrappedHandler);
    },
  };

  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };

  const services: ServiceContainer = {
    data: new Map(),
    get: function<T>(key: string): T | undefined {
      return this.data.get(key) as T | undefined;
    },
    set: function<T>(key: string, value: T): void {
      this.data.set(key, value);
    },
    has: function(key: string): boolean {
      return this.data.has(key);
    },
    delete: function(key: string): boolean {
      return this.data.delete(key);
    },
  };

  return {
    config: {
      enabled: true,
      priority: 50,
      settings: {},
    },
    eventBus,
    logger,
    services,
    coreVersion: '3.0.0',
    dataDir: '/tmp/test',
  };
}

// ============================================================================
// Queen Leadership Tests
// ============================================================================

describe('Queen Leadership', () => {
  let queen: QueenAgent;

  beforeEach(() => {
    queen = createQueenAgent({
      id: 'queen_test',
      maxWorkers: 10,
      heartbeatIntervalMs: 1000,
      workerTimeoutMs: 5000,
      electionTimeoutMs: 2000,
      consensusTimeoutMs: 10000,
      faultTolerance: 1,
    });
  });

  afterEach(async () => {
    await queen.shutdown();
  });

  it('should initialize queen successfully', async () => {
    await queen.initialize();
    expect(queen.getTerm()).toBeGreaterThan(0);
  });

  it('should become leader after election', async () => {
    await queen.initialize();
    // After initialization, queen should attempt to become leader
    expect(queen.isLeader()).toBe(true);
  });

  it('should accept votes during election', async () => {
    let voteReceived = false;

    queen.on('vote.received', () => {
      voteReceived = true;
    });

    await queen.receiveVote('worker_1', true);
    expect(voteReceived).toBe(true);
  });

  it('should register workers', async () => {
    await queen.initialize();
    await queen.registerWorker('worker_1', ['code', 'test']);

    expect(queen.getWorkerCount()).toBe(1);
    expect(queen.getWorkerStatus('worker_1')).toBe('idle');
  });

  it('should unregister workers', async () => {
    await queen.initialize();
    await queen.registerWorker('worker_1', ['code']);
    await queen.unregisterWorker('worker_1');

    expect(queen.getWorkerCount()).toBe(0);
  });

  it('should receive heartbeat from workers', async () => {
    await queen.initialize();
    await queen.registerWorker('worker_1', ['code']);

    await queen.receiveHeartbeat('worker_1', {
      score: 0.9,
      cpuUsage: 0.3,
      memoryUsage: 0.4,
      errorRate: 0.0,
      responseTime: 100,
    });

    expect(queen.getWorkerStatus('worker_1')).toBe('idle');
  });
});

// ============================================================================
// Worker Coordination Tests
// ============================================================================

describe('Worker Coordination', () => {
  let worker: WorkerAgent;

  beforeEach(() => {
    worker = createWorkerAgent({
      id: 'worker_test',
      capabilities: ['code', 'test', 'review'],
      heartbeatIntervalMs: 1000,
      maxConcurrentTasks: 5,
      degradationThreshold: 0.5,
    });
  });

  afterEach(async () => {
    await worker.shutdown();
  });

  it('should initialize worker successfully', async () => {
    await worker.initialize();
    expect(worker.getStatus()).toBe('idle');
  });

  it('should connect to queen', async () => {
    let connected = false;

    worker.on('queen.connected', () => {
      connected = true;
    });

    await worker.initialize();
    await worker.connectToQueen('queen_1');

    expect(connected).toBe(true);
  });

  it('should receive and queue directives', async () => {
    let taskQueued = false;

    worker.on('task.queued', () => {
      taskQueued = true;
    });

    await worker.initialize();
    await worker.connectToQueen('queen_1');

    await worker.receiveDirective({
      id: 'msg_1',
      type: 'directive',
      from: 'queen_1',
      to: 'worker_test',
      payload: {
        id: 'dir_1',
        type: 'task',
        priority: 50,
        payload: { action: 'code' },
      },
      timestamp: new Date(),
      priority: 50,
      requiresAck: true,
    });

    expect(taskQueued).toBe(true);
    expect(worker.getQueueSize()).toBeGreaterThan(0);
  });

  it('should report health status', async () => {
    await worker.initialize();
    const health = worker.getHealth();

    expect(health).toHaveProperty('score');
    expect(health).toHaveProperty('cpuUsage');
    expect(health).toHaveProperty('memoryUsage');
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(1);
  });

  it('should handle graceful degradation', async () => {
    await worker.initialize();
    await worker.connectToQueen('queen_1');
    await worker.handleQueenUnavailable();

    expect(worker.getStatus()).toBe('degraded');
  });

  it('should reconnect to queen', async () => {
    await worker.initialize();
    await worker.connectToQueen('queen_1');
    await worker.handleQueenUnavailable();
    await worker.attemptQueenReconnection('queen_1');

    // Status should recover if health is good
    const status = worker.getStatus();
    expect(['idle', 'busy', 'degraded']).toContain(status);
  });

  it('should expose capabilities', async () => {
    const capabilities = worker.getCapabilities();
    expect(capabilities).toEqual(['code', 'test', 'review']);
  });
});

// ============================================================================
// Byzantine Consensus Tests
// ============================================================================

describe('Byzantine Consensus', () => {
  let primary: ByzantineFaultTolerant;
  let replicas: ByzantineFaultTolerant[];

  beforeEach(async () => {
    // Create 4 nodes (f=1, so we can tolerate 1 faulty node)
    primary = createByzantineFaultTolerant({
      nodeId: 'node_0',
      maxFaultyNodes: 1,
      timeoutMs: 5000,
      viewChangeTimeoutMs: 3000,
    });

    replicas = [
      createByzantineFaultTolerant({
        nodeId: 'node_1',
        maxFaultyNodes: 1,
        timeoutMs: 5000,
        viewChangeTimeoutMs: 3000,
      }),
      createByzantineFaultTolerant({
        nodeId: 'node_2',
        maxFaultyNodes: 1,
        timeoutMs: 5000,
        viewChangeTimeoutMs: 3000,
      }),
      createByzantineFaultTolerant({
        nodeId: 'node_3',
        maxFaultyNodes: 1,
        timeoutMs: 5000,
        viewChangeTimeoutMs: 3000,
      }),
    ];

    // Initialize all nodes
    await primary.initialize(['node_1', 'node_2', 'node_3']);
    for (const replica of replicas) {
      await replica.initialize(['node_0', 'node_1', 'node_2', 'node_3'].filter(id => id !== replica['nodeId']));
    }
  });

  afterEach(async () => {
    await primary.shutdown();
    for (const replica of replicas) {
      await replica.shutdown();
    }
  });

  it('should initialize with correct node count', () => {
    expect(primary.getTotalNodes()).toBe(4);
    expect(primary.getMaxFaultyNodes()).toBe(1);
  });

  it('should tolerate 1 faulty node', () => {
    expect(primary.canTolerateFaults(1)).toBe(true);
    expect(primary.canTolerateFaults(2)).toBe(false);
  });

  it('should elect primary on initialization', () => {
    const primaryId = primary.getPrimaryId();
    expect(['node_0', 'node_1', 'node_2', 'node_3']).toContain(primaryId);
  });

  it('should propose value as primary', async () => {
    if (primary.isPrimaryNode()) {
      const proposalId = await primary.propose({ decision: 'approve' });
      expect(proposalId).toContain('bft_');
    }
  });

  it('should handle Byzantine messages', async () => {
    if (primary.isPrimaryNode()) {
      const proposalId = await primary.propose({ decision: 'approve' });

      // Simulate messages from replicas
      for (let i = 0; i < replicas.length; i++) {
        await primary.handleMessage({
          type: 'prepare',
          viewNumber: primary.getViewNumber(),
          sequenceNumber: primary.getSequenceNumber(),
          digest: '',
          senderId: `node_${i + 1}`,
          timestamp: new Date(),
        });
      }
    }
  });

  it('should track proposal status', async () => {
    if (primary.isPrimaryNode()) {
      const proposalId = await primary.propose({ decision: 'approve' });
      const proposal = primary.getProposal(proposalId);

      expect(proposal).toBeDefined();
      expect(proposal?.status).toBe('pending');
    }
  });

  it('should increment view number on view change', async () => {
    const initialView = primary.getViewNumber();
    await primary.initiateViewChange('test');
    expect(primary.getViewNumber()).toBe(initialView + 1);
  });
});

// ============================================================================
// Collective Intelligence Tests
// ============================================================================

describe('Collective Memory', () => {
  let memory: CollectiveMemoryStore;

  beforeEach(() => {
    memory = new CollectiveMemoryStore('test');
  });

  it('should store and retrieve entries', async () => {
    await memory.store('key1', { data: 'value1' }, 'agent1', 0.9);
    const entry = await memory.retrieve('key1');

    expect(entry).toBeDefined();
    expect(entry?.value).toEqual({ data: 'value1' });
    expect(entry?.confidence).toBe(0.9);
    expect(entry?.contributors).toContain('agent1');
  });

  it('should search entries', async () => {
    await memory.store('key1', { topic: 'testing' }, 'agent1', 0.9);
    await memory.store('key2', { topic: 'development' }, 'agent2', 0.8);

    const results = await memory.search('testing');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].key).toBe('key1');
  });

  it('should detect patterns', async () => {
    const patternId = await memory.detectPattern(
      'repeated-behavior',
      'Test pattern',
      'detector1'
    );

    expect(patternId).toContain('pattern_');
  });

  it('should track pattern occurrences', async () => {
    const patternId = await memory.detectPattern(
      'test-pattern',
      'Test',
      'detector1'
    );

    await memory.recordPatternOccurrence(patternId, 'detector2');

    const patterns = await memory.getPatterns();
    const pattern = patterns.find(p => p.id === patternId);

    expect(pattern?.occurrences).toBe(2);
    expect(pattern?.detectedBy).toContain('detector1');
    expect(pattern?.detectedBy).toContain('detector2');
  });

  it('should provide memory stats', () => {
    const stats = memory.getStats();

    expect(stats).toHaveProperty('totalEntries');
    expect(stats).toHaveProperty('avgConfidence');
    expect(stats).toHaveProperty('uniqueContributors');
    expect(stats).toHaveProperty('totalPatterns');
  });
});

describe('Consensus Builder', () => {
  let builder: ConsensusBuilder;

  beforeEach(() => {
    builder = new ConsensusBuilder();
  });

  it('should propose decision', async () => {
    const decisionId = await builder.proposeDecision(
      'Should we proceed?',
      'proposer1',
      'majority',
      5000
    );

    expect(decisionId).toContain('decision_');
  });

  it('should accept votes', async () => {
    const decisionId = await builder.proposeDecision(
      'Test decision',
      'proposer1',
      'majority',
      5000
    );

    await builder.vote(decisionId, {
      voterId: 'voter1',
      choice: 'yes',
      confidence: 0.9,
      timestamp: new Date(),
    });

    const decision = await builder.getDecision(decisionId);
    expect(decision?.votes.size).toBe(1);
  });

  it('should calculate majority consensus', async () => {
    const decisionId = await builder.proposeDecision(
      'Test decision',
      'proposer1',
      'majority',
      100
    );

    await builder.vote(decisionId, {
      voterId: 'voter1',
      choice: 'yes',
      confidence: 1.0,
      timestamp: new Date(),
    });

    await builder.vote(decisionId, {
      voterId: 'voter2',
      choice: 'yes',
      confidence: 1.0,
      timestamp: new Date(),
    });

    await builder.vote(decisionId, {
      voterId: 'voter3',
      choice: 'no',
      confidence: 1.0,
      timestamp: new Date(),
    });

    // Wait for decision to finalize
    await new Promise(resolve => setTimeout(resolve, 150));

    const decision = await builder.getDecision(decisionId);
    expect(decision?.result?.consensus).toBe(true);
    expect(decision?.result?.approvalRate).toBeGreaterThan(0.5);
  });
});

describe('Knowledge Aggregator', () => {
  let aggregator: KnowledgeAggregator;

  beforeEach(() => {
    aggregator = new KnowledgeAggregator();
  });

  it('should aggregate insights', async () => {
    const result = await aggregator.aggregateInsights([
      { workerId: 'w1', data: { value: 'a' }, confidence: 0.9 },
      { workerId: 'w2', data: { value: 'b' }, confidence: 0.8 },
      { workerId: 'w3', data: { value: 'c' }, confidence: 0.7 },
    ]);

    expect(result.confidence).toBeGreaterThan(0);
    expect(result.contributors).toHaveLength(3);
  });

  it('should combine results with conflict resolution', async () => {
    const result = await aggregator.combineResults([
      { workerId: 'w1', result: 'yes', confidence: 0.9 },
      { workerId: 'w2', result: 'yes', confidence: 0.8 },
      { workerId: 'w3', result: 'no', confidence: 0.5 },
    ]);

    expect(result.final).toBe('yes');
    expect(result.agreements).toBe(2);
    expect(result.conflicts).toBe(1);
  });
});

describe('Pattern Emergence', () => {
  let detector: PatternEmergence;

  beforeEach(() => {
    detector = new PatternEmergence();
  });

  it('should observe behaviors', async () => {
    await detector.observe('action-type', { action: 'test' }, 'source1');

    const stats = detector.getPatternStats();
    expect(stats.totalObservations).toBe(1);
  });

  it('should detect repeating patterns', async () => {
    let patternDetected = false;

    detector.on('pattern.emerged', () => {
      patternDetected = true;
    });

    // Observe same behavior multiple times
    for (let i = 0; i < 5; i++) {
      await detector.observe('test-behavior', { data: 'same' }, `source${i}`);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(patternDetected).toBe(true);
  });
});

// ============================================================================
// Topology Tests
// ============================================================================

describe('Topology Manager', () => {
  let topology: TopologyManager;

  beforeEach(async () => {
    topology = createTopologyManager({
      type: 'hierarchical',
      maxConnectionsPerWorker: 5,
    });

    await topology.initialize();
  });

  afterEach(async () => {
    await topology.shutdown();
  });

  it('should initialize with correct topology', () => {
    expect(topology.getTopologyType()).toBe('hierarchical');
  });

  it('should add nodes', async () => {
    await topology.addNode('queen_1', 'queen');
    expect(topology.getNodeCount()).toBe(1);
    expect(topology.getQueenId()).toBe('queen_1');
  });

  it('should create hierarchical connections', async () => {
    await topology.addNode('queen_1', 'queen');
    await topology.addNode('worker_1', 'worker');
    await topology.addNode('worker_2', 'worker');

    const queenConnections = topology.getNodeConnections('queen_1');
    expect(queenConnections).toContain('worker_1');
    expect(queenConnections).toContain('worker_2');
  });

  it('should detect partitions', async () => {
    await topology.addNode('queen_1', 'queen');
    await topology.addNode('worker_1', 'worker');
    await topology.addNode('worker_2', 'worker');

    const partitions = await topology.detectPartitions();
    expect(partitions.length).toBe(1); // All connected
  });

  it('should reconfigure topology', async () => {
    await topology.addNode('queen_1', 'queen');
    await topology.addNode('worker_1', 'worker');

    await topology.reconfigureTopology('mesh');
    expect(topology.getTopologyType()).toBe('mesh');
  });

  it('should check node connectivity', async () => {
    await topology.addNode('queen_1', 'queen');
    await topology.addNode('worker_1', 'worker');

    expect(topology.isConnected('queen_1', 'worker_1')).toBe(true);
  });
});

// ============================================================================
// Plugin Lifecycle Tests
// ============================================================================

describe('HiveMind Plugin', () => {
  let plugin: ReturnType<typeof createHiveMindPlugin>;
  let context: PluginContext;

  beforeEach(() => {
    plugin = createHiveMindPlugin();
    context = createMockContext();
  });

  afterEach(async () => {
    if (plugin.state !== 'shutdown') {
      await plugin.shutdown();
    }
  });

  it('should initialize plugin', async () => {
    await plugin.initialize(context);
    expect(plugin.state).toBe('initialized');
  });

  it('should register agent types', () => {
    const agentTypes = plugin.registerAgentTypes?.() || [];

    expect(agentTypes.length).toBeGreaterThan(0);
    expect(agentTypes.some(a => a.type === 'hive-queen')).toBe(true);
    expect(agentTypes.some(a => a.type === 'hive-worker')).toBe(true);
  });

  it('should register MCP tools', () => {
    const tools = plugin.registerMCPTools?.() || [];

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(t => t.name === 'hive_mind_init')).toBe(true);
    expect(tools.some(t => t.name === 'hive_mind_spawn_worker')).toBe(true);
    expect(tools.some(t => t.name === 'hive_mind_issue_directive')).toBe(true);
  });

  it('should perform health check', async () => {
    await plugin.initialize(context);
    const health = await plugin.healthCheck?.();

    expect(health).toBeDefined();
    expect(health?.status).toBeDefined();
    expect(health?.checks).toBeDefined();
  });

  it('should shutdown gracefully', async () => {
    await plugin.initialize(context);
    await plugin.shutdown();

    expect(plugin.state).toBe('shutdown');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration: Full Swarm Workflow', () => {
  let queen: QueenAgent;
  let workers: WorkerAgent[];
  let topology: TopologyManager;

  beforeEach(async () => {
    topology = createTopologyManager({
      type: 'hierarchical-mesh',
      maxConnectionsPerWorker: 3,
    });

    await topology.initialize();

    queen = createQueenAgent({
      id: 'queen_1',
      maxWorkers: 5,
      heartbeatIntervalMs: 500,
      workerTimeoutMs: 2000,
      electionTimeoutMs: 1000,
      consensusTimeoutMs: 5000,
      faultTolerance: 1,
    });

    await queen.initialize();
    await topology.addNode('queen_1', 'queen');

    workers = [];
    for (let i = 1; i <= 3; i++) {
      const worker = createWorkerAgent({
        id: `worker_${i}`,
        capabilities: ['code', 'test'],
        heartbeatIntervalMs: 500,
        maxConcurrentTasks: 3,
        degradationThreshold: 0.5,
      });

      await worker.initialize();
      await worker.connectToQueen('queen_1');
      await queen.registerWorker(`worker_${i}`, ['code', 'test']);
      await topology.addNode(`worker_${i}`, 'worker');

      workers.push(worker);
    }
  });

  afterEach(async () => {
    await queen.shutdown();
    for (const worker of workers) {
      await worker.shutdown();
    }
    await topology.shutdown();
  });

  it('should coordinate full swarm', async () => {
    expect(queen.isLeader()).toBe(true);
    expect(queen.getWorkerCount()).toBe(3);
    expect(topology.getNodeCount()).toBe(4); // 1 queen + 3 workers
  });

  it('should issue and track directives', async () => {
    const directiveId = await queen.issueDirective(
      'task',
      { action: 'test-task' },
      ['code'],
      70
    );

    expect(directiveId).toContain('dir_');
    expect(queen.getActiveDirectiveCount()).toBeGreaterThan(0);
  });

  it('should detect topology partitions', async () => {
    const partitions = await topology.detectPartitions();
    expect(partitions.length).toBe(1); // Fully connected
  });
});
