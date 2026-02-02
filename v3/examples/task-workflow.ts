/**
 * Task Workflow Example
 *
 * Demonstrates complex task workflows with dependencies, parallel execution,
 * and conditional branching.
 *
 * Run: npx tsx examples/task-workflow.ts
 */

import { TaskExecutionService, TaskRepository } from '@claude-flow/agents';
import { AgentLifecycleService, AgentRepository } from '@claude-flow/agents';

async function main() {
  console.log('🚀 Claude Flow V3 - Task Workflow Example\n');

  // Initialize services
  const agentRepo = new AgentRepository();
  const taskRepo = new TaskRepository();
  const lifecycle = new AgentLifecycleService(agentRepo);
  const taskService = new TaskExecutionService(taskRepo, agentRepo);

  // Spawn specialized agents
  console.log('1️⃣ Spawning specialized agent pool...\n');

  const agents = await Promise.all([
    lifecycle.spawnAgent({ type: 'researcher', name: 'researcher-1' }),
    lifecycle.spawnAgent({ type: 'system-architect', name: 'architect-1' }),
    lifecycle.spawnAgent({ type: 'coder', name: 'coder-1' }),
    lifecycle.spawnAgent({ type: 'coder', name: 'coder-2' }),
    lifecycle.spawnAgent({ type: 'tester', name: 'tester-1' }),
    lifecycle.spawnAgent({ type: 'reviewer', name: 'reviewer-1' }),
  ]);

  console.log(`✅ Spawned ${agents.length} agents\n`);

  // Create task graph with dependencies
  console.log('2️⃣ Creating task workflow with dependencies...\n');

  // Phase 1: Research
  const researchTask = await taskService.createTask({
    title: 'Research authentication requirements',
    description: 'Analyze security requirements for JWT authentication',
    priority: 'high',
    assignedTo: agents[0].id,
  });

  // Phase 2: Architecture (depends on research)
  const designTask = await taskService.createTask({
    title: 'Design authentication architecture',
    description: 'Design JWT authentication system architecture',
    priority: 'high',
    dependencies: [researchTask.id],
    assignedTo: agents[1].id,
  });

  // Phase 3: Implementation (parallel, depends on design)
  const tasks = await Promise.all([
    taskService.createTask({
      title: 'Implement JWT token generation',
      description: 'Create JWT token generation logic',
      priority: 'high',
      dependencies: [designTask.id],
      assignedTo: agents[2].id,
    }),
    taskService.createTask({
      title: 'Implement token validation',
      description: 'Create JWT token validation middleware',
      priority: 'high',
      dependencies: [designTask.id],
      assignedTo: agents[3].id,
    }),
  ]);

  const [implTask1, implTask2] = tasks;

  // Phase 4: Testing (depends on implementation)
  const testTask = await taskService.createTask({
    title: 'Write authentication tests',
    description: 'Create comprehensive test suite for JWT auth',
    priority: 'normal',
    dependencies: [implTask1.id, implTask2.id],
    assignedTo: agents[4].id,
  });

  // Phase 5: Review (depends on testing)
  const reviewTask = await taskService.createTask({
    title: 'Security review',
    description: 'Review authentication implementation for vulnerabilities',
    priority: 'critical',
    dependencies: [testTask.id],
    assignedTo: agents[5].id,
  });

  console.log(`✅ Created workflow with 6 tasks\n`);

  // Execute workflow
  console.log('3️⃣ Executing workflow...\n');

  const workflowTasks = [researchTask, designTask, implTask1, implTask2, testTask, reviewTask];

  for (const task of workflowTasks) {
    console.log(`▶️  Executing: ${task.title}`);
    const result = await taskService.executeTask(task.id, task.assignedTo!);
    console.log(`   ✅ Completed`);
  }

  // Cleanup
  for (const agent of agents) {
    await lifecycle.terminateAgent(agent.id);
  }

  console.log('\n✨ Workflow completed!');
}

main().catch(console.error);
