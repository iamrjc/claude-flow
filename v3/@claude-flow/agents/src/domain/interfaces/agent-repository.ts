/**
 * Agent Repository Interface
 *
 * Repository pattern for agent persistence.
 * Defines contract for agent storage and retrieval.
 *
 * @module @claude-flow/agents/domain/interfaces/agent-repository
 */

import { Agent, AgentId, AgentStatus, AgentType } from '../models/agent.js';
import { AgentPool, PoolId } from '../models/agent-pool.js';

/**
 * Agent Repository Interface
 */
export interface IAgentRepository {
  /**
   * Save agent (insert or update)
   */
  save(agent: Agent): Promise<void>;

  /**
   * Find agent by ID
   */
  findById(id: AgentId): Promise<Agent | null>;

  /**
   * Find agents by type
   */
  findByType(type: AgentType): Promise<Agent[]>;

  /**
   * Find agents by status
   */
  findByStatus(status: AgentStatus): Promise<Agent[]>;

  /**
   * Find all agents
   */
  findAll(): Promise<Agent[]>;

  /**
   * Delete agent
   */
  delete(id: AgentId): Promise<void>;

  /**
   * Count agents by status
   */
  countByStatus(status: AgentStatus): Promise<number>;
}

/**
 * Agent Pool Repository Interface
 */
export interface IAgentPoolRepository {
  /**
   * Save pool (insert or update)
   */
  save(pool: AgentPool): Promise<void>;

  /**
   * Find pool by ID
   */
  findById(id: PoolId): Promise<AgentPool | null>;

  /**
   * Find pools by agent type
   */
  findByType(type: AgentType): Promise<AgentPool[]>;

  /**
   * Find all pools
   */
  findAll(): Promise<AgentPool[]>;

  /**
   * Delete pool
   */
  delete(id: PoolId): Promise<void>;
}
