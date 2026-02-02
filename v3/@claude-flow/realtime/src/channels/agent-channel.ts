/**
 * Agent Channel
 * Agent status changes, health updates, metrics streaming
 */

import { EventEmitter } from 'events';
import type { WSRouter } from '../server/ws-router.js';
import type { WSClient } from '../client/ws-client.js';

export type AgentStatus = 'idle' | 'busy' | 'error' | 'offline';

export interface AgentStatusEvent {
  agentId: string;
  status: AgentStatus;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AgentHealthEvent {
  agentId: string;
  healthy: boolean;
  metrics: {
    cpu?: number;
    memory?: number;
    uptime?: number;
    tasksCompleted?: number;
    errorCount?: number;
  };
  timestamp: number;
}

export interface AgentMetricsEvent {
  agentId: string;
  metrics: {
    responseTime?: number;
    throughput?: number;
    errorRate?: number;
    queueSize?: number;
    activeConnections?: number;
  };
  timestamp: number;
}

export interface AgentLogEvent {
  agentId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Server-side agent channel
 */
export class AgentChannelServer extends EventEmitter {
  private readonly topicPrefix = 'agent';

  constructor(private router: WSRouter) {
    super();
    this.setupRoutes();
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Status updates
    this.router.route({
      topic: `${this.topicPrefix}.status`,
      handler: async (data, clientId) => {
        this.emit('status-update', data);
      },
    });

    // Health updates
    this.router.route({
      topic: `${this.topicPrefix}.health`,
      handler: async (data, clientId) => {
        this.emit('health-update', data);
      },
    });

    // Metrics
    this.router.route({
      topic: `${this.topicPrefix}.metrics`,
      handler: async (data, clientId) => {
        this.emit('metrics-update', data);
      },
    });

    // Logs
    this.router.route({
      topic: `${this.topicPrefix}.logs`,
      handler: async (data, clientId) => {
        this.emit('log-entry', data);
      },
    });
  }

  /**
   * Publish agent status change
   */
  async publishStatusChange(event: AgentStatusEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.agentId}.status`, event);
    await this.router.publish(`${this.topicPrefix}.status`, event); // Broadcast
  }

  /**
   * Publish agent health update
   */
  async publishHealthUpdate(event: AgentHealthEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.agentId}.health`, event);
    await this.router.publish(`${this.topicPrefix}.health`, event); // Broadcast
  }

  /**
   * Publish agent metrics
   */
  async publishMetrics(event: AgentMetricsEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.agentId}.metrics`, event);
    await this.router.publish(`${this.topicPrefix}.metrics`, event); // Broadcast
  }

  /**
   * Publish agent log
   */
  async publishLog(event: AgentLogEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.agentId}.logs`, event);
    await this.router.publish(`${this.topicPrefix}.logs`, event); // Broadcast
  }

  /**
   * Publish agent started event
   */
  async publishAgentStarted(agentId: string, metadata?: Record<string, unknown>): Promise<void> {
    const event: AgentStatusEvent = {
      agentId,
      status: 'idle',
      timestamp: Date.now(),
      metadata: { ...metadata, event: 'started' },
    };
    await this.publishStatusChange(event);
  }

  /**
   * Publish agent stopped event
   */
  async publishAgentStopped(agentId: string, reason?: string): Promise<void> {
    const event: AgentStatusEvent = {
      agentId,
      status: 'offline',
      timestamp: Date.now(),
      metadata: { event: 'stopped', reason },
    };
    await this.publishStatusChange(event);
  }

  /**
   * Publish agent error event
   */
  async publishAgentError(
    agentId: string,
    error: Error,
    context?: Record<string, unknown>
  ): Promise<void> {
    const event: AgentStatusEvent = {
      agentId,
      status: 'error',
      timestamp: Date.now(),
      metadata: {
        event: 'error',
        error: error.message,
        stack: error.stack,
        ...context,
      },
    };
    await this.publishStatusChange(event);
  }
}

/**
 * Client-side agent channel
 */
export class AgentChannelClient extends EventEmitter {
  private readonly topicPrefix = 'agent';
  private subscribedAgents = new Set<string>();

  constructor(private client: WSClient) {
    super();
    this.setupListeners();
  }

  /**
   * Setup event listeners
   */
  private setupListeners(): void {
    // Status events
    this.client.on('event:agent.status', (event) => {
      const data = event.data as AgentStatusEvent;
      this.emit('status-change', data);
      this.emit(`status-change:${data.agentId}`, data);
    });

    // Health events
    this.client.on('event:agent.health', (event) => {
      const data = event.data as AgentHealthEvent;
      this.emit('health-update', data);
      this.emit(`health-update:${data.agentId}`, data);
    });

    // Metrics events
    this.client.on('event:agent.metrics', (event) => {
      const data = event.data as AgentMetricsEvent;
      this.emit('metrics-update', data);
      this.emit(`metrics-update:${data.agentId}`, data);
    });

    // Log events
    this.client.on('event:agent.logs', (event) => {
      const data = event.data as AgentLogEvent;
      this.emit('log-entry', data);
      this.emit(`log-entry:${data.agentId}`, data);
    });

    // Agent-specific events
    this.client.on('event', (event) => {
      const topic = event.topic;
      if (topic.startsWith(`${this.topicPrefix}.`)) {
        const parts = topic.split('.');
        if (parts.length === 3) {
          const agentId = parts[1];
          const eventType = parts[2];
          this.emit(`${eventType}:${agentId}`, event.data);
        }
      }
    });
  }

  /**
   * Subscribe to all agent events
   */
  async subscribeAll(): Promise<void> {
    await this.client.subscribe([
      `${this.topicPrefix}.status`,
      `${this.topicPrefix}.health`,
      `${this.topicPrefix}.metrics`,
      `${this.topicPrefix}.logs`,
    ]);
  }

  /**
   * Subscribe to specific agent
   */
  async subscribeToAgent(agentId: string): Promise<void> {
    if (this.subscribedAgents.has(agentId)) {
      return;
    }

    await this.client.subscribe([
      `${this.topicPrefix}.${agentId}.status`,
      `${this.topicPrefix}.${agentId}.health`,
      `${this.topicPrefix}.${agentId}.metrics`,
      `${this.topicPrefix}.${agentId}.logs`,
    ]);

    this.subscribedAgents.add(agentId);
  }

  /**
   * Unsubscribe from specific agent
   */
  async unsubscribeFromAgent(agentId: string): Promise<void> {
    if (!this.subscribedAgents.has(agentId)) {
      return;
    }

    await this.client.unsubscribe([
      `${this.topicPrefix}.${agentId}.status`,
      `${this.topicPrefix}.${agentId}.health`,
      `${this.topicPrefix}.${agentId}.metrics`,
      `${this.topicPrefix}.${agentId}.logs`,
    ]);

    this.subscribedAgents.delete(agentId);
  }

  /**
   * Subscribe to pattern
   */
  async subscribePattern(pattern: string): Promise<void> {
    await this.client.subscribe([`${this.topicPrefix}.${pattern}`]);
  }

  /**
   * Report agent status (client publishing)
   */
  async reportStatus(event: AgentStatusEvent): Promise<void> {
    await this.client.publish(`${this.topicPrefix}.${event.agentId}.status`, event);
  }

  /**
   * Report agent health
   */
  async reportHealth(event: AgentHealthEvent): Promise<void> {
    await this.client.publish(`${this.topicPrefix}.${event.agentId}.health`, event);
  }

  /**
   * Report agent metrics
   */
  async reportMetrics(event: AgentMetricsEvent): Promise<void> {
    await this.client.publish(`${this.topicPrefix}.${event.agentId}.metrics`, event);
  }

  /**
   * Send agent log
   */
  async sendLog(event: AgentLogEvent): Promise<void> {
    await this.client.publish(`${this.topicPrefix}.${event.agentId}.logs`, event);
  }

  /**
   * Get subscribed agents
   */
  getSubscribedAgents(): string[] {
    return Array.from(this.subscribedAgents);
  }
}
