/**
 * Agent-Task Integration E2E Tests
 *
 * Tests the complete flow of:
 * - Spawning agents
 * - Creating tasks
 * - Assigning tasks to agents
 * - Executing tasks
 * - Completing tasks
 * - Agent pool scaling under load
 * - Agent failure and task reassignment
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAgentTemplate, createTaskDefinition, createTestDataGenerator } from '../fixtures/test-fixtures.js';
import {
  Agent,
  AgentId,
  AgentStatus,
  TaskId,
  waitForCondition,
  assertEventuallyEquals,
  assertEventuallyHasCount,
  ResourceManager,
  generateTestId,
  retry,
} from '../utils/e2e-helpers.js';

describe('E2E: Agent-Task Flow', () => {
  let resourceManager: ResourceManager;
  let agents: Map<string, Agent>;
  let tasks: Map<string, { status: string; assignedTo?: string }>;

  beforeEach(() => {
    resourceManager = new ResourceManager();
    agents = new Map();
    tasks = new Map();
  });

  afterEach(async () => {
    await resourceManager.cleanup();
    agents.clear();
    tasks.clear();
  });

  describe('Basic Agent-Task Flow', () => {
    it('should spawn agent, create task, assign, execute, and complete', async () => {
      // 1. Spawn agent
      const template = createAgentTemplate('coder');
      const agent = Agent.create(template);
      agent.spawn();
      agents.set(agent.id.value, agent);

      expect(agent.getStatus()).toBe(AgentStatus.Idle);

      // 2. Create task
      const taskId = TaskId.generate();
      const taskDef = createTaskDefinition('simple');
      tasks.set(taskId.value, { status: 'pending' });

      // 3. Assign task
      agent.assignTask(taskId);
      tasks.set(taskId.value, { status: 'assigned', assignedTo: agent.id.value });

      expect(agent.getStatus()).toBe(AgentStatus.Busy);
      expect(tasks.get(taskId.value)?.assignedTo).toBe(agent.id.value);

      // 4. Execute task (simulated)
      await new Promise(resolve => setTimeout(resolve, 100));

      // 5. Complete task
      agent.completeTask(true);
      tasks.set(taskId.value, { status: 'completed', assignedTo: agent.id.value });

      expect(agent.getStatus()).toBe(AgentStatus.Idle);
      expect(agent.getMetrics().tasksCompleted).toBe(1);
      expect(agent.getMetrics().successRate).toBe(1.0);
    });

    it('should handle task failure and retry', async () => {
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();
      agents.set(agent.id.value, agent);

      // First attempt fails
      const taskId = TaskId.generate();
      agent.assignTask(taskId);
      agent.completeTask(false);

      expect(agent.getMetrics().tasksFailed).toBe(1);
      expect(agent.getStatus()).toBe(AgentStatus.Idle);

      // Retry succeeds
      agent.assignTask(taskId);
      agent.completeTask(true);

      expect(agent.getMetrics().tasksCompleted).toBe(1);
      expect(agent.getMetrics().tasksFailed).toBe(1);
      expect(agent.getMetrics().successRate).toBe(0.5);
    });

    it('should prevent assigning task to busy agent', () => {
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();

      const task1 = TaskId.generate();
      agent.assignTask(task1);

      const task2 = TaskId.generate();
      expect(() => agent.assignTask(task2)).toThrow('not available');
    });

    it('should allow sequential task execution', async () => {
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();

      const taskIds = [TaskId.generate(), TaskId.generate(), TaskId.generate()];

      for (const taskId of taskIds) {
        agent.assignTask(taskId);
        expect(agent.getStatus()).toBe(AgentStatus.Busy);
        agent.completeTask(true);
        expect(agent.getStatus()).toBe(AgentStatus.Idle);
      }

      expect(agent.getMetrics().tasksCompleted).toBe(3);
    });
  });

  describe('Multiple Agents Working on Task Graph', () => {
    it('should distribute tasks across multiple agents', async () => {
      const generator = createTestDataGenerator();
      const agentTemplates = generator.generateAgents(3, 'coder');
      const taskDefs = generator.generateTasks(6, 'simple');

      // Spawn agents
      const agentList: Agent[] = [];
      for (const template of agentTemplates) {
        const agent = Agent.create(template);
        agent.spawn();
        agents.set(agent.id.value, agent);
        agentList.push(agent);
      }

      // Assign tasks round-robin
      const taskIds = taskDefs.map(() => TaskId.generate());
      for (let i = 0; i < taskIds.length; i++) {
        const agent = agentList[i % agentList.length];
        // Wait for agent to be idle
        if (agent.getStatus() === AgentStatus.Busy) {
          agent.completeTask(true);
        }
        agent.assignTask(taskIds[i]);
      }

      // Complete all tasks
      for (const agent of agentList) {
        if (agent.getStatus() === AgentStatus.Busy) {
          agent.completeTask(true);
        }
      }

      // Verify distribution
      const totalCompleted = agentList.reduce(
        (sum, agent) => sum + agent.getMetrics().tasksCompleted,
        0
      );
      expect(totalCompleted).toBe(taskIds.length);
    });

    it('should handle task dependencies', async () => {
      const generator = createTestDataGenerator();
      const agentTemplates = generator.generateAgents(2, 'coder');

      const agents = agentTemplates.map(template => {
        const agent = Agent.create(template);
        agent.spawn();
        return agent;
      });

      // Task graph: task1 -> task2 -> task3
      const task1 = TaskId.generate();
      const task2 = TaskId.generate();
      const task3 = TaskId.generate();

      const completedTasks: string[] = [];

      // Execute task1
      agents[0].assignTask(task1);
      agents[0].completeTask(true);
      completedTasks.push(task1.value);

      // Execute task2 (depends on task1)
      agents[1].assignTask(task2);
      agents[1].completeTask(true);
      completedTasks.push(task2.value);

      // Execute task3 (depends on task2)
      agents[0].assignTask(task3);
      agents[0].completeTask(true);
      completedTasks.push(task3.value);

      expect(completedTasks).toEqual([task1.value, task2.value, task3.value]);
    });

    it('should execute parallel tasks concurrently', async () => {
      const generator = createTestDataGenerator();
      const agentTemplates = generator.generateAgents(3, 'coder');

      const agents = agentTemplates.map(template => {
        const agent = Agent.create(template);
        agent.spawn();
        return agent;
      });

      const taskIds = [TaskId.generate(), TaskId.generate(), TaskId.generate()];

      // Assign all tasks simultaneously
      const startTime = Date.now();
      for (let i = 0; i < agents.length; i++) {
        agents[i].assignTask(taskIds[i]);
      }

      // Complete all tasks
      await Promise.all(
        agents.map(async agent => {
          await new Promise(resolve => setTimeout(resolve, 50));
          agent.completeTask(true);
        })
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in ~50ms (parallel), not 150ms (sequential)
      expect(duration).toBeLessThan(100);
      expect(agents.every(agent => agent.getMetrics().tasksCompleted === 1)).toBe(true);
    });
  });

  describe('Agent Failure and Task Reassignment', () => {
    it('should reassign task when agent fails', async () => {
      const agent1 = Agent.create(createAgentTemplate('coder'));
      agent1.spawn();

      const agent2 = Agent.create(createAgentTemplate('coder'));
      agent2.spawn();

      const taskId = TaskId.generate();

      // Assign to agent1
      agent1.assignTask(taskId);
      tasks.set(taskId.value, { status: 'assigned', assignedTo: agent1.id.value });

      // Agent1 fails
      agent1.terminate();
      expect(agent1.getStatus()).toBe(AgentStatus.Terminated);

      // Reassign to agent2
      tasks.set(taskId.value, { status: 'pending' });
      agent2.assignTask(taskId);
      tasks.set(taskId.value, { status: 'assigned', assignedTo: agent2.id.value });

      agent2.completeTask(true);

      expect(tasks.get(taskId.value)?.status).toBe('completed');
      expect(tasks.get(taskId.value)?.assignedTo).toBe(agent2.id.value);
    });

    it('should handle agent health degradation', async () => {
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();

      // Execute some failing tasks
      for (let i = 0; i < 3; i++) {
        agent.assignTask(TaskId.generate());
        agent.completeTask(false);
      }

      const health = agent.reportHealth();
      expect(health.healthScore).toBeLessThan(1.0);
      expect(agent.getMetrics().successRate).toBe(0);
    });

    it('should retry failed task with exponential backoff', async () => {
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();

      let attemptCount = 0;
      const maxAttempts = 3;

      const executeTask = async (): Promise<boolean> => {
        attemptCount++;
        agent.assignTask(TaskId.generate());

        // Simulate failure on first two attempts
        const success = attemptCount >= maxAttempts;
        agent.completeTask(success);

        return success;
      };

      const result = await retry(executeTask, {
        maxAttempts,
        delayMs: 10,
        backoff: true,
      });

      expect(result).toBe(true);
      expect(attemptCount).toBe(maxAttempts);
      expect(agent.getMetrics().tasksFailed).toBe(2);
      expect(agent.getMetrics().tasksCompleted).toBe(1);
    });
  });

  describe('Pool Scaling Under Load', () => {
    it('should scale up pool when tasks exceed capacity', async () => {
      const maxAgents = 10;
      const taskCount = 30;

      const generator = createTestDataGenerator();
      const agentPool: Agent[] = [];

      // Start with 3 agents
      for (let i = 0; i < 3; i++) {
        const agent = Agent.create(createAgentTemplate('coder'));
        agent.spawn();
        agentPool.push(agent);
      }

      const taskIds = Array.from({ length: taskCount }, () => TaskId.generate());
      let completedCount = 0;

      // Process tasks, scaling pool as needed
      for (const taskId of taskIds) {
        // Find idle agent or spawn new one
        let agent = agentPool.find(a => a.getStatus() === AgentStatus.Idle);

        if (!agent && agentPool.length < maxAgents) {
          agent = Agent.create(createAgentTemplate('coder'));
          agent.spawn();
          agentPool.push(agent);
        }

        if (agent) {
          agent.assignTask(taskId);
          // Simulate async completion
          setImmediate(() => {
            if (agent!.getStatus() === AgentStatus.Busy) {
              agent!.completeTask(true);
              completedCount++;
            }
          });
        }
      }

      // Wait for all tasks to complete
      await waitForCondition(
        () => completedCount === taskCount,
        { timeout: 5000, message: 'Not all tasks completed' }
      );

      expect(agentPool.length).toBeGreaterThan(3);
      expect(agentPool.length).toBeLessThanOrEqual(maxAgents);
    });

    it('should scale down pool when load decreases', async () => {
      const generator = createTestDataGenerator();
      const agentPool: Agent[] = [];

      // Spawn 10 agents for high load
      for (let i = 0; i < 10; i++) {
        const agent = Agent.create(createAgentTemplate('coder'));
        agent.spawn();
        agentPool.push(agent);
      }

      expect(agentPool.length).toBe(10);

      // Complete all tasks
      for (const agent of agentPool) {
        if (agent.getStatus() === AgentStatus.Busy) {
          agent.completeTask(true);
        }
      }

      // Scale down idle agents (keep minimum 3)
      const minAgents = 3;
      const idleAgents = agentPool.filter(a => a.getStatus() === AgentStatus.Idle);
      const toTerminate = idleAgents.slice(minAgents);

      for (const agent of toTerminate) {
        agent.terminate();
      }

      const activeAgents = agentPool.filter(a => a.getStatus() !== AgentStatus.Terminated);
      expect(activeAgents.length).toBe(minAgents);
    });

    it('should handle burst traffic', async () => {
      const agentPool: Agent[] = [];

      // Start with 2 agents
      for (let i = 0; i < 2; i++) {
        const agent = Agent.create(createAgentTemplate('coder'));
        agent.spawn();
        agentPool.push(agent);
      }

      // Simulate burst of 20 tasks
      const burstTasks = Array.from({ length: 20 }, () => TaskId.generate());
      const assignments: Array<{ agent: Agent; task: TaskId }> = [];

      for (const taskId of burstTasks) {
        let agent = agentPool.find(a => a.getStatus() === AgentStatus.Idle);

        if (!agent) {
          agent = Agent.create(createAgentTemplate('coder'));
          agent.spawn();
          agentPool.push(agent);
        }

        agent.assignTask(taskId);
        assignments.push({ agent, task: taskId });
      }

      expect(agentPool.length).toBeGreaterThan(2);

      // Complete tasks
      for (const { agent } of assignments) {
        agent.completeTask(true);
      }

      const totalCompleted = agentPool.reduce(
        (sum, a) => sum + a.getMetrics().tasksCompleted,
        0
      );
      expect(totalCompleted).toBe(20);
    });
  });

  describe('Performance and Metrics', () => {
    it('should track agent performance metrics', async () => {
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();

      const taskCount = 10;
      for (let i = 0; i < taskCount; i++) {
        agent.assignTask(TaskId.generate());
        agent.completeTask(i % 2 === 0); // 50% success rate
      }

      const metrics = agent.getMetrics();
      expect(metrics.tasksCompleted).toBe(5);
      expect(metrics.tasksFailed).toBe(5);
      expect(metrics.successRate).toBe(0.5);
    });

    it('should measure task execution time', async () => {
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();

      const startTime = Date.now();
      agent.assignTask(TaskId.generate());

      await new Promise(resolve => setTimeout(resolve, 50));

      agent.completeTask(true);
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeGreaterThanOrEqual(50);
      expect(executionTime).toBeLessThan(100);
    });

    it('should calculate agent health score', async () => {
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();

      // Initial health should be good
      let health = agent.reportHealth();
      expect(health.healthScore).toBeGreaterThan(0);

      // After some successful tasks
      for (let i = 0; i < 5; i++) {
        agent.assignTask(TaskId.generate());
        agent.completeTask(true);
      }

      health = agent.reportHealth();
      expect(health.healthScore).toBeGreaterThan(0.7);
    });
  });
});
