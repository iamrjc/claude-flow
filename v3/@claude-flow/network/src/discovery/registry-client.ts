/**
 * Registry Client for WP03
 *
 * Optional central registry-based discovery.
 * Useful for cloud/hybrid deployments where mDNS doesn't work.
 *
 * @module @claude-flow/network/discovery/registry-client
 */

import { EventEmitter } from 'events';
import type {
  NetworkAgent,
  AgentAdvertisement,
  DiscoveryProvider,
  RegistryConfig,
} from './types.js';

export class RegistryClient extends EventEmitter implements DiscoveryProvider {
  private url: string;
  private apiKey?: string;
  private heartbeatInterval: number;
  private knownAgents: Map<string, NetworkAgent> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private registeredAgent: AgentAdvertisement | null = null;
  private isRunning = false;

  constructor(config: RegistryConfig) {
    super();
    this.url = config.url.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.heartbeatInterval = config.heartbeatInterval || 30000;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('discovery-started');

    // Initial poll
    await this.poll();

    // Start polling for agents
    this.pollTimer = setInterval(() => this.poll(), this.heartbeatInterval);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    // Deregister if we were advertising
    if (this.registeredAgent) {
      await this.deregister();
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.knownAgents.clear();
    this.isRunning = false;
    this.emit('discovery-stopped');
  }

  async discover(): Promise<NetworkAgent[]> {
    await this.poll();
    return Array.from(this.knownAgents.values());
  }

  async advertise(advertisement: AgentAdvertisement): Promise<void> {
    this.registeredAgent = advertisement;
    await this.register(advertisement);

    // Start heartbeat
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.heartbeatInterval
    );
  }

  async stopAdvertising(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.registeredAgent) {
      await this.deregister();
      this.registeredAgent = null;
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

  private async register(advertisement: AgentAdvertisement): Promise<void> {
    try {
      const response = await this.fetch('/agents/register', {
        method: 'POST',
        body: JSON.stringify(advertisement),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Registration failed: ${error}`);
      }
    } catch (error) {
      this.emit('discovery-error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async deregister(): Promise<void> {
    if (!this.registeredAgent) return;

    try {
      await this.fetch(`/agents/${this.registeredAgent.id}`, {
        method: 'DELETE',
      });
    } catch (error) {
      // Ignore deregistration errors on shutdown
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.registeredAgent) return;

    try {
      const response = await this.fetch(`/agents/${this.registeredAgent.id}/heartbeat`, {
        method: 'POST',
        body: JSON.stringify({
          status: this.registeredAgent.status || 'available',
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        // Re-register if heartbeat fails
        await this.register(this.registeredAgent);
      }
    } catch (error) {
      // Will retry on next interval
    }
  }

  private async poll(): Promise<void> {
    try {
      const response = await this.fetch('/agents');

      if (!response.ok) {
        throw new Error(`Poll failed: ${response.status}`);
      }

      const agents = (await response.json()) as NetworkAgent[];
      this.updateAgents(agents);
    } catch (error) {
      this.emit('discovery-error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private updateAgents(agents: NetworkAgent[]): void {
    const currentIds = new Set(agents.map((a) => a.id));

    // Check for new or updated agents
    for (const agent of agents) {
      const existing = this.knownAgents.get(agent.id);

      // Ensure discovery method is set
      agent.discoveryMethod = 'registry';
      agent.lastSeen = Date.now();

      if (!existing) {
        agent.discoveredAt = Date.now();
        this.knownAgents.set(agent.id, agent);
        this.emit('agent-discovered', agent);
      } else if (this.hasAgentChanged(existing, agent)) {
        this.knownAgents.set(agent.id, agent);
        this.emit('agent-updated', agent);
      }
    }

    // Check for lost agents
    for (const [id, agent] of this.knownAgents) {
      if (!currentIds.has(id)) {
        this.knownAgents.delete(id);
        this.emit('agent-lost', id);
      }
    }
  }

  private hasAgentChanged(existing: NetworkAgent, updated: NetworkAgent): boolean {
    return (
      existing.status !== updated.status ||
      existing.models.join(',') !== updated.models.join(',') ||
      existing.host !== updated.host ||
      existing.port !== updated.port
    );
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return fetch(`${this.url}${path}`, {
      ...options,
      headers,
    });
  }
}
