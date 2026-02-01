/**
 * Agent Discovery Service for WP03
 *
 * Main entry point for network agent discovery.
 * Supports multiple discovery methods:
 * - mDNS/Bonjour (zero-config LAN discovery)
 * - Static configuration (manual hosts)
 * - Registry (central server)
 * - Auto (tries mDNS first, falls back to static)
 *
 * @module @claude-flow/network/discovery/agent-discovery
 */

import { EventEmitter } from 'events';
import type {
  NetworkAgent,
  AgentAdvertisement,
  DiscoveryConfig,
  DiscoveryEvents,
  DiscoveryProvider,
} from './types.js';
import { DEFAULT_DISCOVERY_CONFIG } from './types.js';
import { MDNSDiscovery } from './mdns-discovery.js';
import { StaticDiscovery } from './static-discovery.js';
import { RegistryClient } from './registry-client.js';

export class AgentDiscovery extends EventEmitter {
  private config: DiscoveryConfig;
  private providers: DiscoveryProvider[] = [];
  private knownAgents: Map<string, NetworkAgent> = new Map();
  private continuousDiscoveryTimer: NodeJS.Timeout | null = null;
  private agentTimeoutTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: Partial<DiscoveryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
  }

  // ===== Lifecycle Methods =====

  async start(): Promise<void> {
    if (this.isRunning) return;

    await this.initializeProviders();

    // Start all providers
    for (const provider of this.providers) {
      try {
        await provider.start();
      } catch (error) {
        this.emit('discovery-error', error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Start agent timeout checker
    this.startAgentTimeoutChecker();

    this.isRunning = true;
    this.emit('discovery-started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.stopContinuousDiscovery();
    this.stopAgentTimeoutChecker();

    // Stop all providers
    for (const provider of this.providers) {
      try {
        await provider.stop();
      } catch (error) {
        // Ignore stop errors
      }
    }

    this.providers = [];
    this.knownAgents.clear();
    this.isRunning = false;
    this.emit('discovery-stopped');
  }

  // ===== Discovery Methods =====

  /**
   * Perform a single discovery scan
   */
  async discover(): Promise<NetworkAgent[]> {
    if (!this.isRunning) {
      await this.start();
    }

    const allAgents: NetworkAgent[] = [];

    for (const provider of this.providers) {
      try {
        const agents = await provider.discover();
        allAgents.push(...agents);
      } catch (error) {
        this.emit('discovery-error', error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Deduplicate and update known agents
    for (const agent of allAgents) {
      this.updateKnownAgent(agent);
    }

    return Array.from(this.knownAgents.values());
  }

  /**
   * Perform discovery once and return immediately
   */
  async discoverOnce(): Promise<NetworkAgent[]> {
    const wasRunning = this.isRunning;

    if (!wasRunning) {
      await this.start();
    }

    const agents = await this.discover();

    if (!wasRunning) {
      await this.stop();
    }

    return agents;
  }

  /**
   * Start continuous discovery at specified interval
   */
  startContinuousDiscovery(intervalMs?: number): void {
    this.stopContinuousDiscovery();

    const interval = intervalMs || this.config.discoveryInterval || 10000;

    this.continuousDiscoveryTimer = setInterval(async () => {
      try {
        await this.discover();
      } catch (error) {
        this.emit('discovery-error', error instanceof Error ? error : new Error(String(error)));
      }
    }, interval);
  }

  /**
   * Stop continuous discovery
   */
  stopContinuousDiscovery(): void {
    if (this.continuousDiscoveryTimer) {
      clearInterval(this.continuousDiscoveryTimer);
      this.continuousDiscoveryTimer = null;
    }
  }

  // ===== Advertisement Methods =====

  /**
   * Advertise this agent on the network
   */
  async advertise(advertisement: AgentAdvertisement): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.advertise(advertisement);
      } catch (error) {
        this.emit('discovery-error', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Stop advertising this agent
   */
  async stopAdvertising(): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.stopAdvertising();
      } catch (error) {
        // Ignore stop errors
      }
    }
  }

  // ===== Agent Access Methods =====

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

  /**
   * Get agents filtered by status
   */
  getAgentsByStatus(status: NetworkAgent['status']): NetworkAgent[] {
    return Array.from(this.knownAgents.values()).filter((a) => a.status === status);
  }

  /**
   * Get agents that have a specific model
   */
  getAgentsByModel(model: string): NetworkAgent[] {
    return Array.from(this.knownAgents.values()).filter((agent) =>
      agent.models.some((m) => m.toLowerCase().includes(model.toLowerCase()))
    );
  }

  /**
   * Get available agents (status: available)
   */
  getAvailableAgents(): NetworkAgent[] {
    return this.getAgentsByStatus('available');
  }

  // ===== Event Type Declarations =====

  override on<K extends keyof DiscoveryEvents>(
    event: K,
    listener: DiscoveryEvents[K]
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof DiscoveryEvents>(
    event: K,
    ...args: Parameters<DiscoveryEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  // ===== Private Methods =====

  private async initializeProviders(): Promise<void> {
    this.providers = [];

    switch (this.config.method) {
      case 'mdns':
        this.addMDNSProvider();
        break;

      case 'static':
        this.addStaticProvider();
        break;

      case 'registry':
        this.addRegistryProvider();
        break;

      case 'auto':
      default:
        // Try mDNS first, fall back to static
        this.addMDNSProvider();
        if (this.config.staticHosts?.length) {
          this.addStaticProvider();
        }
        break;
    }

    // Wire up events from all providers
    for (const provider of this.providers) {
      this.wireProviderEvents(provider);
    }
  }

  private addMDNSProvider(): void {
    try {
      const mdns = new MDNSDiscovery(this.config.mdns);
      this.providers.push(mdns);
    } catch (error) {
      this.emit('discovery-error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private addStaticProvider(): void {
    if (!this.config.staticHosts?.length) return;

    const staticDiscovery = new StaticDiscovery({
      hosts: this.config.staticHosts,
    });
    this.providers.push(staticDiscovery);
  }

  private addRegistryProvider(): void {
    if (!this.config.registry?.url) return;

    const registry = new RegistryClient(this.config.registry);
    this.providers.push(registry);
  }

  private wireProviderEvents(provider: DiscoveryProvider): void {
    const emitter = provider as EventEmitter;

    emitter.on('agent-discovered', (agent: NetworkAgent) => {
      this.updateKnownAgent(agent);
    });

    emitter.on('agent-lost', (agentId: string) => {
      if (this.knownAgents.has(agentId)) {
        this.knownAgents.delete(agentId);
        this.emit('agent-lost', agentId);
      }
    });

    emitter.on('agent-updated', (agent: NetworkAgent) => {
      this.updateKnownAgent(agent);
    });
  }

  private updateKnownAgent(agent: NetworkAgent): void {
    const existing = this.knownAgents.get(agent.id);

    if (!existing) {
      this.knownAgents.set(agent.id, agent);
      this.emit('agent-discovered', agent);
    } else {
      // Merge with existing, preferring newer data
      const updated: NetworkAgent = {
        ...existing,
        ...agent,
        discoveredAt: existing.discoveredAt, // Keep original discovery time
        lastSeen: Date.now(),
      };
      this.knownAgents.set(agent.id, updated);

      // Only emit update if something meaningful changed
      if (
        existing.status !== updated.status ||
        existing.models.join(',') !== updated.models.join(',')
      ) {
        this.emit('agent-updated', updated);
      }
    }
  }

  private startAgentTimeoutChecker(): void {
    const timeout = this.config.agentTimeout || 30000;

    this.agentTimeoutTimer = setInterval(() => {
      const now = Date.now();

      for (const [id, agent] of this.knownAgents) {
        if (now - agent.lastSeen > timeout) {
          // Mark as offline first
          if (agent.status !== 'offline') {
            agent.status = 'offline';
            this.emit('agent-updated', agent);
          }

          // Remove if offline for too long (3x timeout)
          if (now - agent.lastSeen > timeout * 3) {
            this.knownAgents.delete(id);
            this.emit('agent-lost', id);
          }
        }
      }
    }, timeout / 2);
  }

  private stopAgentTimeoutChecker(): void {
    if (this.agentTimeoutTimer) {
      clearInterval(this.agentTimeoutTimer);
      this.agentTimeoutTimer = null;
    }
  }
}
