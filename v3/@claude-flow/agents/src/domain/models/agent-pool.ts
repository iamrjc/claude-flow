/**
 * Agent Pool Domain Model
 *
 * Manages groups of agents with scaling and health aggregation.
 *
 * @module @claude-flow/agents/domain/models/agent-pool
 */

import { Agent, AgentId, AgentStatus, AgentType } from './agent.js';
import { AgentPoolCreated, AgentPoolScaled, DomainEvent } from '../events/agent-events.js';

/**
 * Pool ID value object
 */
export class PoolId {
  private constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('Pool ID cannot be empty');
    }
  }

  static generate(): PoolId {
    return new PoolId(`pool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }

  static from(value: string): PoolId {
    return new PoolId(value);
  }

  equals(other: PoolId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Scaling Configuration
 */
export interface ScalingConfig {
  minSize: number;
  maxSize: number;
  targetSize: number;
  scaleUpThreshold: number; // Load % to trigger scale up
  scaleDownThreshold: number; // Load % to trigger scale down
  cooldownPeriod: number; // ms to wait between scaling operations
}

/**
 * Pool Health
 */
export interface PoolHealth {
  poolId: PoolId;
  totalAgents: number;
  healthyAgents: number;
  unhealthyAgents: number;
  idleAgents: number;
  busyAgents: number;
  averageHealthScore: number;
  timestamp: Date;
}

/**
 * Agent Pool Aggregate
 */
export class AgentPool {
  private domainEvents: DomainEvent[] = [];
  private agents: Map<string, AgentId> = new Map();
  private createdAt: Date;
  private updatedAt: Date;
  private lastScalingOperation?: Date;

  private constructor(
    public readonly id: PoolId,
    private type: AgentType,
    private scalingConfig: ScalingConfig,
    private name?: string
  ) {
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.validateScalingConfig();
  }

  /**
   * Factory method to create a new pool
   */
  static create(
    type: AgentType,
    scalingConfig: ScalingConfig,
    name?: string
  ): AgentPool {
    const pool = new AgentPool(PoolId.generate(), type, scalingConfig, name);

    pool.addDomainEvent(new AgentPoolCreated(pool.id, type, scalingConfig));
    return pool;
  }

  /**
   * Add agent to pool
   */
  addAgent(agentId: AgentId): void {
    if (this.agents.size >= this.scalingConfig.maxSize) {
      throw new Error(`Pool ${this.id.value} is at maximum capacity`);
    }

    this.agents.set(agentId.value, agentId);
    this.updatedAt = new Date();
  }

  /**
   * Remove agent from pool
   */
  removeAgent(agentId: AgentId): void {
    this.agents.delete(agentId.value);
    this.updatedAt = new Date();
  }

  /**
   * Scale pool to target size
   */
  scale(targetSize: number): void {
    if (targetSize < this.scalingConfig.minSize) {
      throw new Error(`Target size ${targetSize} is below minimum ${this.scalingConfig.minSize}`);
    }

    if (targetSize > this.scalingConfig.maxSize) {
      throw new Error(`Target size ${targetSize} exceeds maximum ${this.scalingConfig.maxSize}`);
    }

    // Check cooldown period
    if (this.lastScalingOperation) {
      const timeSinceLastScale = Date.now() - this.lastScalingOperation.getTime();
      if (timeSinceLastScale < this.scalingConfig.cooldownPeriod) {
        throw new Error(
          `Scaling operation in cooldown. Wait ${
            this.scalingConfig.cooldownPeriod - timeSinceLastScale
          }ms`
        );
      }
    }

    const currentSize = this.agents.size;
    const previousSize = currentSize;

    this.scalingConfig.targetSize = targetSize;
    this.lastScalingOperation = new Date();
    this.updatedAt = new Date();

    this.addDomainEvent(
      new AgentPoolScaled(this.id, previousSize, targetSize, this.lastScalingOperation)
    );
  }

  /**
   * Calculate pool health from agent health scores
   */
  calculateHealth(agentHealthScores: Map<string, number>): PoolHealth {
    let totalHealthScore = 0;
    let healthyCount = 0;
    let unhealthyCount = 0;

    this.agents.forEach((agentId) => {
      const healthScore = agentHealthScores.get(agentId.value) || 0;
      totalHealthScore += healthScore;

      if (healthScore >= 0.5) {
        healthyCount++;
      } else {
        unhealthyCount++;
      }
    });

    const averageHealthScore = this.agents.size > 0 ? totalHealthScore / this.agents.size : 0;

    return {
      poolId: this.id,
      totalAgents: this.agents.size,
      healthyAgents: healthyCount,
      unhealthyAgents: unhealthyCount,
      idleAgents: 0, // Will be calculated by service
      busyAgents: 0, // Will be calculated by service
      averageHealthScore,
      timestamp: new Date(),
    };
  }

  /**
   * Check if pool needs scaling based on current load
   */
  needsScaling(currentLoad: number): { needed: boolean; direction?: 'up' | 'down' } {
    if (currentLoad >= this.scalingConfig.scaleUpThreshold) {
      if (this.agents.size < this.scalingConfig.maxSize) {
        return { needed: true, direction: 'up' };
      }
    } else if (currentLoad <= this.scalingConfig.scaleDownThreshold) {
      if (this.agents.size > this.scalingConfig.minSize) {
        return { needed: true, direction: 'down' };
      }
    }

    return { needed: false };
  }

  /**
   * Get domain events
   */
  getDomainEvents(): DomainEvent[] {
    return [...this.domainEvents];
  }

  /**
   * Clear domain events
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

  /**
   * Validate scaling configuration
   */
  private validateScalingConfig(): void {
    if (this.scalingConfig.minSize < 0) {
      throw new Error('Minimum pool size cannot be negative');
    }

    if (this.scalingConfig.maxSize < this.scalingConfig.minSize) {
      throw new Error('Maximum pool size must be greater than or equal to minimum');
    }

    if (
      this.scalingConfig.targetSize < this.scalingConfig.minSize ||
      this.scalingConfig.targetSize > this.scalingConfig.maxSize
    ) {
      throw new Error('Target size must be between min and max');
    }

    if (
      this.scalingConfig.scaleUpThreshold < 0 ||
      this.scalingConfig.scaleUpThreshold > 1
    ) {
      throw new Error('Scale up threshold must be between 0 and 1');
    }

    if (
      this.scalingConfig.scaleDownThreshold < 0 ||
      this.scalingConfig.scaleDownThreshold > 1
    ) {
      throw new Error('Scale down threshold must be between 0 and 1');
    }

    if (this.scalingConfig.cooldownPeriod < 0) {
      throw new Error('Cooldown period cannot be negative');
    }
  }

  // Getters
  getType(): AgentType {
    return this.type;
  }

  getName(): string | undefined {
    return this.name;
  }

  getScalingConfig(): ScalingConfig {
    return { ...this.scalingConfig };
  }

  getAgents(): AgentId[] {
    return Array.from(this.agents.values());
  }

  getSize(): number {
    return this.agents.size;
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
      name: this.name,
      scalingConfig: this.scalingConfig,
      agents: Array.from(this.agents.values()).map((id) => id.value),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      lastScalingOperation: this.lastScalingOperation?.toISOString(),
    };
  }
}
