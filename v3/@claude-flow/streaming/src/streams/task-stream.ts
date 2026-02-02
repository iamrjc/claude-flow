/**
 * Task Stream - Task Execution Event Streaming
 *
 * Streams task execution events including:
 * - Task lifecycle events (created, started, completed, failed)
 * - Progress updates with percentage and current step
 * - Intermediate results and outputs
 * - Dependency status changes
 * - Resource usage metrics
 *
 * @module @claude-flow/streaming/streams
 */

import { EventEmitter } from 'events';
import { SSEServer, SSEEvent } from '../server/sse-server.js';

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
 * Task progress update
 */
export interface TaskProgress {
  /** Task ID */
  taskId: string;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current step description */
  currentStep: string;
  /** Total steps */
  totalSteps?: number;
  /** Current step number */
  currentStepNumber?: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining?: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Task event data
 */
export interface TaskEventData {
  /** Task ID */
  taskId: string;
  /** Task status */
  status: TaskStatus;
  /** Task name */
  name?: string;
  /** Task description */
  description?: string;
  /** Task priority */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Task type */
  type?: string;
  /** Agent ID assigned to task */
  agentId?: string;
  /** Task result */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Progress data */
  progress?: TaskProgress;
  /** Dependencies */
  dependencies?: string[];
  /** Metrics */
  metrics?: TaskMetrics;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Task metrics
 */
export interface TaskMetrics {
  /** Execution time in ms */
  executionTime?: number;
  /** CPU usage percentage */
  cpuUsage?: number;
  /** Memory usage in bytes */
  memoryUsage?: number;
  /** Token count (for LLM tasks) */
  tokenCount?: number;
  /** Cost estimate */
  costEstimate?: number;
}

/**
 * Intermediate task result
 */
export interface IntermediateResult {
  /** Task ID */
  taskId: string;
  /** Result data */
  data: unknown;
  /** Result type */
  type: 'partial' | 'checkpoint' | 'artifact';
  /** Sequence number */
  sequence: number;
  /** Is final result */
  isFinal?: boolean;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Task Stream configuration
 */
export interface TaskStreamConfig {
  /** Include progress updates */
  includeProgress?: boolean;
  /** Include intermediate results */
  includeIntermediateResults?: boolean;
  /** Include metrics */
  includeMetrics?: boolean;
  /** Progress update interval in ms */
  progressUpdateInterval?: number;
}

/**
 * Task Stream
 *
 * Streams task execution events to SSE clients.
 *
 * Example:
 * ```ts
 * const taskStream = new TaskStream(sseServer);
 * taskStream.start();
 *
 * taskStream.emitTaskStarted('task-123', { name: 'Code generation' });
 * taskStream.emitProgress('task-123', { percentage: 50, currentStep: 'Analyzing' });
 * taskStream.emitTaskCompleted('task-123', { result: { code: '...' } });
 * ```
 */
export class TaskStream extends EventEmitter {
  private sseServer: SSEServer;
  private config: Required<TaskStreamConfig>;
  private taskStates: Map<string, TaskEventData> = new Map();
  private lastProgressUpdate: Map<string, number> = new Map();

  constructor(sseServer: SSEServer, config: TaskStreamConfig = {}) {
    super();
    this.sseServer = sseServer;
    this.config = {
      includeProgress: config.includeProgress ?? true,
      includeIntermediateResults: config.includeIntermediateResults ?? true,
      includeMetrics: config.includeMetrics ?? true,
      progressUpdateInterval: config.progressUpdateInterval ?? 1000,
    };
  }

  /**
   * Start task stream
   */
  start(): void {
    this.emit('started');
  }

  /**
   * Stop task stream
   */
  stop(): void {
    this.taskStates.clear();
    this.lastProgressUpdate.clear();
    this.emit('stopped');
  }

  /**
   * Emit task created event
   */
  emitTaskCreated(taskId: string, data: Partial<TaskEventData> = {}): void {
    const eventData: TaskEventData = {
      taskId,
      status: TaskStatus.PENDING,
      timestamp: new Date(),
      ...data,
    };

    this.taskStates.set(taskId, eventData);
    this.sendEvent('task:created', eventData);
    this.emit('taskCreated', eventData);
  }

  /**
   * Emit task queued event
   */
  emitTaskQueued(taskId: string, data: Partial<TaskEventData> = {}): void {
    const eventData = this.updateTaskState(taskId, {
      status: TaskStatus.QUEUED,
      ...data,
    });

    this.sendEvent('task:queued', eventData);
    this.emit('taskQueued', eventData);
  }

  /**
   * Emit task assigned event
   */
  emitTaskAssigned(taskId: string, agentId: string, data: Partial<TaskEventData> = {}): void {
    const eventData = this.updateTaskState(taskId, {
      status: TaskStatus.ASSIGNED,
      agentId,
      ...data,
    });

    this.sendEvent('task:assigned', eventData);
    this.emit('taskAssigned', eventData);
  }

  /**
   * Emit task started event
   */
  emitTaskStarted(taskId: string, data: Partial<TaskEventData> = {}): void {
    const eventData = this.updateTaskState(taskId, {
      status: TaskStatus.RUNNING,
      ...data,
    });

    this.sendEvent('task:started', eventData);
    this.emit('taskStarted', eventData);
  }

  /**
   * Emit task progress update
   */
  emitProgress(taskId: string, progress: Omit<TaskProgress, 'taskId' | 'timestamp'>): void {
    if (!this.config.includeProgress) {
      return;
    }

    // Throttle progress updates
    const lastUpdate = this.lastProgressUpdate.get(taskId) || 0;
    const now = Date.now();
    if (now - lastUpdate < this.config.progressUpdateInterval) {
      return;
    }
    this.lastProgressUpdate.set(taskId, now);

    const progressData: TaskProgress = {
      taskId,
      timestamp: new Date(),
      ...progress,
    };

    const eventData = this.updateTaskState(taskId, {
      progress: progressData,
    });

    this.sendEvent('task:progress', {
      taskId: eventData.taskId,
      progress: progressData,
      status: eventData.status,
    });

    this.emit('taskProgress', progressData);
  }

  /**
   * Emit intermediate result
   */
  emitIntermediateResult(result: Omit<IntermediateResult, 'timestamp'>): void {
    if (!this.config.includeIntermediateResults) {
      return;
    }

    const resultData: IntermediateResult = {
      ...result,
      timestamp: new Date(),
    };

    this.sendEvent('task:intermediate', resultData);
    this.emit('intermediateResult', resultData);
  }

  /**
   * Emit task completed event
   */
  emitTaskCompleted(taskId: string, data: Partial<TaskEventData> = {}): void {
    const eventData = this.updateTaskState(taskId, {
      status: TaskStatus.COMPLETED,
      ...data,
    });

    this.sendEvent('task:completed', eventData);
    this.emit('taskCompleted', eventData);

    // Cleanup
    this.lastProgressUpdate.delete(taskId);
  }

  /**
   * Emit task failed event
   */
  emitTaskFailed(taskId: string, error: string, data: Partial<TaskEventData> = {}): void {
    const eventData = this.updateTaskState(taskId, {
      status: TaskStatus.FAILED,
      error,
      ...data,
    });

    this.sendEvent('task:failed', eventData);
    this.emit('taskFailed', eventData);

    // Cleanup
    this.lastProgressUpdate.delete(taskId);
  }

  /**
   * Emit task cancelled event
   */
  emitTaskCancelled(taskId: string, data: Partial<TaskEventData> = {}): void {
    const eventData = this.updateTaskState(taskId, {
      status: TaskStatus.CANCELLED,
      ...data,
    });

    this.sendEvent('task:cancelled', eventData);
    this.emit('taskCancelled', eventData);

    // Cleanup
    this.lastProgressUpdate.delete(taskId);
  }

  /**
   * Emit task metrics update
   */
  emitMetrics(taskId: string, metrics: TaskMetrics): void {
    if (!this.config.includeMetrics) {
      return;
    }

    const eventData = this.updateTaskState(taskId, {
      metrics,
    });

    this.sendEvent('task:metrics', {
      taskId: eventData.taskId,
      metrics,
      status: eventData.status,
    });

    this.emit('taskMetrics', { taskId, metrics });
  }

  /**
   * Update task state
   */
  private updateTaskState(taskId: string, updates: Partial<TaskEventData>): TaskEventData {
    const current = this.taskStates.get(taskId) || {
      taskId,
      status: TaskStatus.PENDING,
      timestamp: new Date(),
    };

    const updated: TaskEventData = {
      ...current,
      ...updates,
      timestamp: new Date(),
    };

    this.taskStates.set(taskId, updated);
    return updated;
  }

  /**
   * Send event to SSE server
   */
  private sendEvent(eventType: string, data: unknown): void {
    const event: SSEEvent = {
      event: eventType,
      data,
      id: `${eventType}-${Date.now()}`,
    };

    this.sseServer.broadcast(event);
  }

  /**
   * Get task state
   */
  getTaskState(taskId: string): TaskEventData | undefined {
    return this.taskStates.get(taskId);
  }

  /**
   * Get all task states
   */
  getAllTaskStates(): TaskEventData[] {
    return Array.from(this.taskStates.values());
  }

  /**
   * Clear task state
   */
  clearTaskState(taskId: string): void {
    this.taskStates.delete(taskId);
    this.lastProgressUpdate.delete(taskId);
  }
}
