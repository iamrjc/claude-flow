/**
 * Agent Lifecycle Service
 *
 * Application service for agent lifecycle operations.
 * Orchestrates domain models and infrastructure.
 *
 * @module @claude-flow/agents/application/services/agent-lifecycle-service
 */

import { EventEmitter } from 'events';
import {
  Agent,
  AgentId,
  AgentTemplate,
  AgentHealth,
  AgentStatus,
  AgentType,
  AgentNotFoundError,
} from '../../domain/models/agent.js';
import {
  AgentPool,
  PoolId,
  ScalingConfig,
  PoolHealth,
} from '../../domain/models/agent-pool.js';
import { IAgentRepository, IAgentPoolRepository } from '../../domain/interfaces/agent-repository.js';

/**
 * Logger Interface
 */
export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Event Bus Interface
 */
export interface IEventBus {
  emit(eventType: string, data: unknown): void;
  on(eventType: string, handler: (data: unknown) => void): void;
}

/**
 * Agent Filter
 */
export interface AgentFilter {
  type?: AgentType;
  status?: AgentStatus;
  minHealthScore?: number;
}

/**
 * Agent Lifecycle Service
 */
export class AgentLifecycleService extends EventEmitter {
  constructor(
    private agentRepository: IAgentRepository,
    private poolRepository: IAgentPoolRepository,
    private eventBus: IEventBus,
    private logger: ILogger
  ) {
    super();
  }

  /**
   * Spawn a new agent
   */
  async spawnAgent(template: AgentTemplate): Promise<AgentId> {
    this.logger.info('Spawning agent', { type: template.type });

    try {
      // Create domain model
      const agent = Agent.create(template);

      // Spawn the agent (state transition)
      agent.spawn();

      // Save to repository
      await this.agentRepository.save(agent);

      // Publish domain events
      this.publishDomainEvents(agent);

      this.logger.info('Agent spawned successfully', { agentId: agent.id.value });

      return agent.id;
    } catch (error) {
      this.logger.error('Failed to spawn agent', error);
      throw error;
    }
  }

  /**
   * Terminate an agent
   */
  async terminateAgent(agentId: AgentId): Promise<void> {
    this.logger.info('Terminating agent', { agentId: agentId.value });

    try {
      const agent = await this.agentRepository.findById(agentId);
      if (!agent) {
        throw new AgentNotFoundError(agentId);
      }

      // Terminate in domain
      agent.terminate();

      // Save state
      await this.agentRepository.save(agent);

      // Publish domain events
      this.publishDomainEvents(agent);

      this.logger.info('Agent terminated successfully', { agentId: agentId.value });
    } catch (error) {
      this.logger.error('Failed to terminate agent', error);
      throw error;
    }
  }

  /**
   * Get agent health
   */
  async getAgentHealth(agentId: AgentId): Promise<AgentHealth> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new AgentNotFoundError(agentId);
    }

    return agent.reportHealth();
  }

  /**
   * List agents with optional filter
   */
  async listAgents(filter?: AgentFilter): Promise<Agent[]> {
    let agents: Agent[];

    if (filter?.type) {
      agents = await this.agentRepository.findByType(filter.type);
    } else if (filter?.status) {
      agents = await this.agentRepository.findByStatus(filter.status);
    } else {
      agents = await this.agentRepository.findAll();
    }

    // Apply health score filter if specified
    if (filter?.minHealthScore !== undefined) {
      agents = agents.filter((agent) => {
        const health = agent.reportHealth();
        return health.healthScore >= filter.minHealthScore!;
      });
    }

    return agents;
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: AgentId): Promise<Agent> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new AgentNotFoundError(agentId);
    }
    return agent;
  }

  /**
   * Create an agent pool
   */
  async createPool(
    type: AgentType,
    scalingConfig: ScalingConfig,
    name?: string
  ): Promise<PoolId> {
    this.logger.info('Creating agent pool', { type, name });

    try {
      const pool = AgentPool.create(type, scalingConfig, name);

      await this.poolRepository.save(pool);
      this.publishPoolDomainEvents(pool);

      this.logger.info('Pool created successfully', { poolId: pool.id.value });

      return pool.id;
    } catch (error) {
      this.logger.error('Failed to create pool', error);
      throw error;
    }
  }

  /**
   * Scale an agent pool
   */
  async scalePool(poolId: PoolId, targetSize: number): Promise<void> {
    this.logger.info('Scaling agent pool', { poolId: poolId.value, targetSize });

    try {
      const pool = await this.poolRepository.findById(poolId);
      if (!pool) {
        throw new Error(`Pool ${poolId.value} not found`);
      }

      const currentSize = pool.getSize();

      // Scale the pool (will emit domain event)
      pool.scale(targetSize);

      // Save pool state
      await this.poolRepository.save(pool);

      // Publish domain events
      this.publishPoolDomainEvents(pool);

      // Spawn or terminate agents to reach target size
      if (targetSize > currentSize) {
        // Spawn additional agents
        const agentsToSpawn = targetSize - currentSize;
        this.logger.info(`Spawning ${agentsToSpawn} agents for pool`, {
          poolId: poolId.value,
        });

        const template: AgentTemplate = {
          type: pool.getType(),
          capabilities: this.getDefaultCapabilitiesForType(pool.getType()),
        };

        for (let i = 0; i < agentsToSpawn; i++) {
          const agentId = await this.spawnAgent(template);
          // Note: In a full implementation, we would add the agent to the pool
          // For now, we just spawn them
        }
      } else if (targetSize < currentSize) {
        // Terminate excess agents
        const agentsToTerminate = currentSize - targetSize;
        this.logger.info(`Terminating ${agentsToTerminate} agents from pool`, {
          poolId: poolId.value,
        });

        const poolAgents = pool.getAgents();
        for (let i = 0; i < agentsToTerminate && i < poolAgents.length; i++) {
          await this.terminateAgent(poolAgents[i]);
        }
      }

      this.logger.info('Pool scaled successfully', {
        poolId: poolId.value,
        from: currentSize,
        to: targetSize,
      });
    } catch (error) {
      this.logger.error('Failed to scale pool', error);
      throw error;
    }
  }

  /**
   * Get pool health
   */
  async getPoolHealth(poolId: PoolId): Promise<PoolHealth> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId.value} not found`);
    }

    // Gather health scores for all agents in the pool
    const healthScores = new Map<string, number>();

    for (const agentId of pool.getAgents()) {
      const agent = await this.agentRepository.findById(agentId);
      if (agent) {
        const health = agent.reportHealth();
        healthScores.set(agentId.value, health.healthScore);
      }
    }

    return pool.calculateHealth(healthScores);
  }

  /**
   * Get agent statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<AgentStatus, number>;
    byType: Record<AgentType, number>;
  }> {
    const agents = await this.agentRepository.findAll();

    const byStatus: Record<AgentStatus, number> = {
      [AgentStatus.Initializing]: 0,
      [AgentStatus.Idle]: 0,
      [AgentStatus.Busy]: 0,
      [AgentStatus.Terminated]: 0,
      [AgentStatus.Error]: 0,
    };

    const byType: Record<string, number> = {};

    agents.forEach((agent) => {
      byStatus[agent.getStatus()]++;

      const type = agent.getType();
      byType[type] = (byType[type] || 0) + 1;
    });

    return {
      total: agents.length,
      byStatus,
      byType: byType as Record<AgentType, number>,
    };
  }

  /**
   * Publish domain events to event bus
   */
  private publishDomainEvents(agent: Agent): void {
    const events = agent.getDomainEvents();

    events.forEach((event) => {
      this.eventBus.emit(event.eventType, event.toJSON());
      this.emit(event.eventType, event.toJSON());
    });

    agent.clearDomainEvents();
  }

  /**
   * Publish pool domain events
   */
  private publishPoolDomainEvents(pool: AgentPool): void {
    const events = pool.getDomainEvents();

    events.forEach((event) => {
      this.eventBus.emit(event.eventType, event.toJSON());
      this.emit(event.eventType, event.toJSON());
    });

    pool.clearDomainEvents();
  }

  /**
   * Get default capabilities for agent type
   */
  private getDefaultCapabilitiesForType(type: AgentType) {
    // Default capabilities based on type
    const capabilitiesMap: Record<AgentType, any> = {
      coder: {
        canCode: true,
        canReview: false,
        canTest: false,
        canResearch: false,
        canArchitect: false,
        canCoordinate: false,
        specializations: ['coding', 'implementation'],
      },
      researcher: {
        canCode: false,
        canReview: false,
        canTest: false,
        canResearch: true,
        canArchitect: false,
        canCoordinate: false,
        specializations: ['research', 'analysis'],
      },
      reviewer: {
        canCode: false,
        canReview: true,
        canTest: false,
        canResearch: false,
        canArchitect: false,
        canCoordinate: false,
        specializations: ['code-review', 'quality'],
      },
      tester: {
        canCode: false,
        canReview: false,
        canTest: true,
        canResearch: false,
        canArchitect: false,
        canCoordinate: false,
        specializations: ['testing', 'qa'],
      },
      architect: {
        canCode: true,
        canReview: true,
        canTest: false,
        canResearch: true,
        canArchitect: true,
        canCoordinate: false,
        specializations: ['architecture', 'design'],
      },
      planner: {
        canCode: false,
        canReview: false,
        canTest: false,
        canResearch: true,
        canArchitect: true,
        canCoordinate: true,
        specializations: ['planning', 'coordination'],
      },
      coordinator: {
        canCode: false,
        canReview: false,
        canTest: false,
        canResearch: false,
        canArchitect: false,
        canCoordinate: true,
        specializations: ['coordination', 'orchestration'],
      },
      'security-architect': {
        canCode: true,
        canReview: true,
        canTest: false,
        canResearch: true,
        canArchitect: true,
        canCoordinate: false,
        specializations: ['security', 'architecture'],
      },
      'security-auditor': {
        canCode: false,
        canReview: true,
        canTest: true,
        canResearch: true,
        canArchitect: false,
        canCoordinate: false,
        specializations: ['security', 'auditing'],
      },
      'memory-specialist': {
        canCode: true,
        canReview: false,
        canTest: false,
        canResearch: true,
        canArchitect: true,
        canCoordinate: false,
        specializations: ['memory', 'optimization'],
      },
      'performance-engineer': {
        canCode: true,
        canReview: true,
        canTest: true,
        canResearch: true,
        canArchitect: true,
        canCoordinate: false,
        specializations: ['performance', 'optimization'],
      },
    };

    return capabilitiesMap[type] || capabilitiesMap.coder;
  }
}
