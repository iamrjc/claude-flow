/**
 * Worker Agent
 * Receives and executes tasks from queen, reports results, maintains heartbeat
 */

import { EventEmitter } from 'events';
import type {
  WorkerState,
  TaskAssignment,
  DirectiveResult,
  HiveMindMessage,
  WorkerStatus,
  WorkerHealth,
  Vote,
} from './types.js';

export interface WorkerConfig {
  id: string;
  capabilities: string[];
  heartbeatIntervalMs: number;
  maxConcurrentTasks: number;
  degradationThreshold: number; // Health score threshold
}

export class WorkerAgent extends EventEmitter {
  private state: WorkerState;
  private config: WorkerConfig;
  private heartbeatInterval?: NodeJS.Timeout;
  private taskProcessor?: NodeJS.Timeout;
  private health: WorkerHealth;

  constructor(config: WorkerConfig) {
    super();
    this.config = config;

    this.state = {
      id: config.id,
      status: 'idle',
      capabilities: config.capabilities,
      taskQueue: [],
      lastHeartbeatSent: new Date(),
    };

    this.health = {
      score: 1.0,
      cpuUsage: 0,
      memoryUsage: 0,
      errorRate: 0,
      responseTime: 0,
    };
  }

  // ===== LIFECYCLE =====

  async initialize(): Promise<void> {
    this.emit('initializing', { workerId: this.state.id });

    // Start heartbeat
    this.startHeartbeat();

    // Start task processor
    this.startTaskProcessor();

    this.state.status = 'idle';

    this.emit('initialized', { workerId: this.state.id, capabilities: this.state.capabilities });
  }

  async shutdown(): Promise<void> {
    this.emit('shutting-down', { workerId: this.state.id });

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.taskProcessor) {
      clearInterval(this.taskProcessor);
    }

    // Complete current task if possible
    if (this.state.currentTask) {
      this.emit('task.interrupted', { taskId: this.state.currentTask.id });
    }

    // Clear queue
    this.state.taskQueue = [];
    this.state.status = 'offline';

    this.emit('shutdown', { workerId: this.state.id });
  }

  // ===== QUEEN CONNECTION =====

  async connectToQueen(queenId: string): Promise<void> {
    this.state.queenId = queenId;

    this.emit('queen.connected', { workerId: this.state.id, queenId });

    // Send registration message
    const registration: HiveMindMessage = {
      id: `reg_${this.state.id}_${Date.now()}`,
      type: 'heartbeat', // Initial heartbeat acts as registration
      from: this.state.id,
      to: queenId,
      payload: {
        capabilities: this.state.capabilities,
        health: this.health,
        status: this.state.status,
      },
      timestamp: new Date(),
      priority: 90,
      requiresAck: true,
    };

    this.emit('message.send', { message: registration });
  }

  async disconnectFromQueen(): Promise<void> {
    const queenId = this.state.queenId;
    this.state.queenId = undefined;

    this.emit('queen.disconnected', { workerId: this.state.id, queenId });
  }

  // ===== HEARTBEAT =====

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);
  }

  private sendHeartbeat(): void {
    if (!this.state.queenId) {
      return; // Not connected to queen
    }

    // Update health metrics
    this.updateHealth();

    const heartbeat: HiveMindMessage = {
      id: `hb_${this.state.id}_${Date.now()}`,
      type: 'heartbeat',
      from: this.state.id,
      to: this.state.queenId,
      payload: {
        health: this.health,
        status: this.state.status,
        queueSize: this.state.taskQueue.length,
        currentTask: this.state.currentTask?.id,
      },
      timestamp: new Date(),
      priority: 20,
      requiresAck: false,
    };

    this.state.lastHeartbeatSent = new Date();
    this.emit('message.send', { message: heartbeat });
  }

  private updateHealth(): void {
    // In a real implementation, these would be actual system metrics
    // For now, we'll simulate based on queue size and current state

    const queueLoad = Math.min(1.0, this.state.taskQueue.length / 10);
    const taskLoad = this.state.currentTask ? 0.5 : 0;

    // Health degrades with load and errors
    this.health.score = Math.max(0, 1.0 - queueLoad - taskLoad - this.health.errorRate);

    // Check for degradation
    if (this.health.score < this.config.degradationThreshold) {
      if (this.state.status !== 'degraded' && this.state.status !== 'failed') {
        this.state.status = 'degraded';
        this.state.degradationReason = 'high_load';
        this.emit('worker.degraded', {
          workerId: this.state.id,
          health: this.health
        });
      }
    } else if (this.state.status === 'degraded') {
      this.state.status = this.state.currentTask ? 'busy' : 'idle';
      this.state.degradationReason = undefined;
      this.emit('worker.recovered', {
        workerId: this.state.id,
        health: this.health
      });
    }
  }

  // ===== TASK RECEPTION =====

  async receiveDirective(message: HiveMindMessage): Promise<void> {
    const directive = message.payload as any;

    this.emit('directive.received', { directiveId: directive.id });

    // Create task assignment
    const task: TaskAssignment = {
      id: `task_${this.state.id}_${Date.now()}`,
      directiveId: directive.id,
      description: JSON.stringify(directive.payload),
      priority: directive.priority || 50,
      timeout: directive.timeout || 30000,
      startedAt: new Date(),
      expectedCompletionAt: new Date(Date.now() + (directive.timeout || 30000)),
    };

    // Add to queue (sorted by priority)
    this.state.taskQueue.push(task);
    this.state.taskQueue.sort((a, b) => b.priority - a.priority);

    this.emit('task.queued', {
      taskId: task.id,
      directiveId: directive.id,
      queuePosition: this.state.taskQueue.indexOf(task)
    });

    // Send acknowledgment
    this.sendAcknowledgment(message.id);
  }

  private sendAcknowledgment(messageId: string): void {
    if (!this.state.queenId) {
      return;
    }

    const ack: HiveMindMessage = {
      id: `ack_${this.state.id}_${Date.now()}`,
      type: 'heartbeat',
      from: this.state.id,
      to: this.state.queenId,
      payload: {
        ackFor: messageId,
        timestamp: new Date(),
      },
      timestamp: new Date(),
      priority: 30,
      requiresAck: false,
    };

    this.emit('message.send', { message: ack });
  }

  // ===== TASK PROCESSING =====

  private startTaskProcessor(): void {
    this.taskProcessor = setInterval(() => {
      void this.processNextTask();
    }, 100); // Check queue every 100ms
  }

  private async processNextTask(): Promise<void> {
    // Check if we can process a task
    if (this.state.currentTask) {
      return; // Already processing
    }

    if (this.state.taskQueue.length === 0) {
      if (this.state.status === 'busy') {
        this.state.status = 'idle';
        this.emit('worker.idle', { workerId: this.state.id });
      }
      return;
    }

    if (this.state.status === 'degraded' || this.state.status === 'failed') {
      return; // Not in a state to process
    }

    // Get next task
    const task = this.state.taskQueue.shift()!;
    this.state.currentTask = task;
    this.state.status = 'busy';

    this.emit('task.started', {
      taskId: task.id,
      directiveId: task.directiveId
    });

    try {
      // Execute task (simulate async work)
      const result = await this.executeTask(task);

      // Send result to queen
      await this.reportResult({
        directiveId: task.directiveId,
        workerId: this.state.id,
        success: true,
        result,
        completedAt: new Date(),
        metrics: {
          duration: Date.now() - task.startedAt.getTime(),
        },
      });

      this.emit('task.completed', {
        taskId: task.id,
        directiveId: task.directiveId,
        success: true
      });
    } catch (error) {
      // Handle failure
      this.health.errorRate = Math.min(1.0, this.health.errorRate + 0.1);

      await this.reportResult({
        directiveId: task.directiveId,
        workerId: this.state.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
        metrics: {
          duration: Date.now() - task.startedAt.getTime(),
        },
      });

      this.emit('task.failed', {
        taskId: task.id,
        directiveId: task.directiveId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      this.state.currentTask = undefined;
    }
  }

  private async executeTask(task: TaskAssignment): Promise<unknown> {
    // In a real implementation, this would execute actual work
    // For now, simulate async execution
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ status: 'completed', taskId: task.id });
      }, Math.random() * 1000 + 100);
    });
  }

  // ===== RESULT REPORTING =====

  private async reportResult(result: DirectiveResult): Promise<void> {
    if (!this.state.queenId) {
      this.emit('error', { reason: 'no_queen', result });
      return;
    }

    const message: HiveMindMessage = {
      id: `result_${this.state.id}_${Date.now()}`,
      type: 'result',
      from: this.state.id,
      to: this.state.queenId,
      payload: result,
      timestamp: new Date(),
      priority: 60,
      requiresAck: true,
    };

    this.emit('message.send', { message });
    this.emit('result.reported', { directiveId: result.directiveId, success: result.success });
  }

  // ===== VOTING =====

  async receiveVoteRequest(decisionId: string, question: string, options: unknown[]): Promise<void> {
    this.emit('vote.requested', { decisionId, question });

    // In a real implementation, worker would make a decision
    // For now, randomly choose an option
    const choice = options[Math.floor(Math.random() * options.length)];
    const confidence = Math.random() * 0.5 + 0.5; // 0.5 - 1.0

    const vote: Vote = {
      voterId: this.state.id,
      choice,
      confidence,
      reasoning: 'Worker decision based on analysis',
      timestamp: new Date(),
    };

    await this.sendVote(decisionId, vote);
  }

  private async sendVote(decisionId: string, vote: Vote): Promise<void> {
    if (!this.state.queenId) {
      return;
    }

    const message: HiveMindMessage = {
      id: `vote_${this.state.id}_${Date.now()}`,
      type: 'vote',
      from: this.state.id,
      to: this.state.queenId,
      payload: { decisionId, vote },
      timestamp: new Date(),
      priority: 70,
      requiresAck: true,
    };

    this.emit('message.send', { message });
    this.emit('vote.sent', { decisionId, choice: vote.choice });
  }

  // ===== GRACEFUL DEGRADATION =====

  async handleQueenUnavailable(): Promise<void> {
    this.emit('queen.unavailable', { workerId: this.state.id });

    // Continue processing queued tasks
    // But don't accept new ones until reconnected

    if (this.state.status !== 'failed') {
      this.state.status = 'degraded';
      this.state.degradationReason = 'queen_unavailable';
    }
  }

  async attemptQueenReconnection(queenId: string): Promise<void> {
    this.emit('queen.reconnecting', { workerId: this.state.id, queenId });

    await this.connectToQueen(queenId);

    // If successful, recover from degraded state
    if (this.state.status === 'degraded' && this.state.degradationReason === 'queen_unavailable') {
      this.state.status = this.state.currentTask ? 'busy' : 'idle';
      this.state.degradationReason = undefined;
    }
  }

  // ===== STATE QUERIES =====

  getStatus(): WorkerStatus {
    return this.state.status;
  }

  getHealth(): WorkerHealth {
    return { ...this.health };
  }

  getQueueSize(): number {
    return this.state.taskQueue.length;
  }

  isAvailable(): boolean {
    return this.state.status === 'idle' || this.state.status === 'busy';
  }

  getCurrentTask(): TaskAssignment | undefined {
    return this.state.currentTask;
  }

  getCapabilities(): string[] {
    return [...this.state.capabilities];
  }
}

export function createWorkerAgent(config: WorkerConfig): WorkerAgent {
  return new WorkerAgent(config);
}
