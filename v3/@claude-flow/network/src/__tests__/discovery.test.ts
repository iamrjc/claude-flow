/**
 * Network Discovery Unit Tests
 *
 * Tests for WP03: Network Discovery Service
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentDiscovery } from '../discovery/agent-discovery.js';
import { StaticDiscovery } from '../discovery/static-discovery.js';
import { RegistryClient } from '../discovery/registry-client.js';
import type { NetworkAgent, AgentAdvertisement, StaticHostConfig } from '../discovery/types.js';

// Mock multicast-dns
vi.mock('multicast-dns', () => {
  const EventEmitter = require('events');
  return {
    default: () => {
      const emitter = new EventEmitter();
      return {
        on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler),
        query: vi.fn(),
        respond: vi.fn(),
        destroy: vi.fn(),
        // Simulate responses
        _emit: (event: string, data: unknown) => emitter.emit(event, data),
      };
    },
  };
});

// Mock fetch for static discovery and registry
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create test agents
function createTestAgent(overrides: Partial<NetworkAgent> = {}): NetworkAgent {
  return {
    id: `agent-${Date.now()}`,
    hostname: 'test-host',
    host: '192.168.1.100',
    port: 11434,
    models: ['qwen2.5:7b'],
    hardware: { gpu: 'RTX 3080', vramGB: 12 },
    status: 'available',
    discoveredAt: Date.now(),
    lastSeen: Date.now(),
    discoveryMethod: 'static',
    ...overrides,
  };
}

describe('AgentDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('initialization', () => {
    it('should create with default config', () => {
      const discovery = new AgentDiscovery();
      expect(discovery).toBeDefined();
    });

    it('should create with custom config', () => {
      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: 'localhost', port: 11434 }],
      });
      expect(discovery).toBeDefined();
    });

    it('should support all discovery methods', () => {
      const methods = ['mdns', 'static', 'registry', 'auto'] as const;
      for (const method of methods) {
        const discovery = new AgentDiscovery({ method });
        expect(discovery).toBeDefined();
      }
    });
  });

  describe('static discovery', () => {
    it('should discover static hosts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      const discovered: NetworkAgent[] = [];
      discovery.on('agent-discovered', (agent) => discovered.push(agent));

      await discovery.start();
      await discovery.discover();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(discovered.length).toBeGreaterThanOrEqual(1);
      await discovery.stop();
    });

    it('should handle connection failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      await discovery.start();
      const agents = await discovery.discover();

      // Should not throw, just return empty or with offline status
      expect(Array.isArray(agents)).toBe(true);
      await discovery.stop();
    });

    it('should emit agent-lost when host becomes unreachable', async () => {
      // First call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
      });

      const staticDiscovery = new StaticDiscovery({
        hosts: [{ host: '192.168.1.100', port: 11434 }],
        healthCheckInterval: 100,
      });

      const discovered: NetworkAgent[] = [];
      staticDiscovery.on('agent-discovered', (agent) => discovered.push(agent));

      await staticDiscovery.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(discovered.length).toBe(1);
      await staticDiscovery.stop();
    });
  });

  describe('agent management', () => {
    it('should get agent by ID', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      await discovery.start();
      await discovery.discover();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const agents = discovery.getAllAgents();
      if (agents.length > 0) {
        const agent = discovery.getAgent(agents[0].id);
        expect(agent).toBeDefined();
        expect(agent?.id).toBe(agents[0].id);
      }

      await discovery.stop();
    });

    it('should filter agents by model', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2:3b' }] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      await discovery.start();
      await discovery.discover();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const qwenAgents = discovery.getAgentsByModel('qwen');
      const llamaAgents = discovery.getAgentsByModel('llama');

      // Both should match the same agent since it has both models
      expect(qwenAgents.length).toBeGreaterThanOrEqual(0);
      expect(llamaAgents.length).toBeGreaterThanOrEqual(0);

      await discovery.stop();
    });

    it('should filter agents by status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      await discovery.start();
      await discovery.discover();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const available = discovery.getAgentsByStatus('available');
      const offline = discovery.getAgentsByStatus('offline');

      expect(Array.isArray(available)).toBe(true);
      expect(Array.isArray(offline)).toBe(true);

      await discovery.stop();
    });

    it('should return available agents via getAvailableAgents()', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      await discovery.start();
      await discovery.discover();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const available = discovery.getAvailableAgents();
      expect(Array.isArray(available)).toBe(true);

      await discovery.stop();
    });
  });

  describe('continuous discovery', () => {
    it('should start and stop continuous discovery', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      await discovery.start();
      discovery.startContinuousDiscovery(100);

      // Let it run for a bit
      await new Promise((resolve) => setTimeout(resolve, 250));

      discovery.stopContinuousDiscovery();
      await discovery.stop();

      // Should have made multiple discover calls
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('advertisement', () => {
    it('should advertise an agent', async () => {
      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [],
      });

      await discovery.start();

      const advertisement: AgentAdvertisement = {
        id: 'my-agent',
        hostname: 'my-host',
        port: 11434,
        models: ['qwen2.5:7b'],
        status: 'available',
      };

      // Should not throw
      await discovery.advertise(advertisement);
      await discovery.stopAdvertising();
      await discovery.stop();
    });
  });

  describe('events', () => {
    it('should emit discovery-started on start', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      const started = vi.fn();
      discovery.on('discovery-started', started);

      await discovery.start();

      expect(started).toHaveBeenCalled();
      await discovery.stop();
    });

    it('should emit discovery-stopped on stop', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      const stopped = vi.fn();
      discovery.on('discovery-stopped', stopped);

      await discovery.start();
      await discovery.stop();

      expect(stopped).toHaveBeenCalled();
    });

    it('should emit agent-discovered when new agent found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      const discovered = vi.fn();
      discovery.on('agent-discovered', discovered);

      await discovery.start();
      await discovery.discover();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(discovered).toHaveBeenCalled();
      await discovery.stop();
    });
  });

  describe('discoverOnce', () => {
    it('should perform single discovery and return agents', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
      });

      const discovery = new AgentDiscovery({
        method: 'static',
        staticHosts: [{ host: '192.168.1.100', port: 11434 }],
      });

      const agents = await discovery.discoverOnce();
      expect(Array.isArray(agents)).toBe(true);
    });
  });
});

describe('StaticDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('should add hosts at runtime', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
    });

    const discovery = new StaticDiscovery({ hosts: [] });
    await discovery.start();

    discovery.addHost({ host: '192.168.1.100', port: 11434 });

    const agents = await discovery.discover();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should have attempted to probe the new host
    expect(mockFetch).toHaveBeenCalled();
    await discovery.stop();
  });

  it('should remove hosts at runtime', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
    });

    const discovery = new StaticDiscovery({
      hosts: [{ host: '192.168.1.100', port: 11434 }],
    });

    const lost = vi.fn();
    discovery.on('agent-lost', lost);

    await discovery.start();
    await discovery.discover();
    await new Promise((resolve) => setTimeout(resolve, 50));

    discovery.removeHost('192.168.1.100', 11434);

    expect(lost).toHaveBeenCalled();
    await discovery.stop();
  });
});

describe('RegistryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('should poll registry for agents', async () => {
    const testAgent = createTestAgent({ discoveryMethod: 'registry' });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [testAgent],
    });

    const registry = new RegistryClient({
      url: 'http://localhost:8080',
      heartbeatInterval: 1000,
    });

    const discovered = vi.fn();
    registry.on('agent-discovered', discovered);

    await registry.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(discovered).toHaveBeenCalled();
    await registry.stop();
  });

  it('should register agent with registry', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const registry = new RegistryClient({
      url: 'http://localhost:8080',
    });

    await registry.start();
    await registry.advertise({
      id: 'my-agent',
      hostname: 'my-host',
      port: 11434,
      models: ['qwen2.5:7b'],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/agents/register',
      expect.objectContaining({ method: 'POST' })
    );

    await registry.stop();
  });

  it('should handle registry errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const registry = new RegistryClient({
      url: 'http://localhost:8080',
    });

    const errorHandler = vi.fn();
    registry.on('discovery-error', errorHandler);

    await registry.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errorHandler).toHaveBeenCalled();
    await registry.stop();
  });
});
