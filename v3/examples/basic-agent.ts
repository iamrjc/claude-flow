/**
 * Basic Agent Example
 *
 * Demonstrates basic agent spawning, task execution, and termination.
 *
 * Run: npx tsx examples/basic-agent.ts
 */

import { Agent LifecycleService, AgentRepository } from '@claude-flow/agents';
import { Task ExecutionService, TaskRepository } from '@claude-flow/agents';

async function main() {
  console.log('🚀 Claude Flow V3 - Basic Agent Example\n');

  // Step 1: Initialize services
  console.log('1️⃣ Initializing services...');
  const agentRepo = new AgentRepository();
  const taskRepo = new TaskRepository();
  const lifecycle = new AgentLifecycleService(agentRepo);
  const taskService = new TaskExecutionService(taskRepo, agentRepo);

  // Step 2: Spawn an agent
  console.log('\n2️⃣ Spawning a coder agent...');
  const agent = await lifecycle.spawnAgent({
    type: 'coder',
    name: 'example-coder',
    config: {
      model: 'claude-sonnet-4-5',
      maxTokens: 4096,
      temperature: 0.7,
    },
    priority: 'normal',
    capabilities: ['typescript', 'nodejs', 'testing'],
  });

  console.log(`✅ Agent spawned: ${agent.id}`);
  console.log(`   Type: ${agent.type}`);
  console.log(`   Status: ${agent.status}`);
  console.log(`   Capabilities: ${agent.capabilities.join(', ')}`);

  // Step 3: Check agent health
  console.log('\n3️⃣ Checking agent health...');
  const health = await lifecycle.checkHealth(agent.id);
  console.log(`✅ Health status: ${health.status}`);
  console.log(`   Uptime: ${health.uptime}ms`);
  console.log(`   Memory usage: ${(health.memoryUsage / 1024 / 1024).toFixed(2)} MB`);

  // Step 4: Create a task
  console.log('\n4️⃣ Creating a task...');
  const task = await taskService.createTask({
    title: 'Implement hello world function',
    description: `Create a TypeScript function that:
      1. Takes a name parameter
      2. Returns a greeting message
      3. Includes proper type annotations
      4. Has JSDoc comments`,
    priority: 'normal',
    estimatedDuration: 300000, // 5 minutes
  });

  console.log(`✅ Task created: ${task.id}`);
  console.log(`   Title: ${task.title}`);
  console.log(`   Priority: ${task.priority}`);
  console.log(`   Status: ${task.status}`);

  // Step 5: Assign task to agent
  console.log('\n5️⃣ Assigning task to agent...');
  await taskService.assignTask(task.id, agent.id);
  console.log(`✅ Task assigned to agent ${agent.id}`);

  // Step 6: Execute task
  console.log('\n6️⃣ Executing task...');
  const result = await taskService.executeTask(task.id, agent.id);

  console.log(`✅ Task completed!`);
  console.log(`   Status: ${result.status}`);
  console.log(`   Duration: ${result.duration}ms`);

  if (result.output) {
    console.log(`   Output:`);
    console.log(`\n${result.output}\n`);
  }

  // Step 7: Get agent metrics
  console.log('\n7️⃣ Retrieving agent metrics...');
  const metrics = await lifecycle.getMetrics(agent.id);

  console.log(`✅ Agent Metrics:`);
  console.log(`   Tasks completed: ${metrics.tasksCompleted}`);
  console.log(`   Success rate: ${metrics.successRate.toFixed(2)}%`);
  console.log(`   Average task time: ${metrics.averageTaskTime}ms`);
  console.log(`   Total uptime: ${metrics.totalUptime}ms`);

  // Step 8: Graceful termination
  console.log('\n8️⃣ Terminating agent gracefully...');

  // Wait for agent to become idle
  let status = await lifecycle.getStatus(agent.id);
  while (status.state === 'busy') {
    console.log('   Waiting for agent to complete current work...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    status = await lifecycle.getStatus(agent.id);
  }

  await lifecycle.terminateAgent(agent.id);
  console.log(`✅ Agent terminated: ${agent.id}`);

  console.log('\n✨ Example completed successfully!');
}

// Error handling
main().catch(error => {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
