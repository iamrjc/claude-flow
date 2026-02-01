/**
 * Agent Pool Repository Implementation
 *
 * SQLite-based repository for agent pool persistence.
 *
 * @module @claude-flow/agents/infrastructure/repositories/agent-pool-repository
 */

import Database from 'better-sqlite3';
import {
  AgentPool,
  PoolId,
  ScalingConfig,
} from '../../domain/models/agent-pool.js';
import { AgentId, AgentType } from '../../domain/models/agent.js';
import { IAgentPoolRepository } from '../../domain/interfaces/agent-repository.js';

/**
 * Pool persistence model
 */
interface PoolPersistence {
  id: string;
  type: AgentType;
  name?: string;
  scaling_config: string; // JSON
  agents: string; // JSON array of agent IDs
  created_at: string;
  updated_at: string;
  last_scaling_operation?: string;
}

/**
 * Pool Mapper
 */
export class PoolMapper {
  toPersistence(pool: AgentPool): PoolPersistence {
    const json = pool.toJSON();

    return {
      id: json.id,
      type: json.type,
      name: json.name,
      scaling_config: JSON.stringify(json.scalingConfig),
      agents: JSON.stringify(json.agents),
      created_at: json.createdAt,
      updated_at: json.updatedAt,
      last_scaling_operation: json.lastScalingOperation,
    };
  }

  toDomain(data: PoolPersistence): AgentPool {
    const scalingConfig: ScalingConfig = JSON.parse(data.scaling_config);
    const agentIds: string[] = JSON.parse(data.agents);

    // Reconstruct pool using reflection
    const pool = Object.create(AgentPool.prototype);

    Object.defineProperty(pool, 'id', {
      value: PoolId.from(data.id),
      writable: false,
      enumerable: true,
    });

    pool['type'] = data.type;
    pool['scalingConfig'] = scalingConfig;
    pool['name'] = data.name;
    pool['createdAt'] = new Date(data.created_at);
    pool['updatedAt'] = new Date(data.updated_at);
    pool['lastScalingOperation'] = data.last_scaling_operation
      ? new Date(data.last_scaling_operation)
      : undefined;
    pool['domainEvents'] = [];

    // Reconstruct agents map
    pool['agents'] = new Map<string, AgentId>();
    agentIds.forEach((id) => {
      const agentId = AgentId.from(id);
      pool['agents'].set(id, agentId);
    });

    return pool;
  }
}

/**
 * SQLite Agent Pool Repository
 */
export class AgentPoolRepository implements IAgentPoolRepository {
  private mapper: PoolMapper;

  constructor(private db: Database.Database) {
    this.mapper = new PoolMapper();
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_pools (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT,
        scaling_config TEXT NOT NULL,
        agents TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_scaling_operation TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_pools_type ON agent_pools(type);
    `);
  }

  /**
   * Save pool (insert or update)
   */
  async save(pool: AgentPool): Promise<void> {
    const data = this.mapper.toPersistence(pool);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_pools (
        id, type, name, scaling_config, agents,
        created_at, updated_at, last_scaling_operation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.id,
      data.type,
      data.name || null,
      data.scaling_config,
      data.agents,
      data.created_at,
      data.updated_at,
      data.last_scaling_operation || null
    );
  }

  /**
   * Find pool by ID
   */
  async findById(id: PoolId): Promise<AgentPool | null> {
    const stmt = this.db.prepare('SELECT * FROM agent_pools WHERE id = ?');
    const row = stmt.get(id.value) as PoolPersistence | undefined;

    if (!row) {
      return null;
    }

    return this.mapper.toDomain(row);
  }

  /**
   * Find pools by type
   */
  async findByType(type: AgentType): Promise<AgentPool[]> {
    const stmt = this.db.prepare('SELECT * FROM agent_pools WHERE type = ?');
    const rows = stmt.all(type) as PoolPersistence[];

    return rows.map((row) => this.mapper.toDomain(row));
  }

  /**
   * Find all pools
   */
  async findAll(): Promise<AgentPool[]> {
    const stmt = this.db.prepare('SELECT * FROM agent_pools ORDER BY created_at DESC');
    const rows = stmt.all() as PoolPersistence[];

    return rows.map((row) => this.mapper.toDomain(row));
  }

  /**
   * Delete pool
   */
  async delete(id: PoolId): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM agent_pools WHERE id = ?');
    stmt.run(id.value);
  }
}
