/**
 * Network Discovery Module
 *
 * Exports all discovery-related types and classes.
 *
 * @module @claude-flow/network/discovery
 */

// Types
export type {
  NetworkAgent,
  AgentAdvertisement,
  AgentHardware,
  AgentStatus,
  DiscoveryMethod,
  DiscoveryConfig,
  DiscoveryEvents,
  DiscoveryProvider,
  MDNSConfig,
  StaticHostConfig,
  RegistryConfig,
  MDNSTxtRecord,
} from './types.js';

// Constants
export {
  DEFAULT_DISCOVERY_CONFIG,
  DEFAULT_SERVICE_NAME,
  DEFAULT_DOMAIN,
  DEFAULT_PORT,
} from './types.js';

// Main discovery class
export { AgentDiscovery } from './agent-discovery.js';

// Discovery providers
export { MDNSDiscovery } from './mdns-discovery.js';
export { StaticDiscovery } from './static-discovery.js';
export type { StaticDiscoveryConfig } from './static-discovery.js';
export { RegistryClient } from './registry-client.js';
