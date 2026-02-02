/**
 * WebSocket Client
 * Auto-reconnect, message queuing, EventEmitter-based API
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  Message,
  MessageSerializer,
  VersionNegotiator,
  MessageValidator,
  EventMessage,
} from '../protocol/message-types.js';

export interface WSClientOptions {
  url: string;
  token?: string;
  metadata?: Record<string, unknown>;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectMaxAttempts?: number;
  pingInterval?: number;
  queueSize?: number;
  messageTimeout?: number;
}

export interface PendingMessage {
  message: Message;
  resolve: (response: Message) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class WSClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private authenticated = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private messageQueue: Message[] = [];
  private pendingMessages = new Map<string, PendingMessage>();
  private subscriptions = new Set<string>();
  private isConnecting = false;
  private isClosed = false;

  constructor(private options: WSClientOptions) {
    super();
    this.options = {
      reconnect: true,
      reconnectInterval: 5000,
      reconnectMaxAttempts: 10,
      pingInterval: 30000,
      queueSize: 1000,
      messageTimeout: 30000,
      ...options,
    };
  }

  /**
   * Connect to server
   */
  async connect(): Promise<void> {
    if (this.ws || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.isClosed = false;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url);

        this.ws.on('open', async () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.emit('connected');

          // Start ping
          this.startPing();

          try {
            // Authenticate
            if (this.options.token) {
              await this.authenticate(this.options.token, this.options.metadata);
            } else {
              // No token means server will auto-authenticate
              this.authenticated = true;
              this.emit('authenticated');
            }

            // Resubscribe
            if (this.subscriptions.size > 0) {
              await this.resubscribe();
            }

            // Flush queue
            await this.flushQueue();

            resolve();
          } catch (error) {
            reject(error);
          }
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', (code, reason) => {
          this.handleClose(code, reason.toString());
        });

        this.ws.on('error', (error) => {
          this.isConnecting = false;
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Authenticate with server
   */
  private async authenticate(token: string, metadata?: Record<string, unknown>): Promise<void> {
    const authMsg = MessageSerializer.create('auth', {
      token,
      metadata,
    });

    const response = await this.sendAndWait(authMsg);

    if (response.type === 'ack' && response.success) {
      this.authenticated = true;
      this.emit('authenticated');
    } else if (response.type === 'error') {
      throw new Error(`Authentication failed: ${response.message}`);
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message = MessageSerializer.deserialize(data);

      if (!MessageValidator.validate(message)) {
        this.emit('invalid-message', data);
        return;
      }

      // Handle version negotiation
      if (message.type === 'version-negotiation') {
        this.handleVersionNegotiation(message);
        return;
      }

      // Handle pong
      if (message.type === 'pong') {
        this.emit('pong', { latency: message.latency });
        return;
      }

      // Handle ack/error for pending messages
      if (message.type === 'ack' || message.type === 'error') {
        const msgId = message.type === 'ack' ? message.messageId : message.id;
        const pending = this.pendingMessages.get(msgId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingMessages.delete(msgId);

          if (message.type === 'error') {
            pending.reject(new Error(message.message));
          } else {
            pending.resolve(message);
          }
        }
        return;
      }

      // Handle event
      if (message.type === 'event') {
        this.emit('event', message as EventMessage);
        this.emit(`event:${message.topic}`, message as EventMessage);
        return;
      }

      this.emit('message', message);
    } catch (error) {
      this.emit('parse-error', { data, error });
    }
  }

  /**
   * Handle version negotiation
   */
  private handleVersionNegotiation(message: any): void {
    const selectedVersion = VersionNegotiator.selectVersion(message.supportedVersions);
    if (!selectedVersion) {
      this.emit('error', new Error('No compatible protocol version'));
      this.disconnect();
    }
  }

  /**
   * Handle close
   */
  private handleClose(code: number, reason: string): void {
    this.cleanup();
    this.emit('disconnected', { code, reason });

    // Auto-reconnect
    if (
      this.options.reconnect &&
      !this.isClosed &&
      this.reconnectAttempts < this.options.reconnectMaxAttempts!
    ) {
      this.reconnectAttempts++;
      this.emit('reconnecting', { attempt: this.reconnectAttempts });

      this.reconnectTimer = setTimeout(() => {
        this.connect().catch((error) => {
          this.emit('reconnect-error', error);
        });
      }, this.options.reconnectInterval);
    }
  }

  /**
   * Start ping timer
   */
  private startPing(): void {
    this.stopPing();

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMsg = MessageSerializer.create('ping', {});
        this.send(pingMsg);
      }
    }, this.options.pingInterval);
  }

  /**
   * Stop ping timer
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Subscribe to topics
   */
  async subscribe(topics: string[]): Promise<void> {
    // Add to local subscriptions
    for (const topic of topics) {
      this.subscriptions.add(topic);
    }

    // Send subscribe message if connected
    if (this.authenticated) {
      const subMsg = MessageSerializer.create('subscribe', {
        topics,
      });

      await this.sendAndWait(subMsg);
    }
  }

  /**
   * Unsubscribe from topics
   */
  async unsubscribe(topics: string[]): Promise<void> {
    // Remove from local subscriptions
    for (const topic of topics) {
      this.subscriptions.delete(topic);
    }

    // Send unsubscribe message if connected
    if (this.authenticated) {
      const unsubMsg = MessageSerializer.create('unsubscribe', {
        topics,
      });

      await this.sendAndWait(unsubMsg);
    }
  }

  /**
   * Publish message
   */
  async publish(topic: string, data: unknown, broadcast: boolean = false): Promise<void> {
    const pubMsg = MessageSerializer.create('publish', {
      topic,
      data,
      broadcast,
    });

    await this.sendAndWait(pubMsg);
  }

  /**
   * Resubscribe after reconnect
   */
  private async resubscribe(): Promise<void> {
    if (this.subscriptions.size === 0) return;

    const topics = Array.from(this.subscriptions);
    const subMsg = MessageSerializer.create('subscribe', {
      topics,
    });

    await this.sendAndWait(subMsg);
  }

  /**
   * Send message
   */
  send(message: Message): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue message
      if (this.messageQueue.length < this.options.queueSize!) {
        this.messageQueue.push(message);
      } else {
        this.emit('queue-full', message);
      }
      return;
    }

    const data = MessageSerializer.serialize(message);
    this.ws.send(data);
  }

  /**
   * Send message and wait for response
   */
  sendAndWait(message: Message): Promise<Message> {
    return new Promise((resolve, reject) => {
      // Setup timeout
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(message.id);
        reject(new Error('Message timeout'));
      }, this.options.messageTimeout);

      // Store pending
      this.pendingMessages.set(message.id, {
        message,
        resolve,
        reject,
        timeout,
      });

      // Send
      this.send(message);
    });
  }

  /**
   * Flush message queue
   */
  private async flushQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.isClosed = true;
    this.cleanup();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.authenticated = false;
    this.stopPing();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clear pending messages
    for (const [id, pending] of this.pendingMessages.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingMessages.clear();
  }

  /**
   * Get connection state
   */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticated;
  }

  /**
   * Get queue size
   */
  get queueSize(): number {
    return this.messageQueue.length;
  }
}
