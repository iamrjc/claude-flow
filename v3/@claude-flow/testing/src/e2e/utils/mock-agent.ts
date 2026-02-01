/**
 * Mock Agent Implementation for E2E Tests
 *
 * Simplified agent implementation for testing end-to-end flows.
 * This is a test double that simulates real agent behavior.
 */

import type { AgentType, AgentCapabilities } from '../fixtures/test-fixtures.js';

/**
 * Agent Status enum
 */
export enum AgentStatus {
  Initializing = 'initializing',
  Idle = 'idle',
  Busy = 'busy',
  Terminated = 'terminated',
  Error = 'error',
}

/**
 * Agent ID value object
 */
export class AgentId {
  private constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('Agent ID cannot be empty');
    }
  }

  static generate(): AgentId {
    return new AgentId(`agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }

  static from(value: string): AgentId {
    return new AgentId(value);
  }

  equals(other: AgentId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Task ID value object
 */
export class TaskId {
  private constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('Task ID cannot be empty');
    }
  }

  static generate(): TaskId {
    return new TaskId(`task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }

  static from(value: string): TaskId {
    return new TaskId(value);
  }

  equals(other: TaskId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Agent Metrics
 */
export class AgentMetrics {
  constructor(
    public tasksCompleted: number = 0,
    public tasksFailed: number = 0,
    public uptime: number = 0,
    public totalTime: number = 0,
    public successRate: number = 1.0
  ) {}

  static initial(): AgentMetrics {
    return new AgentMetrics(0, 0, 0, 0, 1.0);
  }

  updateSuccessRate(): void {
    const total = this.tasksCompleted + this.tasksFailed;
    this.successRate = total > 0 ? this.tasksCompleted / total : 1.0;
  }
}

/**
 * Agent Health
 */
export class AgentHealth {
  constructor(
    public readonly agentId: AgentId,
    public readonly healthScore: number,
    public readonly metrics: AgentMetrics,
    public readonly timestamp: Date
  ) {
    if (healthScore < 0 || healthScore > 1) {
      throw new Error('Health score must be between 0 and 1');
    }
  }
}

/**
 * Agent Template for creation
 */
export interface AgentTemplate {
  type: AgentType;
  capabilities: AgentCapabilities;
  name?: string;
  config?: Record<string, unknown>;
}

/**
 * Domain Errors
 */
export class InvalidStateTransition extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateTransition';
  }
}

export class AgentNotAvailable extends Error {
  constructor(agentId: AgentId) {
    super(`Agent ${agentId.value} is not available`);
    this.name = 'AgentNotAvailable';
  }
}

/**
 * Mock Agent Implementation
 *
 * Simplified agent for E2E testing that simulates core behaviors.
 */
export class Agent {
  private createdAt: Date;
  private updatedAt: Date;
  private startTime?: Date;

  private constructor(
    public readonly id: AgentId,
    private type: AgentType,
    private status: AgentStatus,
    private capabilities: AgentCapabilities,
    private metrics: AgentMetrics,
    private name?: string,
    private config?: Record<string, unknown>
  ) {
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * Factory method to create a new agent
   */
  static create(template: AgentTemplate): Agent {
    return new Agent(
      AgentId.generate(),
      template.type,
      AgentStatus.Initializing,
      template.capabilities,
      AgentMetrics.initial(),
      template.name,
      template.config
    );
  }

  /**
   * Spawn the agent (transition from initializing to idle)
   */
  spawn(): void {
    if (this.status !== AgentStatus.Initializing) {
      throw new InvalidStateTransition(`Cannot spawn agent in ${this.status} state`);
    }

    this.status = AgentStatus.Idle;
    this.startTime = new Date();
    this.updatedAt = new Date();
  }

  /**
   * Assign a task to the agent
   */
  assignTask(taskId: TaskId): void {
    if (this.status !== AgentStatus.Idle) {
      throw new AgentNotAvailable(this.id);
    }

    this.status = AgentStatus.Busy;
    this.updatedAt = new Date();
  }

  /**
   * Mark task as completed
   */
  completeTask(success: boolean = true): void {
    if (this.status !== AgentStatus.Busy) {
      throw new InvalidStateTransition(`Cannot complete task in ${this.status} state`);
    }

    this.status = AgentStatus.Idle;
    this.updatedAt = new Date();

    if (success) {
      this.metrics.tasksCompleted++;
    } else {
      this.metrics.tasksFailed++;
    }

    this.metrics.updateSuccessRate();
  }

  /**
   * Terminate the agent
   */
  terminate(): void {
    if (this.status === AgentStatus.Terminated) {
      return; // Already terminated
    }

    this.status = AgentStatus.Terminated;
    this.updatedAt = new Date();

    if (this.startTime) {
      this.metrics.totalTime = Date.now() - this.startTime.getTime();
    }
  }

  /**
   * Report agent health
   */
  reportHealth(): AgentHealth {
    const healthScore = this.calculateHealthScore();

    if (this.startTime) {
      this.metrics.uptime = Date.now() - this.startTime.getTime();
    }

    return new AgentHealth(this.id, healthScore, this.metrics, new Date());
  }

  /**
   * Calculate health score (0-1)
   */
  private calculateHealthScore(): number {
    if (this.status === AgentStatus.Terminated) {
      return 0;
    }

    if (this.status === AgentStatus.Error) {
      return 0.2;
    }

    // Base score on success rate and uptime
    const successComponent = this.metrics.successRate * 0.7;

    // Uptime component (healthy if uptime > 1 minute)
    const uptimeComponent = this.startTime
      ? Math.min((Date.now() - this.startTime.getTime()) / 60000, 1) * 0.3
      : 0;

    return Math.min(successComponent + uptimeComponent, 1);
  }

  // Getters
  getType(): AgentType {
    return this.type;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getCapabilities(): AgentCapabilities {
    return { ...this.capabilities };
  }

  getMetrics(): AgentMetrics {
    return this.metrics;
  }

  getName(): string | undefined {
    return this.name;
  }

  getConfig(): Record<string, unknown> | undefined {
    return this.config ? { ...this.config } : undefined;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }
}
