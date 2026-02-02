/**
 * Task Channel
 * Task progress, completion events, error notifications
 */

import { EventEmitter } from 'events';
import type { WSRouter } from '../server/ws-router.js';
import type { WSClient } from '../client/ws-client.js';

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';

export interface TaskProgressEvent {
  taskId: string;
  progress: number; // 0-100
  status: TaskStatus;
  message?: string;
  timestamp: number;
}

export interface TaskCompletedEvent {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  result?: unknown;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  duration?: number;
  timestamp: number;
}

export interface TaskCreatedEvent {
  taskId: string;
  agentId?: string;
  type: string;
  priority?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface TaskAssignedEvent {
  taskId: string;
  agentId: string;
  timestamp: number;
}

export interface TaskErrorEvent {
  taskId: string;
  error: {
    message: string;
    code?: string;
    stack?: string;
    recoverable?: boolean;
  };
  timestamp: number;
}

/**
 * Server-side task channel
 */
export class TaskChannelServer extends EventEmitter {
  private readonly topicPrefix = 'task';

  constructor(private router: WSRouter) {
    super();
    this.setupRoutes();
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Progress updates
    this.router.route({
      topic: `${this.topicPrefix}.progress`,
      handler: async (data, clientId) => {
        this.emit('progress-update', data);
      },
    });

    // Completion events
    this.router.route({
      topic: `${this.topicPrefix}.completed`,
      handler: async (data, clientId) => {
        this.emit('task-completed', data);
      },
    });

    // Creation events
    this.router.route({
      topic: `${this.topicPrefix}.created`,
      handler: async (data, clientId) => {
        this.emit('task-created', data);
      },
    });

    // Assignment events
    this.router.route({
      topic: `${this.topicPrefix}.assigned`,
      handler: async (data, clientId) => {
        this.emit('task-assigned', data);
      },
    });

    // Error events
    this.router.route({
      topic: `${this.topicPrefix}.error`,
      handler: async (data, clientId) => {
        this.emit('task-error', data);
      },
    });
  }

  /**
   * Publish task progress
   */
  async publishProgress(event: TaskProgressEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.taskId}.progress`, event);
    await this.router.publish(`${this.topicPrefix}.progress`, event); // Broadcast
  }

  /**
   * Publish task completion
   */
  async publishCompleted(event: TaskCompletedEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.taskId}.completed`, event);
    await this.router.publish(`${this.topicPrefix}.completed`, event); // Broadcast
  }

  /**
   * Publish task creation
   */
  async publishCreated(event: TaskCreatedEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.taskId}.created`, event);
    await this.router.publish(`${this.topicPrefix}.created`, event); // Broadcast
  }

  /**
   * Publish task assignment
   */
  async publishAssigned(event: TaskAssignedEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.taskId}.assigned`, event);
    await this.router.publish(`${this.topicPrefix}.assigned`, event); // Broadcast
  }

  /**
   * Publish task error
   */
  async publishError(event: TaskErrorEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.taskId}.error`, event);
    await this.router.publish(`${this.topicPrefix}.error`, event); // Broadcast
  }

  /**
   * Publish task started
   */
  async publishTaskStarted(taskId: string, agentId?: string): Promise<void> {
    const event: TaskProgressEvent = {
      taskId,
      progress: 0,
      status: 'in-progress',
      message: 'Task started',
      timestamp: Date.now(),
    };
    await this.publishProgress(event);
  }

  /**
   * Publish task success
   */
  async publishTaskSuccess(taskId: string, result?: unknown, duration?: number): Promise<void> {
    const event: TaskCompletedEvent = {
      taskId,
      status: 'completed',
      result,
      duration,
      timestamp: Date.now(),
    };
    await this.publishCompleted(event);
  }

  /**
   * Publish task failure
   */
  async publishTaskFailure(taskId: string, error: Error, duration?: number): Promise<void> {
    const event: TaskCompletedEvent = {
      taskId,
      status: 'failed',
      error: {
        message: error.message,
        stack: error.stack,
      },
      duration,
      timestamp: Date.now(),
    };
    await this.publishCompleted(event);
  }
}

/**
 * Client-side task channel
 */
export class TaskChannelClient extends EventEmitter {
  private readonly topicPrefix = 'task';
  private subscribedTasks = new Set<string>();

  constructor(private client: WSClient) {
    super();
    this.setupListeners();
  }

  /**
   * Setup event listeners
   */
  private setupListeners(): void {
    // Progress events
    this.client.on('event:task.progress', (event) => {
      const data = event.data as TaskProgressEvent;
      this.emit('progress', data);
      this.emit(`progress:${data.taskId}`, data);
    });

    // Completion events
    this.client.on('event:task.completed', (event) => {
      const data = event.data as TaskCompletedEvent;
      this.emit('completed', data);
      this.emit(`completed:${data.taskId}`, data);
    });

    // Creation events
    this.client.on('event:task.created', (event) => {
      const data = event.data as TaskCreatedEvent;
      this.emit('created', data);
      this.emit(`created:${data.taskId}`, data);
    });

    // Assignment events
    this.client.on('event:task.assigned', (event) => {
      const data = event.data as TaskAssignedEvent;
      this.emit('assigned', data);
      this.emit(`assigned:${data.taskId}`, data);
    });

    // Error events
    this.client.on('event:task.error', (event) => {
      const data = event.data as TaskErrorEvent;
      this.emit('error', data);
      this.emit(`error:${data.taskId}`, data);
    });

    // Task-specific events
    this.client.on('event', (event) => {
      const topic = event.topic;
      if (topic.startsWith(`${this.topicPrefix}.`)) {
        const parts = topic.split('.');
        if (parts.length === 3) {
          const taskId = parts[1];
          const eventType = parts[2];
          this.emit(`${eventType}:${taskId}`, event.data);
        }
      }
    });
  }

  /**
   * Subscribe to all task events
   */
  async subscribeAll(): Promise<void> {
    await this.client.subscribe([
      `${this.topicPrefix}.progress`,
      `${this.topicPrefix}.completed`,
      `${this.topicPrefix}.created`,
      `${this.topicPrefix}.assigned`,
      `${this.topicPrefix}.error`,
    ]);
  }

  /**
   * Subscribe to specific task
   */
  async subscribeToTask(taskId: string): Promise<void> {
    if (this.subscribedTasks.has(taskId)) {
      return;
    }

    await this.client.subscribe([
      `${this.topicPrefix}.${taskId}.progress`,
      `${this.topicPrefix}.${taskId}.completed`,
      `${this.topicPrefix}.${taskId}.assigned`,
      `${this.topicPrefix}.${taskId}.error`,
    ]);

    this.subscribedTasks.add(taskId);
  }

  /**
   * Unsubscribe from specific task
   */
  async unsubscribeFromTask(taskId: string): Promise<void> {
    if (!this.subscribedTasks.has(taskId)) {
      return;
    }

    await this.client.unsubscribe([
      `${this.topicPrefix}.${taskId}.progress`,
      `${this.topicPrefix}.${taskId}.completed`,
      `${this.topicPrefix}.${taskId}.assigned`,
      `${this.topicPrefix}.${taskId}.error`,
    ]);

    this.subscribedTasks.delete(taskId);
  }

  /**
   * Subscribe to pattern
   */
  async subscribePattern(pattern: string): Promise<void> {
    await this.client.subscribe([`${this.topicPrefix}.${pattern}`]);
  }

  /**
   * Report task progress (client publishing)
   */
  async reportProgress(event: TaskProgressEvent): Promise<void> {
    await this.client.publish(`${this.topicPrefix}.${event.taskId}.progress`, event);
  }

  /**
   * Report task completion
   */
  async reportCompleted(event: TaskCompletedEvent): Promise<void> {
    await this.client.publish(`${this.topicPrefix}.${event.taskId}.completed`, event);
  }

  /**
   * Report task error
   */
  async reportError(event: TaskErrorEvent): Promise<void> {
    await this.client.publish(`${this.topicPrefix}.${event.taskId}.error`, event);
  }

  /**
   * Get subscribed tasks
   */
  getSubscribedTasks(): string[] {
    return Array.from(this.subscribedTasks);
  }

  /**
   * Wait for task completion
   */
  async waitForCompletion(taskId: string, timeout?: number): Promise<TaskCompletedEvent> {
    return new Promise((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | undefined;

      const onCompleted = (event: TaskCompletedEvent) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.off(`completed:${taskId}`, onCompleted);
        resolve(event);
      };

      this.on(`completed:${taskId}`, onCompleted);

      if (timeout) {
        timeoutHandle = setTimeout(() => {
          this.off(`completed:${taskId}`, onCompleted);
          reject(new Error(`Task ${taskId} completion timeout`));
        }, timeout);
      }
    });
  }
}
