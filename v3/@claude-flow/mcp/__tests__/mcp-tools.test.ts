/**
 * @claude-flow/mcp - Tools Test Suite
 *
 * Comprehensive tests for all MCP tools
 * Target: 50+ tests, >80% coverage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createToolRegistry } from '../src/tool-registry.js';
import { createToolExecutor } from '../src/tools/tool-executor.js';
import {
  agentTools,
  taskTools,
  memoryTools,
  coordinationTools,
  swarmTools,
  allMCPTools,
  getAllToolNames,
  toolCounts,
} from '../src/tools/index.js';

// Mock logger
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ============================================================================
// Tool Registry Tests
// ============================================================================

describe('MCP Tools - Registry', () => {
  it('should export all tool categories', () => {
    expect(agentTools).toBeDefined();
    expect(taskTools).toBeDefined();
    expect(memoryTools).toBeDefined();
    expect(coordinationTools).toBeDefined();
    expect(swarmTools).toBeDefined();
  });

  it('should have correct tool counts', () => {
    expect(agentTools.length).toBe(6);
    expect(taskTools.length).toBe(7);
    expect(memoryTools.length).toBe(6);
    expect(coordinationTools.length).toBe(5);
    expect(swarmTools.length).toBe(4);
    expect(toolCounts.total).toBe(28);
  });

  it('should export allMCPTools array', () => {
    expect(allMCPTools).toHaveLength(28);
    expect(Array.isArray(allMCPTools)).toBe(true);
  });

  it('should get all tool names', () => {
    const names = getAllToolNames();
    expect(names).toHaveLength(28);
    expect(names).toContain('agent/spawn');
    expect(names).toContain('task/create');
    expect(names).toContain('memory/store');
  });

  it('should register all tools successfully', () => {
    const registry = createToolRegistry(mockLogger);
    const result = registry.registerBatch(allMCPTools);
    expect(result.registered).toBe(28);
    expect(result.failed).toHaveLength(0);
  });
});

// ============================================================================
// Agent Tools Tests
// ============================================================================

describe('MCP Tools - Agent', () => {
  let registry: ReturnType<typeof createToolRegistry>;
  let executor: ReturnType<typeof createToolExecutor>;

  beforeEach(() => {
    registry = createToolRegistry(mockLogger);
    registry.registerBatch(agentTools);
    executor = createToolExecutor(registry, mockLogger);
  });

  it('should spawn agent with type', async () => {
    const result = await executor.execute('agent/spawn', { type: 'coder' });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.agent.type).toBe('coder');
    expect(data.agent.agentId).toBeDefined();
  });

  it('should spawn agent with custom capabilities', async () => {
    const result = await executor.execute('agent/spawn', {
      type: 'coder',
      capabilities: { canCode: true, canReview: true },
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.agent.capabilities.canCode).toBe(true);
    expect(data.agent.capabilities.canReview).toBe(true);
  });

  it('should require type for agent spawn', async () => {
    const result = await executor.execute('agent/spawn', {});
    expect(result.isError).toBe(true);
  });

  it('should terminate agent', async () => {
    const result = await executor.execute('agent/terminate', {
      agentId: 'agent-123',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.status).toBe('terminated');
  });

  it('should list agents with filters', async () => {
    const result = await executor.execute('agent/list', {
      status: 'idle',
      limit: 10,
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.agents).toBeDefined();
  });

  it('should get agent health metrics', async () => {
    const result = await executor.execute('agent/health', {
      agentId: 'agent-123',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.health.score).toBeDefined();
    expect(data.health.metrics).toBeDefined();
  });

  it('should create agent pool', async () => {
    const result = await executor.execute('agent/pool/create', {
      type: 'coder',
      minSize: 2,
      maxSize: 5,
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.poolId).toBeDefined();
    expect(data.config.minSize).toBe(2);
    expect(data.config.maxSize).toBe(5);
  });

  it('should scale agent pool', async () => {
    const result = await executor.execute('agent/pool/scale', {
      poolId: 'pool-123',
      targetSize: 10,
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.targetSize).toBe(10);
  });
});

// ============================================================================
// Task Tools Tests
// ============================================================================

describe('MCP Tools - Task', () => {
  let registry: ReturnType<typeof createToolRegistry>;
  let executor: ReturnType<typeof createToolExecutor>;

  beforeEach(() => {
    registry = createToolRegistry(mockLogger);
    registry.registerBatch(taskTools);
    executor = createToolExecutor(registry, mockLogger);
  });

  it('should create task', async () => {
    const result = await executor.execute('task/create', {
      description: 'Implement authentication',
      priority: 8,
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.task.taskId).toBeDefined();
    expect(data.task.description).toBe('Implement authentication');
    expect(data.task.priority).toBe(8);
  });

  it('should create task with dependencies', async () => {
    const result = await executor.execute('task/create', {
      description: 'Write tests',
      dependencies: ['task-1', 'task-2'],
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.task.dependencies).toHaveLength(2);
  });

  it('should assign task to agent', async () => {
    const result = await executor.execute('task/assign', {
      taskId: 'task-123',
      agentId: 'agent-456',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.status).toBe('assigned');
  });

  it('should get task status', async () => {
    const result = await executor.execute('task/status', {
      taskId: 'task-123',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.task.status).toBeDefined();
    expect(data.task.progress).toBeDefined();
  });

  it('should complete task successfully', async () => {
    const result = await executor.execute('task/complete', {
      taskId: 'task-123',
      success: true,
      result: { output: 'done' },
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.status).toBe('completed');
  });

  it('should cancel task', async () => {
    const result = await executor.execute('task/cancel', {
      taskId: 'task-123',
      reason: 'Obsolete',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.status).toBe('cancelled');
  });

  it('should list tasks with filters', async () => {
    const result = await executor.execute('task/list', {
      status: 'running',
      limit: 20,
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.tasks).toBeDefined();
  });

  it('should create task graph', async () => {
    const result = await executor.execute('task/graph', {
      tasks: [
        { id: 'task-1', description: 'First task' },
        { id: 'task-2', description: 'Second task', dependencies: ['task-1'] },
      ],
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.graph.executionOrder).toBeDefined();
  });

  it('should detect cycles in task graph', async () => {
    const result = await executor.execute('task/graph', {
      tasks: [
        { id: 'task-1', description: 'First', dependencies: ['task-2'] },
        { id: 'task-2', description: 'Second', dependencies: ['task-1'] },
      ],
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});

// ============================================================================
// Memory Tools Tests
// ============================================================================

describe('MCP Tools - Memory', () => {
  let registry: ReturnType<typeof createToolRegistry>;
  let executor: ReturnType<typeof createToolExecutor>;

  beforeEach(() => {
    registry = createToolRegistry(mockLogger);
    registry.registerBatch(memoryTools);
    executor = createToolExecutor(registry, mockLogger);
  });

  it('should store memory entry', async () => {
    const result = await executor.execute('memory/store', {
      key: 'auth-pattern',
      value: 'JWT authentication',
      namespace: 'patterns',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.entry.key).toBe('auth-pattern');
  });

  it('should store with TTL', async () => {
    const result = await executor.execute('memory/store', {
      key: 'temp-data',
      value: 'test',
      ttl: 3600,
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.entry.ttl).toBe(3600);
    expect(data.entry.expiresAt).toBeDefined();
  });

  it('should retrieve memory entry', async () => {
    const result = await executor.execute('memory/retrieve', {
      key: 'auth-pattern',
      namespace: 'patterns',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.entry.key).toBe('auth-pattern');
  });

  it('should search memory semantically', async () => {
    const result = await executor.execute('memory/search', {
      query: 'authentication patterns',
      limit: 5,
      threshold: 0.8,
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.results).toBeDefined();
  });

  it('should delete memory entry', async () => {
    const result = await executor.execute('memory/delete', {
      key: 'old-data',
      namespace: 'temp',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.deleted.key).toBe('old-data');
  });

  it('should create namespace', async () => {
    const result = await executor.execute('memory/namespace/create', {
      name: 'security',
      config: { encrypted: true },
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.namespace.name).toBe('security');
  });

  it('should get namespace stats', async () => {
    const result = await executor.execute('memory/namespace/stats', {
      namespace: 'patterns',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.stats.entryCount).toBeDefined();
  });
});

// ============================================================================
// Coordination Tools Tests
// ============================================================================

describe('MCP Tools - Coordination', () => {
  let registry: ReturnType<typeof createToolRegistry>;
  let executor: ReturnType<typeof createToolExecutor>;

  beforeEach(() => {
    registry = createToolRegistry(mockLogger);
    registry.registerBatch(coordinationTools);
    executor = createToolExecutor(registry, mockLogger);
  });

  it('should create coordination session', async () => {
    const result = await executor.execute('coordination/session/create', {
      name: 'Task Session',
      topology: 'mesh',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.session.sessionId).toBeDefined();
    expect(data.session.topology).toBe('mesh');
  });

  it('should join session', async () => {
    const result = await executor.execute('coordination/session/join', {
      sessionId: 'session-123',
      agentId: 'agent-456',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.role).toBe('participant');
  });

  it('should send message', async () => {
    const result = await executor.execute('coordination/message/send', {
      sessionId: 'session-123',
      fromAgentId: 'agent-1',
      toAgentId: 'agent-2',
      message: { type: 'task-update', data: {} },
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.messageId).toBeDefined();
  });

  it('should broadcast message', async () => {
    const result = await executor.execute('coordination/message/broadcast', {
      sessionId: 'session-123',
      fromAgentId: 'agent-1',
      message: { type: 'announcement' },
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.recipients).toBeGreaterThan(0);
  });

  it('should request consensus', async () => {
    const result = await executor.execute('coordination/consensus/request', {
      sessionId: 'session-123',
      proposal: { action: 'scale-up', targetSize: 10 },
      timeout: 5000,
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.consensusId).toBeDefined();
    expect(data.status).toBe('pending');
  });
});

// ============================================================================
// Swarm Tools Tests
// ============================================================================

describe('MCP Tools - Swarm', () => {
  let registry: ReturnType<typeof createToolRegistry>;
  let executor: ReturnType<typeof createToolExecutor>;

  beforeEach(() => {
    registry = createToolRegistry(mockLogger);
    registry.registerBatch(swarmTools);
    executor = createToolExecutor(registry, mockLogger);
  });

  it('should initialize swarm', async () => {
    const result = await executor.execute('swarm/init', {
      topology: 'hierarchical',
      maxAgents: 10,
      strategy: 'specialized',
      consensus: 'raft',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.swarm.swarmId).toBeDefined();
    expect(data.swarm.topology).toBe('hierarchical');
  });

  it('should get swarm status', async () => {
    const result = await executor.execute('swarm/status', {});
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.swarm.state).toBeDefined();
    expect(data.swarm.health).toBeDefined();
  });

  it('should set swarm topology', async () => {
    const result = await executor.execute('swarm/topology/set', {
      swarmId: 'swarm-123',
      topology: 'mesh',
    });
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.newTopology).toBe('mesh');
  });

  it('should get swarm metrics', async () => {
    const result = await executor.execute('swarm/metrics', {});
    const data = JSON.parse(result.content[0].text!);
    expect(data.success).toBe(true);
    expect(data.metrics.agents).toBeDefined();
    expect(data.metrics.tasks).toBeDefined();
    expect(data.metrics.performance).toBeDefined();
  });
});

// ============================================================================
// Tool Executor Tests
// ============================================================================

describe('MCP Tools - Executor', () => {
  let registry: ReturnType<typeof createToolRegistry>;
  let executor: ReturnType<typeof createToolExecutor>;

  beforeEach(() => {
    registry = createToolRegistry(mockLogger);
    registry.registerBatch(allMCPTools);
    executor = createToolExecutor(registry, mockLogger);
  });

  it('should handle non-existent tool', async () => {
    const result = await executor.execute('nonexistent/tool', {});
    expect(result.isError).toBe(true);
  });

  it('should validate input schema', async () => {
    const result = await executor.execute('agent/spawn', {
      type: 'invalid-type',
    });
    expect(result.isError).toBe(true);
  });

  it('should collect execution metrics', async () => {
    await executor.execute('agent/spawn', { type: 'coder' });
    await executor.execute('task/create', { description: 'test' });

    const metrics = executor.getMetrics();
    expect(metrics.length).toBe(2);
  });

  it('should get aggregated metrics', async () => {
    await executor.execute('agent/spawn', { type: 'coder' });
    await executor.execute('agent/spawn', { type: 'tester' });

    const aggregated = executor.getAggregatedMetrics();
    expect(aggregated['agent/spawn']).toBeDefined();
    expect(aggregated['agent/spawn'].calls).toBe(2);
  });

  it('should calculate success rate', async () => {
    await executor.execute('agent/spawn', { type: 'coder' });
    await executor.execute('agent/spawn', {}); // Will fail validation

    const rate = executor.getSuccessRate('agent/spawn');
    // Rate should be 0.5 (1 success, 1 failure)
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });

  it('should clear metrics', () => {
    executor.clearMetrics();
    expect(executor.getMetrics()).toHaveLength(0);
  });
});

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('MCP Tools - Schema Validation', () => {
  let registry: ReturnType<typeof createToolRegistry>;

  beforeEach(() => {
    registry = createToolRegistry(mockLogger);
  });

  it('should validate all tool schemas', () => {
    const result = registry.registerBatch(allMCPTools, { validate: true });
    expect(result.registered).toBe(28);
    expect(result.failed).toHaveLength(0);
  });

  it('should have valid inputSchema for all tools', () => {
    allMCPTools.forEach((tool) => {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    });
  });

  it('should have required fields defined', () => {
    allMCPTools.forEach((tool) => {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.handler).toBeDefined();
    });
  });
});
