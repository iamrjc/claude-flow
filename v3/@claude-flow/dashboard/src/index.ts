/**
 * @claude-flow/dashboard - Admin Dashboard for Claude Flow V3
 *
 * WP32: Real-time monitoring and control dashboard with no external dependencies.
 *
 * Features:
 * - HTTP server with static file serving
 * - REST API endpoints for status, config, and control
 * - Server-Sent Events (SSE) for real-time updates
 * - Vanilla JavaScript frontend (no frameworks)
 * - Dark/light mode support
 * - Mobile responsive design
 * - Authentication middleware
 *
 * @module @claude-flow/dashboard
 */

// Server
export {
  DashboardServer,
  createDashboardServer,
  type DashboardServerConfig,
  type WebSocketClient,
} from './server/dashboard-server.js';

// Status API
export {
  StatusAPI,
  createStatusAPI,
  type SystemStatus,
  type AgentInfo,
  type TaskInfo,
  type SystemMetrics,
} from './api/status-api.js';

// Config API
export {
  ConfigAPI,
  createConfigAPI,
  type ClaudeFlowConfig,
  type ConfigUpdateResult,
  type ConfigReloadResult,
} from './api/config-api.js';

// Control API
export {
  ControlAPI,
  createControlAPI,
  type TerminateAgentResult,
  type CancelTaskResult,
  type ScaleSwarmResult,
} from './api/control-api.js';

// All types (consolidated)
export type {
  APIResponse,
  APIError,
  DashboardState,
  LogEntry,
  SSEMessage,
  DashboardEvent,
  EmergencyShutdownResult,
  RestartSwarmResult,
} from './types.js';

/**
 * Create a complete dashboard instance with all APIs
 */
export async function createDashboard(config?: {
  port?: number;
  host?: string;
  authEnabled?: boolean;
  authToken?: string;
  corsEnabled?: boolean;
  staticPath?: string;
}) {
  const { resolve } = await import('path');
  const { fileURLToPath } = await import('url');
  const { dirname } = await import('path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Import factory functions
  const { createStatusAPI } = await import('./api/status-api.js');
  const { createConfigAPI } = await import('./api/config-api.js');
  const { createControlAPI } = await import('./api/control-api.js');
  const { createDashboardServer } = await import('./server/dashboard-server.js');

  const statusAPI = createStatusAPI();
  const configAPI = createConfigAPI();
  const controlAPI = createControlAPI();

  const serverConfig = {
    port: config?.port ?? 3000,
    host: config?.host ?? 'localhost',
    authEnabled: config?.authEnabled ?? false,
    authToken: config?.authToken,
    corsEnabled: config?.corsEnabled ?? true,
    staticPath: config?.staticPath ?? resolve(__dirname, 'views'),
  };

  const server = createDashboardServer(
    serverConfig,
    statusAPI,
    configAPI,
    controlAPI
  );

  return {
    server,
    statusAPI,
    configAPI,
    controlAPI,
    async start() {
      await server.start();
      return this;
    },
    async stop() {
      await server.stop();
    },
    getInfo() {
      return server.getInfo();
    },
  };
}

/**
 * Start a dashboard server with default configuration
 */
export async function startDashboard(config?: Parameters<typeof createDashboard>[0]) {
  const dashboard = await createDashboard(config);
  await dashboard.start();
  return dashboard;
}
