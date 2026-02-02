/**
 * Agent Rate Limit Policies
 *
 * Per-agent limits for task execution:
 * - Task rate limits (tasks per minute)
 * - Memory operation limits
 * - Message rate limits
 * - Resource consumption tracking
 *
 * @module @claude-flow/throttle/policies/agent-limits
 */

import { SlidingWindow } from '../limiters/sliding-window.js';
import { TokenBucket } from '../limiters/token-bucket.js';

export interface AgentLimitConfig {
  /**
   * Maximum tasks per minute
   */
  tasksPerMinute?: number;

  /**
   * Maximum memory operations per minute
   */
  memoryOpsPerMinute?: number;

  /**
   * Maximum messages per minute
   */
  messagesPerMinute?: number;

  /**
   * Maximum concurrent tasks
   */
  maxConcurrentTasks?: number;

  /**
   * Memory quota in bytes
   */
  memoryQuotaBytes?: number;

  /**
   * CPU time quota per minute (ms)
   */
  cpuQuotaMs?: number;

  /**
   * Enable burst capacity
   * @default true
   */
  allowBurst?: boolean;
}

export const DEFAULT_AGENT_LIMITS: AgentLimitConfig = {
  tasksPerMinute: 30,
  memoryOpsPerMinute: 100,
  messagesPerMinute: 60,
  maxConcurrentTasks: 5,
  memoryQuotaBytes: 100 * 1024 * 1024, // 100 MB
  cpuQuotaMs: 60_000, // 1 minute of CPU per minute
  allowBurst: true,
};

export interface AgentMetrics {
  agentId: string;
  tasksCompleted: number;
  memoryOpsPerformed: number;
  messagesSent: number;
  memoryUsedBytes: number;
  cpuUsedMs: number;
  timestamp: number;
}

export class AgentRateLimiter {
  private readonly agentId: string;
  private readonly config: AgentLimitConfig;
  private readonly taskLimiter?: SlidingWindow;
  private readonly memoryOpsLimiter?: SlidingWindow;
  private readonly messageLimiter?: SlidingWindow;
  private readonly cpuLimiter?: TokenBucket;
  private activeTasks: number = 0;
  private memoryUsed: number = 0;
  private metrics: AgentMetrics;

  constructor(agentId: string, config?: Partial<AgentLimitConfig>) {
    this.agentId = agentId;
    this.config = { ...DEFAULT_AGENT_LIMITS, ...config };

    // Initialize task limiter
    if (this.config.tasksPerMinute) {
      const capacity = this.config.allowBurst
        ? Math.ceil(this.config.tasksPerMinute * 1.5)
        : this.config.tasksPerMinute;

      this.taskLimiter = new SlidingWindow({
        maxRequests: capacity,
        windowMs: 60_000,
        buckets: 12,
      });
    }

    // Initialize memory ops limiter
    if (this.config.memoryOpsPerMinute) {
      const capacity = this.config.allowBurst
        ? Math.ceil(this.config.memoryOpsPerMinute * 1.5)
        : this.config.memoryOpsPerMinute;

      this.memoryOpsLimiter = new SlidingWindow({
        maxRequests: capacity,
        windowMs: 60_000,
        buckets: 12,
      });
    }

    // Initialize message limiter
    if (this.config.messagesPerMinute) {
      const capacity = this.config.allowBurst
        ? Math.ceil(this.config.messagesPerMinute * 1.5)
        : this.config.messagesPerMinute;

      this.messageLimiter = new SlidingWindow({
        maxRequests: capacity,
        windowMs: 60_000,
        buckets: 12,
      });
    }

    // Initialize CPU quota limiter
    if (this.config.cpuQuotaMs) {
      this.cpuLimiter = new TokenBucket({
        capacity: this.config.cpuQuotaMs,
        refillRate: this.config.cpuQuotaMs / 60, // ms per second
        initialTokens: this.config.cpuQuotaMs,
      });
    }

    this.metrics = {
      agentId,
      tasksCompleted: 0,
      memoryOpsPerformed: 0,
      messagesSent: 0,
      memoryUsedBytes: 0,
      cpuUsedMs: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if agent can start a new task
   */
  canStartTask(): {
    allowed: boolean;
    reason?: string;
    waitTimeMs?: number;
  } {
    // Check concurrent task limit
    if (this.config.maxConcurrentTasks &&
        this.activeTasks >= this.config.maxConcurrentTasks) {
      return {
        allowed: false,
        reason: `Concurrent task limit reached (${this.config.maxConcurrentTasks})`,
      };
    }

    // Check task rate limit
    if (this.taskLimiter && !this.taskLimiter.tryAcquire()) {
      const waitTime = this.taskLimiter.getWaitTime();
      return {
        allowed: false,
        reason: `Task rate limit reached (${this.config.tasksPerMinute}/min)`,
        waitTimeMs: waitTime,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if agent can perform memory operation
   */
  canPerformMemoryOp(bytesNeeded: number = 0): {
    allowed: boolean;
    reason?: string;
    waitTimeMs?: number;
  } {
    // Check memory quota
    if (this.config.memoryQuotaBytes &&
        this.memoryUsed + bytesNeeded > this.config.memoryQuotaBytes) {
      return {
        allowed: false,
        reason: `Memory quota exceeded (${this.config.memoryQuotaBytes} bytes)`,
      };
    }

    // Check memory ops rate limit
    if (this.memoryOpsLimiter && !this.memoryOpsLimiter.tryAcquire()) {
      const waitTime = this.memoryOpsLimiter.getWaitTime();
      return {
        allowed: false,
        reason: `Memory ops rate limit reached (${this.config.memoryOpsPerMinute}/min)`,
        waitTimeMs: waitTime,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if agent can send a message
   */
  canSendMessage(): {
    allowed: boolean;
    reason?: string;
    waitTimeMs?: number;
  } {
    if (this.messageLimiter && !this.messageLimiter.tryAcquire()) {
      const waitTime = this.messageLimiter.getWaitTime();
      return {
        allowed: false,
        reason: `Message rate limit reached (${this.config.messagesPerMinute}/min)`,
        waitTimeMs: waitTime,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if agent can use CPU time
   */
  canUseCPU(cpuMs: number): {
    allowed: boolean;
    reason?: string;
    waitTimeMs?: number;
  } {
    if (this.cpuLimiter && !this.cpuLimiter.consume(cpuMs)) {
      const waitTime = this.cpuLimiter.getWaitTime(cpuMs);
      return {
        allowed: false,
        reason: `CPU quota exceeded (${this.config.cpuQuotaMs}ms/min)`,
        waitTimeMs: waitTime,
      };
    }

    return { allowed: true };
  }

  /**
   * Start a task (acquire slot)
   */
  startTask(): void {
    this.activeTasks++;
  }

  /**
   * Complete a task (release slot)
   */
  completeTask(): void {
    this.activeTasks = Math.max(0, this.activeTasks - 1);
    this.metrics.tasksCompleted++;
  }

  /**
   * Record memory allocation
   */
  allocateMemory(bytes: number): void {
    this.memoryUsed += bytes;
    this.metrics.memoryUsedBytes = this.memoryUsed;
  }

  /**
   * Record memory deallocation
   */
  deallocateMemory(bytes: number): void {
    this.memoryUsed = Math.max(0, this.memoryUsed - bytes);
    this.metrics.memoryUsedBytes = this.memoryUsed;
  }

  /**
   * Record memory operation
   */
  recordMemoryOp(): void {
    this.metrics.memoryOpsPerformed++;
  }

  /**
   * Record message sent
   */
  recordMessage(): void {
    this.metrics.messagesSent++;
  }

  /**
   * Record CPU time used
   */
  recordCPUTime(ms: number): void {
    this.metrics.cpuUsedMs += ms;
  }

  /**
   * Get current metrics
   */
  getMetrics(): AgentMetrics {
    return {
      ...this.metrics,
      timestamp: Date.now(),
    };
  }

  /**
   * Get current state
   */
  getState() {
    return {
      agentId: this.agentId,
      limits: this.config,
      current: {
        activeTasks: this.activeTasks,
        memoryUsed: this.memoryUsed,
        tasksPerMinute: this.taskLimiter?.getState().currentCount ?? 0,
        memoryOpsPerMinute: this.memoryOpsLimiter?.getState().currentCount ?? 0,
        messagesPerMinute: this.messageLimiter?.getState().currentCount ?? 0,
        cpuAvailable: this.cpuLimiter?.getState().tokens ?? 0,
      },
      utilization: {
        tasks: this.config.maxConcurrentTasks
          ? this.activeTasks / this.config.maxConcurrentTasks
          : 0,
        memory: this.config.memoryQuotaBytes
          ? this.memoryUsed / this.config.memoryQuotaBytes
          : 0,
        taskRate: this.taskLimiter?.getState().utilization ?? 0,
        memoryOpsRate: this.memoryOpsLimiter?.getState().utilization ?? 0,
        messageRate: this.messageLimiter?.getState().utilization ?? 0,
        cpu: this.cpuLimiter?.getState().utilization ?? 0,
      },
      metrics: this.getMetrics(),
    };
  }

  /**
   * Reset limiter
   */
  reset(): void {
    this.taskLimiter?.reset();
    this.memoryOpsLimiter?.reset();
    this.messageLimiter?.reset();
    this.cpuLimiter?.reset();
    this.activeTasks = 0;
    this.memoryUsed = 0;
    this.metrics = {
      agentId: this.agentId,
      tasksCompleted: 0,
      memoryOpsPerformed: 0,
      messagesSent: 0,
      memoryUsedBytes: 0,
      cpuUsedMs: 0,
      timestamp: Date.now(),
    };
  }
}
