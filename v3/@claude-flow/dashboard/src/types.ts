/**
 * Dashboard Type Definitions - WP32
 *
 * Central type definitions for the Claude Flow dashboard.
 * All types are also exported from their respective API modules.
 *
 * @module @claude-flow/dashboard/types
 */

// =============================================================================
// Server Types
// =============================================================================

export interface DashboardServerConfig {
  port: number;
  host: string;
  authEnabled: boolean;
  authToken?: string;
  corsEnabled: boolean;
  staticPath: string;
}

export interface WebSocketClient {
  id: string;
  socket: any;
  subscriptions: Set<string>;
}

// =============================================================================
// Status API Types
// =============================================================================

export interface SystemStatus {
  status: 'running' | 'stopped' | 'error' | 'initializing';
  uptime: number;
  version: string;
  topology: string;
  agentCount: number;
  taskCount: number;
  timestamp: number;
}

export interface AgentInfo {
  id: string;
  type: string;
  status: 'idle' | 'busy' | 'error' | 'terminated';
  currentTask?: string;
  tasksCompleted: number;
  tasksFailed: number;
  successRate: number;
  uptime: number;
  healthScore: number;
}

export interface TaskInfo {
  id: string;
  title: string;
  type: string;
  status: 'pending' | 'queued' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: string;
  assignedAgent?: string;
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  error?: string;
}

export interface SystemMetrics {
  agents: {
    total: number;
    active: number;
    idle: number;
    blocked: number;
    utilization: number;
  };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
    averageDuration: number;
    throughput: number;
  };
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    memoryLimit: number;
    requestsPerSecond: number;
    averageResponseTime: number;
  };
  errors: {
    count: number;
    rate: number;
    lastError?: {
      message: string;
      timestamp: number;
    };
  };
}

// =============================================================================
// Config API Types
// =============================================================================

export interface ClaudeFlowConfig {
  swarm: {
    topology: string;
    maxAgents: number;
    strategy: string;
    consensus: string;
  };
  memory: {
    backend: string;
    path: string;
    hnsw: boolean;
  };
  performance: {
    autoScaling: boolean;
    maxConcurrentTasks: number;
    taskTimeout: number;
  };
  logging: {
    level: string;
    format: string;
    outputs: string[];
  };
  api: {
    port: number;
    host: string;
    authEnabled: boolean;
  };
}

export interface ConfigUpdateResult {
  success: boolean;
  updated: string[];
  errors?: string[];
  config: ClaudeFlowConfig;
}

export interface ConfigReloadResult {
  success: boolean;
  message: string;
  config: ClaudeFlowConfig;
  timestamp: number;
}

// =============================================================================
// Control API Types
// =============================================================================

export interface TerminateAgentResult {
  success: boolean;
  agentId: string;
  message: string;
  timestamp: number;
}

export interface CancelTaskResult {
  success: boolean;
  taskId: string;
  message: string;
  timestamp: number;
}

export interface ScaleSwarmResult {
  success: boolean;
  currentAgents: number;
  targetAgents: number;
  message: string;
  timestamp: number;
}

export interface EmergencyShutdownResult {
  success: boolean;
  agentsTerminated: number;
  tasksCancelled: number;
  message: string;
  timestamp: number;
}

export interface RestartSwarmResult {
  success: boolean;
  message: string;
  timestamp: number;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

export interface APIError {
  code: string;
  message: string;
  details?: any;
}

// =============================================================================
// Dashboard State Types
// =============================================================================

export interface DashboardState {
  connected: boolean;
  status: SystemStatus | null;
  agents: AgentInfo[];
  tasks: TaskInfo[];
  metrics: SystemMetrics | null;
  logs: LogEntry[];
  theme: 'light' | 'dark';
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: any;
}

// =============================================================================
// Event Types
// =============================================================================

export interface SSEMessage {
  type: 'connected' | 'status' | 'agents' | 'tasks' | 'metrics' | 'log';
  data: any;
  timestamp?: number;
}

export interface DashboardEvent {
  type: string;
  payload: any;
  timestamp: number;
}
