# Task Execution Guide

Complete guide to task creation, assignment, dependencies, and error handling in Claude Flow v3.

## Table of Contents

- [Creating Tasks](#creating-tasks)
- [Task Assignment](#task-assignment)
- [Task Dependencies (DAGs)](#task-dependencies-dags)
- [Task Queues](#task-queues)
- [Error Handling](#error-handling)
- [Advanced Patterns](#advanced-patterns)

## Creating Tasks

### Basic Task Creation

```bash
# CLI
npx @claude-flow/cli@alpha task create \
  --title "Implement user authentication" \
  --description "Add JWT-based authentication to the API" \
  --priority high \
  --estimated-duration 3600000
```

```typescript
// Programmatic
import { TaskExecutionService } from '@claude-flow/agents';
import { TaskPriority } from '@claude-flow/agents/domain';

const taskService = new TaskExecutionService(taskRepo);

const task = await taskService.createTask({
  title: 'Implement user authentication',
  description: 'Add JWT-based authentication to the API',
  priority: TaskPriority.High,
  estimatedDuration: 3600000, // 1 hour in ms
  metadata: {
    module: 'auth',
    complexity: 'medium',
  },
});

console.log(`Created task: ${task.id}`);
```

### Task Types

```typescript
enum TaskPriority {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
  Critical = 'critical',
}

interface TaskSpec {
  title: string;
  description: string;
  priority: TaskPriority;
  estimatedDuration?: number;
  requiredCapabilities?: string[];
  dependencies?: TaskId[];
  metadata?: Record<string, unknown>;
}
```

### Batch Task Creation

```typescript
async function createFeatureTasks(): Promise<Task[]> {
  const specs: TaskSpec[] = [
    {
      title: 'Design database schema',
      priority: TaskPriority.High,
      requiredCapabilities: ['database-design'],
    },
    {
      title: 'Implement data models',
      priority: TaskPriority.High,
      requiredCapabilities: ['coding'],
    },
    {
      title: 'Write unit tests',
      priority: TaskPriority.Normal,
      requiredCapabilities: ['testing'],
    },
    {
      title: 'Write API documentation',
      priority: TaskPriority.Low,
      requiredCapabilities: ['documentation'],
    },
  ];

  return Promise.all(specs.map(spec => taskService.createTask(spec)));
}
```

## Task Assignment

### Manual Assignment

```bash
# Assign task to specific agent
npx @claude-flow/cli@alpha task assign \
  --task-id task-123 \
  --agent-id agent-456
```

```typescript
// Programmatic assignment
await taskService.assignTask(taskId, agentId);
```

### Auto-assignment

```typescript
class TaskAssigner {
  async autoAssignTask(task: Task): Promise<Agent> {
    // Find suitable agents
    const suitableAgents = await this.findSuitableAgents(task);

    if (suitableAgents.length === 0) {
      throw new NoSuitableAgentError();
    }

    // Select best agent based on:
    // 1. Capability match
    // 2. Current workload
    // 3. Historical performance
    const agent = this.selectBestAgent(suitableAgents, task);

    // Assign task
    await taskService.assignTask(task.id, agent.id);

    return agent;
  }

  private async findSuitableAgents(task: Task): Promise<Agent[]> {
    const allAgents = await agentRepo.findByStatus('idle');

    return allAgents.filter(agent => {
      // Check capabilities
      const hasCapabilities = task.requiredCapabilities?.every(cap =>
        agent.capabilities.includes(cap)
      ) ?? true;

      // Check workload
      const notOverloaded = agent.currentTasks.length < 3;

      return hasCapabilities && notOverloaded;
    });
  }

  private selectBestAgent(agents: Agent[], task: Task): Agent {
    // Score each agent
    const scores = agents.map(agent => ({
      agent,
      score: this.scoreAgent(agent, task),
    }));

    // Return highest scoring agent
    scores.sort((a, b) => b.score - a.score);
    return scores[0].agent;
  }

  private scoreAgent(agent: Agent, task: Task): number {
    let score = 0;

    // Capability match
    const capabilityMatch = task.requiredCapabilities?.filter(cap =>
      agent.capabilities.includes(cap)
    ).length ?? 0;
    score += capabilityMatch * 10;

    // Low workload
    score += (5 - agent.currentTasks.length) * 5;

    // High success rate
    score += agent.metrics.successRate;

    // Recent activity (prefer active agents)
    const minutesSinceActive = 
      (Date.now() - agent.lastActive.getTime()) / 1000 / 60;
    score += Math.max(0, 10 - minutesSinceActive);

    return score;
  }
}
```

### Load Balancing

```typescript
class LoadBalancingAssigner {
  async assignTask(task: Task): Promise<Agent> {
    // Get all idle agents
    const idleAgents = await agentRepo.findByStatus('idle');

    if (idleAgents.length > 0) {
      // Assign to idle agent
      return this.selectIdleAgent(idleAgents, task);
    }

    // Find least loaded agent
    const allAgents = await agentRepo.findAll();
    const leastLoaded = allAgents.reduce((min, agent) =>
      agent.currentTasks.length < min.currentTasks.length ? agent : min
    );

    await taskService.assignTask(task.id, leastLoaded.id);
    return leastLoaded;
  }

  private selectIdleAgent(agents: Agent[], task: Task): Agent {
    // Round-robin selection
    const index = this.lastAssignedIndex++ % agents.length;
    return agents[index];
  }
}
```

## Task Dependencies (DAGs)

### Creating Dependencies

```typescript
import { TaskGraph } from '@claude-flow/agents/domain';

// Create task graph
const graph = new TaskGraph();

// Add tasks
const tasks = await createFeatureTasks();
tasks.forEach(task => graph.addTask(task));

// Define dependencies
// implement depends on design
await graph.addDependency(tasks[1].id, tasks[0].id);

// tests depend on implement
await graph.addDependency(tasks[2].id, tasks[1].id);

// docs depend on implement
await graph.addDependency(tasks[3].id, tasks[1].id);
```

### Execution Order

```typescript
// Get topological order
const executionOrder = graph.getExecutionOrder();

console.log('Execution order:');
executionOrder.forEach((taskId, index) => {
  const task = graph.getTask(taskId);
  console.log(`${index + 1}. ${task.title}`);
});

// Output:
// 1. Design database schema
// 2. Implement data models
// 3. Write unit tests
// 4. Write API documentation
```

### Parallel Execution

```typescript
async function executeTaskGraph(graph: TaskGraph): Promise<void> {
  const order = graph.getExecutionOrder();
  const completed = new Set<TaskId>();

  // Group tasks by level (tasks that can run in parallel)
  const levels = this.groupByLevel(graph, order);

  for (const level of levels) {
    // Execute all tasks in level in parallel
    await Promise.all(
      level.map(async taskId => {
        const task = graph.getTask(taskId);
        const agent = await taskAssigner.autoAssignTask(task);

        await taskService.executeTask(task.id, agent.id);
        completed.add(task.id);
      })
    );
  }
}

private groupByLevel(
  graph: TaskGraph,
  order: TaskId[]
): TaskId[][] {
  const levels: TaskId[][] = [];
  const level = new Map<TaskId, number>();

  for (const taskId of order) {
    const task = graph.getTask(taskId);
    const depLevels = task.dependencies.map(depId => level.get(depId) ?? 0);
    const taskLevel = depLevels.length > 0 ? Math.max(...depLevels) + 1 : 0;

    level.set(taskId, taskLevel);

    if (!levels[taskLevel]) {
      levels[taskLevel] = [];
    }
    levels[taskLevel].push(taskId);
  }

  return levels;
}
```

### Cycle Detection

```typescript
class TaskGraph {
  addDependency(taskId: TaskId, dependsOn: TaskId): void {
    // Check for cycles before adding
    if (this.wouldCreateCycle(taskId, dependsOn)) {
      throw new CyclicDependencyError(
        `Adding dependency ${dependsOn} → ${taskId} would create a cycle`
      );
    }

    const task = this.tasks.get(taskId);
    task.addDependency(dependsOn);
  }

  private wouldCreateCycle(from: TaskId, to: TaskId): boolean {
    // DFS to check if there's a path from 'to' to 'from'
    const visited = new Set<TaskId>();
    const stack = [to];

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (current === from) {
        return true; // Found cycle
      }

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      const task = this.tasks.get(current);
      task.dependencies.forEach(dep => stack.push(dep));
    }

    return false;
  }
}
```

## Task Queues

### Priority Queue

```typescript
class PriorityTaskQueue {
  private queues: Map<TaskPriority, Task[]> = new Map([
    [TaskPriority.Critical, []],
    [TaskPriority.High, []],
    [TaskPriority.Normal, []],
    [TaskPriority.Low, []],
  ]);

  enqueue(task: Task): void {
    const queue = this.queues.get(task.priority)!;
    queue.push(task);
  }

  dequeue(): Task | null {
    // Try each priority level in order
    for (const priority of [
      TaskPriority.Critical,
      TaskPriority.High,
      TaskPriority.Normal,
      TaskPriority.Low,
    ]) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }

  peek(): Task | null {
    for (const priority of [
      TaskPriority.Critical,
      TaskPriority.High,
      TaskPriority.Normal,
      TaskPriority.Low,
    ]) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  size(): number {
    return Array.from(this.queues.values())
      .reduce((sum, queue) => sum + queue.length, 0);
  }
}
```

### Fair Queue

```typescript
class FairTaskQueue {
  private queues: Map<string, Task[]> = new Map();
  private lastServed: string | null = null;

  enqueue(task: Task): void {
    const category = task.metadata.category as string;

    if (!this.queues.has(category)) {
      this.queues.set(category, []);
    }

    this.queues.get(category)!.push(task);
  }

  dequeue(): Task | null {
    if (this.queues.size === 0) {
      return null;
    }

    // Round-robin between categories
    const categories = Array.from(this.queues.keys());
    const startIdx = this.lastServed 
      ? categories.indexOf(this.lastServed) + 1 
      : 0;

    for (let i = 0; i < categories.length; i++) {
      const idx = (startIdx + i) % categories.length;
      const category = categories[idx];
      const queue = this.queues.get(category)!;

      if (queue.length > 0) {
        this.lastServed = category;
        return queue.shift()!;
      }
    }

    return null;
  }
}
```

## Error Handling

### Retry Strategies

```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

class TaskExecutor {
  async executeWithRetry(
    task: Task,
    agent: Agent,
    config: RetryConfig
  ): Promise<TaskResult> {
    let attempt = 0;
    let delay = config.initialDelay;

    while (attempt < config.maxAttempts) {
      try {
        return await this.execute(task, agent);
      } catch (error) {
        attempt++;

        if (attempt >= config.maxAttempts) {
          throw new MaxRetriesExceededError(task.id, error);
        }

        console.log(`Task ${task.id} failed (attempt ${attempt}), retrying in ${delay}ms`);

        // Wait before retry
        await this.sleep(delay);

        // Exponential backoff
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
      }
    }

    throw new Error('Unreachable');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Error Recovery

```typescript
class ErrorRecovery {
  async handleTaskFailure(task: Task, error: Error): Promise<void> {
    // Log error
    await this.logError(task, error);

    // Determine recovery strategy
    if (error instanceof AgentTimeoutError) {
      // Retry with different agent
      const newAgent = await this.findAvailableAgent(task);
      await taskService.assignTask(task.id, newAgent.id);
    } else if (error instanceof DependencyFailedError) {
      // Retry dependencies first
      await this.retryDependencies(task);
      await taskService.retryTask(task.id);
    } else if (error instanceof InsufficientCapabilitiesError) {
      // Spawn specialized agent
      const specialist = await this.spawnSpecialist(task);
      await taskService.assignTask(task.id, specialist.id);
    } else {
      // Generic retry
      await taskService.retryTask(task.id);
    }
  }

  async retryDependencies(task: Task): Promise<void> {
    const failedDeps = task.dependencies.filter(depId => {
      const dep = taskRepo.findById(depId);
      return dep?.status === TaskStatus.Failed;
    });

    await Promise.all(
      failedDeps.map(depId => taskService.retryTask(depId))
    );
  }
}
```

### Circuit Breaker

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private config = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    successThreshold: 2,
  };

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new CircuitBreakerOpenError();
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }
}
```

## Advanced Patterns

### Task Streaming

```typescript
async function* executeTasksStream(
  tasks: Task[]
): AsyncGenerator<TaskResult> {
  for (const task of tasks) {
    const agent = await taskAssigner.autoAssignTask(task);
    const result = await taskService.executeTask(task.id, agent.id);
    yield result;
  }
}

// Usage
for await (const result of executeTasksStream(tasks)) {
  console.log(`Task ${result.taskId} completed: ${result.status}`);
}
```

### Task Batching

```typescript
async function executeBatch(
  tasks: Task[],
  batchSize: number
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async task => {
        const agent = await taskAssigner.autoAssignTask(task);
        return taskService.executeTask(task.id, agent.id);
      })
    );

    results.push(...batchResults);

    // Brief pause between batches
    if (i + batchSize < tasks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
```

### Progress Tracking

```typescript
class ProgressTracker {
  async trackTaskGraph(graph: TaskGraph): Promise<void> {
    const totalTasks = graph.size();
    let completedTasks = 0;

    // Subscribe to task completion events
    eventBus.subscribe('TaskCompleted', (event: TaskCompletedEvent) => {
      if (graph.hasTask(event.taskId)) {
        completedTasks++;
        const progress = (completedTasks / totalTasks) * 100;
        this.reportProgress(progress, event.taskId);
      }
    });
  }

  private reportProgress(percentage: number, completedTaskId: TaskId): void {
    console.log(`Progress: ${percentage.toFixed(1)}%`);
    console.log(`Completed task: ${completedTaskId}`);

    // Update UI, send notification, etc.
    this.updateProgressBar(percentage);
  }
}
```

## Next Steps

- [Swarm Coordination Guide](./swarm-coordination.md) - Multi-agent orchestration
- [Memory Usage Guide](./memory-usage.md) - Share context between tasks
- [Agent Management Guide](./agent-management.md) - Agent pools and health
