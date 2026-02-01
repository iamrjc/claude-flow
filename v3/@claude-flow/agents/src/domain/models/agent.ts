/**
 * Agent Aggregate Root
 *
 * Core domain model for agent lifecycle management.
 * Implements DDD aggregate root pattern with domain events.
 *
 * @module @claude-flow/agents/domain/models/agent
 */

import { EventEmitter } from 'events';
import { AgentCreated, AgentSpawned, AgentTerminated, AgentHealthChanged, TaskAssignedToAgent, AgentTaskCompleted, DomainEvent } from '../events/agent-events.js';

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
 * Agent Type
 */
export type AgentType =
  | 'coder'
  | 'researcher'
  | 'reviewer'
  | 'tester'
  | 'architect'
  | 'planner'
  | 'coordinator'
  | 'security-architect'
  | 'security-auditor'
  | 'memory-specialist'
  | 'performance-engineer';

/**
 * Agent Capabilities
 */
export interface AgentCapabilities {
  canCode: boolean;
  canReview: boolean;
  canTest: boolean;
  canResearch: boolean;
  canArchitect: boolean;
  canCoordinate: boolean;
  specializations: string[];
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

  toJSON() {
    return {
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      uptime: this.uptime,
      totalTime: this.totalTime,
      successRate: this.successRate,
    };
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

  toJSON() {
    return {
      agentId: this.agentId.value,
      healthScore: this.healthScore,
      metrics: this.metrics.toJSON(),
      timestamp: this.timestamp.toISOString(),
    };
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

export class AgentNotFoundError extends Error {
  constructor(agentId: AgentId) {
    super(`Agent ${agentId.value} not found`);
    this.name = 'AgentNotFoundError';
  }
}

/**
 * Agent Aggregate Root
 *
 * Main domain model implementing lifecycle state machine.
 */
export class Agent {
  private domainEvents: DomainEvent[] = [];
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
    const agent = new Agent(
      AgentId.generate(),
      template.type,
      AgentStatus.Initializing,
      template.capabilities,
      AgentMetrics.initial(),
      template.name,
      template.config
    );

    agent.addDomainEvent(new AgentCreated(agent.id, agent.type, template.capabilities));
    return agent;
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
    this.addDomainEvent(new AgentSpawned(this.id, this.startTime));
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
    this.addDomainEvent(new TaskAssignedToAgent(this.id, taskId));
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
    this.addDomainEvent(new AgentTaskCompleted(this.id, success));
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

    this.addDomainEvent(new AgentTerminated(this.id, this.updatedAt));
  }

  /**
   * Report agent health
   */
  reportHealth(): AgentHealth {
    const healthScore = this.calculateHealthScore();

    if (this.startTime) {
      this.metrics.uptime = Date.now() - this.startTime.getTime();
    }

    const health = new AgentHealth(this.id, healthScore, this.metrics, new Date());

    // Emit health changed event if score is low
    if (healthScore < 0.5) {
      this.addDomainEvent(new AgentHealthChanged(this.id, healthScore));
    }

    return health;
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

  /**
   * Get domain events
   */
  getDomainEvents(): DomainEvent[] {
    return [...this.domainEvents];
  }

  /**
   * Clear domain events (after publishing)
   */
  clearDomainEvents(): void {
    this.domainEvents = [];
  }

  /**
   * Add domain event
   */
  private addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
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

  /**
   * Convert to JSON for persistence
   */
  toJSON() {
    return {
      id: this.id.value,
      type: this.type,
      status: this.status,
      capabilities: this.capabilities,
      metrics: this.metrics.toJSON(),
      name: this.name,
      config: this.config,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      startTime: this.startTime?.toISOString(),
    };
  }
}
