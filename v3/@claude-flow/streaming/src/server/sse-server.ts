/**
 * SSE Server - Server-Sent Events with HTTP/2 Support
 *
 * Provides SSE streaming server with:
 * - HTTP/2 multiplexing for multiple concurrent streams
 * - Automatic keep-alive with configurable heartbeat
 * - Client connection tracking and management
 * - Graceful shutdown and cleanup
 * - Compression support (gzip, deflate, brotli)
 * - Per-client event filtering
 *
 * @module @claude-flow/streaming/server
 */

import { EventEmitter } from 'events';
import { createServer as createHTTPServer, IncomingMessage, ServerResponse } from 'http';
import { createSecureServer as createHTTP2Server, Http2ServerRequest, Http2ServerResponse } from 'http2';
import { readFileSync } from 'fs';
import compression from 'compression';

/**
 * SSE Server configuration
 */
export interface SSEServerConfig {
  /** Server port */
  port?: number;
  /** Server host */
  host?: string;
  /** Enable HTTP/2 */
  http2?: boolean;
  /** HTTP/2 TLS certificate path */
  certPath?: string;
  /** HTTP/2 TLS key path */
  keyPath?: string;
  /** Keep-alive interval in ms */
  keepAliveInterval?: number;
  /** Enable compression */
  compression?: boolean;
  /** Compression level (0-9) */
  compressionLevel?: number;
  /** Max clients */
  maxClients?: number;
  /** CORS origins */
  corsOrigins?: string[];
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * SSE Client connection
 */
export interface SSEClient {
  /** Client ID */
  id: string;
  /** Response stream */
  response: ServerResponse | Http2ServerResponse;
  /** Connection time */
  connectedAt: Date;
  /** Last activity time */
  lastActivity: Date;
  /** Event filters */
  filters?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * SSE Event data
 */
export interface SSEEvent {
  /** Event type */
  event?: string;
  /** Event data */
  data: unknown;
  /** Event ID */
  id?: string;
  /** Retry timeout in ms */
  retry?: number;
}

/**
 * SSE Server
 *
 * Example:
 * ```ts
 * const server = new SSEServer({ port: 3000, http2: true });
 * await server.start();
 *
 * server.broadcast({ event: 'task', data: { status: 'running' } });
 * server.sendToClient('client-123', { event: 'message', data: 'Hello!' });
 * ```
 */
export class SSEServer extends EventEmitter {
  private config: Required<SSEServerConfig>;
  private server: ReturnType<typeof createHTTPServer> | ReturnType<typeof createHTTP2Server> | null = null;
  private clients: Map<string, SSEClient> = new Map();
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private clientIdCounter = 0;

  constructor(config: SSEServerConfig = {}) {
    super();
    this.config = {
      port: config.port ?? 3000,
      host: config.host ?? 'localhost',
      http2: config.http2 ?? false,
      certPath: config.certPath ?? '',
      keyPath: config.keyPath ?? '',
      keepAliveInterval: config.keepAliveInterval ?? 15000,
      compression: config.compression ?? true,
      compressionLevel: config.compressionLevel ?? 6,
      maxClients: config.maxClients ?? 1000,
      corsOrigins: config.corsOrigins ?? ['*'],
      headers: config.headers ?? {},
    };
  }

  /**
   * Start the SSE server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('SSE server is already running');
    }

    try {
      if (this.config.http2) {
        await this.startHTTP2Server();
      } else {
        await this.startHTTPServer();
      }

      this.startKeepAlive();
      this.isRunning = true;
      this.emit('started', { port: this.config.port, http2: this.config.http2 });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start HTTP/1.1 server
   */
  private async startHTTPServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createHTTPServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', reject);
      this.server.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });
  }

  /**
   * Start HTTP/2 server
   */
  private async startHTTP2Server(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const options = this.config.certPath && this.config.keyPath
          ? {
              key: readFileSync(this.config.keyPath),
              cert: readFileSync(this.config.certPath),
            }
          : undefined;

        if (!options) {
          reject(new Error('HTTP/2 requires certPath and keyPath'));
          return;
        }

        this.server = createHTTP2Server(options, (req, res) => {
          this.handleRequest(req, res);
        });

        this.server.on('error', reject);
        this.server.listen(this.config.port, this.config.host, () => {
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming request
   */
  private handleRequest(
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse | Http2ServerResponse
  ): void {
    // CORS headers
    this.setCORSHeaders(res);

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only accept GET requests for SSE
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    // Check max clients
    if (this.clients.size >= this.config.maxClients) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Server at capacity');
      this.emit('clientRejected', { reason: 'max_clients_reached' });
      return;
    }

    // Setup SSE connection
    this.setupSSEConnection(req, res);
  }

  /**
   * Set CORS headers
   */
  private setCORSHeaders(res: ServerResponse | Http2ServerResponse): void {
    const origin = this.config.corsOrigins.includes('*')
      ? '*'
      : this.config.corsOrigins[0];

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  /**
   * Setup SSE connection for a client
   */
  private setupSSEConnection(
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse | Http2ServerResponse
  ): void {
    const clientId = `client-${++this.clientIdCounter}-${Date.now()}`;

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      ...this.config.headers,
    });

    // Apply compression if enabled
    if (this.config.compression) {
      const compressor = compression({
        level: this.config.compressionLevel,
        threshold: 0,
      });
      compressor(req as any, res as any, () => {});
    }

    // Parse filters from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const filters = url.searchParams.get('filters')?.split(',');

    // Create client object
    const client: SSEClient = {
      id: clientId,
      response: res,
      connectedAt: new Date(),
      lastActivity: new Date(),
      filters,
    };

    this.clients.set(clientId, client);

    // Send initial connection event
    this.sendToClient(clientId, {
      event: 'connected',
      data: { clientId, serverTime: new Date().toISOString() },
      id: '0',
    });

    // Handle client disconnect
    req.on('close', () => {
      this.removeClient(clientId);
    });

    this.emit('clientConnected', { clientId, filters });
  }

  /**
   * Start keep-alive heartbeat
   */
  private startKeepAlive(): void {
    this.keepAliveTimer = setInterval(() => {
      const comment = `: keep-alive ${Date.now()}\n\n`;
      this.clients.forEach((client) => {
        try {
          (client.response as any).write(comment);
          client.lastActivity = new Date();
        } catch (error) {
          this.removeClient(client.id);
        }
      });
    }, this.config.keepAliveInterval);
  }

  /**
   * Stop keep-alive heartbeat
   */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Remove a client connection
   */
  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.response.end();
      } catch {
        // Ignore errors on close
      }
      this.clients.delete(clientId);
      this.emit('clientDisconnected', { clientId });
    }
  }

  /**
   * Send event to a specific client
   */
  sendToClient(clientId: string, event: SSEEvent): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    // Check event filter
    if (client.filters && event.event && !client.filters.includes(event.event)) {
      return true; // Filtered out, but client exists
    }

    try {
      const message = this.formatSSEMessage(event);
      (client.response as any).write(message);
      client.lastActivity = new Date();
      return true;
    } catch (error) {
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Broadcast event to all clients
   */
  broadcast(event: SSEEvent, filter?: (client: SSEClient) => boolean): number {
    let sentCount = 0;
    const message = this.formatSSEMessage(event);

    this.clients.forEach((client) => {
      // Apply custom filter
      if (filter && !filter(client)) {
        return;
      }

      // Apply event filter
      if (client.filters && event.event && !client.filters.includes(event.event)) {
        return;
      }

      try {
        (client.response as any).write(message);
        client.lastActivity = new Date();
        sentCount++;
      } catch (error) {
        this.removeClient(client.id);
      }
    });

    return sentCount;
  }

  /**
   * Format SSE message
   */
  private formatSSEMessage(event: SSEEvent): string {
    let message = '';

    if (event.id) {
      message += `id: ${event.id}\n`;
    }

    if (event.event) {
      message += `event: ${event.event}\n`;
    }

    if (event.retry !== undefined) {
      message += `retry: ${event.retry}\n`;
    }

    // Handle multi-line data
    const data = typeof event.data === 'string'
      ? event.data
      : JSON.stringify(event.data);

    const lines = data.split('\n');
    lines.forEach(line => {
      message += `data: ${line}\n`;
    });

    message += '\n';
    return message;
  }

  /**
   * Get connected clients
   */
  getClients(): SSEClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): SSEClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get server statistics
   */
  getStats(): {
    isRunning: boolean;
    clientCount: number;
    uptime: number;
    config: SSEServerConfig;
  } {
    return {
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      uptime: this.isRunning ? Date.now() - (this.clients.values().next().value?.connectedAt?.getTime() || Date.now()) : 0,
      config: this.config,
    };
  }

  /**
   * Stop the SSE server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.stopKeepAlive();

    // Close all client connections
    this.clients.forEach((client) => {
      this.sendToClient(client.id, {
        event: 'shutdown',
        data: { message: 'Server is shutting down' },
      });
      this.removeClient(client.id);
    });

    // Close server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * Check if server is running
   */
  get running(): boolean {
    return this.isRunning;
  }
}
