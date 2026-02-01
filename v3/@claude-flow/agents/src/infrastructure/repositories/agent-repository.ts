/**
 * Agent Repository Implementation
 *
 * SQLite-based repository for agent persistence.
 * Uses better-sqlite3 for synchronous operations.
 *
 * @module @claude-flow/agents/infrastructure/repositories/agent-repository
 */

import Database from 'better-sqlite3';
import {
  Agent,
  AgentId,
  AgentStatus,
  AgentType,
  AgentCapabilities,
  AgentMetrics,
} from '../../domain/models/agent.js';
import { IAgentRepository } from '../../domain/interfaces/agent-repository.js';

/**
 * Agent persistence model
 */
interface AgentPersistence {
  id: string;
  type: AgentType;
  status: AgentStatus;
  capabilities: string; // JSON
  metrics: string; // JSON
  name?: string;
  config?: string; // JSON
  created_at: string;
  updated_at: string;
  start_time?: string;
}

/**
 * Agent Mapper
 *
 * Maps between domain model and persistence model
 */
export class AgentMapper {
  /**
   * Convert domain model to persistence model
   */
  toPersistence(agent: Agent): AgentPersistence {
    const json = agent.toJSON();

    return {
      id: json.id,
      type: json.type,
      status: json.status,
      capabilities: JSON.stringify(json.capabilities),
      metrics: JSON.stringify(json.metrics),
      name: json.name,
      config: json.config ? JSON.stringify(json.config) : undefined,
      created_at: json.createdAt,
      updated_at: json.updatedAt,
      start_time: json.startTime,
    };
  }

  /**
   * Reconstruct domain model from persistence model
   */
  toDomain(data: AgentPersistence): Agent {
    const capabilities: AgentCapabilities = JSON.parse(data.capabilities);
    const metricsData = JSON.parse(data.metrics);
    const config = data.config ? JSON.parse(data.config) : undefined;

    const metrics = new AgentMetrics(
      metricsData.tasksCompleted || 0,
      metricsData.tasksFailed || 0,
      metricsData.uptime || 0,
      metricsData.totalTime || 0,
      metricsData.successRate || 1.0
    );

    // Use reflection to reconstruct the agent
    // This bypasses the private constructor
    const agent = Object.create(Agent.prototype);

    Object.defineProperty(agent, 'id', {
      value: AgentId.from(data.id),
      writable: false,
      enumerable: true,
    });

    agent['type'] = data.type;
    agent['status'] = data.status;
    agent['capabilities'] = capabilities;
    agent['metrics'] = metrics;
    agent['name'] = data.name;
    agent['config'] = config;
    agent['createdAt'] = new Date(data.created_at);
    agent['updatedAt'] = new Date(data.updated_at);
    agent['startTime'] = data.start_time ? new Date(data.start_time) : undefined;
    agent['domainEvents'] = [];

    return agent;
  }
}

/**
 * SQLite Agent Repository
 */
export class AgentRepository implements IAgentRepository {
  private mapper: AgentMapper;

  constructor(private db: Database.Database) {
    this.mapper = new AgentMapper();
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        metrics TEXT NOT NULL,
        name TEXT,
        config TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        start_time TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at);
    `);
  }

  /**
   * Save agent (insert or update)
   */
  async save(agent: Agent): Promise<void> {
    const data = this.mapper.toPersistence(agent);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agents (
        id, type, status, capabilities, metrics, name, config,
        created_at, updated_at, start_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.id,
      data.type,
      data.status,
      data.capabilities,
      data.metrics,
      data.name || null,
      data.config || null,
      data.created_at,
      data.updated_at,
      data.start_time || null
    );
  }

  /**
   * Find agent by ID
   */
  async findById(id: AgentId): Promise<Agent | null> {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    const row = stmt.get(id.value) as AgentPersistence | undefined;

    if (!row) {
      return null;
    }

    return this.mapper.toDomain(row);
  }

  /**
   * Find agents by type
   */
  async findByType(type: AgentType): Promise<Agent[]> {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE type = ?');
    const rows = stmt.all(type) as AgentPersistence[];

    return rows.map((row) => this.mapper.toDomain(row));
  }

  /**
   * Find agents by status
   */
  async findByStatus(status: AgentStatus): Promise<Agent[]> {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE status = ?');
    const rows = stmt.all(status) as AgentPersistence[];

    return rows.map((row) => this.mapper.toDomain(row));
  }

  /**
   * Find all agents
   */
  async findAll(): Promise<Agent[]> {
    const stmt = this.db.prepare('SELECT * FROM agents ORDER BY created_at DESC');
    const rows = stmt.all() as AgentPersistence[];

    return rows.map((row) => this.mapper.toDomain(row));
  }

  /**
   * Delete agent
   */
  async delete(id: AgentId): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM agents WHERE id = ?');
    stmt.run(id.value);
  }

  /**
   * Count agents by status
   */
  async countByStatus(status: AgentStatus): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM agents WHERE status = ?');
    const result = stmt.get(status) as { count: number };
    return result.count;
  }
}
