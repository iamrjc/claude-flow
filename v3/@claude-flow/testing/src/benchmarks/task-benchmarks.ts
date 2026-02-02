/**
 * Task Performance Benchmarks
 *
 * Benchmarks for task execution operations:
 * - Task assignment (<10ms target)
 * - Task throughput (100+ tasks/min target)
 * - Task graph execution
 * - Task queue management
 *
 * @module @claude-flow/testing/benchmarks/task-benchmarks
 */

import { describe, bench } from 'vitest';
import { Task, TaskId, TaskType, TaskPriority, TaskStatus } from '@claude-flow/agents';
import { runBenchmarkSuite } from './utils/benchmark-runner.js';

/**
 * Task creation benchmark
 */
export async function benchTaskCreation(): Promise<void> {
  const task = Task.create({
    title: 'Benchmark Task',
    description: 'A task for benchmarking',
    type: TaskType.CODE,
    priority: TaskPriority.NORMAL,
  });
}

/**
 * Task assignment benchmark
 * Target: <10ms per assignment
 */
export async function benchTaskAssignment(): Promise<void> {
  const task = Task.create({
    title: 'Benchmark Task',
    description: 'A task for benchmarking',
    type: TaskType.CODE,
    priority: TaskPriority.NORMAL,
  });

  task.queue();
  task.assign('agent-123');
}

/**
 * Task execution lifecycle benchmark
 */
export async function benchTaskLifecycle(): Promise<void> {
  const task = Task.create({
    title: 'Benchmark Task',
    description: 'A task for benchmarking',
    type: TaskType.CODE,
    priority: TaskPriority.NORMAL,
  });

  task.queue();
  task.assign('agent-123');
  task.start();
  task.complete({ output: 'success' });
}

/**
 * Task throughput benchmark
 * Creates, assigns, and completes multiple tasks
 * Target: 100+ tasks/min
 */
export async function benchTaskThroughput(count: number = 100): Promise<void> {
  const tasks: Task[] = [];

  for (let i = 0; i < count; i++) {
    const task = Task.create({
      title: `Task ${i}`,
      description: `Benchmark task ${i}`,
      type: TaskType.CODE,
      priority: TaskPriority.NORMAL,
    });

    task.queue();
    task.assign(`agent-${i % 10}`);
    task.start();
    task.complete({ output: `result-${i}` });

    tasks.push(task);
  }
}

/**
 * Task dependency graph benchmark
 * Creates a graph with dependencies
 */
export async function benchTaskDependencyGraph(): Promise<void> {
  const tasks: Task[] = [];

  // Create 10 tasks with dependencies
  for (let i = 0; i < 10; i++) {
    const task = Task.create({
      title: `Task ${i}`,
      description: `Dependent task ${i}`,
      type: TaskType.CODE,
      priority: TaskPriority.NORMAL,
    });

    // Add dependency to previous task
    if (i > 0) {
      task.addBlockedBy(tasks[i - 1].id.value);
      tasks[i - 1].addBlocks(task.id.value);
    }

    tasks.push(task);
  }

  // Execute in order
  const completed = new Set<string>();

  for (const task of tasks) {
    if (task.areDependenciesSatisfied(completed)) {
      task.queue();
      task.assign('agent-123');
      task.start();
      task.complete({ output: 'success' });
      completed.add(task.id.value);
    }
  }
}

/**
 * Concurrent task creation benchmark
 */
export async function benchConcurrentTaskCreation(count: number = 100): Promise<void> {
  const promises = Array.from({ length: count }, (_, i) => {
    return Promise.resolve().then(() => {
      return Task.create({
        title: `Concurrent Task ${i}`,
        description: `Benchmark concurrent task ${i}`,
        type: TaskType.CODE,
        priority: TaskPriority.NORMAL,
      });
    });
  });

  await Promise.all(promises);
}

/**
 * Task priority sorting benchmark
 */
export async function benchTaskPrioritySorting(): Promise<void> {
  const tasks: Task[] = [];
  const priorities = [
    TaskPriority.LOW,
    TaskPriority.NORMAL,
    TaskPriority.HIGH,
    TaskPriority.CRITICAL,
  ];

  // Create 100 tasks with random priorities
  for (let i = 0; i < 100; i++) {
    const task = Task.create({
      title: `Task ${i}`,
      description: `Priority task ${i}`,
      type: TaskType.CODE,
      priority: priorities[Math.floor(Math.random() * priorities.length)],
    });
    tasks.push(task);
  }

  // Sort by priority
  tasks.sort((a, b) => a.comparePriority(b));
}

/**
 * Task retry mechanism benchmark
 */
export async function benchTaskRetry(): Promise<void> {
  const task = Task.create({
    title: 'Retry Task',
    description: 'A task that fails and retries',
    type: TaskType.CODE,
    priority: TaskPriority.NORMAL,
    maxRetries: 3,
  });

  task.queue();
  task.assign('agent-123');
  task.start();

  // Fail and retry
  task.fail('Temporary error');

  // Should be queued again
  if (task.status === TaskStatus.QUEUED) {
    task.assign('agent-123');
    task.start();
    task.complete({ output: 'success' });
  }
}

/**
 * Task metadata operations benchmark
 */
export async function benchTaskMetadata(): Promise<void> {
  const task = Task.create({
    title: 'Metadata Task',
    description: 'A task with metadata',
    type: TaskType.CODE,
    priority: TaskPriority.NORMAL,
  });

  // Set multiple metadata fields
  for (let i = 0; i < 10; i++) {
    task.setMetadata(`field${i}`, `value${i}`);
  }

  // Read metadata
  const metadata = task.metadata;
}

/**
 * Run all task benchmarks
 */
export async function runTaskBenchmarks() {
  return runBenchmarkSuite('Task Performance', [
    {
      name: 'Task Creation',
      fn: benchTaskCreation,
      options: { iterations: 1000 },
    },
    {
      name: 'Task Assignment (target: <10ms)',
      fn: benchTaskAssignment,
      options: { iterations: 1000 },
    },
    {
      name: 'Task Lifecycle',
      fn: benchTaskLifecycle,
      options: { iterations: 1000 },
    },
    {
      name: 'Task Throughput (100 tasks) - target: <60s',
      fn: () => benchTaskThroughput(100),
      options: { iterations: 10 },
    },
    {
      name: 'Task Throughput (1000 tasks)',
      fn: () => benchTaskThroughput(1000),
      options: { iterations: 5 },
    },
    {
      name: 'Task Dependency Graph (10 tasks)',
      fn: benchTaskDependencyGraph,
      options: { iterations: 100 },
    },
    {
      name: 'Concurrent Task Creation (100 tasks)',
      fn: () => benchConcurrentTaskCreation(100),
      options: { iterations: 50 },
    },
    {
      name: 'Task Priority Sorting (100 tasks)',
      fn: benchTaskPrioritySorting,
      options: { iterations: 100 },
    },
    {
      name: 'Task Retry Mechanism',
      fn: benchTaskRetry,
      options: { iterations: 1000 },
    },
    {
      name: 'Task Metadata Operations',
      fn: benchTaskMetadata,
      options: { iterations: 1000 },
    },
  ]);
}

// Vitest benchmarks
describe('Task Benchmarks', () => {
  bench('task creation', async () => {
    await benchTaskCreation();
  });

  bench('task assignment', async () => {
    await benchTaskAssignment();
  });

  bench('task lifecycle', async () => {
    await benchTaskLifecycle();
  });

  bench('task throughput (100)', async () => {
    await benchTaskThroughput(100);
  });

  bench('concurrent task creation (100)', async () => {
    await benchConcurrentTaskCreation(100);
  });

  bench('task priority sorting', async () => {
    await benchTaskPrioritySorting();
  });

  bench('task retry', async () => {
    await benchTaskRetry();
  });

  bench('task metadata operations', async () => {
    await benchTaskMetadata();
  });
});
