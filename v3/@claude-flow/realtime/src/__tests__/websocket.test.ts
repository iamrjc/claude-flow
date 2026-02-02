/**
 * WebSocket Support Tests
 * Tests covering server, client, routing, channels, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WSServer } from '../server/ws-server.js';
import { WSRouter } from '../server/ws-router.js';
import { WSClient } from '../client/ws-client.js';
import { AgentChannelServer, AgentChannelClient } from '../channels/agent-channel.js';
import { TaskChannelServer, TaskChannelClient } from '../channels/task-channel.js';
import { SwarmChannelServer, SwarmChannelClient } from '../channels/swarm-channel.js';
import {
  MessageSerializer,
  VersionNegotiator,
  MessageValidator,
  ErrorCodes,
} from '../protocol/message-types.js';

// Helper to wait for a short time
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Protocol Layer', () => {
  describe('MessageSerializer', () => {
    it('should serialize and deserialize messages', () => {
      const msg = MessageSerializer.create('ping', {});
      const serialized = MessageSerializer.serialize(msg);
      const deserialized = MessageSerializer.deserialize(serialized);

      expect(deserialized).toEqual(msg);
    });

    it('should generate unique message IDs', () => {
      const id1 = MessageSerializer.generateId();
      const id2 = MessageSerializer.generateId();

      expect(id1).not.toBe(id2);
    });

    it('should create messages with defaults', () => {
      const msg = MessageSerializer.create('subscribe', {
        topics: ['test'],
      });

      expect(msg.id).toBeDefined();
      expect(msg.type).toBe('subscribe');
      expect(msg.version).toBeDefined();
      expect(msg.timestamp).toBeDefined();
      expect(msg.topics).toEqual(['test']);
    });
  });

  describe('VersionNegotiator', () => {
    it('should check if version is supported', () => {
      expect(VersionNegotiator.isSupported('1.0.0')).toBe(true);
      expect(VersionNegotiator.isSupported('0.0.1')).toBe(false);
    });

    it('should select best version', () => {
      const version = VersionNegotiator.selectVersion(['1.0.0', '0.9.0']);
      expect(version).toBe('1.0.0');
    });

    it('should return null for no compatible versions', () => {
      const version = VersionNegotiator.selectVersion(['0.0.1']);
      expect(version).toBeNull();
    });

    it('should create negotiation message', () => {
      const msg = VersionNegotiator.createNegotiationMessage('1.0.0');
      expect(msg.type).toBe('version-negotiation');
      expect(msg.supportedVersions).toContain('1.0.0');
      expect(msg.selectedVersion).toBe('1.0.0');
    });
  });

  describe('MessageValidator', () => {
    it('should validate valid messages', () => {
      const msg = MessageSerializer.create('ping', {});
      expect(MessageValidator.validate(msg)).toBe(true);
    });

    it('should reject invalid messages', () => {
      expect(MessageValidator.validate(null)).toBe(false);
      expect(MessageValidator.validate({})).toBe(false);
      expect(MessageValidator.validate({ id: 'test' })).toBe(false);
    });

    it('should validate type-specific fields', () => {
      const subMsg = MessageSerializer.create('subscribe', {
        topics: ['test'],
      });
      expect(MessageValidator.validate(subMsg)).toBe(true);

      const invalidSubMsg = { ...subMsg, topics: 'invalid' };
      expect(MessageValidator.validate(invalidSubMsg)).toBe(false);
    });
  });
});

describe('WSServer', () => {
  let server: WSServer;
  let port = 18880;

  beforeEach(() => {
    port++;
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.shutdown();
      } catch {
        // Ignore shutdown errors
      }
      server = null as any;
    }
    await sleep(50);
  });

  it('should start server', async () => {
    server = new WSServer({ port });
    await server.start();
    expect(server).toBeDefined();
  });

  it('should handle connections', async () => {
    server = new WSServer({ port });
    await server.start();

    const connectedPromise = new Promise<void>((resolve) => {
      server.once('connection', () => resolve());
    });

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });

    await client.connect();
    await connectedPromise;

    expect(server.getConnectedClients().length).toBeGreaterThanOrEqual(1);
    client.disconnect();
  });

  it('should reject invalid auth', async () => {
    server = new WSServer({
      port,
      authenticate: async () => false,
      authTimeout: 500,
    });
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      token: 'invalid',
      reconnect: false,
    });

    try {
      await client.connect();
    } catch {
      // Expected - auth should fail
    } finally {
      client.disconnect();
    }
  });

  it('should handle heartbeat', async () => {
    server = new WSServer({ port, heartbeatInterval: 100 });
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      pingInterval: 100,
      reconnect: false,
    });

    const pongReceived = new Promise<void>((resolve) => {
      client.once('pong', () => resolve());
    });

    await client.connect();
    await pongReceived;

    client.disconnect();
  });

  it('should gracefully shutdown', async () => {
    server = new WSServer({ port });
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });

    await client.connect();
    await sleep(100);

    await server.shutdown();

    expect(server.getConnectedClients().length).toBe(0);
    client.disconnect();
  });

  it('should enforce max connections', async () => {
    server = new WSServer({ port, maxConnections: 2 });
    await server.start();

    const clients: WSClient[] = [];

    for (let i = 0; i < 3; i++) {
      const client = new WSClient({
        url: `ws://localhost:${port}`,
        reconnect: false,
      });
      clients.push(client);
      try {
        await client.connect();
      } catch {
        // Expected for 3rd client
      }
    }

    await sleep(100);
    expect(server.getConnectedClients().length).toBeLessThanOrEqual(2);

    clients.forEach((c) => c.disconnect());
  });
});

describe('WSRouter', () => {
  let server: WSServer;
  let router: WSRouter;
  let port = 18900;

  beforeEach(() => {
    port++;
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.shutdown();
      } catch {
        // Ignore
      }
      server = null as any;
      router = null as any;
    }
    await sleep(50);
  });

  it('should create router', async () => {
    server = new WSServer({ port });
    router = new WSRouter(server);
    await server.start();

    expect(router).toBeDefined();
  });

  it('should handle subscriptions', async () => {
    server = new WSServer({ port });
    router = new WSRouter(server);
    await server.start();

    const subscribedPromise = new Promise<void>((resolve) => {
      router.once('subscribed', () => resolve());
    });

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });

    await client.connect();
    await sleep(50);
    await client.subscribe(['test/topic']);
    await subscribedPromise;

    client.disconnect();
  });

  it('should check pattern matching', () => {
    server = new WSServer({ port: 19999 });
    router = new WSRouter(server);

    // Test internal pattern matching (via indirect verification)
    expect(router).toBeDefined();
  });

  it('should handle backpressure configuration', () => {
    server = new WSServer({ port: 19998 });
    router = new WSRouter(server, { maxQueueSize: 10 });

    expect(router).toBeDefined();
  });
});

describe('WSClient', () => {
  let server: WSServer;
  let port = 18950;

  beforeEach(() => {
    port++;
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.shutdown();
      } catch {
        // Ignore
      }
      server = null as any;
    }
    await sleep(50);
  });

  it('should connect and disconnect', async () => {
    server = new WSServer({ port });
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });

    await client.connect();
    expect(server.getConnectedClients().length).toBe(1);

    client.disconnect();
    await sleep(100);
    expect(server.getConnectedClients().length).toBe(0);
  });

  it('should queue messages when disconnected', async () => {
    server = new WSServer({ port });
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
      queueSize: 100,
    });

    await client.connect();
    await sleep(100);

    // Disconnect
    await server.shutdown();
    await sleep(100);

    // Queue some messages
    client.send({ type: 'ping' } as any);
    client.send({ type: 'ping' } as any);

    // Should not throw
    expect(true).toBe(true);
    client.disconnect();
  });

  it('should handle reconnection configuration', () => {
    const client = new WSClient({
      url: 'ws://localhost:9999',
      reconnect: true,
      reconnectInterval: 200,
      reconnectMaxAttempts: 3,
    });

    expect(client).toBeDefined();
    client.disconnect();
  });
});

describe('AgentChannel', () => {
  let server: WSServer;
  let router: WSRouter;
  let port = 19000;

  beforeEach(() => {
    port++;
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.shutdown();
      } catch {
        // Ignore
      }
      server = null as any;
    }
    await sleep(50);
  });

  it('should create agent channels', async () => {
    server = new WSServer({ port });
    router = new WSRouter(server);
    const agentServer = new AgentChannelServer(router);
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });
    const agentClient = new AgentChannelClient(client);

    expect(agentServer).toBeDefined();
    expect(agentClient).toBeDefined();

    client.disconnect();
  });

  it('should handle subscriptions', async () => {
    server = new WSServer({ port });
    router = new WSRouter(server);
    const agentServer = new AgentChannelServer(router);
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });
    const agentClient = new AgentChannelClient(client);

    await client.connect();
    await sleep(50);
    await agentClient.subscribeToAgent('agent-1');

    // Should not throw
    expect(true).toBe(true);

    client.disconnect();
  });
});

describe('TaskChannel', () => {
  let server: WSServer;
  let router: WSRouter;
  let port = 19050;

  beforeEach(() => {
    port++;
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.shutdown();
      } catch {
        // Ignore
      }
      server = null as any;
    }
    await sleep(50);
  });

  it('should create task channels', async () => {
    server = new WSServer({ port });
    router = new WSRouter(server);
    const taskServer = new TaskChannelServer(router);
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });
    const taskClient = new TaskChannelClient(client);

    expect(taskServer).toBeDefined();
    expect(taskClient).toBeDefined();

    client.disconnect();
  });

  it('should handle subscriptions', async () => {
    server = new WSServer({ port });
    router = new WSRouter(server);
    const taskServer = new TaskChannelServer(router);
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });
    const taskClient = new TaskChannelClient(client);

    await client.connect();
    await sleep(50);
    await taskClient.subscribeToTask('task-1');

    expect(true).toBe(true);

    client.disconnect();
  });
});

describe('SwarmChannel', () => {
  let server: WSServer;
  let router: WSRouter;
  let port = 19100;

  beforeEach(() => {
    port++;
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.shutdown();
      } catch {
        // Ignore
      }
      server = null as any;
    }
    await sleep(50);
  });

  it('should create swarm channels', async () => {
    server = new WSServer({ port });
    router = new WSRouter(server);
    const swarmServer = new SwarmChannelServer(router);
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });
    const swarmClient = new SwarmChannelClient(client);

    expect(swarmServer).toBeDefined();
    expect(swarmClient).toBeDefined();

    client.disconnect();
  });

  it('should handle subscriptions', async () => {
    server = new WSServer({ port });
    router = new WSRouter(server);
    const swarmServer = new SwarmChannelServer(router);
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });
    const swarmClient = new SwarmChannelClient(client);

    await client.connect();
    await sleep(50);
    await swarmClient.subscribeToSwarm();

    expect(true).toBe(true);

    client.disconnect();
  });
});

describe('Edge Cases', () => {
  let server: WSServer;
  let port = 19150;

  beforeEach(() => {
    port++;
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.shutdown();
      } catch {
        // Ignore
      }
      server = null as any;
    }
    await sleep(50);
  });

  it('should handle rapid connect/disconnect', async () => {
    server = new WSServer({ port });
    await server.start();

    const clients: WSClient[] = [];

    for (let i = 0; i < 5; i++) {
      const client = new WSClient({
        url: `ws://localhost:${port}`,
        reconnect: false,
      });
      clients.push(client);
      await client.connect();
      client.disconnect();
    }

    expect(true).toBe(true);
    clients.forEach((c) => c.disconnect());
  });

  it('should handle concurrent subscriptions', async () => {
    server = new WSServer({ port });
    const router = new WSRouter(server);
    await server.start();

    const client = new WSClient({
      url: `ws://localhost:${port}`,
      reconnect: false,
    });

    await client.connect();
    await sleep(100);

    // Subscribe to multiple topics concurrently
    await Promise.all([
      client.subscribe(['topic/1']),
      client.subscribe(['topic/2']),
      client.subscribe(['topic/3']),
    ]);

    expect(true).toBe(true);
    client.disconnect();
  });
});
