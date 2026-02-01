/**
 * Task Repository Implementation - Infrastructure Layer
 *
 * SQLite-based implementation of ITaskRepository.
 * Handles persistence and retrieval of task aggregates.
 *
 * @module v3/agents/infrastructure/repositories
 */

import Database from 'better-sqlite3';
import { Task, TaskId, TaskStatus, TaskPriority, TaskType, TaskProps } from '../../domain/models/task.js';
import { ITaskRepository, TaskQueryOptions, TaskStatistics } from '../../domain/interfaces/task-repository.js';

/**
 * Task Repository - SQLite Implementation
 */
export class TaskRepository implements ITaskRepository {
  private db?: Database.Database;

  constructor(private readonly dbPath: string = ':memory:') {}

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath);

    // Create tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        assigned_agent_id TEXT,
        blocked_by TEXT,
        blocks TEXT,
        input TEXT,
        output TEXT,
        error TEXT,
        metrics TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        timeout INTEGER DEFAULT 300000,
        metadata TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
      CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
    `);
  }

  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  async clear(): Promise<void> {
    this.ensureInitialized();
    this.db!.exec('DELETE FROM tasks');
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  async save(task: Task): Promise<void> {
    this.ensureInitialized();

    const data = task.toPersistence();

    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO tasks (
        id, title, description, type, priority, status,
        assigned_agent_id, blocked_by, blocks,
        input, output, error, metrics,
        retry_count, max_retries, timeout, metadata,
        created_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.id,
      data.title,
      data.description,
      data.type,
      data.priority,
      data.status,
      data.assignedAgentId ?? null,
      JSON.stringify(data.blockedBy),
      JSON.stringify(data.blocks),
      data.input ? JSON.stringify(data.input) : null,
      data.output ? JSON.stringify(data.output) : null,
      data.error ?? null,
      data.metrics ? JSON.stringify(data.metrics) : null,
      data.retryCount,
      data.maxRetries,
      data.timeout,
      JSON.stringify(data.metadata),
      data.createdAt,
      data.startedAt ?? null,
      data.completedAt ?? null
    );
  }

  async findById(id: string): Promise<Task | null> {
    this.ensureInitialized();

    const stmt = this.db!.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as any;

    return row ? this.rowToTask(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();

    const stmt = this.db!.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }

  async exists(id: string): Promise<boolean> {
    this.ensureInitialized();

    const stmt = this.db!.prepare('SELECT 1 FROM tasks WHERE id = ? LIMIT 1');
    const row = stmt.get(id);

    return !!row;
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  async saveMany(tasks: Task[]): Promise<void> {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO tasks (
        id, title, description, type, priority, status,
        assigned_agent_id, blocked_by, blocks,
        input, output, error, metrics,
        retry_count, max_retries, timeout, metadata,
        created_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db!.transaction((tasks: Task[]) => {
      for (const task of tasks) {
        const data = task.toPersistence();
        stmt.run(
          data.id,
          data.title,
          data.description,
          data.type,
          data.priority,
          data.status,
          data.assignedAgentId ?? null,
          JSON.stringify(data.blockedBy),
          JSON.stringify(data.blocks),
          data.input ? JSON.stringify(data.input) : null,
          data.output ? JSON.stringify(data.output) : null,
          data.error ?? null,
          data.metrics ? JSON.stringify(data.metrics) : null,
          data.retryCount,
          data.maxRetries,
          data.timeout,
          JSON.stringify(data.metadata),
          data.createdAt,
          data.startedAt ?? null,
          data.completedAt ?? null
        );
      }
    });

    insertMany(tasks);
  }

  async findByIds(ids: string[]): Promise<Task[]> {
    this.ensureInitialized();

    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db!.prepare(`SELECT * FROM tasks WHERE id IN (${placeholders})`);
    const rows = stmt.all(...ids) as any[];

    return rows.map(row => this.rowToTask(row));
  }

  async deleteMany(ids: string[]): Promise<number> {
    this.ensureInitialized();

    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db!.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`);
    const result = stmt.run(...ids);

    return result.changes;
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  async findAll(options?: TaskQueryOptions): Promise<Task[]> {
    this.ensureInitialized();

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (options?.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    if (options?.priority) {
      query += ' AND priority = ?';
      params.push(options.priority);
    }

    if (options?.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    if (options?.assignedAgentId) {
      query += ' AND assigned_agent_id = ?';
      params.push(options.assignedAgentId);
    }

    // Order by
    const orderBy = options?.orderBy ?? 'created_at';
    const orderDirection = options?.orderDirection ?? 'desc';
    query += ` ORDER BY ${orderBy} ${orderDirection}`;

    // Limit and offset
    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);

      if (options?.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const stmt = this.db!.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.rowToTask(row));
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.findAll({ status });
  }

  async findByPriority(priority: TaskPriority): Promise<Task[]> {
    return this.findAll({ priority });
  }

  async findByType(type: TaskType): Promise<Task[]> {
    return this.findAll({ type });
  }

  async findByAgent(agentId: string): Promise<Task[]> {
    return this.findAll({ assignedAgentId: agentId });
  }

  async findPending(): Promise<Task[]> {
    return this.findByStatus(TaskStatus.PENDING);
  }

  async findQueued(): Promise<Task[]> {
    return this.findByStatus(TaskStatus.QUEUED);
  }

  async findRunning(): Promise<Task[]> {
    return this.findByStatus(TaskStatus.RUNNING);
  }

  async findTimedOut(): Promise<Task[]> {
    this.ensureInitialized();

    const now = new Date().toISOString();
    const stmt = this.db!.prepare(`
      SELECT * FROM tasks
      WHERE status = ?
        AND started_at IS NOT NULL
        AND (julianday(?) - julianday(started_at)) * 86400000 > timeout
    `);

    const rows = stmt.all(TaskStatus.RUNNING, now) as any[];
    return rows.map(row => this.rowToTask(row));
  }

  // ============================================================================
  // Queue Operations
  // ============================================================================

  async getNextTask(agentCapabilities?: string[]): Promise<Task | null> {
    this.ensureInitialized();

    // Get all queued tasks ordered by priority
    const tasks = await this.findQueued();

    // Get completed task IDs
    const completed = await this.findByStatus(TaskStatus.COMPLETED);
    const completedIds = new Set(completed.map(t => t.id.value));

    // Find first task with satisfied dependencies
    for (const task of tasks) {
      if (task.areDependenciesSatisfied(completedIds)) {
        return task;
      }
    }

    return null;
  }

  async getTaskQueue(limit?: number): Promise<Task[]> {
    return this.findAll({
      status: TaskStatus.QUEUED,
      orderBy: 'priority',
      orderDirection: 'asc',
      limit,
    });
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getStatistics(): Promise<TaskStatistics> {
    this.ensureInitialized();

    // Total count
    const totalStmt = this.db!.prepare('SELECT COUNT(*) as count FROM tasks');
    const total = (totalStmt.get() as any).count;

    // By status
    const statusStmt = this.db!.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status');
    const statusRows = statusStmt.all() as any[];
    const byStatus: Record<TaskStatus, number> = {
      [TaskStatus.PENDING]: 0,
      [TaskStatus.QUEUED]: 0,
      [TaskStatus.ASSIGNED]: 0,
      [TaskStatus.RUNNING]: 0,
      [TaskStatus.COMPLETED]: 0,
      [TaskStatus.FAILED]: 0,
      [TaskStatus.CANCELLED]: 0,
    };
    statusRows.forEach(row => {
      byStatus[row.status as TaskStatus] = row.count;
    });

    // By priority
    const priorityStmt = this.db!.prepare('SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority');
    const priorityRows = priorityStmt.all() as any[];
    const byPriority: Record<TaskPriority, number> = {
      [TaskPriority.CRITICAL]: 0,
      [TaskPriority.HIGH]: 0,
      [TaskPriority.NORMAL]: 0,
      [TaskPriority.LOW]: 0,
    };
    priorityRows.forEach(row => {
      byPriority[row.priority as TaskPriority] = row.count;
    });

    // By type
    const typeStmt = this.db!.prepare('SELECT type, COUNT(*) as count FROM tasks GROUP BY type');
    const typeRows = typeStmt.all() as any[];
    const byType: Record<string, number> = {};
    typeRows.forEach(row => {
      byType[row.type] = row.count;
    });

    // Average execution time
    const avgStmt = this.db!.prepare(`
      SELECT AVG((julianday(completed_at) - julianday(started_at)) * 86400000) as avg_time
      FROM tasks
      WHERE started_at IS NOT NULL AND completed_at IS NOT NULL
    `);
    const avgRow = avgStmt.get() as any;
    const averageExecutionTime = avgRow.avg_time ?? 0;

    // Success rate
    const completedCount = byStatus[TaskStatus.COMPLETED];
    const failedCount = byStatus[TaskStatus.FAILED];
    const totalFinished = completedCount + failedCount;
    const successRate = totalFinished > 0 ? completedCount / totalFinished : 0;

    // Retry rate
    const retryStmt = this.db!.prepare('SELECT AVG(retry_count) as avg_retries FROM tasks WHERE status = ?');
    const retryRow = retryStmt.get(TaskStatus.FAILED) as any;
    const retryRate = retryRow.avg_retries ?? 0;

    return {
      total,
      byStatus,
      byPriority,
      byType,
      averageExecutionTime,
      successRate,
      retryRate,
    };
  }

  async count(options?: TaskQueryOptions): Promise<number> {
    this.ensureInitialized();

    let query = 'SELECT COUNT(*) as count FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (options?.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    if (options?.priority) {
      query += ' AND priority = ?';
      params.push(options.priority);
    }

    if (options?.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    if (options?.assignedAgentId) {
      query += ' AND assigned_agent_id = ?';
      params.push(options.assignedAgentId);
    }

    const stmt = this.db!.prepare(query);
    const row = stmt.get(...params) as any;

    return row.count;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.db) {
      throw new Error('Repository not initialized. Call initialize() first.');
    }
  }

  private rowToTask(row: any): Task {
    const props: TaskProps = {
      id: TaskId.fromString(row.id),
      title: row.title,
      description: row.description,
      type: row.type as TaskType,
      priority: row.priority as TaskPriority,
      status: row.status as TaskStatus,
      assignedAgentId: row.assigned_agent_id ?? undefined,
      blockedBy: JSON.parse(row.blocked_by),
      blocks: JSON.parse(row.blocks),
      input: row.input ? JSON.parse(row.input) : undefined,
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error ?? undefined,
      metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      timeout: row.timeout,
      metadata: JSON.parse(row.metadata),
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };

    return Task.fromPersistence(props);
  }
}
