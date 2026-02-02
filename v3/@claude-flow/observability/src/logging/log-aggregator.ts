/**
 * Log Aggregator - Cross-agent correlation, session grouping, search, export
 *
 * Features:
 * - Cross-agent log correlation
 * - Session-based log grouping
 * - Full-text search across logs
 * - Time range queries
 * - Export to JSON/CSV
 * - In-memory storage with optional persistence
 */

import type { LogEntry, LogLevel } from './structured-logger.js';

export interface LogQuery {
  level?: LogLevel;
  correlationId?: string;
  agentId?: string;
  taskId?: string;
  sessionId?: string;
  startTime?: Date;
  endTime?: Date;
  searchTerm?: string;
  context?: string;
  limit?: number;
  offset?: number;
}

export interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  byAgent: Record<string, number>;
  bySession: Record<string, number>;
  timeRange: {
    earliest: string;
    latest: string;
  };
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'ndjson';
  pretty?: boolean;
}

export class LogAggregator {
  private logs: LogEntry[] = [];
  private maxLogs: number;
  private correlationIndex: Map<string, LogEntry[]> = new Map();
  private agentIndex: Map<string, LogEntry[]> = new Map();
  private sessionIndex: Map<string, LogEntry[]> = new Map();
  private taskIndex: Map<string, LogEntry[]> = new Map();

  constructor(maxLogs: number = 10000) {
    this.maxLogs = maxLogs;
  }

  /**
   * Add a log entry to the aggregator
   */
  addLog(entry: LogEntry): void {
    // Add to main array
    this.logs.push(entry);

    // Update indexes
    if (entry.correlationId) {
      this.addToIndex(this.correlationIndex, entry.correlationId, entry);
    }
    if (entry.agentId) {
      this.addToIndex(this.agentIndex, entry.agentId, entry);
    }
    if (entry.sessionId) {
      this.addToIndex(this.sessionIndex, entry.sessionId, entry);
    }
    if (entry.taskId) {
      this.addToIndex(this.taskIndex, entry.taskId, entry);
    }

    // Trim if exceeding max logs
    if (this.logs.length > this.maxLogs) {
      const removed = this.logs.shift();
      if (removed) {
        this.removeFromIndexes(removed);
      }
    }
  }

  /**
   * Query logs with filters
   */
  query(query: LogQuery = {}): LogEntry[] {
    let results = [...this.logs];

    // Filter by level
    if (query.level) {
      results = results.filter((log) => log.level === query.level);
    }

    // Filter by correlation ID
    if (query.correlationId) {
      results = this.correlationIndex.get(query.correlationId) ?? [];
    }

    // Filter by agent ID
    if (query.agentId) {
      const agentLogs = this.agentIndex.get(query.agentId) ?? [];
      results = results.filter((log) => agentLogs.includes(log));
    }

    // Filter by task ID
    if (query.taskId) {
      const taskLogs = this.taskIndex.get(query.taskId) ?? [];
      results = results.filter((log) => taskLogs.includes(log));
    }

    // Filter by session ID
    if (query.sessionId) {
      const sessionLogs = this.sessionIndex.get(query.sessionId) ?? [];
      results = results.filter((log) => sessionLogs.includes(log));
    }

    // Filter by time range
    if (query.startTime) {
      const startTime = query.startTime.getTime();
      results = results.filter((log) => new Date(log.timestamp).getTime() >= startTime);
    }
    if (query.endTime) {
      const endTime = query.endTime.getTime();
      results = results.filter((log) => new Date(log.timestamp).getTime() <= endTime);
    }

    // Filter by context
    if (query.context) {
      results = results.filter((log) => log.context?.includes(query.context!));
    }

    // Full-text search
    if (query.searchTerm) {
      const searchLower = query.searchTerm.toLowerCase();
      results = results.filter((log) => {
        return (
          log.message.toLowerCase().includes(searchLower) ||
          (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(searchLower))
        );
      });
    }

    // Apply offset and limit
    const offset = query.offset ?? 0;
    const limit = query.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get logs by correlation ID
   */
  getByCorrelation(correlationId: string): LogEntry[] {
    return this.correlationIndex.get(correlationId) ?? [];
  }

  /**
   * Get logs by agent ID
   */
  getByAgent(agentId: string): LogEntry[] {
    return this.agentIndex.get(agentId) ?? [];
  }

  /**
   * Get logs by session ID
   */
  getBySession(sessionId: string): LogEntry[] {
    return this.sessionIndex.get(sessionId) ?? [];
  }

  /**
   * Get logs by task ID
   */
  getByTask(taskId: string): LogEntry[] {
    return this.taskIndex.get(taskId) ?? [];
  }

  /**
   * Get statistics about stored logs
   */
  getStats(): LogStats {
    const byLevel: Record<string, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0,
    };

    const byAgent: Record<string, number> = {};
    const bySession: Record<string, number> = {};

    let earliest = this.logs[0]?.timestamp;
    let latest = this.logs[0]?.timestamp;

    for (const log of this.logs) {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;

      if (log.agentId) {
        byAgent[log.agentId] = (byAgent[log.agentId] || 0) + 1;
      }

      if (log.sessionId) {
        bySession[log.sessionId] = (bySession[log.sessionId] || 0) + 1;
      }

      if (log.timestamp < earliest) earliest = log.timestamp;
      if (log.timestamp > latest) latest = log.timestamp;
    }

    return {
      total: this.logs.length,
      byLevel: byLevel as Record<LogLevel, number>,
      byAgent,
      bySession,
      timeRange: {
        earliest: earliest ?? new Date().toISOString(),
        latest: latest ?? new Date().toISOString(),
      },
    };
  }

  /**
   * Export logs in various formats
   */
  export(query: LogQuery = {}, options: ExportOptions = { format: 'json' }): string {
    const logs = this.query(query);

    switch (options.format) {
      case 'json':
        return options.pretty ? JSON.stringify(logs, null, 2) : JSON.stringify(logs);

      case 'ndjson':
        return logs.map((log) => JSON.stringify(log)).join('\n');

      case 'csv':
        return this.exportToCsv(logs);

      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
    this.correlationIndex.clear();
    this.agentIndex.clear();
    this.sessionIndex.clear();
    this.taskIndex.clear();
  }

  /**
   * Get total number of logs
   */
  size(): number {
    return this.logs.length;
  }

  /**
   * Get all unique correlation IDs
   */
  getCorrelationIds(): string[] {
    return Array.from(this.correlationIndex.keys());
  }

  /**
   * Get all unique agent IDs
   */
  getAgentIds(): string[] {
    return Array.from(this.agentIndex.keys());
  }

  /**
   * Get all unique session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessionIndex.keys());
  }

  /**
   * Add entry to index
   */
  private addToIndex(
    index: Map<string, LogEntry[]>,
    key: string,
    entry: LogEntry
  ): void {
    const existing = index.get(key) ?? [];
    existing.push(entry);
    index.set(key, existing);
  }

  /**
   * Remove entry from all indexes
   */
  private removeFromIndexes(entry: LogEntry): void {
    if (entry.correlationId) {
      this.removeFromIndex(this.correlationIndex, entry.correlationId, entry);
    }
    if (entry.agentId) {
      this.removeFromIndex(this.agentIndex, entry.agentId, entry);
    }
    if (entry.sessionId) {
      this.removeFromIndex(this.sessionIndex, entry.sessionId, entry);
    }
    if (entry.taskId) {
      this.removeFromIndex(this.taskIndex, entry.taskId, entry);
    }
  }

  /**
   * Remove entry from a specific index
   */
  private removeFromIndex(
    index: Map<string, LogEntry[]>,
    key: string,
    entry: LogEntry
  ): void {
    const existing = index.get(key);
    if (existing) {
      const filtered = existing.filter((e) => e !== entry);
      if (filtered.length === 0) {
        index.delete(key);
      } else {
        index.set(key, filtered);
      }
    }
  }

  /**
   * Export logs to CSV format
   */
  private exportToCsv(logs: LogEntry[]): string {
    if (logs.length === 0) return '';

    const headers = [
      'timestamp',
      'level',
      'message',
      'correlationId',
      'agentId',
      'taskId',
      'sessionId',
      'context',
      'metadata',
    ];

    const rows = logs.map((log) =>
      headers
        .map((header) => {
          const value = log[header as keyof LogEntry];
          if (value === undefined || value === null) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value).replace(/"/g, '""');
        })
        .map((val) => `"${val}"`)
        .join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }
}

/**
 * Global log aggregator instance
 */
export const logAggregator = new LogAggregator();

/**
 * Create a new log aggregator
 */
export function createLogAggregator(maxLogs?: number): LogAggregator {
  return new LogAggregator(maxLogs);
}
