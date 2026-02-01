/**
 * MCP/CLI Integration E2E Tests
 *
 * Tests the complete flow through the MCP and CLI layers:
 * - Execute MCP tools via CLI commands
 * - Round-trip: CLI -> MCP -> Domain -> Response
 * - Error propagation through stack
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createAgentTemplate,
  createTaskDefinition,
  createMemoryEntry,
} from '../fixtures/test-fixtures.js';
import {
  Agent,
  AgentId,
  TaskId,
  waitForCondition,
  ResourceManager,
  generateTestId,
} from '../utils/e2e-helpers.js';

describe('E2E: MCP/CLI Integration', () => {
  let resourceManager: ResourceManager;
  let mcpServer: MCPServer;
  let cliContext: CLIContext;

  beforeEach(async () => {
    resourceManager = new ResourceManager();
    mcpServer = await createMCPServer();
    cliContext = createCLIContext();

    resourceManager.register(async () => {
      await mcpServer.stop();
    });
  });

  afterEach(async () => {
    await resourceManager.cleanup();
  });

  describe('Execute MCP Tools via CLI Commands', () => {
    it('should execute agent spawn via CLI', async () => {
      const command = {
        tool: 'agent.spawn',
        args: {
          type: 'coder',
          name: 'test-agent',
        },
      };

      const result = await executeCLICommand(cliContext, mcpServer, command);

      expect(result.success).toBe(true);
      expect(result.data.agentId).toBeDefined();
      expect(result.data.type).toBe('coder');
    });

    it('should execute task creation via CLI', async () => {
      // First spawn an agent
      const agentResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.spawn',
        args: { type: 'coder', name: 'worker' },
      });

      // Then create a task
      const taskResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'task.create',
        args: {
          type: 'coding',
          description: 'Write a function',
          priority: 'normal',
        },
      });

      expect(taskResult.success).toBe(true);
      expect(taskResult.data.taskId).toBeDefined();
    });

    it('should execute memory operations via CLI', async () => {
      const memoryEntry = createMemoryEntry('pattern');

      // Store memory
      const storeResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'memory.store',
        args: {
          namespace: memoryEntry.namespace,
          key: memoryEntry.key,
          value: memoryEntry.value,
        },
      });

      expect(storeResult.success).toBe(true);

      // Retrieve memory
      const retrieveResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'memory.retrieve',
        args: {
          namespace: memoryEntry.namespace,
          key: memoryEntry.key,
        },
      });

      expect(retrieveResult.success).toBe(true);
      expect(retrieveResult.data.value).toEqual(memoryEntry.value);
    });

    it('should execute swarm initialization via CLI', async () => {
      const result = await executeCLICommand(cliContext, mcpServer, {
        tool: 'swarm.init',
        args: {
          topology: 'hierarchical',
          maxAgents: 10,
          strategy: 'specialized',
        },
      });

      expect(result.success).toBe(true);
      expect(result.data.swarmId).toBeDefined();
      expect(result.data.topology).toBe('hierarchical');
    });

    it('should list agents via CLI', async () => {
      // Spawn multiple agents
      for (let i = 0; i < 3; i++) {
        await executeCLICommand(cliContext, mcpServer, {
          tool: 'agent.spawn',
          args: { type: 'coder', name: `agent-${i}` },
        });
      }

      // List agents
      const result = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.list',
        args: {},
      });

      expect(result.success).toBe(true);
      expect(result.data.agents).toHaveLength(3);
    });

    it('should execute agent health check via CLI', async () => {
      const spawnResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.spawn',
        args: { type: 'coder', name: 'health-test' },
      });

      const healthResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.health',
        args: { agentId: spawnResult.data.agentId },
      });

      expect(healthResult.success).toBe(true);
      expect(healthResult.data.healthScore).toBeGreaterThan(0);
    });
  });

  describe('Round-trip: CLI -> MCP -> Domain -> Response', () => {
    it('should complete full round-trip for agent lifecycle', async () => {
      // 1. CLI: Spawn agent
      const spawnCmd = { tool: 'agent.spawn', args: { type: 'coder', name: 'roundtrip-test' } };
      const spawnResult = await executeCLICommand(cliContext, mcpServer, spawnCmd);

      expect(spawnResult.success).toBe(true);
      const agentId = spawnResult.data.agentId;

      // 2. MCP: Process command through MCP layer
      const mcpSpawnResult = await mcpServer.processToolCall('agent.spawn', spawnCmd.args);
      expect(mcpSpawnResult.agentId).toBeDefined();

      // 3. Domain: Verify agent exists in domain
      const agent = mcpServer.domainAgents.get(agentId);
      expect(agent).toBeDefined();
      expect(agent?.getStatus()).toBe('idle');

      // 4. CLI: Get agent status
      const statusCmd = { tool: 'agent.status', args: { agentId } };
      const statusResult = await executeCLICommand(cliContext, mcpServer, statusCmd);

      expect(statusResult.success).toBe(true);
      expect(statusResult.data.status).toBe('idle');
    });

    it('should complete round-trip for task assignment', async () => {
      // Setup: Spawn agent
      const agentResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.spawn',
        args: { type: 'coder', name: 'task-worker' },
      });
      const agentId = agentResult.data.agentId;

      // 1. CLI: Create and assign task
      const taskResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'task.assign',
        args: {
          agentId,
          taskType: 'coding',
          description: 'Implement feature X',
        },
      });

      expect(taskResult.success).toBe(true);
      const taskId = taskResult.data.taskId;

      // 2. Domain: Verify task assigned
      const agent = mcpServer.domainAgents.get(agentId);
      expect(agent?.getStatus()).toBe('busy');

      // 3. CLI: Complete task
      const completeResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'task.complete',
        args: { taskId, success: true },
      });

      expect(completeResult.success).toBe(true);

      // 4. Verify agent back to idle
      const finalStatus = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.status',
        args: { agentId },
      });

      expect(finalStatus.data.status).toBe('idle');
    });

    it('should propagate domain events through layers', async () => {
      const events: DomainEventRecord[] = [];

      // Subscribe to events at MCP layer
      mcpServer.onDomainEvent((event: DomainEventRecord) => {
        events.push(event);
      });

      // Execute command that generates events
      await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.spawn',
        args: { type: 'coder', name: 'event-test' },
      });

      await waitForCondition(() => events.length > 0, { timeout: 1000 });

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'AgentCreated')).toBe(true);
    });

    it('should handle concurrent CLI commands', async () => {
      const commands = Array.from({ length: 10 }, (_, i) => ({
        tool: 'agent.spawn',
        args: { type: 'coder', name: `concurrent-${i}` },
      }));

      const results = await Promise.all(
        commands.map(cmd => executeCLICommand(cliContext, mcpServer, cmd))
      );

      expect(results).toHaveLength(10);
      expect(results.every(r => r.success)).toBe(true);

      // Verify all agents created
      const listResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.list',
        args: {},
      });

      expect(listResult.data.agents.length).toBe(10);
    });
  });

  describe('Error Propagation Through Stack', () => {
    it('should propagate validation errors from domain to CLI', async () => {
      const result = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.spawn',
        args: {
          type: 'invalid-type', // Invalid agent type
          name: 'error-test',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('invalid');
    });

    it('should handle MCP server errors gracefully', async () => {
      // Simulate server error
      mcpServer.status = 'error';

      const result = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.spawn',
        args: { type: 'coder', name: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('server');
    });

    it('should handle timeout errors', async () => {
      const result = await executeCLICommand(
        cliContext,
        mcpServer,
        {
          tool: 'task.longRunning',
          args: { duration: 10000 },
        },
        { timeout: 100 }
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
    });

    it('should provide detailed error context', async () => {
      const result = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.spawn',
        args: {
          type: 'coder',
          name: '', // Invalid empty name
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.context).toBeDefined();
      expect(result.error?.context?.field).toBe('name');
    });

    it('should handle domain constraint violations', async () => {
      // Spawn agent
      const agentResult = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.spawn',
        args: { type: 'coder', name: 'busy-agent' },
      });

      const agentId = agentResult.data.agentId;

      // Assign first task
      const task1 = await executeCLICommand(cliContext, mcpServer, {
        tool: 'task.assign',
        args: { agentId, taskType: 'coding', description: 'Task 1' },
      });

      expect(task1.success).toBe(true);

      // Try to assign second task (should fail - agent busy)
      const task2 = await executeCLICommand(cliContext, mcpServer, {
        tool: 'task.assign',
        args: { agentId, taskType: 'coding', description: 'Task 2' },
      });

      expect(task2.success).toBe(false);
      expect(task2.error?.message).toContain('not available');
    });

    it('should handle network errors in MCP transport', async () => {
      // Simulate network error
      mcpServer.transport.connected = false;

      const result = await executeCLICommand(cliContext, mcpServer, {
        tool: 'agent.list',
        args: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('connection');
    });

    it('should recover from transient errors', async () => {
      let attemptCount = 0;

      mcpServer.onToolCall((tool: string) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient error');
        }
      });

      const result = await executeCLICommand(
        cliContext,
        mcpServer,
        {
          tool: 'agent.spawn',
          args: { type: 'coder', name: 'retry-test' },
        },
        { retries: 3 }
      );

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
    });
  });

  describe('Integration Performance', () => {
    it('should handle high throughput CLI commands', async () => {
      const commandCount = 100;
      const commands = Array.from({ length: commandCount }, (_, i) => ({
        tool: 'memory.store',
        args: {
          namespace: 'performance',
          key: `key-${i}`,
          value: { index: i },
        },
      }));

      const startTime = Date.now();

      await Promise.all(
        commands.map(cmd => executeCLICommand(cliContext, mcpServer, cmd))
      );

      const duration = Date.now() - startTime;
      const throughput = commandCount / (duration / 1000);

      expect(throughput).toBeGreaterThan(10); // At least 10 ops/sec
    });

    it('should maintain low latency for simple operations', async () => {
      const iterations = 10;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();

        await executeCLICommand(cliContext, mcpServer, {
          tool: 'agent.list',
          args: {},
        });

        latencies.push(Date.now() - start);
      }

      const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
      expect(avgLatency).toBeLessThan(100); // < 100ms average
    });
  });
});

// Helper types and functions

interface MCPServer {
  status: 'running' | 'error' | 'stopped';
  transport: { connected: boolean };
  domainAgents: Map<string, Agent>;
  eventHandlers: Array<(event: DomainEventRecord) => void>;
  toolCallHandlers: Array<(tool: string) => void>;
  processToolCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  onDomainEvent: (handler: (event: DomainEventRecord) => void) => void;
  onToolCall: (handler: (tool: string) => void) => void;
  stop: () => Promise<void>;
}

interface CLIContext {
  id: string;
}

interface CLICommand {
  tool: string;
  args: Record<string, unknown>;
}

interface CLIResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: {
    message: string;
    context?: Record<string, unknown>;
  };
}

interface DomainEventRecord {
  type: string;
  timestamp: Date;
  data: unknown;
}

async function createMCPServer(): Promise<MCPServer> {
  const server: MCPServer = {
    status: 'running',
    transport: { connected: true },
    domainAgents: new Map(),
    eventHandlers: [],
    toolCallHandlers: [],

    async processToolCall(tool: string, args: Record<string, unknown>) {
      // Notify handlers
      for (const handler of this.toolCallHandlers) {
        handler(tool);
      }

      if (this.status === 'error') {
        throw new Error('MCP server error');
      }

      if (!this.transport.connected) {
        throw new Error('MCP connection error');
      }

      // Handle different tools
      switch (tool) {
        case 'agent.spawn': {
          const agent = Agent.create(
            createAgentTemplate(args.type as Parameters<typeof createAgentTemplate>[0], {
              name: args.name as string,
            })
          );
          agent.spawn();
          this.domainAgents.set(agent.id.value, agent);

          this.eventHandlers.forEach(h =>
            h({ type: 'AgentCreated', timestamp: new Date(), data: agent })
          );

          return { agentId: agent.id.value, type: args.type };
        }

        case 'agent.list':
          return {
            agents: Array.from(this.domainAgents.values()).map(a => ({
              id: a.id.value,
              type: a.getType(),
              status: a.getStatus(),
            })),
          };

        case 'agent.status': {
          const agent = this.domainAgents.get(args.agentId as string);
          if (!agent) throw new Error('Agent not found');
          return { status: agent.getStatus() };
        }

        case 'agent.health': {
          const agent = this.domainAgents.get(args.agentId as string);
          if (!agent) throw new Error('Agent not found');
          const health = agent.reportHealth();
          return { healthScore: health.healthScore };
        }

        case 'task.assign': {
          const agent = this.domainAgents.get(args.agentId as string);
          if (!agent) throw new Error('Agent not found');

          const taskId = TaskId.generate();
          agent.assignTask(taskId);
          return { taskId: taskId.value };
        }

        case 'task.complete': {
          // Find agent with this task
          for (const agent of this.domainAgents.values()) {
            if (agent.getStatus() === 'busy') {
              agent.completeTask(args.success as boolean);
              return { completed: true };
            }
          }
          throw new Error('No active task found');
        }

        default:
          return {};
      }
    },

    onDomainEvent(handler: (event: DomainEventRecord) => void) {
      this.eventHandlers.push(handler);
    },

    onToolCall(handler: (tool: string) => void) {
      this.toolCallHandlers.push(handler);
    },

    async stop() {
      this.status = 'stopped';
      this.domainAgents.clear();
    },
  };

  return server;
}

function createCLIContext(): CLIContext {
  return {
    id: generateTestId('cli'),
  };
}

async function executeCLICommand(
  context: CLIContext,
  server: MCPServer,
  command: CLICommand,
  options: { timeout?: number; retries?: number } = {}
): Promise<CLIResult> {
  const { timeout = 5000, retries = 1 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Command timeout')), timeout);
      });

      const executePromise = server.processToolCall(command.tool, command.args);

      const data = await Promise.race([executePromise, timeoutPromise]);

      return {
        success: true,
        data: data as Record<string, unknown>,
      };
    } catch (error) {
      lastError = error as Error;

      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  return {
    success: false,
    error: {
      message: lastError?.message || 'Unknown error',
      context: {
        tool: command.tool,
        args: command.args,
      },
    },
  };
}
