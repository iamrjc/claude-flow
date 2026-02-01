# @claude-flow/agents - Task Execution Domain

Complete Domain-Driven Design (DDD) implementation of the Task Execution domain for Claude Flow V3.

## Overview

This package provides a comprehensive task execution system with:

- **Task Lifecycle Management** - State machine with validation
- **Priority Queue** - Priority-based task scheduling
- **Task Graph (DAG)** - Complex workflow management with topological sorting
- **Task Scheduler** - Load balancing and retry logic
- **SQLite Persistence** - Repository pattern with better-sqlite3
- **Domain Events** - EventEmitter-based event system

## Architecture

### Domain Layer (`domain/`)

#### Models
- **Task** - Aggregate root with state machine
  - TaskId value object
  - TaskStatus enum (pending, queued, assigned, running, completed, failed, cancelled)
  - TaskPriority (low, normal, high, critical)
  - TaskType (code, research, review, test, etc.)
  - Domain events (TaskCreated, TaskAssigned, TaskStarted, TaskCompleted, TaskFailed, TaskCancelled)

- **TaskQueue** - Priority queue with dependency support
  - Priority-based dequeuing
  - Dependency satisfaction checking
  - Queue statistics

- **TaskGraph** - Directed Acyclic Graph (DAG)
  - Topological sorting
  - Parallel execution detection
  - Cycle detection

#### Interfaces
- **ITaskRepository** - Repository contract
  - CRUD operations
  - Bulk operations
  - Query operations
  - Queue operations
  - Statistics

### Application Layer (`application/`)

- **TaskExecutionService** - Task lifecycle orchestration
  - Create, assign, start, complete, fail, cancel tasks
  - Event emission
  - Task queries

- **TaskScheduler** - Task scheduling and load balancing
  - Agent registration
  - Task assignment
  - Retry logic with exponential backoff
  - Load balancing strategies

### Infrastructure Layer (`infrastructure/`)

- **TaskRepository** - SQLite implementation
  - better-sqlite3 for performance
  - Indexed queries
  - Transaction support
  - Statistics calculation

## Installation

```bash
npm install @claude-flow/agents
```

## Usage

### Basic Task Lifecycle

```typescript
import {
  Task,
  TaskType,
  TaskPriority,
  TaskExecutionService,
  TaskRepository,
} from '@claude-flow/agents';

// Initialize repository
const repository = new TaskRepository('./tasks.db');
await repository.initialize();

// Create service
const service = new TaskExecutionService(repository);

// Create task
const taskId = await service.createTask({
  title: 'Implement feature',
  description: 'Add new authentication system',
  type: TaskType.CODE,
  priority: TaskPriority.HIGH,
  input: { feature: 'auth' },
});

// Assign to agent
await service.assignTask(taskId.value, 'agent-1');

// Start execution
await service.startTask(taskId.value);

// Complete with result
await service.completeTask(taskId.value, {
  output: { status: 'success' },
  metrics: {
    executionTime: 5000,
    tokensUsed: 1500,
  },
});

// Cleanup
await repository.shutdown();
```

### Task Queue

```typescript
import { TaskQueue, Task, TaskPriority } from '@claude-flow/agents';

const queue = new TaskQueue({ maxSize: 100 });

// Enqueue tasks
const task1 = Task.create({
  title: 'High priority task',
  description: 'Critical bug fix',
  type: TaskType.CODE,
  priority: TaskPriority.CRITICAL,
});

const task2 = Task.create({
  title: 'Low priority task',
  description: 'Refactoring',
  type: TaskType.REFACTOR,
  priority: TaskPriority.LOW,
});

task1.queue();
task2.queue();

queue.enqueue(task1);
queue.enqueue(task2);

// Dequeue by priority (highest first)
const next = queue.dequeue(); // Returns task1

// Get statistics
const stats = queue.getStatistics();
console.log(`Queue size: ${stats.total}`);
```

### Task Graph (DAG)

```typescript
import { TaskGraph, Task } from '@claude-flow/agents';

const graph = new TaskGraph();

// Create tasks with dependencies
const task1 = Task.create({
  title: 'Design architecture',
  description: 'Design system',
  type: TaskType.CODE,
});

const task2 = Task.create({
  title: 'Implement core',
  description: 'Build core modules',
  type: TaskType.CODE,
  blockedBy: [task1.id.value],
});

const task3 = Task.create({
  title: 'Write tests',
  description: 'Unit tests',
  type: TaskType.TEST,
  blockedBy: [task2.id.value],
});

graph.addTask(task1);
graph.addTask(task2);
graph.addTask(task3);

// Topological sort (execution order)
const executionOrder = graph.topologicalSort();
// [task1, task2, task3]

// Get parallel execution levels
const levels = graph.getExecutionLevels();
// [{ level: 0, tasks: [task1] }, { level: 1, tasks: [task2] }, ...]
```

### Task Scheduler

```typescript
import { TaskScheduler, TaskRepository } from '@claude-flow/agents';

const repository = new TaskRepository(':memory:');
await repository.initialize();

const scheduler = new TaskScheduler(repository, {
  maxConcurrentTasks: 5,
  retryDelay: 5000,
  loadBalancingStrategy: 'priority',
});

// Register agents
scheduler.registerAgent('agent-1', ['code', 'test']);
scheduler.registerAgent('agent-2', ['review', 'deploy']);

// Listen for events
scheduler.on('task-assigned', ({ taskId, agentId }) => {
  console.log(`Task ${taskId} assigned to ${agentId}`);
});

scheduler.on('task-completed', ({ taskId }) => {
  console.log(`Task ${taskId} completed`);
});

// Schedule task
const task = Task.create({
  title: 'Deploy app',
  description: 'Deploy to production',
  type: TaskType.DEPLOY,
});

await scheduler.scheduleTask(task);

// Get statistics
const stats = scheduler.getStatistics();
console.log(`Running tasks: ${stats.runningTasks}`);
console.log(`Available agents: ${stats.availableAgents}`);

// Cleanup
scheduler.cleanup();
```

### Domain Events

```typescript
const task = Task.create({
  title: 'Test Task',
  description: 'Test',
  type: TaskType.CODE,
});

// Listen for domain events
task.on('domain-event', (event) => {
  console.log(`Event: ${event.constructor.name}`);

  if (event instanceof TaskCreated) {
    console.log(`Task created: ${event.taskId}`);
  }

  if (event instanceof TaskAssigned) {
    console.log(`Task assigned to: ${event.agentId}`);
  }

  if (event instanceof TaskCompleted) {
    console.log(`Task completed with result:`, event.result);
  }
});

task.queue();
task.assign('agent-1');
task.start();
task.complete({ output: 'done' });
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

The test suite includes 40+ tests covering:
- Task state machine
- Queue ordering
- Graph/DAG operations
- Repository persistence
- Service integration
- Scheduler logic
- Domain events

Target coverage: >80%

## State Machine

Tasks follow a strict state machine:

```
PENDING → QUEUED → ASSIGNED → RUNNING → COMPLETED
                                    ↓
                                 FAILED
                                    ↓
                             (retry) → QUEUED
                                    ↓
                            (max retries) → FAILED

Any non-terminal state → CANCELLED
```

### Valid Transitions

- `PENDING` → `QUEUED`, `ASSIGNED`, `CANCELLED`
- `QUEUED` → `ASSIGNED`, `CANCELLED`
- `ASSIGNED` → `RUNNING`, `FAILED`, `CANCELLED`
- `RUNNING` → `COMPLETED`, `FAILED`, `CANCELLED`
- Terminal states (`COMPLETED`, `FAILED`, `CANCELLED`) → no transitions

## Domain Events

| Event | Emitted When | Properties |
|-------|-------------|------------|
| `TaskCreated` | Task is created | taskId, type, priority |
| `TaskAssigned` | Task assigned to agent | taskId, agentId |
| `TaskStarted` | Task execution starts | taskId |
| `TaskCompleted` | Task completes successfully | taskId, result |
| `TaskFailed` | Task fails | taskId, error, retryCount, willRetry |
| `TaskCancelled` | Task is cancelled | taskId, reason |

## Repository Operations

### CRUD
- `save(task)` - Insert or update
- `findById(id)` - Find by ID
- `delete(id)` - Delete by ID
- `exists(id)` - Check existence

### Bulk
- `saveMany(tasks)` - Bulk insert/update
- `findByIds(ids)` - Bulk find
- `deleteMany(ids)` - Bulk delete

### Queries
- `findAll(options)` - Query with filters
- `findByStatus(status)` - Filter by status
- `findByPriority(priority)` - Filter by priority
- `findByAgent(agentId)` - Filter by agent
- `findPending()` - Get pending tasks
- `findQueued()` - Get queued tasks
- `findRunning()` - Get running tasks
- `findTimedOut()` - Get timed out tasks

### Queue
- `getNextTask(capabilities)` - Get next task for execution
- `getTaskQueue(limit)` - Get priority-ordered queue

### Statistics
- `getStatistics()` - Get comprehensive stats
- `count(options)` - Count tasks

## License

MIT

## Author

Claude Flow Team
