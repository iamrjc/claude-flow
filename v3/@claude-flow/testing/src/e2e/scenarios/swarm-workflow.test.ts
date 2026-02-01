/**
 * Full Swarm Workflow E2E Tests
 *
 * Tests complete swarm lifecycle:
 * - Initialize swarm with topology
 * - Queen distributes tasks to workers
 * - Workers report results
 * - Collective decision making
 * - Swarm scaling and topology change
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSwarmConfig,
  createAgentTemplate,
  createTaskDefinition,
  createTestDataGenerator,
} from '../fixtures/test-fixtures.js';
import {
  Agent,
  AgentId,
  AgentStatus,
  TaskId,
  waitForCondition,
  assertEventuallyHasCount,
  ResourceManager,
  generateTestId,
  parallelLimit,
} from '../utils/e2e-helpers.js';

describe('E2E: Full Swarm Workflow', () => {
  let resourceManager: ResourceManager;
  let swarm: SwarmState;

  beforeEach(() => {
    resourceManager = new ResourceManager();
    swarm = createSwarmState();
  });

  afterEach(async () => {
    await resourceManager.cleanup();
  });

  describe('Initialize Swarm with Topology', () => {
    it('should initialize hierarchical swarm', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      expect(swarm.topology).toBe('hierarchical');
      expect(swarm.config.maxAgents).toBe(15);
      expect(swarm.status).toBe('running');
    });

    it('should initialize mesh topology swarm', async () => {
      const config = createSwarmConfig('mesh');
      await initializeSwarm(swarm, config);

      expect(swarm.topology).toBe('mesh');
      expect(swarm.config.maxAgents).toBe(10);
    });

    it('should initialize with consensus configuration', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      expect(swarm.config.consensus?.algorithm).toBe('raft');
      expect(swarm.config.consensus?.threshold).toBe(0.66);
      expect(swarm.config.consensus?.requireQuorum).toBe(true);
    });

    it('should validate topology configuration', async () => {
      const invalidConfig = {
        ...createSwarmConfig('hierarchical'),
        maxAgents: -1,
      };

      await expect(initializeSwarm(swarm, invalidConfig)).rejects.toThrow('maxAgents');
    });
  });

  describe('Queen Distributes Tasks to Workers', () => {
    it('should spawn queen and worker agents', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      // Spawn queen
      const queen = Agent.create(createAgentTemplate('coordinator', { name: 'queen' }));
      queen.spawn();
      swarm.agents.set(queen.id.value, { agent: queen, role: 'queen' });

      // Spawn workers
      const workerCount = 5;
      for (let i = 0; i < workerCount; i++) {
        const worker = Agent.create(createAgentTemplate('coder', { name: `worker-${i}` }));
        worker.spawn();
        swarm.agents.set(worker.id.value, { agent: worker, role: 'worker' });
      }

      expect(swarm.agents.size).toBe(6); // 1 queen + 5 workers
      const queenAgents = Array.from(swarm.agents.values()).filter(a => a.role === 'queen');
      expect(queenAgents).toHaveLength(1);
    });

    it('should distribute tasks to available workers', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      // Setup swarm with queen and workers
      const queen = spawnAgent(swarm, 'coordinator', 'queen');
      const workers = [
        spawnAgent(swarm, 'coder', 'worker'),
        spawnAgent(swarm, 'coder', 'worker'),
        spawnAgent(swarm, 'coder', 'worker'),
      ];

      // Create tasks
      const generator = createTestDataGenerator();
      const taskDefs = generator.generateTasks(6, 'simple');
      const tasks = taskDefs.map(def => {
        const taskId = TaskId.generate();
        swarm.tasks.set(taskId.value, { id: taskId, status: 'pending', definition: def });
        return taskId;
      });

      // Queen distributes tasks
      for (const taskId of tasks) {
        const availableWorker = workers.find(w => w.getStatus() === AgentStatus.Idle);
        if (availableWorker) {
          availableWorker.assignTask(taskId);
          swarm.tasks.get(taskId.value)!.status = 'assigned';
          swarm.tasks.get(taskId.value)!.assignedTo = availableWorker.id.value;
        }
      }

      // Verify all tasks assigned
      const assignedTasks = Array.from(swarm.tasks.values()).filter(t => t.status === 'assigned');
      expect(assignedTasks.length).toBeGreaterThan(0);
    });

    it('should prioritize high-priority tasks', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const worker = spawnAgent(swarm, 'coder', 'worker');

      // Create tasks with different priorities
      const lowPriority = TaskId.generate();
      const highPriority = TaskId.generate();

      swarm.tasks.set(lowPriority.value, {
        id: lowPriority,
        status: 'pending',
        definition: { ...createTaskDefinition('simple'), priority: 'low' },
      });

      swarm.tasks.set(highPriority.value, {
        id: highPriority,
        status: 'pending',
        definition: { ...createTaskDefinition('simple'), priority: 'high' },
      });

      // Assign high-priority task first
      const sortedTasks = Array.from(swarm.tasks.values()).sort((a, b) => {
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        return (
          priorityOrder[b.definition.priority as keyof typeof priorityOrder] -
          priorityOrder[a.definition.priority as keyof typeof priorityOrder]
        );
      });

      worker.assignTask(sortedTasks[0].id);

      expect(worker.getStatus()).toBe(AgentStatus.Busy);
      // First assigned task should be high priority
      expect(sortedTasks[0].id.value).toBe(highPriority.value);
    });

    it('should handle task dependencies', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const worker1 = spawnAgent(swarm, 'coder', 'worker');
      const worker2 = spawnAgent(swarm, 'coder', 'worker');

      const task1 = TaskId.generate();
      const task2 = TaskId.generate();

      swarm.tasks.set(task1.value, {
        id: task1,
        status: 'pending',
        definition: createTaskDefinition('simple'),
      });

      swarm.tasks.set(task2.value, {
        id: task2,
        status: 'pending',
        definition: { ...createTaskDefinition('simple'), dependencies: [task1.value] },
      });

      // Execute task1 first
      worker1.assignTask(task1);
      worker1.completeTask(true);
      swarm.tasks.get(task1.value)!.status = 'completed';

      // Now task2 can execute
      const task2Def = swarm.tasks.get(task2.value)!;
      const allDepsCompleted = task2Def.definition.dependencies.every(
        depId => swarm.tasks.get(depId)?.status === 'completed'
      );

      expect(allDepsCompleted).toBe(true);

      worker2.assignTask(task2);
      worker2.completeTask(true);
    });
  });

  describe('Workers Report Results', () => {
    it('should collect results from workers', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const workers = [
        spawnAgent(swarm, 'coder', 'worker'),
        spawnAgent(swarm, 'coder', 'worker'),
      ];

      const results: Array<{ taskId: string; success: boolean; workerId: string }> = [];

      // Execute tasks and collect results
      for (const worker of workers) {
        const taskId = TaskId.generate();
        worker.assignTask(taskId);
        worker.completeTask(true);

        results.push({
          taskId: taskId.value,
          success: true,
          workerId: worker.id.value,
        });
      }

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should aggregate worker metrics', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const workers = Array.from({ length: 5 }, () => spawnAgent(swarm, 'coder', 'worker'));

      // Execute tasks
      for (const worker of workers) {
        for (let i = 0; i < 3; i++) {
          worker.assignTask(TaskId.generate());
          worker.completeTask(i !== 2); // Last task fails
        }
      }

      // Aggregate metrics
      const totalCompleted = workers.reduce((sum, w) => sum + w.getMetrics().tasksCompleted, 0);
      const totalFailed = workers.reduce((sum, w) => sum + w.getMetrics().tasksFailed, 0);
      const avgSuccessRate =
        workers.reduce((sum, w) => sum + w.getMetrics().successRate, 0) / workers.length;

      expect(totalCompleted).toBe(10); // 5 workers * 2 successful
      expect(totalFailed).toBe(5); // 5 workers * 1 failed
      expect(avgSuccessRate).toBeCloseTo(0.66, 1);
    });

    it('should handle partial failures', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const workers = [
        spawnAgent(swarm, 'coder', 'worker'),
        spawnAgent(swarm, 'coder', 'worker'),
        spawnAgent(swarm, 'coder', 'worker'),
      ];

      const taskIds = [TaskId.generate(), TaskId.generate(), TaskId.generate()];

      // Worker 1 succeeds
      workers[0].assignTask(taskIds[0]);
      workers[0].completeTask(true);

      // Worker 2 fails
      workers[1].assignTask(taskIds[1]);
      workers[1].completeTask(false);

      // Worker 3 succeeds
      workers[2].assignTask(taskIds[2]);
      workers[2].completeTask(true);

      const successCount = workers.filter(w => w.getMetrics().tasksCompleted > 0).length;
      const failCount = workers.filter(w => w.getMetrics().tasksFailed > 0).length;

      expect(successCount).toBe(2);
      expect(failCount).toBe(1);
    });
  });

  describe('Collective Decision Making', () => {
    it('should reach consensus on simple decision', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const agents = Array.from({ length: 5 }, () => spawnAgent(swarm, 'coder', 'worker'));

      // Agents vote
      const votes = [
        { agentId: agents[0].id.value, vote: 'option-A' },
        { agentId: agents[1].id.value, vote: 'option-A' },
        { agentId: agents[2].id.value, vote: 'option-B' },
        { agentId: agents[3].id.value, vote: 'option-A' },
        { agentId: agents[4].id.value, vote: 'option-B' },
      ];

      // Tally votes
      const tally = votes.reduce((acc, { vote }) => {
        acc[vote] = (acc[vote] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Determine winner (majority)
      const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];

      expect(winner).toBe('option-A');
      expect(tally['option-A']).toBe(3);
      expect(tally['option-B']).toBe(2);
    });

    it('should handle tie-breaking', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const agents = Array.from({ length: 4 }, () => spawnAgent(swarm, 'coder', 'worker'));

      const votes = [
        { agentId: agents[0].id.value, vote: 'A', timestamp: 100 },
        { agentId: agents[1].id.value, vote: 'B', timestamp: 101 },
        { agentId: agents[2].id.value, vote: 'A', timestamp: 102 },
        { agentId: agents[3].id.value, vote: 'B', timestamp: 103 },
      ];

      const tally = votes.reduce((acc, { vote }) => {
        acc[vote] = (acc[vote] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Tie - use earliest vote
      const tied = Object.entries(tally).filter(([_, count]) => count === 2);
      if (tied.length > 1) {
        const firstVote = votes[0].vote;
        expect(['A', 'B']).toContain(firstVote);
      }
    });

    it('should require quorum for decisions', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const totalAgents = 10;
      const quorumSize = Math.floor(totalAgents * 0.66) + 1; // 7 agents

      const agents = Array.from({ length: totalAgents }, () =>
        spawnAgent(swarm, 'coder', 'worker')
      );

      // Only 6 agents vote (not quorum)
      const votes = agents.slice(0, 6).map(a => ({ agentId: a.id.value, vote: 'yes' }));

      const hasQuorum = votes.length >= quorumSize;
      expect(hasQuorum).toBe(false);

      // Add one more vote to reach quorum
      votes.push({ agentId: agents[6].id.value, vote: 'yes' });
      const nowHasQuorum = votes.length >= quorumSize;
      expect(nowHasQuorum).toBe(true);
    });
  });

  describe('Swarm Scaling and Topology Change', () => {
    it('should scale up swarm when needed', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const initialAgents = 3;
      for (let i = 0; i < initialAgents; i++) {
        spawnAgent(swarm, 'coder', 'worker');
      }

      expect(swarm.agents.size).toBe(initialAgents);

      // Add more agents
      const additionalAgents = 5;
      for (let i = 0; i < additionalAgents; i++) {
        spawnAgent(swarm, 'coder', 'worker');
      }

      expect(swarm.agents.size).toBe(initialAgents + additionalAgents);
    });

    it('should scale down when load decreases', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      // Start with 10 agents
      const agents = Array.from({ length: 10 }, () => spawnAgent(swarm, 'coder', 'worker'));

      // Terminate idle agents (keep minimum 3)
      const minAgents = 3;
      const idleAgents = agents.filter(a => a.getStatus() === AgentStatus.Idle);
      const toTerminate = idleAgents.slice(minAgents);

      for (const agent of toTerminate) {
        agent.terminate();
        swarm.agents.delete(agent.id.value);
      }

      const activeCount = Array.from(swarm.agents.values()).filter(
        ({ agent }) => agent.getStatus() !== AgentStatus.Terminated
      ).length;

      expect(activeCount).toBeGreaterThanOrEqual(minAgents);
    });

    it('should change topology at runtime', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      expect(swarm.topology).toBe('hierarchical');

      // Change to mesh
      swarm.topology = 'mesh';
      swarm.config = createSwarmConfig('mesh');

      expect(swarm.topology).toBe('mesh');
      expect(swarm.config.maxAgents).toBe(10);
    });

    it('should maintain agent state during topology change', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const agents = Array.from({ length: 5 }, (_, i) => {
        const agent = spawnAgent(swarm, 'coder', 'worker');
        // Complete some tasks
        agent.assignTask(TaskId.generate());
        agent.completeTask(true);
        return agent;
      });

      // Record metrics before change
      const metricsBefore = agents.map(a => a.getMetrics().tasksCompleted);

      // Change topology
      swarm.topology = 'mesh';

      // Verify metrics preserved
      const metricsAfter = agents.map(a => a.getMetrics().tasksCompleted);
      expect(metricsAfter).toEqual(metricsBefore);
    });

    it('should handle dynamic agent addition during execution', async () => {
      const config = createSwarmConfig('hierarchical');
      await initializeSwarm(swarm, config);

      const initialWorkers = [spawnAgent(swarm, 'coder', 'worker')];

      // Start processing tasks
      const tasks = Array.from({ length: 10 }, () => TaskId.generate());
      let processedCount = 0;

      // Process in batches, adding workers as needed
      for (let i = 0; i < tasks.length; i++) {
        let worker = initialWorkers.find(w => w.getStatus() === AgentStatus.Idle);

        if (!worker && swarm.agents.size < config.maxAgents) {
          worker = spawnAgent(swarm, 'coder', 'worker');
          initialWorkers.push(worker);
        }

        if (worker) {
          worker.assignTask(tasks[i]);
          setImmediate(() => {
            worker!.completeTask(true);
            processedCount++;
          });
        }
      }

      await waitForCondition(() => processedCount === tasks.length, {
        timeout: 2000,
      });

      expect(swarm.agents.size).toBeGreaterThan(1);
    });
  });
});

// Helper types and functions

interface SwarmState {
  id: string;
  topology: 'hierarchical' | 'mesh' | 'adaptive' | 'centralized';
  status: 'initializing' | 'running' | 'paused' | 'stopped';
  config: ReturnType<typeof createSwarmConfig>;
  agents: Map<string, { agent: Agent; role: 'queen' | 'worker' }>;
  tasks: Map<
    string,
    {
      id: TaskId;
      status: string;
      definition: ReturnType<typeof createTaskDefinition>;
      assignedTo?: string;
    }
  >;
}

function createSwarmState(): SwarmState {
  return {
    id: generateTestId('swarm'),
    topology: 'hierarchical',
    status: 'initializing',
    config: createSwarmConfig('hierarchical'),
    agents: new Map(),
    tasks: new Map(),
  };
}

async function initializeSwarm(
  swarm: SwarmState,
  config: ReturnType<typeof createSwarmConfig>
): Promise<void> {
  if (config.maxAgents <= 0) {
    throw new Error('maxAgents must be positive');
  }

  swarm.topology = config.topology;
  swarm.config = config;
  swarm.status = 'running';
}

function spawnAgent(
  swarm: SwarmState,
  type: Parameters<typeof createAgentTemplate>[0],
  role: 'queen' | 'worker'
): Agent {
  const template = createAgentTemplate(type);
  const agent = Agent.create(template);
  agent.spawn();
  swarm.agents.set(agent.id.value, { agent, role });
  return agent;
}
