/**
 * WebSocket Server
 * Connection management, authentication, heartbeat, graceful shutdown
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { EventEmitter } from 'events';
import type { Server as HttpServer } from 'http';
import {
  Message,
  MessageSerializer,
  VersionNegotiator,
  ErrorCodes,
  MessageValidator,
} from '../protocol/message-types.js';

export interface WSServerOptions {
  port?: number;
  host?: string;
  server?: HttpServer;
  heartbeatInterval?: number;
  authTimeout?: number;
  maxConnections?: number;
  rateLimit?: {
    maxMessages: number;
    windowMs: number;
  };
  authenticate?: (token: string, metadata?: Record<string, unknown>) => Promise<boolean>;
}

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  authenticated: boolean;
  subscriptions: Set<string>;
  lastPing: number;
  metadata?: Record<string, unknown>;
  messageCount: number;
  windowStart: number;
}

export class WSServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ClientConnection>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(private options: WSServerOptions = {}) {
    super();
    this.options = {
      heartbeatInterval: 30000,
      authTimeout: 10000,
      maxConnections: 1000,
      rateLimit: {
        maxMessages: 100,
        windowMs: 60000,
      },
      ...options,
    };
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    if (this.wss) {
      throw new Error('Server already started');
    }

    const wsOptions: any = {};

    if (this.options.server) {
      wsOptions.server = this.options.server;
    } else {
      wsOptions.port = this.options.port || 8080;
      wsOptions.host = this.options.host || '0.0.0.0';
    }

    this.wss = new WebSocketServer(wsOptions);

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      this.emit('error', error);
    });

    // Start heartbeat
    this.startHeartbeat();

    this.emit('started', {
      port: this.options.port,
      host: this.options.host,
    });
  }

  /**
   * Handle new connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    // Check max connections
    if (this.clients.size >= this.options.maxConnections!) {
      ws.close(1008, 'Max connections reached');
      return;
    }

    const clientId = this.generateClientId();
    const client: ClientConnection = {
      id: clientId,
      ws,
      authenticated: false,
      subscriptions: new Set(),
      lastPing: Date.now(),
      messageCount: 0,
      windowStart: Date.now(),
    };

    this.clients.set(clientId, client);

    // Send version negotiation
    const versionMsg = VersionNegotiator.createNegotiationMessage();
    this.sendMessage(clientId, versionMsg);

    // Auto-authenticate if no authenticate function is provided
    if (!this.options.authenticate) {
      client.authenticated = true;
      this.emit('authenticated', { clientId });
    }

    // Setup auth timeout (only if authentication is required)
    const authTimeout = this.options.authenticate
      ? setTimeout(() => {
          if (!client.authenticated) {
            this.disconnectClient(clientId, 'Authentication timeout');
          }
        }, this.options.authTimeout)
      : null;

    // Setup message handler
    ws.on('message', async (data: RawData) => {
      try {
        // Check rate limit
        if (!this.checkRateLimit(clientId)) {
          this.sendError(clientId, ErrorCodes.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded');
          return;
        }

        const message = MessageSerializer.deserialize(data.toString());

        if (!MessageValidator.validate(message)) {
          this.sendError(clientId, ErrorCodes.INVALID_MESSAGE, 'Invalid message format');
          return;
        }

        // Handle auth message
        if (message.type === 'auth') {
          if (authTimeout) clearTimeout(authTimeout);
          await this.handleAuth(clientId, message.token, message.metadata);
          return;
        }

        // Require auth for other messages
        if (!client.authenticated) {
          this.sendError(clientId, ErrorCodes.AUTHENTICATION_FAILED, 'Not authenticated');
          return;
        }

        // Handle message
        await this.handleMessage(clientId, message);
      } catch (error) {
        this.sendError(
          clientId,
          ErrorCodes.INVALID_MESSAGE,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    });

    // Setup close handler
    ws.on('close', () => {
      if (authTimeout) clearTimeout(authTimeout);
      this.handleDisconnect(clientId);
    });

    // Setup error handler
    ws.on('error', (error) => {
      this.emit('client-error', { clientId, error });
    });

    this.emit('connection', { clientId });
  }

  /**
   * Handle authentication
   */
  private async handleAuth(
    clientId: string,
    token: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // Use custom auth function if provided
      if (this.options.authenticate) {
        const authenticated = await this.options.authenticate(token, metadata);
        if (!authenticated) {
          this.sendError(clientId, ErrorCodes.AUTHENTICATION_FAILED, 'Invalid credentials');
          this.disconnectClient(clientId, 'Authentication failed');
          return;
        }
      }

      client.authenticated = true;
      client.metadata = metadata;

      // Send ack
      const ackMsg = MessageSerializer.create('ack', {
        messageId: 'auth',
        success: true,
      });
      this.sendMessage(clientId, ackMsg);

      this.emit('authenticated', { clientId, metadata });
    } catch (error) {
      this.sendError(
        clientId,
        ErrorCodes.AUTHENTICATION_FAILED,
        error instanceof Error ? error.message : 'Authentication error'
      );
      this.disconnectClient(clientId, 'Authentication error');
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(clientId: string, message: Message): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'ping':
        this.handlePing(clientId, message);
        break;

      case 'subscribe':
        this.handleSubscribe(clientId, message);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(clientId, message);
        break;

      case 'publish':
        this.handlePublish(clientId, message);
        break;

      default:
        this.emit('message', { clientId, message });
    }
  }

  /**
   * Handle ping message
   */
  private handlePing(clientId: string, message: Message): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastPing = Date.now();

    const pongMsg = MessageSerializer.create('pong', {
      latency: Date.now() - message.timestamp,
    });
    this.sendMessage(clientId, pongMsg);
  }

  /**
   * Handle subscribe message
   */
  private handleSubscribe(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    for (const topic of message.topics) {
      client.subscriptions.add(topic);
    }

    const ackMsg = MessageSerializer.create('ack', {
      messageId: message.id,
      success: true,
    });
    this.sendMessage(clientId, ackMsg);

    this.emit('subscribe', { clientId, topics: message.topics });
  }

  /**
   * Handle unsubscribe message
   */
  private handleUnsubscribe(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    for (const topic of message.topics) {
      client.subscriptions.delete(topic);
    }

    const ackMsg = MessageSerializer.create('ack', {
      messageId: message.id,
      success: true,
    });
    this.sendMessage(clientId, ackMsg);

    this.emit('unsubscribe', { clientId, topics: message.topics });
  }

  /**
   * Handle publish message
   */
  private handlePublish(clientId: string, message: any): void {
    this.emit('publish', {
      clientId,
      topic: message.topic,
      data: message.data,
      broadcast: message.broadcast,
    });

    const ackMsg = MessageSerializer.create('ack', {
      messageId: message.id,
      success: true,
    });
    this.sendMessage(clientId, ackMsg);
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);
    this.emit('disconnect', { clientId });
  }

  /**
   * Check rate limit for client
   */
  private checkRateLimit(clientId: string): boolean {
    if (!this.options.rateLimit) {
      return true;
    }

    const client = this.clients.get(clientId);
    if (!client) return false;

    const now = Date.now();
    const windowElapsed = now - client.windowStart;

    // Reset window if expired
    if (windowElapsed >= this.options.rateLimit.windowMs) {
      client.messageCount = 0;
      client.windowStart = now;
    }

    // Check limit
    if (client.messageCount >= this.options.rateLimit.maxMessages) {
      return false;
    }

    client.messageCount++;
    return true;
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = this.options.heartbeatInterval! * 2;

      for (const [clientId, client] of this.clients.entries()) {
        if (now - client.lastPing > timeout) {
          this.disconnectClient(clientId, 'Heartbeat timeout');
        }
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Send message to client
   */
  sendMessage(clientId: string, message: Message): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const data = MessageSerializer.serialize(message);
      client.ws.send(data);
      return true;
    } catch (error) {
      this.emit('send-error', { clientId, error });
      return false;
    }
  }

  /**
   * Send error message to client
   */
  private sendError(clientId: string, code: string, message: string, details?: unknown): void {
    const errorMsg = MessageSerializer.create('error', {
      code,
      message,
      details,
    });
    this.sendMessage(clientId, errorMsg);
  }

  /**
   * Disconnect client
   */
  disconnectClient(clientId: string, reason: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.ws.close(1000, reason);
    this.handleDisconnect(clientId);
  }

  /**
   * Broadcast to all authenticated clients
   */
  broadcast(message: Message): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.authenticated) {
        this.sendMessage(clientId, message);
      }
    }
  }

  /**
   * Get connected clients
   */
  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get client info
   */
  getClient(clientId: string): ClientConnection | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all clients
    const closePromises = Array.from(this.clients.keys()).map((clientId) => {
      return new Promise<void>((resolve) => {
        const client = this.clients.get(clientId);
        if (client) {
          client.ws.once('close', () => resolve());
          client.ws.close(1001, 'Server shutting down');
          setTimeout(() => resolve(), 5000); // Timeout after 5s
        } else {
          resolve();
        }
      });
    });

    await Promise.all(closePromises);

    // Close server
    if (this.wss) {
      await new Promise<void>((resolve, reject) => {
        this.wss!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    this.clients.clear();
    this.wss = null;
    this.emit('shutdown');
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
