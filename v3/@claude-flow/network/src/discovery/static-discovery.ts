/**
 * Static Discovery for WP03
 *
 * Fallback discovery using manually configured hosts.
 * Useful when mDNS is unavailable or for remote agents outside LAN.
 *
 * @module @claude-flow/network/discovery/static-discovery
 */

import { EventEmitter } from 'events';
import type {
  NetworkAgent,
  AgentAdvertisement,
  DiscoveryProvider,
  StaticHostConfig,
  AgentStatus,
} from './types.js';
import { DEFAULT_PORT } from './types.js';

export interface StaticDiscoveryConfig {
  /** List of static hosts to discover */
  hosts: StaticHostConfig[];
  /** Health check interval in ms (default: 30000) */
  healthCheckInterval?: number;
  /** Connection timeout in ms (default: 5000) */
  connectionTimeout?: number;
}

export class StaticDiscovery extends EventEmitter implements DiscoveryProvider {
  private hosts: StaticHostConfig[];
  private healthCheckInterval: number;
  private connectionTimeout: number;
  private knownAgents: Map<string, NetworkAgent> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: StaticDiscoveryConfig) {
    super();
    this.hosts = config.hosts || [];
    this.healthCheckInterval = config.healthCheckInterval || 30000;
    this.connectionTimeout = config.connectionTimeout || 5000;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('discovery-started');

    // Initial discovery
    await this.discover();

    // Start periodic health checks
    this.healthCheckTimer = setInterval(
      () => this.performHealthChecks(),
      this.healthCheckInterval
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.knownAgents.clear();
    this.isRunning = false;
    this.emit('discovery-stopped');
  }

  async discover(): Promise<NetworkAgent[]> {
    const discoveryPromises = this.hosts.map((host) => this.probeHost(host));
    await Promise.allSettled(discoveryPromises);
    return Array.from(this.knownAgents.values());
  }

  async advertise(advertisement: AgentAdvertisement): Promise<void> {
    // Static discovery doesn't support advertising
    // This is a no-op but could be extended to register with a coordinator
    console.warn('StaticDiscovery does not support advertising. Use mDNS or registry.');
  }

  async stopAdvertising(): Promise<void> {
    // No-op for static discovery
  }

  /**
   * Add a host at runtime
   */
  addHost(host: StaticHostConfig): void {
    if (!this.hosts.find((h) => h.host === host.host && h.port === host.port)) {
      this.hosts.push(host);
      // Probe the new host immediately
      this.probeHost(host);
    }
  }

  /**
   * Remove a host at runtime
   */
  removeHost(host: string, port?: number): void {
    this.hosts = this.hosts.filter(
      (h) => !(h.host === host && (port === undefined || h.port === port))
    );
    // Remove from known agents
    const agentId = this.generateAgentId(host, port || DEFAULT_PORT);
    if (this.knownAgents.has(agentId)) {
      this.knownAgents.delete(agentId);
      this.emit('agent-lost', agentId);
    }
  }

  /**
   * Get a known agent by ID
   */
  getAgent(id: string): NetworkAgent | undefined {
    return this.knownAgents.get(id);
  }

  /**
   * Get all known agents
   */
  getAllAgents(): NetworkAgent[] {
    return Array.from(this.knownAgents.values());
  }

  private async probeHost(hostConfig: StaticHostConfig): Promise<void> {
    const { host, port = DEFAULT_PORT, models, name } = hostConfig;
    const agentId = this.generateAgentId(host, port);

    try {
      // Try to connect to Ollama API to verify host is running
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.connectionTimeout);

      const response = await fetch(`http://${host}:${port}/api/tags`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as { models?: Array<{ name: string }> };
        const discoveredModels = data.models?.map((m) => m.name) || models || [];

        const agent: NetworkAgent = {
          id: agentId,
          hostname: name || host,
          host,
          port,
          models: discoveredModels,
          hardware: {},
          status: 'available',
          discoveredAt: this.knownAgents.get(agentId)?.discoveredAt || Date.now(),
          lastSeen: Date.now(),
          discoveryMethod: 'static',
        };

        this.updateAgent(agent);
      } else {
        this.markAgentDegraded(agentId);
      }
    } catch (error) {
      this.markAgentOffline(agentId);
    }
  }

  private async performHealthChecks(): Promise<void> {
    const checkPromises = this.hosts.map((host) => this.probeHost(host));
    await Promise.allSettled(checkPromises);
  }

  private generateAgentId(host: string, port: number): string {
    return `static-${host.replace(/\./g, '-')}-${port}`;
  }

  private updateAgent(agent: NetworkAgent): void {
    const existing = this.knownAgents.get(agent.id);

    if (!existing) {
      this.knownAgents.set(agent.id, agent);
      this.emit('agent-discovered', agent);
    } else if (existing.status !== agent.status || this.modelsChanged(existing.models, agent.models)) {
      this.knownAgents.set(agent.id, agent);
      this.emit('agent-updated', agent);
    } else {
      // Just update lastSeen
      existing.lastSeen = Date.now();
    }
  }

  private markAgentDegraded(agentId: string): void {
    const existing = this.knownAgents.get(agentId);
    if (existing && existing.status !== 'degraded') {
      existing.status = 'degraded';
      existing.lastSeen = Date.now();
      this.emit('agent-updated', existing);
    }
  }

  private markAgentOffline(agentId: string): void {
    const existing = this.knownAgents.get(agentId);
    if (existing) {
      if (existing.status !== 'offline') {
        existing.status = 'offline';
        this.emit('agent-updated', existing);
      }
      // Remove if offline for too long
      if (Date.now() - existing.lastSeen > this.healthCheckInterval * 3) {
        this.knownAgents.delete(agentId);
        this.emit('agent-lost', agentId);
      }
    }
  }

  private modelsChanged(oldModels: string[], newModels: string[]): boolean {
    if (oldModels.length !== newModels.length) return true;
    return !oldModels.every((m) => newModels.includes(m));
  }
}
