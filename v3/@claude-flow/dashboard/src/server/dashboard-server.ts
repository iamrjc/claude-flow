/**
 * Dashboard Server - WP32
 *
 * HTTP server with static file serving, API endpoints, WebSocket support,
 * and basic auth middleware. No external dependencies (vanilla Node.js).
 *
 * @module @claude-flow/dashboard/server
 */

import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import type { StatusAPI } from '../api/status-api.js';
import type { ConfigAPI } from '../api/config-api.js';
import type { ControlAPI } from '../api/control-api.js';

export interface DashboardServerConfig {
  port: number;
  host: string;
  authEnabled: boolean;
  authToken?: string;
  corsEnabled: boolean;
  staticPath: string;
}

export interface WebSocketClient {
  id: string;
  socket: any;
  subscriptions: Set<string>;
}

/**
 * Dashboard Server
 * Serves static files and API endpoints with WebSocket support
 */
export class DashboardServer {
  private server: http.Server | null = null;
  private wsClients: Map<string, WebSocketClient> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: DashboardServerConfig,
    private statusAPI: StatusAPI,
    private configAPI: ConfigAPI,
    private controlAPI: ControlAPI
  ) {}

  /**
   * Start the dashboard server
   */
  async start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));

    // Setup WebSocket-like SSE for real-time updates
    this.setupRealtimeUpdates();

    return new Promise((resolve) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        console.log(`[Dashboard] Server running at http://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('[Dashboard] Server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Handle HTTP requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers
    if (this.config.corsEnabled) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    // Handle OPTIONS for CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth middleware
    if (this.config.authEnabled && !this.isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // API routes
    if (url.pathname.startsWith('/api/')) {
      await this.handleAPIRequest(url, req, res);
      return;
    }

    // SSE endpoint for real-time updates
    if (url.pathname === '/events') {
      this.handleSSE(req, res);
      return;
    }

    // Static files
    await this.handleStaticFile(url.pathname, res);
  }

  /**
   * Handle API requests
   */
  private async handleAPIRequest(url: URL, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const path = url.pathname;
    const method = req.method || 'GET';

    try {
      let result: any;

      // Status API
      if (path === '/api/status' && method === 'GET') {
        result = await this.statusAPI.getStatus();
      } else if (path === '/api/agents' && method === 'GET') {
        result = await this.statusAPI.getAgents();
      } else if (path === '/api/tasks' && method === 'GET') {
        result = await this.statusAPI.getTasks();
      } else if (path === '/api/metrics' && method === 'GET') {
        result = await this.statusAPI.getMetrics();
      }
      // Config API
      else if (path === '/api/config' && method === 'GET') {
        result = await this.configAPI.getConfig();
      } else if (path === '/api/config' && method === 'PUT') {
        const body = await this.readBody(req);
        result = await this.configAPI.updateConfig(JSON.parse(body));
      } else if (path === '/api/config/reload' && method === 'POST') {
        result = await this.configAPI.reloadConfig();
      }
      // Control API
      else if (path.match(/^\/api\/agents\/[^/]+\/terminate$/) && method === 'POST') {
        const agentId = path.split('/')[3];
        result = await this.controlAPI.terminateAgent(agentId);
      } else if (path.match(/^\/api\/tasks\/[^/]+\/cancel$/) && method === 'POST') {
        const taskId = path.split('/')[3];
        result = await this.controlAPI.cancelTask(taskId);
      } else if (path === '/api/swarm/scale' && method === 'POST') {
        const body = await this.readBody(req);
        const { targetAgents } = JSON.parse(body);
        result = await this.controlAPI.scaleSwarm(targetAgents);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Dashboard] API error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }));
    }
  }

  /**
   * Handle Server-Sent Events for real-time updates
   */
  private handleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const client: WebSocketClient = {
      id: clientId,
      socket: res,
      subscriptions: new Set(['status', 'agents', 'tasks', 'metrics']),
    };

    this.wsClients.set(clientId, client);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      this.wsClients.delete(clientId);
    });
  }

  /**
   * Setup real-time updates broadcast
   */
  private setupRealtimeUpdates(): void {
    this.updateInterval = setInterval(async () => {
      if (this.wsClients.size === 0) return;

      try {
        const [status, agents, tasks, metrics] = await Promise.all([
          this.statusAPI.getStatus(),
          this.statusAPI.getAgents(),
          this.statusAPI.getTasks(),
          this.statusAPI.getMetrics(),
        ]);

        this.broadcast('status', status);
        this.broadcast('agents', agents);
        this.broadcast('tasks', tasks);
        this.broadcast('metrics', metrics);
      } catch (error) {
        console.error('[Dashboard] Update broadcast error:', error);
      }
    }, 2000); // Update every 2 seconds
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(type: string, data: any): void {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });

    for (const client of this.wsClients.values()) {
      if (client.subscriptions.has(type)) {
        try {
          client.socket.write(`data: ${message}\n\n`);
        } catch (error) {
          console.error(`[Dashboard] Broadcast error for client ${client.id}:`, error);
          this.wsClients.delete(client.id);
        }
      }
    }
  }

  /**
   * Handle static file requests
   */
  private async handleStaticFile(pathname: string, res: http.ServerResponse): Promise<void> {
    try {
      // Default to index.html
      if (pathname === '/') {
        pathname = '/index.html';
      }

      const filePath = join(this.config.staticPath, pathname);
      const content = await readFile(filePath);

      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
      };

      const ext = extname(pathname);
      const contentType = mimeTypes[ext] || 'text/plain';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  }

  /**
   * Check if request is authenticated
   */
  private isAuthenticated(req: http.IncomingMessage): boolean {
    if (!this.config.authToken) {
      return true;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return false;
    }

    const token = authHeader.replace('Bearer ', '');
    return token === this.config.authToken;
  }

  /**
   * Read request body
   */
  private async readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }

  /**
   * Get server info
   */
  getInfo() {
    return {
      host: this.config.host,
      port: this.config.port,
      running: this.server !== null,
      clients: this.wsClients.size,
    };
  }
}

/**
 * Create dashboard server instance
 */
export function createDashboardServer(
  config: DashboardServerConfig,
  statusAPI: StatusAPI,
  configAPI: ConfigAPI,
  controlAPI: ControlAPI
): DashboardServer {
  return new DashboardServer(config, statusAPI, configAPI, controlAPI);
}
