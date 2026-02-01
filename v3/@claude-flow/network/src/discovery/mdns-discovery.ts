/**
 * mDNS/Bonjour Discovery for WP03
 *
 * Zero-configuration network discovery using multicast DNS.
 * Advertises and discovers Claude Flow agents on the local network.
 *
 * Service: _claude-flow-agent._tcp.local
 *
 * @module @claude-flow/network/discovery/mdns-discovery
 */

import { EventEmitter } from 'events';
import type {
  NetworkAgent,
  AgentAdvertisement,
  DiscoveryProvider,
  MDNSConfig,
  MDNSTxtRecord,
  AgentHardware,
  AgentStatus,
} from './types.js';
import {
  DEFAULT_SERVICE_NAME,
  DEFAULT_DOMAIN,
  DEFAULT_PORT,
} from './types.js';

// Type definitions for multicast-dns
interface MDNSQuestion {
  name: string;
  type: string;
}

interface MDNSAnswer {
  name: string;
  type: string;
  ttl?: number;
  data?: string | Buffer | string[] | { target: string; port: number };
}

interface MDNSResponse {
  answers: MDNSAnswer[];
  additionals?: MDNSAnswer[];
}

interface MDNS {
  on(event: 'response', listener: (response: MDNSResponse, rinfo: unknown) => void): this;
  on(event: 'query', listener: (query: { questions: MDNSQuestion[] }) => void): this;
  query(query: { questions: MDNSQuestion[] }): void;
  respond(response: { answers: MDNSAnswer[]; additionals?: MDNSAnswer[] }): void;
  destroy(): void;
}

export class MDNSDiscovery extends EventEmitter implements DiscoveryProvider {
  private mdns: MDNS | null = null;
  private serviceName: string;
  private domain: string;
  private timeout: number;
  private knownAgents: Map<string, NetworkAgent> = new Map();
  private advertisement: AgentAdvertisement | null = null;
  private isRunning = false;

  constructor(config: MDNSConfig = {}) {
    super();
    this.serviceName = config.serviceName || DEFAULT_SERVICE_NAME;
    this.domain = config.domain || DEFAULT_DOMAIN;
    this.timeout = config.timeout || 5000;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      // Dynamic import to handle environments without multicast-dns
      const mDNS = await import('multicast-dns');
      this.mdns = mDNS.default() as MDNS;

      this.mdns.on('response', (response) => this.handleResponse(response));
      this.mdns.on('query', (query) => this.handleQuery(query));

      this.isRunning = true;
      this.emit('discovery-started');

      // Initial discovery query
      this.query();
    } catch (error) {
      this.emit('discovery-error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (this.mdns) {
      this.mdns.destroy();
      this.mdns = null;
    }

    this.knownAgents.clear();
    this.isRunning = false;
    this.emit('discovery-stopped');
  }

  async discover(): Promise<NetworkAgent[]> {
    if (!this.mdns) {
      throw new Error('mDNS not started. Call start() first.');
    }

    return new Promise((resolve) => {
      this.query();

      // Wait for responses
      setTimeout(() => {
        resolve(Array.from(this.knownAgents.values()));
      }, this.timeout);
    });
  }

  async advertise(advertisement: AgentAdvertisement): Promise<void> {
    this.advertisement = advertisement;
    this.broadcastAdvertisement();
  }

  async stopAdvertising(): Promise<void> {
    this.advertisement = null;
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

  /**
   * Get agents that have a specific model
   */
  getAgentsByModel(model: string): NetworkAgent[] {
    return Array.from(this.knownAgents.values()).filter((agent) =>
      agent.models.some((m) => m.includes(model))
    );
  }

  private query(): void {
    if (!this.mdns) return;

    this.mdns.query({
      questions: [
        {
          name: `${this.serviceName}.${this.domain}`,
          type: 'PTR',
        },
      ],
    });
  }

  private handleResponse(response: MDNSResponse): void {
    const answers = [...response.answers, ...(response.additionals || [])];

    // Find PTR records pointing to our service
    const ptrRecords = answers.filter(
      (ans) => ans.type === 'PTR' && ans.name.includes(this.serviceName)
    );

    for (const ptr of ptrRecords) {
      const instanceName = ptr.data as string;
      if (!instanceName) continue;

      // Find corresponding SRV and TXT records
      const srv = answers.find(
        (ans) => ans.type === 'SRV' && ans.name === instanceName
      );
      const txt = answers.find(
        (ans) => ans.type === 'TXT' && ans.name === instanceName
      );

      if (srv && srv.data && typeof srv.data === 'object' && 'target' in srv.data) {
        const srvData = srv.data as { target: string; port: number };
        const txtData = this.parseTxtRecord(txt?.data);
        const agentId = instanceName.split('.')[0];

        const agent = this.createAgentFromRecords(
          agentId,
          srvData.target,
          srvData.port,
          txtData
        );

        this.updateAgent(agent);
      }
    }
  }

  private handleQuery(query: { questions: MDNSQuestion[] }): void {
    if (!this.advertisement || !this.mdns) return;

    // Check if query is for our service
    const isOurService = query.questions.some((q) =>
      q.name.includes(this.serviceName)
    );

    if (isOurService) {
      this.broadcastAdvertisement();
    }
  }

  private broadcastAdvertisement(): void {
    if (!this.mdns || !this.advertisement) return;

    const { id, hostname, port, models, hardware, status, metadata } = this.advertisement;
    const instanceName = `${id}.${this.serviceName}.${this.domain}`;
    const txtRecord = this.buildTxtRecord(models, hardware, status, metadata);

    this.mdns.respond({
      answers: [
        {
          name: `${this.serviceName}.${this.domain}`,
          type: 'PTR',
          ttl: 120,
          data: instanceName,
        },
        {
          name: instanceName,
          type: 'SRV',
          ttl: 120,
          data: { target: `${hostname}.${this.domain}`, port },
        },
        {
          name: instanceName,
          type: 'TXT',
          ttl: 120,
          data: txtRecord,
        },
      ],
    });
  }

  private parseTxtRecord(data: unknown): MDNSTxtRecord {
    const result: MDNSTxtRecord = {};

    if (!data) return result;

    const records = Array.isArray(data) ? data : [data];

    for (const record of records) {
      const str = record.toString();
      const eqIndex = str.indexOf('=');
      if (eqIndex > 0) {
        const key = str.substring(0, eqIndex);
        const value = str.substring(eqIndex + 1);
        (result as Record<string, string>)[key] = value;
      }
    }

    return result;
  }

  private buildTxtRecord(
    models: string[],
    hardware?: AgentHardware,
    status?: AgentStatus,
    metadata?: Record<string, unknown>
  ): string[] {
    const records: string[] = [];

    records.push(`models=${models.join(',')}`);
    records.push(`status=${status || 'available'}`);

    if (hardware?.gpu) records.push(`gpu=${hardware.gpu}`);
    if (hardware?.vramGB) records.push(`vram=${hardware.vramGB}`);
    if (hardware?.cpuCores) records.push(`cpuCores=${hardware.cpuCores}`);
    if (hardware?.ramGB) records.push(`ram=${hardware.ramGB}`);

    if (metadata) {
      records.push(`metadata=${JSON.stringify(metadata)}`);
    }

    return records;
  }

  private createAgentFromRecords(
    id: string,
    target: string,
    port: number,
    txt: MDNSTxtRecord
  ): NetworkAgent {
    const hostname = target.replace(`.${this.domain}`, '');

    const hardware: AgentHardware = {};
    if (txt.gpu) hardware.gpu = txt.gpu;
    if (txt.vram) hardware.vramGB = parseInt(txt.vram, 10);
    if (txt.cpuCores) hardware.cpuCores = parseInt(txt.cpuCores, 10);
    if (txt.ram) hardware.ramGB = parseInt(txt.ram, 10);

    return {
      id,
      hostname,
      host: hostname, // Will be resolved by mDNS
      port,
      models: txt.models ? txt.models.split(',') : [],
      hardware,
      status: (txt.status as AgentStatus) || 'available',
      discoveredAt: Date.now(),
      lastSeen: Date.now(),
      discoveryMethod: 'mdns',
    };
  }

  private updateAgent(agent: NetworkAgent): void {
    const existing = this.knownAgents.get(agent.id);

    if (!existing) {
      this.knownAgents.set(agent.id, agent);
      this.emit('agent-discovered', agent);
    } else {
      const updated = { ...existing, ...agent, lastSeen: Date.now() };
      this.knownAgents.set(agent.id, updated);
      this.emit('agent-updated', updated);
    }
  }
}
