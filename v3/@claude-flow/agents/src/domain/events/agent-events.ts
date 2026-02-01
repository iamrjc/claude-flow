/**
 * Agent Domain Events
 *
 * Domain events for agent lifecycle state changes.
 * Following DDD event-driven architecture.
 *
 * @module @claude-flow/agents/domain/events/agent-events
 */

import { AgentId, AgentType, AgentCapabilities, TaskId } from '../models/agent.js';
import { PoolId, ScalingConfig } from '../models/agent-pool.js';

/**
 * Base Domain Event
 */
export abstract class DomainEvent {
  public readonly occurredAt: Date;

  constructor(public readonly eventType: string) {
    this.occurredAt = new Date();
  }

  abstract toJSON(): Record<string, unknown>;
}

/**
 * Agent Created Event
 */
export class AgentCreated extends DomainEvent {
  constructor(
    public readonly agentId: AgentId,
    public readonly agentType: AgentType,
    public readonly capabilities: AgentCapabilities
  ) {
    super('agent.created');
  }

  toJSON() {
    return {
      eventType: this.eventType,
      agentId: this.agentId.value,
      agentType: this.agentType,
      capabilities: this.capabilities,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}

/**
 * Agent Spawned Event
 */
export class AgentSpawned extends DomainEvent {
  constructor(
    public readonly agentId: AgentId,
    public readonly spawnedAt: Date
  ) {
    super('agent.spawned');
  }

  toJSON() {
    return {
      eventType: this.eventType,
      agentId: this.agentId.value,
      spawnedAt: this.spawnedAt.toISOString(),
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}

/**
 * Agent Terminated Event
 */
export class AgentTerminated extends DomainEvent {
  constructor(
    public readonly agentId: AgentId,
    public readonly terminatedAt: Date
  ) {
    super('agent.terminated');
  }

  toJSON() {
    return {
      eventType: this.eventType,
      agentId: this.agentId.value,
      terminatedAt: this.terminatedAt.toISOString(),
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}

/**
 * Agent Health Changed Event
 */
export class AgentHealthChanged extends DomainEvent {
  constructor(
    public readonly agentId: AgentId,
    public readonly healthScore: number
  ) {
    super('agent.health_changed');
  }

  toJSON() {
    return {
      eventType: this.eventType,
      agentId: this.agentId.value,
      healthScore: this.healthScore,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}

/**
 * Task Assigned to Agent Event
 */
export class TaskAssignedToAgent extends DomainEvent {
  constructor(
    public readonly agentId: AgentId,
    public readonly taskId: TaskId
  ) {
    super('agent.task_assigned');
  }

  toJSON() {
    return {
      eventType: this.eventType,
      agentId: this.agentId.value,
      taskId: this.taskId.value,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}

/**
 * Agent Task Completed Event
 */
export class AgentTaskCompleted extends DomainEvent {
  constructor(
    public readonly agentId: AgentId,
    public readonly success: boolean
  ) {
    super('agent.task_completed');
  }

  toJSON() {
    return {
      eventType: this.eventType,
      agentId: this.agentId.value,
      success: this.success,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}

/**
 * Agent Pool Created Event
 */
export class AgentPoolCreated extends DomainEvent {
  constructor(
    public readonly poolId: PoolId,
    public readonly agentType: AgentType,
    public readonly scalingConfig: ScalingConfig
  ) {
    super('pool.created');
  }

  toJSON() {
    return {
      eventType: this.eventType,
      poolId: this.poolId.value,
      agentType: this.agentType,
      scalingConfig: this.scalingConfig,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}

/**
 * Agent Pool Scaled Event
 */
export class AgentPoolScaled extends DomainEvent {
  constructor(
    public readonly poolId: PoolId,
    public readonly previousSize: number,
    public readonly newSize: number,
    public readonly scaledAt: Date
  ) {
    super('pool.scaled');
  }

  toJSON() {
    return {
      eventType: this.eventType,
      poolId: this.poolId.value,
      previousSize: this.previousSize,
      newSize: this.newSize,
      scaledAt: this.scaledAt.toISOString(),
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}
