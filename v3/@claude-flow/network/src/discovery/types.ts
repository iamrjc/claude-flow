/**
 * Network Discovery Types for WP03
 *
 * Type definitions for mDNS/Bonjour discovery, static configuration,
 * and registry-based discovery of network agents.
 *
 * @module @claude-flow/network/discovery/types
 */

// ===== Agent Types =====

export type AgentStatus = 'available' | 'busy' | 'degraded' | 'offline';
export type DiscoveryMethod = 'mdns' | 'static' | 'registry';

export interface AgentHardware {
  /** GPU model (e.g., "RTX 3080", "M2 Pro") */
  gpu?: string;
  /** VRAM in GB */
  vramGB?: number;
  /** Number of CPU cores */
  cpuCores?: number;
  /** RAM in GB */
  ramGB?: number;
}

export interface NetworkAgent {
  /** Unique agent identifier */
  id: string;
  /** Agent hostname */
  hostname: string;
  /** IP address or resolvable hostname */
  host: string;
  /** Port number for Ollama/provider API */
  port: number;
  /** Available models on this agent */
  models: string[];
  /** Hardware specifications */
  hardware: AgentHardware;
  /** Current agent status */
  status: AgentStatus;
  /** Timestamp when agent was discovered */
  discoveredAt: number;
  /** Timestamp of last successful contact */
  lastSeen: number;
  /** How this agent was discovered */
  discoveryMethod: DiscoveryMethod;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ===== Advertisement Types =====

export interface AgentAdvertisement {
  /** Agent identifier */
  id: string;
  /** Hostname to advertise */
  hostname: string;
  /** Port number */
  port: number;
  /** Available models */
  models: string[];
  /** Hardware specs */
  hardware?: AgentHardware;
  /** Current status */
  status?: AgentStatus;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

// ===== Configuration Types =====

export interface MDNSConfig {
  /** Service name (default: '_claude-flow-agent._tcp') */
  serviceName?: string;
  /** Discovery timeout in milliseconds */
  timeout?: number;
  /** Domain (default: 'local') */
  domain?: string;
}

export interface StaticHostConfig {
  /** Hostname or IP address */
  host: string;
  /** Port number */
  port: number;
  /** Optional: known models */
  models?: string[];
  /** Optional: agent name */
  name?: string;
}

export interface RegistryConfig {
  /** Registry server URL */
  url: string;
  /** API key for authentication */
  apiKey?: string;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
}

export interface DiscoveryConfig {
  /** Discovery method: mdns, static, registry, or auto */
  method: 'mdns' | 'static' | 'registry' | 'auto';
  /** mDNS-specific configuration */
  mdns?: MDNSConfig;
  /** Static host list */
  staticHosts?: StaticHostConfig[];
  /** Registry configuration */
  registry?: RegistryConfig;
  /** Agent timeout in milliseconds (default: 30000) */
  agentTimeout?: number;
  /** Continuous discovery interval in milliseconds */
  discoveryInterval?: number;
}

// ===== Event Types =====

export interface DiscoveryEvents {
  'agent-discovered': (agent: NetworkAgent) => void;
  'agent-lost': (agentId: string) => void;
  'agent-updated': (agent: NetworkAgent) => void;
  'discovery-started': () => void;
  'discovery-stopped': () => void;
  'discovery-error': (error: Error) => void;
}

// ===== Provider Interface =====

export interface DiscoveryProvider {
  /** Start the discovery provider */
  start(): Promise<void>;
  /** Stop the discovery provider */
  stop(): Promise<void>;
  /** Discover agents once */
  discover(): Promise<NetworkAgent[]>;
  /** Advertise an agent */
  advertise(advertisement: AgentAdvertisement): Promise<void>;
  /** Stop advertising */
  stopAdvertising(): Promise<void>;
}

// ===== mDNS Record Types =====

export interface MDNSTxtRecord {
  models?: string;
  gpu?: string;
  vram?: string;
  cpuCores?: string;
  ram?: string;
  status?: string;
}

// ===== Default Configuration =====

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  method: 'auto',
  mdns: {
    serviceName: '_claude-flow-agent._tcp',
    timeout: 5000,
    domain: 'local',
  },
  agentTimeout: 30000,
  discoveryInterval: 10000,
};

export const DEFAULT_SERVICE_NAME = '_claude-flow-agent._tcp';
export const DEFAULT_DOMAIN = 'local';
export const DEFAULT_PORT = 11434; // Ollama default
