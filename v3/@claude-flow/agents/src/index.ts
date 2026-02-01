/**
 * @claude-flow/agents - Task Execution Domain
 *
 * Complete task execution domain following DDD patterns.
 * Manages task lifecycle, scheduling, and execution.
 *
 * @module @claude-flow/agents
 */

// Domain Models
export {
  Task,
  TaskId,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskCreated,
  TaskAssigned,
  TaskStarted,
  TaskCompleted,
  TaskFailed,
  TaskCancelled,
} from './domain/models/task.js';

export type {
  TaskResult,
  TaskMetrics,
  TaskProps,
} from './domain/models/task.js';

export {
  TaskQueue,
} from './domain/models/task-queue.js';

export type {
  TaskQueueConfig,
} from './domain/models/task-queue.js';

export {
  TaskGraph,
} from './domain/models/task-graph.js';

export type {
  ExecutionLevel,
} from './domain/models/task-graph.js';

// Domain Interfaces
export type {
  ITaskRepository,
  TaskQueryOptions,
  TaskStatistics,
} from './domain/interfaces/task-repository.js';

// Application Services
export {
  TaskExecutionService,
} from './application/services/task-execution-service.js';

export type {
  TaskSpec,
} from './application/services/task-execution-service.js';

export {
  TaskScheduler,
} from './application/services/task-scheduler.js';

export type {
  SchedulerConfig,
  AgentLoad,
} from './application/services/task-scheduler.js';

// Infrastructure
export { TaskRepository } from './infrastructure/repositories/task-repository.js';
