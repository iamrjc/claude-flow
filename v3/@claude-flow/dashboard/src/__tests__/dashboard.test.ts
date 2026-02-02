/**
 * Dashboard Tests - WP32
 *
 * Comprehensive test suite covering:
 * - Server initialization and lifecycle
 * - Status API endpoints
 * - Config API endpoints
 * - Control API endpoints
 * - Authentication middleware
 * - Real-time updates (SSE)
 * - Error handling
 *
 * @module @claude-flow/dashboard/__tests__
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DashboardServer, createDashboardServer } from '../server/dashboard-server.js';
import { StatusAPI, createStatusAPI } from '../api/status-api.js';
import { ConfigAPI, createConfigAPI } from '../api/config-api.js';
import { ControlAPI, createControlAPI } from '../api/control-api.js';
import type { DashboardServerConfig } from '../server/dashboard-server.js';
import http from 'http';

// =============================================================================
// Test Helpers
// =============================================================================

function makeRequest(
  host: string,
  port: number,
  method: string,
  path: string,
  data?: any,
  headers?: Record<string, string>
): Promise<{ statusCode: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({
            statusCode: res.statusCode || 500,
            data: parsed,
            headers: res.headers,
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode || 500,
            data: body,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// =============================================================================
// Status API Tests
// =============================================================================

describe('StatusAPI', () => {
  let statusAPI: StatusAPI;

  beforeEach(() => {
    statusAPI = createStatusAPI();
  });

  it('should get system status', async () => {
    const status = await statusAPI.getStatus();

    expect(status).toBeDefined();
    expect(status.status).toBe('running');
    expect(status.version).toBe('3.0.0-alpha.1');
    expect(status.topology).toBe('hierarchical');
    expect(typeof status.uptime).toBe('number');
    expect(typeof status.agentCount).toBe('number');
    expect(typeof status.taskCount).toBe('number');
    expect(typeof status.timestamp).toBe('number');
  });

  it('should get agents list', async () => {
    const agents = await statusAPI.getAgents();

    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);

    const agent = agents[0];
    expect(agent.id).toBeDefined();
    expect(agent.type).toBeDefined();
    expect(agent.status).toBeDefined();
    expect(typeof agent.tasksCompleted).toBe('number');
    expect(typeof agent.tasksFailed).toBe('number');
    expect(typeof agent.successRate).toBe('number');
    expect(typeof agent.uptime).toBe('number');
    expect(typeof agent.healthScore).toBe('number');
  });

  it('should get tasks list', async () => {
    const tasks = await statusAPI.getTasks();

    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThan(0);

    const task = tasks[0];
    expect(task.id).toBeDefined();
    expect(task.title).toBeDefined();
    expect(task.type).toBeDefined();
    expect(task.status).toBeDefined();
    expect(task.priority).toBeDefined();
    expect(typeof task.progress).toBe('number');
    expect(typeof task.createdAt).toBe('number');
  });

  it('should get system metrics', async () => {
    const metrics = await statusAPI.getMetrics();

    expect(metrics).toBeDefined();
    expect(metrics.agents).toBeDefined();
    expect(metrics.tasks).toBeDefined();
    expect(metrics.performance).toBeDefined();
    expect(metrics.errors).toBeDefined();

    expect(typeof metrics.agents.total).toBe('number');
    expect(typeof metrics.agents.active).toBe('number');
    expect(typeof metrics.agents.utilization).toBe('number');

    expect(typeof metrics.tasks.total).toBe('number');
    expect(typeof metrics.tasks.completed).toBe('number');
    expect(typeof metrics.tasks.throughput).toBe('number');

    expect(typeof metrics.performance.cpuUsage).toBe('number');
    expect(typeof metrics.performance.memoryUsage).toBe('number');
  });
});

// =============================================================================
// Config API Tests
// =============================================================================

describe('ConfigAPI', () => {
  let configAPI: ConfigAPI;

  beforeEach(() => {
    configAPI = createConfigAPI();
  });

  it('should get current configuration', async () => {
    const config = await configAPI.getConfig();

    expect(config).toBeDefined();
    expect(config.swarm).toBeDefined();
    expect(config.memory).toBeDefined();
    expect(config.performance).toBeDefined();
    expect(config.logging).toBeDefined();
    expect(config.api).toBeDefined();
  });

  it('should update swarm configuration', async () => {
    const result = await configAPI.updateConfig({
      swarm: {
        topology: 'mesh',
        maxAgents: 20,
      },
    });

    expect(result.success).toBe(true);
    expect(result.updated).toContain('swarm.topology');
    expect(result.updated).toContain('swarm.maxAgents');
    expect(result.config.swarm.topology).toBe('mesh');
    expect(result.config.swarm.maxAgents).toBe(20);
  });

  it('should reject invalid topology', async () => {
    const result = await configAPI.updateConfig({
      swarm: {
        topology: 'invalid' as any,
      },
    });

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('should reject invalid maxAgents range', async () => {
    const result = await configAPI.updateConfig({
      swarm: {
        maxAgents: 200,
      },
    });

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should update memory configuration', async () => {
    const result = await configAPI.updateConfig({
      memory: {
        backend: 'sqlite',
        hnsw: false,
      },
    });

    expect(result.success).toBe(true);
    expect(result.updated).toContain('memory.backend');
    expect(result.updated).toContain('memory.hnsw');
  });

  it('should reload configuration', async () => {
    await configAPI.updateConfig({
      swarm: { maxAgents: 25 },
    });

    const result = await configAPI.reloadConfig();

    expect(result.success).toBe(true);
    expect(result.message).toContain('reloaded');
    expect(result.config.swarm.maxAgents).toBe(15); // Back to original
  });

  it('should validate configuration', () => {
    const validation = configAPI.validateConfig();

    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it('should detect config changes', async () => {
    await configAPI.updateConfig({
      swarm: { maxAgents: 20 },
    });

    const diff = configAPI.getConfigDiff();

    expect(diff.changed.length).toBeGreaterThan(0);
    expect(diff.values).toBeDefined();
  });
});

// =============================================================================
// Control API Tests
// =============================================================================

describe('ControlAPI', () => {
  let controlAPI: ControlAPI;

  beforeEach(() => {
    controlAPI = createControlAPI();
  });

  it('should terminate agent', async () => {
    const result = await controlAPI.terminateAgent('agent-1');

    expect(result.success).toBe(true);
    expect(result.agentId).toBe('agent-1');
    expect(result.message).toContain('terminated');
    expect(typeof result.timestamp).toBe('number');
  });

  it('should reject empty agent ID', async () => {
    const result = await controlAPI.terminateAgent('');

    expect(result.success).toBe(false);
    expect(result.message).toContain('required');
  });

  it('should cancel task', async () => {
    const result = await controlAPI.cancelTask('task-123');

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-123');
    expect(result.message).toContain('cancelled');
    expect(typeof result.timestamp).toBe('number');
  });

  it('should reject empty task ID', async () => {
    const result = await controlAPI.cancelTask('');

    expect(result.success).toBe(false);
    expect(result.message).toContain('required');
  });

  it('should scale swarm up', async () => {
    const result = await controlAPI.scaleSwarm(10);

    expect(result.success).toBe(true);
    expect(result.targetAgents).toBe(10);
    expect(result.message).toContain('scaled');
    expect(typeof result.timestamp).toBe('number');
  });

  it('should scale swarm down', async () => {
    const result = await controlAPI.scaleSwarm(2);

    expect(result.success).toBe(true);
    expect(result.targetAgents).toBe(2);
  });

  it('should reject invalid scale target', async () => {
    const result = await controlAPI.scaleSwarm(200);

    expect(result.success).toBe(false);
    expect(result.message).toContain('between 1 and 100');
  });

  it('should batch terminate agents', async () => {
    const results = await controlAPI.terminateAgents(['agent-1', 'agent-2']);

    expect(results.length).toBe(2);
    expect(results[0].agentId).toBe('agent-1');
    expect(results[1].agentId).toBe('agent-2');
  });

  it('should batch cancel tasks', async () => {
    const results = await controlAPI.cancelTasks(['task-1', 'task-2']);

    expect(results.length).toBe(2);
    expect(results[0].taskId).toBe('task-1');
    expect(results[1].taskId).toBe('task-2');
  });

  it('should perform emergency shutdown', async () => {
    const result = await controlAPI.emergencyShutdown();

    expect(result.success).toBe(true);
    expect(typeof result.agentsTerminated).toBe('number');
    expect(typeof result.tasksCancelled).toBe('number');
    expect(result.message).toContain('shutdown');
  });

  it('should restart swarm', async () => {
    const result = await controlAPI.restartSwarm();

    expect(result.success).toBe(true);
    expect(result.message).toContain('restarted');
  });
});

// =============================================================================
// Dashboard Server Tests
// =============================================================================

describe('DashboardServer', () => {
  let server: DashboardServer;
  const port = 3456;
  const host = 'localhost';

  beforeEach(async () => {
    const statusAPI = createStatusAPI();
    const configAPI = createConfigAPI();
    const controlAPI = createControlAPI();

    const config: DashboardServerConfig = {
      port,
      host,
      authEnabled: false,
      corsEnabled: true,
      staticPath: './src/views',
    };

    server = createDashboardServer(config, statusAPI, configAPI, controlAPI);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should start and stop server', async () => {
    const info = server.getInfo();
    expect(info.running).toBe(true);
    expect(info.port).toBe(port);
  });

  it('should respond to status endpoint', async () => {
    const response = await makeRequest(host, port, 'GET', '/api/status');

    expect(response.statusCode).toBe(200);
    expect(response.data).toBeDefined();
    expect(response.data.status).toBe('running');
  });

  it('should respond to agents endpoint', async () => {
    const response = await makeRequest(host, port, 'GET', '/api/agents');

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('should respond to tasks endpoint', async () => {
    const response = await makeRequest(host, port, 'GET', '/api/tasks');

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('should respond to metrics endpoint', async () => {
    const response = await makeRequest(host, port, 'GET', '/api/metrics');

    expect(response.statusCode).toBe(200);
    expect(response.data.agents).toBeDefined();
    expect(response.data.tasks).toBeDefined();
  });

  it('should respond to config endpoint', async () => {
    const response = await makeRequest(host, port, 'GET', '/api/config');

    expect(response.statusCode).toBe(200);
    expect(response.data.swarm).toBeDefined();
  });

  it('should update config via PUT', async () => {
    const response = await makeRequest(host, port, 'PUT', '/api/config', {
      swarm: { maxAgents: 20 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.config.swarm.maxAgents).toBe(20);
  });

  it('should reload config via POST', async () => {
    const response = await makeRequest(host, port, 'POST', '/api/config/reload');

    expect(response.statusCode).toBe(200);
    expect(response.data.success).toBe(true);
  });

  it('should terminate agent via POST', async () => {
    const response = await makeRequest(host, port, 'POST', '/api/agents/agent-1/terminate');

    expect(response.statusCode).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.agentId).toBe('agent-1');
  });

  it('should cancel task via POST', async () => {
    const response = await makeRequest(host, port, 'POST', '/api/tasks/task-123/cancel');

    expect(response.statusCode).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.taskId).toBe('task-123');
  });

  it('should scale swarm via POST', async () => {
    const response = await makeRequest(host, port, 'POST', '/api/swarm/scale', {
      targetAgents: 10,
    });

    expect(response.statusCode).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.targetAgents).toBe(10);
  });

  it('should return 404 for unknown endpoint', async () => {
    const response = await makeRequest(host, port, 'GET', '/api/unknown');

    expect(response.statusCode).toBe(404);
  });

  it('should handle CORS preflight', async () => {
    const response = await makeRequest(host, port, 'OPTIONS', '/api/status');

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });
});

// =============================================================================
// Authentication Tests
// =============================================================================

describe('DashboardServer - Authentication', () => {
  let server: DashboardServer;
  const port = 3457;
  const host = 'localhost';
  const authToken = 'test-token-123';

  beforeEach(async () => {
    const statusAPI = createStatusAPI();
    const configAPI = createConfigAPI();
    const controlAPI = createControlAPI();

    const config: DashboardServerConfig = {
      port,
      host,
      authEnabled: true,
      authToken,
      corsEnabled: true,
      staticPath: './src/views',
    };

    server = createDashboardServer(config, statusAPI, configAPI, controlAPI);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should reject unauthenticated requests', async () => {
    const response = await makeRequest(host, port, 'GET', '/api/status');

    expect(response.statusCode).toBe(401);
    expect(response.data.error).toBe('Unauthorized');
  });

  it('should accept authenticated requests', async () => {
    const response = await makeRequest(host, port, 'GET', '/api/status', undefined, {
      Authorization: `Bearer ${authToken}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.data.status).toBe('running');
  });

  it('should reject invalid token', async () => {
    const response = await makeRequest(host, port, 'GET', '/api/status', undefined, {
      Authorization: 'Bearer invalid-token',
    });

    expect(response.statusCode).toBe(401);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Dashboard - Integration', () => {
  let server: DashboardServer;
  const port = 3458;

  beforeEach(async () => {
    const statusAPI = createStatusAPI();
    const configAPI = createConfigAPI();
    const controlAPI = createControlAPI();

    server = createDashboardServer(
      {
        port,
        host: 'localhost',
        authEnabled: false,
        corsEnabled: true,
        staticPath: './src/views',
      },
      statusAPI,
      configAPI,
      controlAPI
    );

    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should handle multiple concurrent requests', async () => {
    const requests = [
      makeRequest('localhost', port, 'GET', '/api/status'),
      makeRequest('localhost', port, 'GET', '/api/agents'),
      makeRequest('localhost', port, 'GET', '/api/tasks'),
      makeRequest('localhost', port, 'GET', '/api/metrics'),
      makeRequest('localhost', port, 'GET', '/api/config'),
    ];

    const responses = await Promise.all(requests);

    expect(responses.every((r) => r.statusCode === 200)).toBe(true);
  });

  it('should maintain server info', () => {
    const info = server.getInfo();

    expect(info.host).toBe('localhost');
    expect(info.port).toBe(port);
    expect(info.running).toBe(true);
    expect(typeof info.clients).toBe('number');
  });
});
