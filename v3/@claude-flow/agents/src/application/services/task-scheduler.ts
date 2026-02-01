/**
 * Task Scheduler - Application Layer
 *
 * Schedules tasks based on priority, dependencies, and agent availability.
 * Implements load balancing and retry logic.
 *
 * @module v3/agents/application/services
 */

import { EventEmitter } from 'events';
import { Task, TaskStatus, TaskPriority } from '../../domain/models/task.js';
import { TaskQueue } from '../../domain/models/task-queue.js';
import { ITaskRepository } from '../../domain/interfaces/task-repository.js';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  maxConcurrentTasks?: number;
  taskTimeout?: number;
  retryDelay?: number;
  loadBalancingStrategy?: 'round-robin' | 'least-loaded' | 'priority';
}

/**
 * Agent load information
 */
export interface AgentLoad {
  agentId: string;
  runningTasks: number;
  capabilities: string[];
}

/**
 * Task Scheduler
 *
 * Manages task scheduling, load balancing, and retry logic.
 */
export class TaskScheduler extends EventEmitter {
  private readonly taskQueue: TaskQueue;
  private readonly config: Required<SchedulerConfig>;
  private readonly agentLoads: Map<string, AgentLoad>;
  private retryTimers: Map<string, NodeJS.Timeout>;

  constructor(
    private readonly repository: ITaskRepository,
    config: SchedulerConfig = {}
  ) {
    super();

    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks ?? 10,
      taskTimeout: config.taskTimeout ?? 300000, // 5 minutes
      retryDelay: config.retryDelay ?? 5000, // 5 seconds
      loadBalancingStrategy: config.loadBalancingStrategy ?? 'priority',
    };

    this.taskQueue = new TaskQueue();
    this.agentLoads = new Map();
    this.retryTimers = new Map();
  }

  /**
   * Schedule a task for execution
   */
  async scheduleTask(task: Task): Promise<void> {
    // Queue the task
    task.queue();
    await this.repository.save(task);

    // Add to in-memory queue
    this.taskQueue.enqueue(task);

    this.emit('task-scheduled', {
      taskId: task.id.value,
      priority: task.priority,
    });

    // Try to assign immediately
    await this.assignNextTasks();
  }

  /**
   * Register an agent
   */
  registerAgent(agentId: string, capabilities: string[] = []): void {
    this.agentLoads.set(agentId, {
      agentId,
      runningTasks: 0,
      capabilities,
    });

    this.emit('agent-registered', { agentId, capabilities });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agentLoads.delete(agentId);
    this.emit('agent-unregistered', { agentId });
  }

  /**
   * Assign next tasks to available agents
   */
  async assignNextTasks(): Promise<void> {
    const availableAgents = this.getAvailableAgents();

    for (const agentId of availableAgents) {
      const task = await this.selectNextTask(agentId);
      if (task) {
        await this.assignTaskToAgent(task, agentId);
      }
    }
  }

  /**
   * Task completed callback
   */
  async onTaskCompleted(taskId: string): Promise<void> {
    const task = await this.repository.findById(taskId);
    if (!task) return;

    // Update agent load
    if (task.assignedAgentId) {
      const load = this.agentLoads.get(task.assignedAgentId);
      if (load) {
        load.runningTasks = Math.max(0, load.runningTasks - 1);
      }
    }

    // Remove from queue if present
    this.taskQueue.remove(taskId);

    this.emit('task-completed', {
      taskId,
      agentId: task.assignedAgentId,
    });

    // Try to assign next task
    await this.assignNextTasks();
  }

  /**
   * Task failed callback
   */
  async onTaskFailed(taskId: string, willRetry: boolean): Promise<void> {
    const task = await this.repository.findById(taskId);
    if (!task) return;

    // Update agent load
    if (task.assignedAgentId) {
      const load = this.agentLoads.get(task.assignedAgentId);
      if (load) {
        load.runningTasks = Math.max(0, load.runningTasks - 1);
      }
    }

    if (willRetry) {
      // Schedule retry
      this.scheduleRetry(task);
    } else {
      // Remove from queue
      this.taskQueue.remove(taskId);
    }

    this.emit('task-failed', {
      taskId,
      agentId: task.assignedAgentId,
      willRetry,
    });

    // Try to assign next task
    await this.assignNextTasks();
  }

  /**
   * Schedule task retry
   */
  private scheduleRetry(task: Task): void {
    // Clear existing timer if any
    const existingTimer = this.retryTimers.get(task.id.value);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule retry with exponential backoff
    const delay = this.config.retryDelay * Math.pow(2, task.retryCount - 1);

    const timer = setTimeout(async () => {
      this.retryTimers.delete(task.id.value);

      // Re-add to queue
      const updatedTask = await this.repository.findById(task.id.value);
      if (updatedTask && updatedTask.status === TaskStatus.QUEUED) {
        this.taskQueue.enqueue(updatedTask);
        await this.assignNextTasks();
      }
    }, delay);

    this.retryTimers.set(task.id.value, timer);

    this.emit('retry-scheduled', {
      taskId: task.id.value,
      delay,
      attempt: task.retryCount,
    });
  }

  /**
   * Select next task for agent based on strategy
   */
  private async selectNextTask(agentId: string): Promise<Task | null> {
    const agentLoad = this.agentLoads.get(agentId);
    if (!agentLoad) return null;

    switch (this.config.loadBalancingStrategy) {
      case 'priority':
        return this.taskQueue.dequeue();

      case 'round-robin':
      case 'least-loaded':
        // For simplicity, use priority-based selection
        // In production, implement proper round-robin or least-loaded
        return this.taskQueue.dequeue();

      default:
        return this.taskQueue.dequeue();
    }
  }

  /**
   * Assign task to agent
   */
  private async assignTaskToAgent(task: Task, agentId: string): Promise<void> {
    task.assign(agentId);
    await this.repository.save(task);

    // Update agent load
    const load = this.agentLoads.get(agentId);
    if (load) {
      load.runningTasks++;
    }

    this.emit('task-assigned', {
      taskId: task.id.value,
      agentId,
    });
  }

  /**
   * Get available agents (not at max capacity)
   */
  private getAvailableAgents(): string[] {
    const available: string[] = [];

    for (const [agentId, load] of this.agentLoads) {
      if (load.runningTasks < this.config.maxConcurrentTasks) {
        available.push(agentId);
      }
    }

    return available;
  }

  /**
   * Get scheduler statistics
   */
  getStatistics(): {
    queuedTasks: number;
    runningTasks: number;
    availableAgents: number;
    totalAgents: number;
  } {
    const queueStats = this.taskQueue.getStatistics();
    const availableAgents = this.getAvailableAgents();

    return {
      queuedTasks: queueStats.byStatus[TaskStatus.QUEUED] ?? 0,
      runningTasks: Array.from(this.agentLoads.values()).reduce(
        (sum, load) => sum + load.runningTasks,
        0
      ),
      availableAgents: availableAgents.length,
      totalAgents: this.agentLoads.size,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all retry timers
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();

    // Clear queue
    this.taskQueue.clear();

    // Clear agent loads
    this.agentLoads.clear();
  }
}
