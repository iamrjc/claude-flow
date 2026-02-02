/**
 * Agent Performance Benchmarks
 *
 * Benchmarks for agent lifecycle operations:
 * - Agent spawn (<100ms target)
 * - Agent termination
 * - Pool scaling
 * - Concurrent operations
 *
 * @module @claude-flow/testing/benchmarks/agent-benchmarks
 */

import { describe, bench } from 'vitest';
import { Agent, AgentId, AgentStatus, AgentCapabilities } from '@claude-flow/agents';
import { runBenchmark, runBenchmarkSuite } from './utils/benchmark-runner.js';
import { MetricsCollector } from './utils/metrics-collector.js';

/**
 * Agent spawn benchmark
 * Target: <100ms for single agent spawn
 */
export async function benchAgentSpawn(): Promise<void> {
  const agent = Agent.create({
    type: 'coder',
    capabilities: {
      canCode: true,
      canReview: false,
      canTest: false,
      canResearch: false,
      canArchitect: false,
      canCoordinate: false,
      specializations: ['typescript', 'javascript'],
    },
    name: 'benchmark-agent',
  });

  agent.spawn();
}

/**
 * Agent terminate benchmark
 */
export async function benchAgentTerminate(): Promise<void> {
  const agent = Agent.create({
    type: 'coder',
    capabilities: {
      canCode: true,
      canReview: false,
      canTest: false,
      canResearch: false,
      canArchitect: false,
      canCoordinate: false,
      specializations: [],
    },
  });

  agent.spawn();
  agent.terminate();
}

/**
 * Agent pool creation benchmark
 * Creates pool of 10 agents
 */
export async function benchAgentPoolCreation(poolSize: number = 10): Promise<Agent[]> {
  const agents: Agent[] = [];

  for (let i = 0; i < poolSize; i++) {
    const agent = Agent.create({
      type: 'coder',
      capabilities: {
        canCode: true,
        canReview: false,
        canTest: false,
        canResearch: false,
        canArchitect: false,
        canCoordinate: false,
        specializations: [],
      },
      name: `agent-${i}`,
    });
    agent.spawn();
    agents.push(agent);
  }

  return agents;
}

/**
 * Agent pool scaling benchmark
 * Tests scaling from 10 to 100 agents
 */
export async function benchAgentPoolScaling(): Promise<void> {
  const agents: Agent[] = [];

  // Start with 10 agents
  for (let i = 0; i < 10; i++) {
    const agent = Agent.create({
      type: 'coder',
      capabilities: {
        canCode: true,
        canReview: false,
        canTest: false,
        canResearch: false,
        canArchitect: false,
        canCoordinate: false,
        specializations: [],
      },
    });
    agent.spawn();
    agents.push(agent);
  }

  // Scale up to 100
  for (let i = 10; i < 100; i++) {
    const agent = Agent.create({
      type: 'coder',
      capabilities: {
        canCode: true,
        canReview: false,
        canTest: false,
        canResearch: false,
        canArchitect: false,
        canCoordinate: false,
        specializations: [],
      },
    });
    agent.spawn();
    agents.push(agent);
  }

  // Cleanup
  agents.forEach(a => a.terminate());
}

/**
 * Concurrent agent spawn benchmark
 * Spawns 50 agents concurrently
 */
export async function benchConcurrentAgentSpawn(count: number = 50): Promise<void> {
  const promises = Array.from({ length: count }, (_, i) => {
    return Promise.resolve().then(() => {
      const agent = Agent.create({
        type: 'coder',
        capabilities: {
          canCode: true,
          canReview: false,
          canTest: false,
          canResearch: false,
          canArchitect: false,
          canCoordinate: false,
          specializations: [],
        },
        name: `concurrent-agent-${i}`,
      });
      agent.spawn();
      return agent;
    });
  });

  await Promise.all(promises);
}

/**
 * Agent health check benchmark
 */
export async function benchAgentHealthCheck(): Promise<void> {
  const agent = Agent.create({
    type: 'coder',
    capabilities: {
      canCode: true,
      canReview: false,
      canTest: false,
      canResearch: false,
      canArchitect: false,
      canCoordinate: false,
      specializations: [],
    },
  });

  agent.spawn();
  agent.reportHealth();
  agent.terminate();
}

/**
 * Agent task assignment benchmark
 */
export async function benchAgentTaskAssignment(): Promise<void> {
  const agent = Agent.create({
    type: 'coder',
    capabilities: {
      canCode: true,
      canReview: false,
      canTest: false,
      canResearch: false,
      canArchitect: false,
      canCoordinate: false,
      specializations: [],
    },
  });

  agent.spawn();

  // Assign task
  const taskId = { value: 'task-123', toString: () => 'task-123' };
  agent.assignTask(taskId as any);

  // Complete task
  agent.completeTask(true);

  agent.terminate();
}

/**
 * Run all agent benchmarks
 */
export async function runAgentBenchmarks() {
  return runBenchmarkSuite('Agent Performance', [
    {
      name: 'Agent Spawn (target: <100ms)',
      fn: benchAgentSpawn,
      options: { iterations: 1000 },
    },
    {
      name: 'Agent Terminate',
      fn: benchAgentTerminate,
      options: { iterations: 1000 },
    },
    {
      name: 'Agent Pool Creation (10 agents)',
      fn: () => benchAgentPoolCreation(10),
      options: { iterations: 100 },
    },
    {
      name: 'Agent Pool Creation (100 agents)',
      fn: () => benchAgentPoolCreation(100),
      options: { iterations: 10 },
    },
    {
      name: 'Agent Pool Scaling (10 to 100)',
      fn: benchAgentPoolScaling,
      options: { iterations: 10 },
    },
    {
      name: 'Concurrent Agent Spawn (50 agents)',
      fn: () => benchConcurrentAgentSpawn(50),
      options: { iterations: 50 },
    },
    {
      name: 'Agent Health Check',
      fn: benchAgentHealthCheck,
      options: { iterations: 1000 },
    },
    {
      name: 'Agent Task Assignment',
      fn: benchAgentTaskAssignment,
      options: { iterations: 1000 },
    },
  ]);
}

// Vitest benchmarks
describe('Agent Benchmarks', () => {
  bench('agent spawn', async () => {
    await benchAgentSpawn();
  });

  bench('agent terminate', async () => {
    await benchAgentTerminate();
  });

  bench('agent pool creation (10)', async () => {
    await benchAgentPoolCreation(10);
  });

  bench('concurrent agent spawn (50)', async () => {
    await benchConcurrentAgentSpawn(50);
  });

  bench('agent health check', async () => {
    await benchAgentHealthCheck();
  });

  bench('agent task assignment', async () => {
    await benchAgentTaskAssignment();
  });
});
