/**
 * Agent Stream - Agent Output Event Streaming
 *
 * Streams agent execution events including:
 * - Agent lifecycle events (spawned, started, stopped)
 * - stdout/stderr output in real-time
 * - Log messages with levels
 * - Performance metrics (CPU, memory, tokens)
 * - Health status updates
 *
 * @module @claude-flow/streaming/streams
 */

import { EventEmitter } from 'events';
import { SSEServer, SSEEvent } from '../server/sse-server.js';

/**
 * Agent status enum
 */
export enum AgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
}

/**
 * Log level enum
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Agent event data
 */
export interface AgentEventData {
  /** Agent ID */
  agentId: string;
  /** Agent name */
  name?: string;
  /** Agent type */
  type?: string;
  /** Agent status */
  status: AgentStatus;
  /** Current task ID */
  currentTaskId?: string;
  /** Health status */
  health?: AgentHealth;
  /** Metrics */
  metrics?: AgentMetrics;
  /** Error message */
  error?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Agent health status
 */
export interface AgentHealth {
  /** Is healthy */
  healthy: boolean;
  /** Health score (0-100) */
  score: number;
  /** Issues */
  issues?: string[];
  /** Last check time */
  lastCheck: Date;
}

/**
 * Agent metrics
 */
export interface AgentMetrics {
  /** Total tasks completed */
  tasksCompleted: number;
  /** Total tasks failed */
  tasksFailed: number;
  /** Average execution time in ms */
  avgExecutionTime: number;
  /** CPU usage percentage */
  cpuUsage: number;
  /** Memory usage in bytes */
  memoryUsage: number;
  /** Total tokens processed */
  totalTokens: number;
  /** Total cost */
  totalCost: number;
  /** Uptime in ms */
  uptime: number;
}

/**
 * Output stream data
 */
export interface OutputData {
  /** Agent ID */
  agentId: string;
  /** Stream type */
  stream: 'stdout' | 'stderr';
  /** Output data */
  data: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Log message data
 */
export interface LogMessage {
  /** Agent ID */
  agentId: string;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Agent stream configuration
 */
export interface AgentStreamConfig {
  /** Include stdout/stderr */
  includeOutput?: boolean;
  /** Include log messages */
  includeLogs?: boolean;
  /** Include metrics */
  includeMetrics?: boolean;
  /** Metrics update interval in ms */
  metricsUpdateInterval?: number;
  /** Buffer size for output */
  outputBufferSize?: number;
}

/**
 * Agent Stream
 *
 * Streams agent execution events to SSE clients.
 *
 * Example:
 * ```ts
 * const agentStream = new AgentStream(sseServer);
 * agentStream.start();
 *
 * agentStream.emitAgentSpawned('agent-123', { name: 'coder-1', type: 'coder' });
 * agentStream.emitOutput('agent-123', 'stdout', 'Processing file...');
 * agentStream.emitLog('agent-123', 'info', 'Task completed successfully');
 * agentStream.emitMetrics('agent-123', { cpuUsage: 45, memoryUsage: 1024000 });
 * ```
 */
export class AgentStream extends EventEmitter {
  private sseServer: SSEServer;
  private config: Required<AgentStreamConfig>;
  private agentStates: Map<string, AgentEventData> = new Map();
  private outputBuffers: Map<string, string[]> = new Map();
  private lastMetricsUpdate: Map<string, number> = new Map();

  constructor(sseServer: SSEServer, config: AgentStreamConfig = {}) {
    super();
    this.sseServer = sseServer;
    this.config = {
      includeOutput: config.includeOutput ?? true,
      includeLogs: config.includeLogs ?? true,
      includeMetrics: config.includeMetrics ?? true,
      metricsUpdateInterval: config.metricsUpdateInterval ?? 2000,
      outputBufferSize: config.outputBufferSize ?? 100,
    };
  }

  /**
   * Start agent stream
   */
  start(): void {
    this.emit('started');
  }

  /**
   * Stop agent stream
   */
  stop(): void {
    this.agentStates.clear();
    this.outputBuffers.clear();
    this.lastMetricsUpdate.clear();
    this.emit('stopped');
  }

  /**
   * Emit agent spawned event
   */
  emitAgentSpawned(agentId: string, data: Partial<AgentEventData> = {}): void {
    const eventData: AgentEventData = {
      agentId,
      status: AgentStatus.IDLE,
      timestamp: new Date(),
      ...data,
    };

    this.agentStates.set(agentId, eventData);
    this.sendEvent('agent:spawned', eventData);
    this.emit('agentSpawned', eventData);
  }

  /**
   * Emit agent started event
   */
  emitAgentStarted(agentId: string, taskId: string, data: Partial<AgentEventData> = {}): void {
    const eventData = this.updateAgentState(agentId, {
      status: AgentStatus.BUSY,
      currentTaskId: taskId,
      ...data,
    });

    this.sendEvent('agent:started', eventData);
    this.emit('agentStarted', eventData);
  }

  /**
   * Emit agent stopped event
   */
  emitAgentStopped(agentId: string, data: Partial<AgentEventData> = {}): void {
    const eventData = this.updateAgentState(agentId, {
      status: AgentStatus.STOPPED,
      currentTaskId: undefined,
      ...data,
    });

    this.sendEvent('agent:stopped', eventData);
    this.emit('agentStopped', eventData);

    // Cleanup
    this.outputBuffers.delete(agentId);
    this.lastMetricsUpdate.delete(agentId);
  }

  /**
   * Emit agent paused event
   */
  emitAgentPaused(agentId: string, data: Partial<AgentEventData> = {}): void {
    const eventData = this.updateAgentState(agentId, {
      status: AgentStatus.PAUSED,
      ...data,
    });

    this.sendEvent('agent:paused', eventData);
    this.emit('agentPaused', eventData);
  }

  /**
   * Emit agent error event
   */
  emitAgentError(agentId: string, error: string, data: Partial<AgentEventData> = {}): void {
    const eventData = this.updateAgentState(agentId, {
      status: AgentStatus.ERROR,
      error,
      ...data,
    });

    this.sendEvent('agent:error', eventData);
    this.emit('agentError', eventData);
  }

  /**
   * Emit agent output (stdout/stderr)
   */
  emitOutput(agentId: string, stream: 'stdout' | 'stderr', data: string): void {
    if (!this.config.includeOutput) {
      return;
    }

    // Buffer output
    const buffer = this.outputBuffers.get(agentId) || [];
    buffer.push(data);
    if (buffer.length > this.config.outputBufferSize) {
      buffer.shift();
    }
    this.outputBuffers.set(agentId, buffer);

    const outputData: OutputData = {
      agentId,
      stream,
      data,
      timestamp: new Date(),
    };

    this.sendEvent(`agent:output:${stream}`, outputData);
    this.emit('agentOutput', outputData);
  }

  /**
   * Emit log message
   */
  emitLog(agentId: string, level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.config.includeLogs) {
      return;
    }

    const logData: LogMessage = {
      agentId,
      level,
      message,
      context,
      timestamp: new Date(),
    };

    this.sendEvent(`agent:log:${level}`, logData);
    this.emit('agentLog', logData);
  }

  /**
   * Emit agent metrics
   */
  emitMetrics(agentId: string, metrics: Partial<AgentMetrics>): void {
    if (!this.config.includeMetrics) {
      return;
    }

    // Throttle metrics updates
    const lastUpdate = this.lastMetricsUpdate.get(agentId) || 0;
    const now = Date.now();
    if (now - lastUpdate < this.config.metricsUpdateInterval) {
      return;
    }
    this.lastMetricsUpdate.set(agentId, now);

    const currentState = this.agentStates.get(agentId);
    const updatedMetrics: AgentMetrics = {
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTime: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      totalTokens: 0,
      totalCost: 0,
      uptime: 0,
      ...currentState?.metrics,
      ...metrics,
    };

    const eventData = this.updateAgentState(agentId, {
      metrics: updatedMetrics,
    });

    this.sendEvent('agent:metrics', {
      agentId: eventData.agentId,
      metrics: updatedMetrics,
      status: eventData.status,
    });

    this.emit('agentMetrics', { agentId, metrics: updatedMetrics });
  }

  /**
   * Emit health status update
   */
  emitHealth(agentId: string, health: AgentHealth): void {
    const eventData = this.updateAgentState(agentId, {
      health,
    });

    this.sendEvent('agent:health', {
      agentId: eventData.agentId,
      health,
      status: eventData.status,
    });

    this.emit('agentHealth', { agentId, health });
  }

  /**
   * Update agent state
   */
  private updateAgentState(agentId: string, updates: Partial<AgentEventData>): AgentEventData {
    const current = this.agentStates.get(agentId) || {
      agentId,
      status: AgentStatus.IDLE,
      timestamp: new Date(),
    };

    const updated: AgentEventData = {
      ...current,
      ...updates,
      timestamp: new Date(),
    };

    this.agentStates.set(agentId, updated);
    return updated;
  }

  /**
   * Send event to SSE server
   */
  private sendEvent(eventType: string, data: unknown): void {
    const event: SSEEvent = {
      event: eventType,
      data,
      id: `${eventType}-${Date.now()}`,
    };

    this.sseServer.broadcast(event);
  }

  /**
   * Get agent state
   */
  getAgentState(agentId: string): AgentEventData | undefined {
    return this.agentStates.get(agentId);
  }

  /**
   * Get all agent states
   */
  getAllAgentStates(): AgentEventData[] {
    return Array.from(this.agentStates.values());
  }

  /**
   * Get agent output buffer
   */
  getOutputBuffer(agentId: string): string[] {
    return this.outputBuffers.get(agentId) || [];
  }

  /**
   * Clear agent state
   */
  clearAgentState(agentId: string): void {
    this.agentStates.delete(agentId);
    this.outputBuffers.delete(agentId);
    this.lastMetricsUpdate.delete(agentId);
  }
}
