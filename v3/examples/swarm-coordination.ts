/**
 * Swarm Coordination Example
 *
 * Demonstrates hierarchical mesh swarm coordination with 15 agents.
 *
 * Run: npx tsx examples/swarm-coordination.ts
 */

import { UnifiedSwarmCoordinator } from '@claude-flow/swarm';

async function main() {
  console.log('🐝 Claude Flow V3 - Swarm Coordination Example\n');

  // Initialize swarm coordinator
  console.log('1️⃣ Initializing swarm coordinator...\n');

  const coordinator = new UnifiedSwarmCoordinator({
    topology: 'hierarchical-mesh',
    maxAgents: 15,
    config: {
      communicationProtocol: 'message-bus',
      consensusMechanism: 'majority',
      failureHandling: 'failover',
      loadBalancing: true,
      autoScaling: true,
    },
  });

  await coordinator.initialize();
  console.log('✅ Coordinator initialized\n');

  // Spawn queen agent
  console.log('2️⃣ Spawning queen coordinator...\n');

  const queenAgent = await coordinator.spawnAgent({
    agentType: 'queen-coordinator',
    id: 'queen-1',
    priority: 'critical',
  });

  console.log(`✅ Queen spawned: ${queenAgent.id}\n`);

  // Spawn worker agents
  console.log('3️⃣ Spawning worker swarm...\n');

  const workers = await Promise.all([
    coordinator.spawnAgent({ agentType: 'coder', priority: 'high' }),
    coordinator.spawnAgent({ agentType: 'coder', priority: 'high' }),
    coordinator.spawnAgent({ agentType: 'coder', priority: 'high' }),
    coordinator.spawnAgent({ agentType: 'tester', priority: 'normal' }),
    coordinator.spawnAgent({ agentType: 'tester', priority: 'normal' }),
    coordinator.spawnAgent({ agentType: 'reviewer', priority: 'normal' }),
  ]);

  console.log(`✅ Spawned ${workers.length} worker agents\n`);

  // Submit complex task
  console.log('4️⃣ Submitting complex task to swarm...\n');

  const task = await coordinator.submitTask({
    title: 'Build authentication system',
    description: 'Implement complete JWT authentication with tests and security review',
    priority: 'high',
    requiredCapabilities: ['coding', 'testing', 'security'],
  });

  console.log(`✅ Task submitted: ${task.id}\n`);

  // Monitor swarm status
  console.log('5️⃣ Monitoring swarm status...\n');

  const status = await coordinator.getSwarmStatus({
    includeAgents: true,
    includeMetrics: true,
    includeTopology: true,
  });

  console.log(`Active agents: ${status.activeAgents}`);
  console.log(`Task queue: ${status.taskQueueSize}`);
  console.log(`Efficiency: ${status.metrics.efficiency}%`);
  console.log(`Message rate: ${status.metrics.messageRate} msgs/sec\n`);

  // Achieve consensus
  console.log('6️⃣ Testing consensus mechanism...\n');

  const consensusResult = await coordinator.achieveConsensus({
    type: 'approval',
    description: 'Approve production deployment',
    threshold: 0.66,
  });

  console.log(`Consensus achieved: ${consensusResult.achieved}`);
  console.log(`Votes in favor: ${consensusResult.votesFor}/${consensusResult.totalVotes}\n`);

  // Cleanup
  console.log('7️⃣ Shutting down swarm...\n');

  await coordinator.shutdown();
  console.log('✅ Swarm shut down gracefully\n');

  console.log('✨ Swarm coordination example completed!');
}

main().catch(console.error);
