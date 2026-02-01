/**
 * Neural Plugin Tests
 *
 * Comprehensive test suite for SONA, ReasoningBank, pattern recognition,
 * learning algorithms, and attention mechanisms.
 *
 * Target: 45+ tests, >80% coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createNeuralPlugin,
  createSONAController,
  createReasoningBankWrapper,
  createPatternRecognizer,
  createLearningAlgorithm,
  createExperienceBuffer,
  createAttentionManager,
} from '../index.js';
import type { PluginContext } from '../../types/index.js';
import type { Trajectory, Experience } from '../types.js';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create mock plugin context
 */
function createMockContext(): PluginContext {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    config: {},
    memory: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    },
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
  } as any;
}

/**
 * Create mock trajectory
 */
function createMockTrajectory(qualityScore: number = 0.8): Trajectory {
  const embedding = new Float32Array(768);
  for (let i = 0; i < 768; i++) {
    embedding[i] = Math.random();
  }

  return {
    trajectoryId: `traj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    context: 'Test trajectory context',
    domain: 'code',
    steps: [
      {
        stepId: 'step_0',
        timestamp: Date.now(),
        action: 'test_action',
        stateBefore: embedding,
        stateAfter: embedding,
        reward: qualityScore,
      },
    ],
    qualityScore,
    isComplete: true,
    startTime: Date.now() - 1000,
    endTime: Date.now(),
  };
}

// ============================================================================
// Plugin Tests
// ============================================================================

describe('NeuralPlugin', () => {
  let plugin: ReturnType<typeof createNeuralPlugin>;
  let context: PluginContext;

  beforeEach(() => {
    plugin = createNeuralPlugin();
    context = createMockContext();
  });

  afterEach(async () => {
    if (plugin.state === 'initialized') {
      await plugin.shutdown();
    }
  });

  describe('Lifecycle', () => {
    it('should initialize successfully', async () => {
      expect(plugin.state).toBe('uninitialized');
      await plugin.initialize(context);
      expect(plugin.state).toBe('initialized');
    });

    it('should shutdown successfully', async () => {
      await plugin.initialize(context);
      await plugin.shutdown();
      expect(plugin.state).toBe('shutdown');
    });

    it('should perform health check', async () => {
      await plugin.initialize(context);
      const health = await plugin.healthCheck();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('timestamp');
    });

    it('should register MCP tools', async () => {
      await plugin.initialize(context);
      const tools = plugin.registerMCPTools!();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some(t => t.name === 'neural_sona_control')).toBe(true);
    });

    it('should get plugin state snapshot', async () => {
      await plugin.initialize(context);
      const state = plugin.getState();
      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('uptime');
    });
  });
});

// ============================================================================
// SONA Tests
// ============================================================================

describe('SONAController', () => {
  let sona: ReturnType<typeof createSONAController>;

  beforeEach(async () => {
    sona = createSONAController('balanced');
    await sona.initialize();
  });

  afterEach(async () => {
    await sona.shutdown();
  });

  describe('Mode Switching', () => {
    it('should start in balanced mode', () => {
      const config = sona.getConfig();
      expect(config.mode).toBe('balanced');
    });

    it('should switch to real-time mode', async () => {
      await sona.setMode('real-time');
      const config = sona.getConfig();
      expect(config.mode).toBe('real-time');
    });

    it('should switch to research mode', async () => {
      await sona.setMode('research');
      const config = sona.getConfig();
      expect(config.mode).toBe('research');
    });

    it('should switch to edge mode', async () => {
      await sona.setMode('edge');
      const config = sona.getConfig();
      expect(config.mode).toBe('edge');
    });

    it('should switch to batch mode', async () => {
      await sona.setMode('batch');
      const config = sona.getConfig();
      expect(config.mode).toBe('batch');
    });
  });

  describe('Trajectory Management', () => {
    it('should begin trajectory', () => {
      const id = sona.beginTrajectory('test context', 'code');
      expect(id).toMatch(/^traj_/);
    });

    it('should record steps', () => {
      const id = sona.beginTrajectory('test', 'code');
      const embedding = new Float32Array(768);
      sona.recordStep(id, 'action1', 0.8, embedding);
      const traj = sona.getTrajectory(id);
      expect(traj?.steps.length).toBe(1);
    });

    it('should complete trajectory', () => {
      const id = sona.beginTrajectory('test', 'code');
      const embedding = new Float32Array(768);
      sona.recordStep(id, 'action1', 0.8, embedding);
      const completed = sona.completeTrajectory(id, 0.9);
      expect(completed?.isComplete).toBe(true);
      expect(completed?.qualityScore).toBe(0.9);
    });
  });

  describe('Pattern Matching', () => {
    it('should find similar patterns', async () => {
      const embedding = new Float32Array(768);
      const matches = await sona.findSimilarPatterns(embedding, 3);
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should store pattern', () => {
      const embedding = new Float32Array(768);
      const pattern = sona.storePattern({
        name: 'test_pattern',
        domain: 'code',
        embedding,
        strategy: 'test strategy',
        successRate: 0.8,
        usageCount: 1,
        qualityHistory: [0.8],
        evolutionHistory: [],
      });
      expect(pattern.patternId).toMatch(/^pat_/);
    });
  });

  describe('Learning', () => {
    it('should trigger learning', async () => {
      await expect(sona.triggerLearning('test')).resolves.not.toThrow();
    });

    it('should apply adaptations', async () => {
      const input = new Float32Array(768);
      for (let i = 0; i < 768; i++) input[i] = Math.random();
      const output = await sona.applyAdaptations(input);
      expect(output).toBeInstanceOf(Float32Array);
    });
  });

  describe('Statistics', () => {
    it('should get stats', () => {
      const stats = sona.getStats();
      expect(stats).toHaveProperty('trajectories');
      expect(stats).toHaveProperty('performance');
      expect(stats).toHaveProperty('patterns');
    });

    it('should track uptime', () => {
      const uptime = sona.getUptime();
      expect(uptime).toBeGreaterThan(0);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', () => {
      const health = sona.healthCheck();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('stats');
    });
  });
});

// ============================================================================
// ReasoningBank Tests
// ============================================================================

describe('ReasoningBankWrapper', () => {
  let bank: ReturnType<typeof createReasoningBankWrapper>;

  beforeEach(async () => {
    bank = createReasoningBankWrapper();
    await bank.initialize();
  });

  afterEach(async () => {
    await bank.shutdown();
  });

  describe('Retrieval', () => {
    it('should retrieve by content', async () => {
      const results = await bank.retrieveByContent('test query', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should retrieve by embedding', async () => {
      const embedding = new Float32Array(768);
      const results = await bank.retrieve(embedding, 3);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Judgment', () => {
    it('should judge successful trajectory', async () => {
      const traj = createMockTrajectory(0.9);
      const verdict = await bank.judge(traj);
      expect(verdict).toHaveProperty('success');
      expect(verdict).toHaveProperty('confidence');
    });

    it('should judge failed trajectory', async () => {
      const traj = createMockTrajectory(0.3);
      const verdict = await bank.judge(traj);
      expect(verdict.success).toBe(false);
    });
  });

  describe('Distillation', () => {
    it('should distill successful trajectory', async () => {
      const traj = createMockTrajectory(0.9);
      const memory = await bank.distill(traj);
      expect(memory).not.toBeNull();
      expect(memory?.memoryId).toMatch(/^mem_/);
    });

    it('should not distill low quality trajectory', async () => {
      const traj = createMockTrajectory(0.3);
      const memory = await bank.distill(traj);
      expect(memory).toBeNull();
    });

    it('should batch distill', async () => {
      const trajs = [createMockTrajectory(0.9), createMockTrajectory(0.8)];
      const memories = await bank.distillBatch(trajs);
      expect(memories.length).toBeGreaterThan(0);
    });
  });

  describe('Consolidation', () => {
    it('should consolidate memories', async () => {
      const result = await bank.consolidate();
      expect(result).toHaveProperty('removedDuplicates');
      expect(result).toHaveProperty('contradictionsDetected');
    });
  });

  describe('Pattern Management', () => {
    it('should convert memory to pattern', async () => {
      const traj = createMockTrajectory(0.9);
      const memory = await bank.distill(traj);
      if (memory) {
        const pattern = bank.memoryToPattern(memory);
        expect(pattern.patternId).toMatch(/^pat_/);
      }
    });

    it('should get patterns', () => {
      const patterns = bank.getPatterns();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should get stats', () => {
      const stats = bank.getStats();
      expect(stats).toHaveProperty('trajectoryCount');
      expect(stats).toHaveProperty('memoryCount');
    });

    it('should get detailed metrics', () => {
      const metrics = bank.getDetailedMetrics();
      expect(metrics).toHaveProperty('routing');
      expect(metrics).toHaveProperty('edits');
    });
  });

  describe('Health Check', () => {
    it('should return health status', () => {
      const health = bank.healthCheck();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('stats');
    });
  });
});

// ============================================================================
// Pattern Recognition Tests
// ============================================================================

describe('PatternRecognizer', () => {
  let recognizer: ReturnType<typeof createPatternRecognizer>;

  beforeEach(() => {
    recognizer = createPatternRecognizer();
  });

  describe('Pattern Detection', () => {
    it('should detect code pattern', () => {
      const embedding = new Float32Array(768);
      const pattern = recognizer.detectCodePattern('function test() {}', embedding);
      expect(pattern.type).toBe('code');
      expect(pattern.confidence).toBeGreaterThan(0);
    });

    it('should detect workflow pattern', () => {
      const embedding = new Float32Array(768);
      const pattern = recognizer.detectWorkflowPattern('step1 -> step2 -> step3', embedding);
      expect(pattern.type).toBe('workflow');
    });

    it('should detect error pattern', () => {
      const embedding = new Float32Array(768);
      const pattern = recognizer.detectErrorPattern('Error: test failed', embedding);
      expect(pattern.type).toBe('error');
    });

    it('should detect success pattern', () => {
      const embedding = new Float32Array(768);
      const pattern = recognizer.detectSuccessPattern('Successfully completed task', embedding);
      expect(pattern.type).toBe('success');
    });

    it('should auto-detect pattern type', () => {
      const embedding = new Float32Array(768);
      const pattern = recognizer.detectPattern('Error occurred', embedding);
      expect(pattern.type).toBe('error');
    });
  });

  describe('Pattern Matching', () => {
    it('should find matches', () => {
      const embedding = new Float32Array(768);
      const matches = recognizer.findMatches(embedding, 3);
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should find best match', () => {
      const embedding = new Float32Array(768);
      const match = recognizer.findBestMatch(embedding);
      // May be null if no patterns exist
      expect(match === null || typeof match === 'object').toBe(true);
    });
  });

  describe('Pattern Similarity', () => {
    it('should compute cosine similarity', () => {
      const emb1 = new Float32Array(768);
      const emb2 = new Float32Array(768);
      const p1 = recognizer.detectCodePattern('test1', emb1);
      const p2 = recognizer.detectCodePattern('test2', emb2);
      const sim = recognizer.cosineSimilarity(p1, p2);
      expect(sim.similarity).toBeGreaterThanOrEqual(0);
      expect(sim.similarity).toBeLessThanOrEqual(1);
    });

    it('should compute Jaccard similarity', () => {
      const emb = new Float32Array(768);
      const p1 = recognizer.detectCodePattern('hello world', emb);
      const p2 = recognizer.detectCodePattern('hello test', emb);
      const sim = recognizer.jaccardSimilarity(p1, p2);
      expect(sim.method).toBe('jaccard');
    });

    it('should compute edit distance similarity', () => {
      const emb = new Float32Array(768);
      const p1 = recognizer.detectCodePattern('test', emb);
      const p2 = recognizer.detectCodePattern('testing', emb);
      const sim = recognizer.editDistanceSimilarity(p1, p2);
      expect(sim.method).toBe('edit-distance');
    });
  });

  describe('Pattern Extraction', () => {
    it('should extract pattern from trajectory', () => {
      const traj = createMockTrajectory(0.9);
      const pattern = recognizer.extractPattern(traj);
      expect(pattern).not.toBeNull();
    });

    it('should batch extract patterns', () => {
      const trajs = [createMockTrajectory(0.9), createMockTrajectory(0.8)];
      const patterns = recognizer.extractPatternsBatch(trajs);
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should get stats', () => {
      const stats = recognizer.getStats();
      expect(stats).toHaveProperty('totalPatterns');
      expect(stats).toHaveProperty('detectedPatterns');
    });
  });
});

// ============================================================================
// Learning Algorithms Tests
// ============================================================================

describe('Learning Algorithms', () => {
  describe('Q-Learning', () => {
    let algo: ReturnType<typeof createLearningAlgorithm>;

    beforeEach(() => {
      algo = createLearningAlgorithm('q-learning');
    });

    it('should create Q-learning algorithm', () => {
      expect(algo.name).toBe('q-learning');
    });

    it('should update from trajectory', async () => {
      const traj = createMockTrajectory(0.8);
      const result = await algo.update(traj);
      expect(result).toHaveProperty('tdError');
    });

    it('should get action', () => {
      const state = new Float32Array(768);
      const action = algo.getAction(state);
      expect(typeof action).toBe('number');
    });

    it('should get stats', () => {
      const stats = algo.getStats();
      expect(stats).toHaveProperty('updateCount');
    });

    it('should reset', () => {
      algo.reset();
      const stats = algo.getStats();
      expect(stats.updateCount).toBe(0);
    });
  });

  describe('SARSA', () => {
    let algo: ReturnType<typeof createLearningAlgorithm>;

    beforeEach(() => {
      algo = createLearningAlgorithm('sarsa');
    });

    it('should create SARSA algorithm', () => {
      expect(algo.name).toBe('sarsa');
    });

    it('should update from trajectory', async () => {
      const traj = createMockTrajectory(0.8);
      const result = await algo.update(traj);
      expect(result).toHaveProperty('tdError');
    });
  });
});

// ============================================================================
// Experience Buffer Tests
// ============================================================================

describe('ExperienceBuffer', () => {
  let buffer: ReturnType<typeof createExperienceBuffer>;

  beforeEach(() => {
    buffer = createExperienceBuffer(100);
  });

  it('should add experience', () => {
    const exp: Experience = {
      state: new Float32Array(768),
      action: 0,
      reward: 0.8,
      nextState: new Float32Array(768),
      done: false,
      timestamp: Date.now(),
    };
    buffer.add(exp);
    expect(buffer.size()).toBe(1);
  });

  it('should sample batch', () => {
    for (let i = 0; i < 10; i++) {
      buffer.add({
        state: new Float32Array(768),
        action: i,
        reward: Math.random(),
        nextState: new Float32Array(768),
        done: false,
        timestamp: Date.now(),
      });
    }
    const batch = buffer.sample(5);
    expect(batch.length).toBe(5);
  });

  it('should clear buffer', () => {
    buffer.add({
      state: new Float32Array(768),
      action: 0,
      reward: 0.8,
      nextState: new Float32Array(768),
      done: false,
      timestamp: Date.now(),
    });
    buffer.clear();
    expect(buffer.size()).toBe(0);
  });

  it('should respect capacity', () => {
    for (let i = 0; i < 150; i++) {
      buffer.add({
        state: new Float32Array(768),
        action: i,
        reward: Math.random(),
        nextState: new Float32Array(768),
        done: false,
        timestamp: Date.now(),
      });
    }
    expect(buffer.size()).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// Attention Manager Tests
// ============================================================================

describe('AttentionManager', () => {
  let attention: ReturnType<typeof createAttentionManager>;

  beforeEach(() => {
    attention = createAttentionManager();
  });

  describe('Context Management', () => {
    it('should add context', () => {
      const embedding = new Float32Array(768);
      attention.addContext('test1', embedding, 0.8);
      const stats = attention.getStats();
      expect(stats.totalItems).toBe(1);
    });

    it('should remove context', () => {
      const embedding = new Float32Array(768);
      attention.addContext('test1', embedding);
      attention.removeContext('test1');
      const stats = attention.getStats();
      expect(stats.totalItems).toBe(0);
    });

    it('should clear context', () => {
      const embedding = new Float32Array(768);
      attention.addContext('test1', embedding);
      attention.addContext('test2', embedding);
      attention.clearContext();
      const stats = attention.getStats();
      expect(stats.totalItems).toBe(0);
    });
  });

  describe('Attention Computation', () => {
    it('should compute attention weights', () => {
      const emb1 = new Float32Array(768);
      const emb2 = new Float32Array(768);
      attention.addContext('test1', emb1);
      attention.addContext('test2', emb2);

      const query = new Float32Array(768);
      const weights = attention.computeAttention(query, 2);
      expect(weights).toHaveProperty('items');
      expect(weights).toHaveProperty('total');
    });

    it('should compute context-aware attention', () => {
      const emb1 = new Float32Array(768);
      attention.addContext('test1', emb1, 0.9);

      const query = new Float32Array(768);
      const weights = attention.computeContextAwareAttention(query);
      expect(weights.items.length).toBeGreaterThan(0);
    });
  });

  describe('Focus Management', () => {
    it('should set focus', () => {
      const embedding = new Float32Array(768);
      attention.addContext('test1', embedding);
      attention.setFocus(['test1']);
      const focus = attention.getFocus();
      expect(focus).toContain('test1');
    });

    it('should clear focus', () => {
      attention.setFocus(['test1']);
      attention.clearFocus();
      const focus = attention.getFocus();
      expect(focus.length).toBe(0);
    });
  });

  describe('Retrieval', () => {
    it('should retrieve items with attention', () => {
      const embedding = new Float32Array(768);
      attention.addContext('test1', embedding);
      const query = new Float32Array(768);
      const items = attention.retrieve(query, 5);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should get stats', () => {
      const stats = attention.getStats();
      expect(stats).toHaveProperty('totalItems');
      expect(stats).toHaveProperty('focusedItems');
    });
  });
});
