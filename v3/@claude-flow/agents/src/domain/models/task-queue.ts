/**
 * Task Queue - Domain Model
 *
 * Priority queue for task management with dependency support.
 * Supports priority-based dequeuing and dependency resolution.
 *
 * @module v3/agents/domain/models
 */

import { Task, TaskPriority, TaskStatus } from './task.js';

/**
 * Task Queue Configuration
 */
export interface TaskQueueConfig {
  maxSize?: number;
  priorityWeights?: Record<TaskPriority, number>;
}

/**
 * Task Queue - Priority Queue
 *
 * Manages tasks in priority order with dependency tracking.
 * Ensures tasks are dequeued in optimal order based on
 * priority and dependency satisfaction.
 */
export class TaskQueue {
  private _tasks: Map<string, Task>;
  private _maxSize: number;
  private _priorityWeights: Record<TaskPriority, number>;

  constructor(config: TaskQueueConfig = {}) {
    this._tasks = new Map();
    this._maxSize = config.maxSize ?? Infinity;
    this._priorityWeights = config.priorityWeights ?? {
      [TaskPriority.CRITICAL]: 1000,
      [TaskPriority.HIGH]: 100,
      [TaskPriority.NORMAL]: 10,
      [TaskPriority.LOW]: 1,
    };
  }

  /**
   * Enqueue a task
   */
  enqueue(task: Task): void {
    if (this._tasks.size >= this._maxSize) {
      throw new Error(`Queue is full (max size: ${this._maxSize})`);
    }

    if (this._tasks.has(task.id.value)) {
      throw new Error(`Task ${task.id.value} already in queue`);
    }

    this._tasks.set(task.id.value, task);
  }

  /**
   * Dequeue next task by priority
   *
   * Returns the highest priority task whose dependencies are satisfied
   */
  dequeue(): Task | null {
    if (this._tasks.size === 0) {
      return null;
    }

    const completedTaskIds = this.getCompletedTaskIds();
    const eligibleTasks = Array.from(this._tasks.values())
      .filter(task =>
        task.status === TaskStatus.QUEUED &&
        task.areDependenciesSatisfied(completedTaskIds)
      );

    if (eligibleTasks.length === 0) {
      return null;
    }

    // Sort by priority (highest first)
    eligibleTasks.sort((a, b) => a.comparePriority(b));

    const nextTask = eligibleTasks[0];
    this._tasks.delete(nextTask.id.value);

    return nextTask;
  }

  /**
   * Peek at next task without removing it
   */
  peek(): Task | null {
    if (this._tasks.size === 0) {
      return null;
    }

    const completedTaskIds = this.getCompletedTaskIds();
    const eligibleTasks = Array.from(this._tasks.values())
      .filter(task =>
        task.status === TaskStatus.QUEUED &&
        task.areDependenciesSatisfied(completedTaskIds)
      );

    if (eligibleTasks.length === 0) {
      return null;
    }

    eligibleTasks.sort((a, b) => a.comparePriority(b));
    return eligibleTasks[0];
  }

  /**
   * Get task by ID
   */
  get(taskId: string): Task | undefined {
    return this._tasks.get(taskId);
  }

  /**
   * Remove task from queue
   */
  remove(taskId: string): boolean {
    return this._tasks.delete(taskId);
  }

  /**
   * Check if task exists in queue
   */
  has(taskId: string): boolean {
    return this._tasks.has(taskId);
  }

  /**
   * Get all tasks
   */
  getAll(): Task[] {
    return Array.from(this._tasks.values());
  }

  /**
   * Get tasks by priority
   */
  getByPriority(priority: TaskPriority): Task[] {
    return Array.from(this._tasks.values())
      .filter(task => task.priority === priority);
  }

  /**
   * Get tasks by status
   */
  getByStatus(status: TaskStatus): Task[] {
    return Array.from(this._tasks.values())
      .filter(task => task.status === status);
  }

  /**
   * Get ready tasks (dependencies satisfied)
   */
  getReadyTasks(): Task[] {
    const completedTaskIds = this.getCompletedTaskIds();
    return Array.from(this._tasks.values())
      .filter(task =>
        task.status === TaskStatus.QUEUED &&
        task.areDependenciesSatisfied(completedTaskIds)
      );
  }

  /**
   * Get blocked tasks (dependencies not satisfied)
   */
  getBlockedTasks(): Task[] {
    const completedTaskIds = this.getCompletedTaskIds();
    return Array.from(this._tasks.values())
      .filter(task =>
        task.status === TaskStatus.QUEUED &&
        !task.areDependenciesSatisfied(completedTaskIds)
      );
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this._tasks.size;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this._tasks.size === 0;
  }

  /**
   * Check if queue is full
   */
  isFull(): boolean {
    return this._tasks.size >= this._maxSize;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this._tasks.clear();
  }

  /**
   * Get priority score for a task
   */
  getPriorityScore(task: Task): number {
    return this._priorityWeights[task.priority];
  }

  /**
   * Get tasks sorted by priority
   */
  getSortedByPriority(): Task[] {
    const tasks = Array.from(this._tasks.values());
    return tasks.sort((a, b) => a.comparePriority(b));
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    total: number;
    byPriority: Record<TaskPriority, number>;
    byStatus: Record<TaskStatus, number>;
    ready: number;
    blocked: number;
  } {
    const tasks = Array.from(this._tasks.values());
    const byPriority: Record<TaskPriority, number> = {
      [TaskPriority.CRITICAL]: 0,
      [TaskPriority.HIGH]: 0,
      [TaskPriority.NORMAL]: 0,
      [TaskPriority.LOW]: 0,
    };
    const byStatus: Record<TaskStatus, number> = {
      [TaskStatus.PENDING]: 0,
      [TaskStatus.QUEUED]: 0,
      [TaskStatus.ASSIGNED]: 0,
      [TaskStatus.RUNNING]: 0,
      [TaskStatus.COMPLETED]: 0,
      [TaskStatus.FAILED]: 0,
      [TaskStatus.CANCELLED]: 0,
    };

    tasks.forEach(task => {
      byPriority[task.priority]++;
      byStatus[task.status]++;
    });

    return {
      total: this._tasks.size,
      byPriority,
      byStatus,
      ready: this.getReadyTasks().length,
      blocked: this.getBlockedTasks().length,
    };
  }

  /**
   * Get completed task IDs from all tasks
   */
  private getCompletedTaskIds(): Set<string> {
    const completedIds = new Set<string>();
    this._tasks.forEach(task => {
      if (task.status === TaskStatus.COMPLETED) {
        completedIds.add(task.id.value);
      }
    });
    return completedIds;
  }

  /**
   * Convert to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      size: this._tasks.size,
      maxSize: this._maxSize,
      tasks: Array.from(this._tasks.values()).map(t => t.toJSON()),
      statistics: this.getStatistics(),
    };
  }
}
