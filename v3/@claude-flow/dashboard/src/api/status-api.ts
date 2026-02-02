/**
 * Status API - WP32
 *
 * GET /api/status - Overall system status
 * GET /api/agents - List of agents with their states
 * GET /api/tasks - List of tasks with their statuses
 * GET /api/metrics - Performance metrics and stats
 *
 * @module @claude-flow/dashboard/api
 */

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

/**
 * Status API - Provides system status, agents, tasks, and metrics
 */
export class StatusAPI {
  private startTime: number = Date.now();
  private requestCount: number = 0;
  private requestTimes: number[] = [];

  constructor(_dataProvider?: any) {}

  /**
   * GET /api/status - Get overall system status
   */
  async getStatus(): Promise<SystemStatus> {
    this.trackRequest();

    // Mock data for now - should integrate with actual swarm coordinator
    const uptime = Date.now() - this.startTime;
    const agents = await this.getAgents();
    const tasks = await this.getTasks();

    return {
      status: 'running',
      uptime,
      version: '3.0.0-alpha.1',
      topology: 'hierarchical',
      agentCount: agents.length,
      taskCount: tasks.length,
      timestamp: Date.now(),
    };
  }

  /**
   * GET /api/agents - Get list of agents
   */
  async getAgents(): Promise<AgentInfo[]> {
    this.trackRequest();

    // Mock data - should integrate with agent registry
    const mockAgents: AgentInfo[] = [
      {
        id: 'agent-1',
        type: 'coder',
        status: 'busy',
        currentTask: 'task-123',
        tasksCompleted: 45,
        tasksFailed: 2,
        successRate: 0.957,
        uptime: Date.now() - this.startTime,
        healthScore: 0.95,
      },
      {
        id: 'agent-2',
        type: 'reviewer',
        status: 'idle',
        tasksCompleted: 32,
        tasksFailed: 1,
        successRate: 0.969,
        uptime: Date.now() - this.startTime,
        healthScore: 0.98,
      },
      {
        id: 'agent-3',
        type: 'tester',
        status: 'busy',
        currentTask: 'task-124',
        tasksCompleted: 28,
        tasksFailed: 0,
        successRate: 1.0,
        uptime: Date.now() - this.startTime,
        healthScore: 1.0,
      },
    ];

    return mockAgents;
  }

  /**
   * GET /api/tasks - Get list of tasks
   */
  async getTasks(): Promise<TaskInfo[]> {
    this.trackRequest();

    // Mock data - should integrate with task orchestrator
    const now = Date.now();
    const mockTasks: TaskInfo[] = [
      {
        id: 'task-123',
        title: 'Implement user authentication',
        type: 'code',
        status: 'running',
        priority: 'high',
        assignedAgent: 'agent-1',
        progress: 65,
        createdAt: now - 3600000,
        startedAt: now - 1800000,
      },
      {
        id: 'task-124',
        title: 'Write integration tests',
        type: 'test',
        status: 'running',
        priority: 'normal',
        assignedAgent: 'agent-3',
        progress: 40,
        createdAt: now - 2400000,
        startedAt: now - 1200000,
      },
      {
        id: 'task-125',
        title: 'Code review PR #42',
        type: 'review',
        status: 'completed',
        priority: 'high',
        assignedAgent: 'agent-2',
        progress: 100,
        createdAt: now - 5400000,
        startedAt: now - 4800000,
        completedAt: now - 3600000,
        duration: 1200000,
      },
      {
        id: 'task-126',
        title: 'Optimize database queries',
        type: 'optimize',
        status: 'pending',
        priority: 'normal',
        progress: 0,
        createdAt: now - 1800000,
      },
      {
        id: 'task-127',
        title: 'Fix memory leak',
        type: 'debug',
        status: 'failed',
        priority: 'critical',
        assignedAgent: 'agent-1',
        progress: 85,
        createdAt: now - 7200000,
        startedAt: now - 6600000,
        completedAt: now - 5400000,
        duration: 1200000,
        error: 'Timeout after 20 minutes',
      },
    ];

    return mockTasks;
  }

  /**
   * GET /api/metrics - Get system metrics
   */
  async getMetrics(): Promise<SystemMetrics> {
    this.trackRequest();

    const agents = await this.getAgents();
    const tasks = await this.getTasks();

    const activeAgents = agents.filter((a) => a.status === 'busy').length;
    const idleAgents = agents.filter((a) => a.status === 'idle').length;
    const blockedAgents = agents.filter((a) => a.status === 'error').length;

    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const failedTasks = tasks.filter((t) => t.status === 'failed').length;
    const pendingTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'queued').length;
    const runningTasks = tasks.filter((t) => t.status === 'running').length;

    const completedWithDuration = tasks.filter((t) => t.duration);
    const avgDuration =
      completedWithDuration.length > 0
        ? completedWithDuration.reduce((sum, t) => sum + (t.duration || 0), 0) / completedWithDuration.length
        : 0;

    const uptime = Date.now() - this.startTime;
    const throughput = (completedTasks / (uptime / 1000)) * 60; // tasks per minute

    // Calculate average response time from tracked requests
    const avgResponseTime =
      this.requestTimes.length > 0
        ? this.requestTimes.reduce((sum, t) => sum + t, 0) / this.requestTimes.length
        : 0;

    const memoryUsage = process.memoryUsage();

    return {
      agents: {
        total: agents.length,
        active: activeAgents,
        idle: idleAgents,
        blocked: blockedAgents,
        utilization: agents.length > 0 ? activeAgents / agents.length : 0,
      },
      tasks: {
        total: tasks.length,
        completed: completedTasks,
        failed: failedTasks,
        pending: pendingTasks,
        running: runningTasks,
        averageDuration: avgDuration,
        throughput,
      },
      performance: {
        cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
        memoryUsage: memoryUsage.heapUsed,
        memoryLimit: memoryUsage.heapTotal,
        requestsPerSecond: this.requestCount / (uptime / 1000),
        averageResponseTime: avgResponseTime,
      },
      errors: {
        count: failedTasks,
        rate: uptime > 0 ? (failedTasks / (uptime / 1000)) * 60 : 0, // errors per minute
        lastError:
          failedTasks > 0
            ? {
                message: 'Task execution timeout',
                timestamp: Date.now() - 300000,
              }
            : undefined,
      },
    };
  }

  /**
   * Track API request for metrics
   */
  private trackRequest(): void {
    this.requestCount++;

    // Simulate processing time
    const responseTime = Math.random() * 50 + 10; // 10-60ms
    this.requestTimes.push(responseTime);

    // Keep only last 100 requests
    if (this.requestTimes.length > 100) {
      this.requestTimes.shift();
    }
  }
}

/**
 * Create status API instance
 */
export function createStatusAPI(dataProvider?: any): StatusAPI {
  return new StatusAPI(dataProvider);
}
