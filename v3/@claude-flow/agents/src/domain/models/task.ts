/**
 * Task Aggregate Root - Domain Layer
 *
 * Task execution domain entity with state machine, events, and business logic.
 * Manages task lifecycle, dependencies, and results.
 *
 * @module v3/agents/domain/models
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

/**
 * Task status enum
 */
export enum TaskStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  ASSIGNED = 'assigned',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Task priority levels
 */
export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Task types
 */
export enum TaskType {
  CODE = 'code',
  RESEARCH = 'research',
  REVIEW = 'review',
  TEST = 'test',
  DEPLOY = 'deploy',
  ANALYZE = 'analyze',
  DOCUMENT = 'document',
  REFACTOR = 'refactor',
  DEBUG = 'debug',
  OPTIMIZE = 'optimize',
}

/**
 * Task ID value object
 */
export class TaskId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('TaskId cannot be empty');
    }
    this._value = value;
  }

  static create(value?: string): TaskId {
    return new TaskId(value ?? randomUUID());
  }

  static fromString(value: string): TaskId {
    return new TaskId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: TaskId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

/**
 * Task result
 */
export interface TaskResult {
  output?: unknown;
  error?: string;
  metrics?: TaskMetrics;
}

/**
 * Task metrics
 */
export interface TaskMetrics {
  executionTime?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  apiCalls?: number;
  tokensUsed?: number;
  cost?: number;
}

/**
 * Task properties
 */
export interface TaskProps {
  id?: TaskId;
  title: string;
  description: string;
  type: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  assignedAgentId?: string;
  blockedBy?: string[];
  blocks?: string[];
  input?: unknown;
  output?: unknown;
  error?: string;
  metrics?: TaskMetrics;
  retryCount?: number;
  maxRetries?: number;
  timeout?: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Domain Events
 */
export class TaskCreated {
  constructor(
    public readonly taskId: string,
    public readonly type: TaskType,
    public readonly priority: TaskPriority,
    public readonly timestamp: Date = new Date()
  ) {}
}

export class TaskAssigned {
  constructor(
    public readonly taskId: string,
    public readonly agentId: string,
    public readonly timestamp: Date = new Date()
  ) {}
}

export class TaskStarted {
  constructor(
    public readonly taskId: string,
    public readonly timestamp: Date = new Date()
  ) {}
}

export class TaskCompleted {
  constructor(
    public readonly taskId: string,
    public readonly result: TaskResult,
    public readonly timestamp: Date = new Date()
  ) {}
}

export class TaskFailed {
  constructor(
    public readonly taskId: string,
    public readonly error: string,
    public readonly retryCount: number,
    public readonly willRetry: boolean,
    public readonly timestamp: Date = new Date()
  ) {}
}

export class TaskCancelled {
  constructor(
    public readonly taskId: string,
    public readonly reason?: string,
    public readonly timestamp: Date = new Date()
  ) {}
}

/**
 * Task - Aggregate Root
 *
 * Manages task lifecycle with state machine validation,
 * dependency tracking, and domain events.
 */
export class Task extends EventEmitter {
  private _id: TaskId;
  private _title: string;
  private _description: string;
  private _type: TaskType;
  private _priority: TaskPriority;
  private _status: TaskStatus;
  private _assignedAgentId?: string;
  private _blockedBy: Set<string>;
  private _blocks: Set<string>;
  private _input?: unknown;
  private _output?: unknown;
  private _error?: string;
  private _metrics?: TaskMetrics;
  private _retryCount: number;
  private _maxRetries: number;
  private _timeout: number;
  private _metadata: Record<string, unknown>;
  private _createdAt: Date;
  private _startedAt?: Date;
  private _completedAt?: Date;

  private constructor(props: TaskProps) {
    super();
    const now = new Date();

    this._id = props.id ?? TaskId.create();
    this._title = props.title;
    this._description = props.description;
    this._type = props.type;
    this._priority = props.priority ?? TaskPriority.NORMAL;
    this._status = props.status ?? TaskStatus.PENDING;
    this._assignedAgentId = props.assignedAgentId;
    this._blockedBy = new Set(props.blockedBy ?? []);
    this._blocks = new Set(props.blocks ?? []);
    this._input = props.input;
    this._output = props.output;
    this._error = props.error;
    this._metrics = props.metrics;
    this._retryCount = props.retryCount ?? 0;
    this._maxRetries = props.maxRetries ?? 3;
    this._timeout = props.timeout ?? 300000; // 5 minutes
    this._metadata = props.metadata ?? {};
    this._createdAt = props.createdAt ?? now;
    this._startedAt = props.startedAt;
    this._completedAt = props.completedAt;
  }

  /**
   * Factory method - Create new task
   */
  static create(props: TaskProps): Task {
    const task = new Task(props);
    task.emit('domain-event', new TaskCreated(
      task._id.value,
      task._type,
      task._priority
    ));
    return task;
  }

  /**
   * Factory method - Reconstruct from persistence
   */
  static fromPersistence(props: TaskProps): Task {
    return new Task(props);
  }

  // Getters
  get id(): TaskId {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get description(): string {
    return this._description;
  }

  get type(): TaskType {
    return this._type;
  }

  get priority(): TaskPriority {
    return this._priority;
  }

  get status(): TaskStatus {
    return this._status;
  }

  get assignedAgentId(): string | undefined {
    return this._assignedAgentId;
  }

  get blockedBy(): string[] {
    return Array.from(this._blockedBy);
  }

  get blocks(): string[] {
    return Array.from(this._blocks);
  }

  get input(): unknown {
    return this._input;
  }

  get output(): unknown {
    return this._output;
  }

  get error(): string | undefined {
    return this._error;
  }

  get metrics(): TaskMetrics | undefined {
    return this._metrics ? { ...this._metrics } : undefined;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  get maxRetries(): number {
    return this._maxRetries;
  }

  get timeout(): number {
    return this._timeout;
  }

  get metadata(): Record<string, unknown> {
    return { ...this._metadata };
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  get startedAt(): Date | undefined {
    return this._startedAt ? new Date(this._startedAt) : undefined;
  }

  get completedAt(): Date | undefined {
    return this._completedAt ? new Date(this._completedAt) : undefined;
  }

  // ============================================================================
  // State Machine - Business Logic
  // ============================================================================

  /**
   * Queue the task for execution
   */
  queue(): void {
    this.validateTransition(TaskStatus.QUEUED);
    if (this._status !== TaskStatus.PENDING) {
      throw new Error(`Cannot queue task in ${this._status} status`);
    }
    this._status = TaskStatus.QUEUED;
  }

  /**
   * Assign task to an agent
   */
  assign(agentId: string): void {
    this.validateTransition(TaskStatus.ASSIGNED);
    if (![TaskStatus.PENDING, TaskStatus.QUEUED].includes(this._status)) {
      throw new Error(`Cannot assign task in ${this._status} status`);
    }
    this._assignedAgentId = agentId;
    this._status = TaskStatus.ASSIGNED;
    this.emit('domain-event', new TaskAssigned(this._id.value, agentId));
  }

  /**
   * Start task execution
   */
  start(): void {
    this.validateTransition(TaskStatus.RUNNING);
    if (this._status !== TaskStatus.ASSIGNED) {
      throw new Error(`Cannot start task in ${this._status} status`);
    }
    if (!this._assignedAgentId) {
      throw new Error('Cannot start task without assigned agent');
    }
    this._status = TaskStatus.RUNNING;
    this._startedAt = new Date();
    this.emit('domain-event', new TaskStarted(this._id.value));
  }

  /**
   * Complete the task successfully
   */
  complete(result: TaskResult): void {
    this.validateTransition(TaskStatus.COMPLETED);
    if (this._status !== TaskStatus.RUNNING) {
      throw new Error(`Cannot complete task in ${this._status} status`);
    }
    this._status = TaskStatus.COMPLETED;
    this._output = result.output;
    this._metrics = result.metrics;
    this._completedAt = new Date();
    this.emit('domain-event', new TaskCompleted(this._id.value, result));
  }

  /**
   * Mark task as failed
   */
  fail(error: string): void {
    this.validateTransition(TaskStatus.FAILED);
    if (![TaskStatus.RUNNING, TaskStatus.ASSIGNED].includes(this._status)) {
      throw new Error(`Cannot fail task in ${this._status} status`);
    }

    this._error = error;
    this._retryCount++;

    const willRetry = this._retryCount < this._maxRetries;

    if (willRetry) {
      // Reset for retry
      this._status = TaskStatus.QUEUED;
      this._assignedAgentId = undefined;
    } else {
      this._status = TaskStatus.FAILED;
      this._completedAt = new Date();
    }

    this.emit('domain-event', new TaskFailed(
      this._id.value,
      error,
      this._retryCount,
      willRetry
    ));
  }

  /**
   * Cancel the task
   */
  cancel(reason?: string): void {
    if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(this._status)) {
      throw new Error(`Cannot cancel task in ${this._status} status`);
    }
    this._status = TaskStatus.CANCELLED;
    this._completedAt = new Date();
    this.emit('domain-event', new TaskCancelled(this._id.value, reason));
  }

  // ============================================================================
  // Dependency Management
  // ============================================================================

  /**
   * Add a blocking dependency
   */
  addBlockedBy(taskId: string): void {
    this._blockedBy.add(taskId);
  }

  /**
   * Remove a blocking dependency
   */
  removeBlockedBy(taskId: string): void {
    this._blockedBy.delete(taskId);
  }

  /**
   * Add a task that this task blocks
   */
  addBlocks(taskId: string): void {
    this._blocks.add(taskId);
  }

  /**
   * Check if all dependencies are satisfied
   */
  areDependenciesSatisfied(completedTaskIds: Set<string>): boolean {
    for (const depId of this._blockedBy) {
      if (!completedTaskIds.has(depId)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if task is blocked
   */
  isBlocked(): boolean {
    return this._blockedBy.size > 0;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Check if task can be retried
   */
  canRetry(): boolean {
    return this._retryCount < this._maxRetries;
  }

  /**
   * Check if task is timed out
   */
  isTimedOut(): boolean {
    if (this._status !== TaskStatus.RUNNING || !this._startedAt) {
      return false;
    }
    return Date.now() - this._startedAt.getTime() > this._timeout;
  }

  /**
   * Get execution duration in milliseconds
   */
  getExecutionDuration(): number | null {
    if (!this._startedAt) return null;
    const endTime = this._completedAt ?? new Date();
    return endTime.getTime() - this._startedAt.getTime();
  }

  /**
   * Check if task is terminal (completed, failed, or cancelled)
   */
  isTerminal(): boolean {
    return [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(this._status);
  }

  /**
   * Priority comparison for sorting
   */
  comparePriority(other: Task): number {
    const priorityOrder: Record<TaskPriority, number> = {
      [TaskPriority.CRITICAL]: 0,
      [TaskPriority.HIGH]: 1,
      [TaskPriority.NORMAL]: 2,
      [TaskPriority.LOW]: 3,
    };
    return priorityOrder[this._priority] - priorityOrder[other._priority];
  }

  /**
   * Update metadata
   */
  setMetadata(key: string, value: unknown): void {
    this._metadata[key] = value;
  }

  /**
   * Validate state transition
   */
  private validateTransition(toStatus: TaskStatus): void {
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.PENDING]: [TaskStatus.QUEUED, TaskStatus.ASSIGNED, TaskStatus.CANCELLED],
      [TaskStatus.QUEUED]: [TaskStatus.ASSIGNED, TaskStatus.CANCELLED],
      [TaskStatus.ASSIGNED]: [TaskStatus.RUNNING, TaskStatus.FAILED, TaskStatus.CANCELLED],
      [TaskStatus.RUNNING]: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED],
      [TaskStatus.COMPLETED]: [],
      [TaskStatus.FAILED]: [],
      [TaskStatus.CANCELLED]: [],
    };

    const allowed = validTransitions[this._status];
    if (!allowed.includes(toStatus)) {
      throw new Error(
        `Invalid state transition from ${this._status} to ${toStatus}`
      );
    }
  }

  /**
   * Convert to persistence format
   */
  toPersistence(): Record<string, unknown> {
    return {
      id: this._id.value,
      title: this._title,
      description: this._description,
      type: this._type,
      priority: this._priority,
      status: this._status,
      assignedAgentId: this._assignedAgentId,
      blockedBy: Array.from(this._blockedBy),
      blocks: Array.from(this._blocks),
      input: this._input,
      output: this._output,
      error: this._error,
      metrics: this._metrics,
      retryCount: this._retryCount,
      maxRetries: this._maxRetries,
      timeout: this._timeout,
      metadata: this._metadata,
      createdAt: this._createdAt.toISOString(),
      startedAt: this._startedAt?.toISOString(),
      completedAt: this._completedAt?.toISOString(),
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): Record<string, unknown> {
    return this.toPersistence();
  }
}
