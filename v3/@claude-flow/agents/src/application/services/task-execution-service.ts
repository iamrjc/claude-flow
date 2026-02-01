/**
 * Task Execution Service - Application Layer
 *
 * Coordinates task lifecycle operations.
 * Orchestrates domain models and repository.
 *
 * @module v3/agents/application/services
 */

import { EventEmitter } from 'events';
import { Task, TaskId, TaskProps, TaskResult, TaskType, TaskPriority } from '../../domain/models/task.js';
import { ITaskRepository } from '../../domain/interfaces/task-repository.js';

/**
 * Task specification for creation
 */
export interface TaskSpec {
  title: string;
  description: string;
  type: TaskType;
  priority?: TaskPriority;
  input?: unknown;
  blockedBy?: string[];
  blocks?: string[];
  metadata?: Record<string, unknown>;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Task Execution Service
 *
 * Application service for task lifecycle management.
 * Emits events for task state changes.
 */
export class TaskExecutionService extends EventEmitter {
  constructor(private readonly repository: ITaskRepository) {
    super();
  }

  /**
   * Create a new task
   */
  async createTask(spec: TaskSpec): Promise<TaskId> {
    const taskProps: TaskProps = {
      title: spec.title,
      description: spec.description,
      type: spec.type,
      priority: spec.priority,
      input: spec.input,
      blockedBy: spec.blockedBy,
      blocks: spec.blocks,
      metadata: spec.metadata,
      maxRetries: spec.maxRetries,
      timeout: spec.timeout,
    };

    const task = Task.create(taskProps);

    // Forward domain events
    task.on('domain-event', (event) => {
      this.emit('task-event', event);
    });

    await this.repository.save(task);

    return task.id;
  }

  /**
   * Assign task to an agent
   */
  async assignTask(taskId: string, agentId: string): Promise<void> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.on('domain-event', (event) => {
      this.emit('task-event', event);
    });

    task.assign(agentId);
    await this.repository.save(task);
  }

  /**
   * Start task execution
   */
  async startTask(taskId: string): Promise<void> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.on('domain-event', (event) => {
      this.emit('task-event', event);
    });

    task.start();
    await this.repository.save(task);
  }

  /**
   * Complete task with result
   */
  async completeTask(taskId: string, result: TaskResult): Promise<void> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.on('domain-event', (event) => {
      this.emit('task-event', event);
    });

    task.complete(result);
    await this.repository.save(task);
  }

  /**
   * Fail task with error
   */
  async failTask(taskId: string, error: string): Promise<void> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.on('domain-event', (event) => {
      this.emit('task-event', event);
    });

    task.fail(error);
    await this.repository.save(task);
  }

  /**
   * Cancel task
   */
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.on('domain-event', (event) => {
      this.emit('task-event', event);
    });

    task.cancel(reason);
    await this.repository.save(task);
  }

  /**
   * Get next task for agent
   *
   * Returns highest priority task that the agent can execute
   */
  async getNextTask(agentId?: string, capabilities?: string[]): Promise<Task | null> {
    return await this.repository.getNextTask(capabilities);
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    return await this.repository.findById(taskId);
  }

  /**
   * Get tasks by agent
   */
  async getTasksByAgent(agentId: string): Promise<Task[]> {
    return await this.repository.findByAgent(agentId);
  }

  /**
   * Get pending tasks
   */
  async getPendingTasks(): Promise<Task[]> {
    return await this.repository.findPending();
  }

  /**
   * Get running tasks
   */
  async getRunningTasks(): Promise<Task[]> {
    return await this.repository.findRunning();
  }

  /**
   * Handle timed out tasks
   */
  async handleTimedOutTasks(): Promise<void> {
    const timedOut = await this.repository.findTimedOut();

    for (const task of timedOut) {
      task.on('domain-event', (event) => {
        this.emit('task-event', event);
      });

      task.fail('Task timed out');
      await this.repository.save(task);
    }
  }

  /**
   * Get task statistics
   */
  async getStatistics(): Promise<any> {
    return await this.repository.getStatistics();
  }

  /**
   * Delete task
   */
  async deleteTask(taskId: string): Promise<boolean> {
    return await this.repository.delete(taskId);
  }
}
