/**
 * Task Repository Interface - Domain Layer
 *
 * Defines the contract for task persistence.
 * Implementation details are in the infrastructure layer.
 *
 * @module v3/agents/domain/interfaces
 */

import { Task, TaskStatus, TaskPriority, TaskType } from '../models/task.js';

/**
 * Task query options
 */
export interface TaskQueryOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  assignedAgentId?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'priority' | 'startedAt';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Task statistics
 */
export interface TaskStatistics {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  byType: Record<string, number>;
  averageExecutionTime: number;
  successRate: number;
  retryRate: number;
}

/**
 * Task Repository Interface
 *
 * Persistence contract for task aggregate roots.
 */
export interface ITaskRepository {
  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Save a task (insert or update)
   */
  save(task: Task): Promise<void>;

  /**
   * Find task by ID
   */
  findById(id: string): Promise<Task | null>;

  /**
   * Delete task by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if task exists
   */
  exists(id: string): Promise<boolean>;

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Save multiple tasks
   */
  saveMany(tasks: Task[]): Promise<void>;

  /**
   * Find tasks by IDs
   */
  findByIds(ids: string[]): Promise<Task[]>;

  /**
   * Delete multiple tasks
   */
  deleteMany(ids: string[]): Promise<number>;

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Find all tasks with optional filtering
   */
  findAll(options?: TaskQueryOptions): Promise<Task[]>;

  /**
   * Find tasks by status
   */
  findByStatus(status: TaskStatus): Promise<Task[]>;

  /**
   * Find tasks by priority
   */
  findByPriority(priority: TaskPriority): Promise<Task[]>;

  /**
   * Find tasks by type
   */
  findByType(type: TaskType): Promise<Task[]>;

  /**
   * Find tasks assigned to agent
   */
  findByAgent(agentId: string): Promise<Task[]>;

  /**
   * Find pending tasks
   */
  findPending(): Promise<Task[]>;

  /**
   * Find queued tasks
   */
  findQueued(): Promise<Task[]>;

  /**
   * Find running tasks
   */
  findRunning(): Promise<Task[]>;

  /**
   * Find timed out tasks
   */
  findTimedOut(): Promise<Task[]>;

  // ============================================================================
  // Queue Operations
  // ============================================================================

  /**
   * Get next task for execution
   *
   * Returns highest priority task whose dependencies are satisfied
   */
  getNextTask(agentCapabilities?: string[]): Promise<Task | null>;

  /**
   * Get task queue (ordered by priority)
   */
  getTaskQueue(limit?: number): Promise<Task[]>;

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get task statistics
   */
  getStatistics(): Promise<TaskStatistics>;

  /**
   * Count tasks matching criteria
   */
  count(options?: TaskQueryOptions): Promise<number>;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Initialize repository (create tables, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown repository (close connections, etc.)
   */
  shutdown(): Promise<void>;

  /**
   * Clear all tasks
   */
  clear(): Promise<void>;
}
