/**
 * SSE Client - EventSource Wrapper with Reconnection
 *
 * Provides SSE client with:
 * - Automatic reconnection with exponential backoff
 * - Event parsing and typed handlers
 * - Connection state management
 * - Event filtering
 * - Error handling and recovery
 *
 * @module @claude-flow/streaming/client
 */

import { EventEmitter } from 'events';

/**
 * SSE Client configuration
 */
export interface SSEClientConfig {
  /** Server URL */
  url: string;
  /** Event filters (only receive specific event types) */
  filters?: string[];
  /** Enable auto-reconnect */
  autoReconnect?: boolean;
  /** Initial reconnect delay in ms */
  reconnectDelay?: number;
  /** Max reconnect delay in ms */
  maxReconnectDelay?: number;
  /** Reconnect backoff multiplier */
  reconnectBackoff?: number;
  /** Max reconnect attempts (0 = infinite) */
  maxReconnectAttempts?: number;
  /** Custom headers */
  headers?: Record<string, string>;
  /** With credentials */
  withCredentials?: boolean;
}

/**
 * Connection state
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

/**
 * SSE Client
 *
 * Example:
 * ```ts
 * const client = new SSEClient({
 *   url: 'http://localhost:3000',
 *   filters: ['task:*', 'agent:*'],
 *   autoReconnect: true
 * });
 *
 * client.on('task:started', (data) => {
 *   console.log('Task started:', data);
 * });
 *
 * client.on('connected', () => {
 *   console.log('Connected to SSE server');
 * });
 *
 * await client.connect();
 * ```
 */
export class SSEClient extends EventEmitter {
  private config: Required<Omit<SSEClientConfig, 'filters' | 'headers'>> & {
    filters?: string[];
    headers?: Record<string, string>;
  };
  private eventSource: EventSource | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastEventId: string | null = null;

  constructor(config: SSEClientConfig) {
    super();
    this.config = {
      url: config.url,
      filters: config.filters,
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      reconnectBackoff: config.reconnectBackoff ?? 2,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 0,
      headers: config.headers,
      withCredentials: config.withCredentials ?? false,
    };
  }

  /**
   * Connect to SSE server
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) {
      return;
    }

    this.state = ConnectionState.CONNECTING;
    this.emit('connecting');

    try {
      await this.createEventSource();
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  /**
   * Create EventSource connection
   */
  private async createEventSource(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Build URL with filters
        let url = this.config.url;
        if (this.config.filters && this.config.filters.length > 0) {
          const separator = url.includes('?') ? '&' : '?';
          url += `${separator}filters=${this.config.filters.join(',')}`;
        }

        // Add last event ID for resumption
        if (this.lastEventId) {
          const separator = url.includes('?') ? '&' : '?';
          url += `${separator}lastEventId=${this.lastEventId}`;
        }

        // Note: EventSource doesn't support custom headers in browser
        // For Node.js, we'd need a different implementation
        this.eventSource = new EventSource(url, {
          withCredentials: this.config.withCredentials,
        });

        // Connection opened
        this.eventSource.onopen = () => {
          this.state = ConnectionState.CONNECTED;
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        };

        // Generic message handler
        this.eventSource.onmessage = (event) => {
          this.handleMessage(event);
        };

        // Error handler
        this.eventSource.onerror = (error) => {
          this.handleConnectionError(error);
          reject(error);
        };

        // Register custom event handlers
        this.registerEventHandlers();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Register handlers for all known event types
   */
  private registerEventHandlers(): void {
    if (!this.eventSource) {
      return;
    }

    const eventTypes = [
      // Connection events
      'connected',
      'shutdown',
      // Task events
      'task:created',
      'task:queued',
      'task:assigned',
      'task:started',
      'task:progress',
      'task:intermediate',
      'task:completed',
      'task:failed',
      'task:cancelled',
      'task:metrics',
      // Agent events
      'agent:spawned',
      'agent:started',
      'agent:stopped',
      'agent:paused',
      'agent:error',
      'agent:output:stdout',
      'agent:output:stderr',
      'agent:log:debug',
      'agent:log:info',
      'agent:log:warn',
      'agent:log:error',
      'agent:log:fatal',
      'agent:metrics',
      'agent:health',
      // LLM events
      'llm:request:started',
      'llm:token',
      'llm:tool:call',
      'llm:tool:result',
      'llm:usage',
      'llm:request:completed',
      'llm:request:error',
    ];

    eventTypes.forEach((eventType) => {
      this.eventSource!.addEventListener(eventType, ((event: Event) => {
        this.handleMessage(event as MessageEvent, eventType);
      }) as any);
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent, eventType?: string): void {
    try {
      // Store last event ID for resumption
      if (event.lastEventId) {
        this.lastEventId = event.lastEventId;
      }

      // Parse event data
      const data = event.data ? JSON.parse(event.data) : null;

      // Emit event with type
      const type = eventType || event.type || 'message';
      this.emit(type, data);
      this.emit('event', { type, data });
    } catch (error) {
      this.emit('parseError', { error, event });
    }
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: unknown): void {
    const prevState = this.state;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Check if we should reconnect
    if (!this.config.autoReconnect) {
      this.state = ConnectionState.FAILED;
      this.emit('disconnected', { error, willReconnect: false });
      this.emit('error', error);
      return;
    }

    // Check max attempts
    if (
      this.config.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      this.state = ConnectionState.FAILED;
      this.emit('disconnected', { error, willReconnect: false });
      this.emit('error', error);
      return;
    }

    // Calculate reconnect delay with exponential backoff
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(this.config.reconnectBackoff, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;

    this.emit('disconnected', {
      error,
      willReconnect: true,
      reconnectAttempt: this.reconnectAttempts,
      reconnectDelay: delay,
    });

    // Only emit error if this wasn't an expected state change
    if (prevState !== ConnectionState.RECONNECTING) {
      this.emit('error', error);
    }

    // Schedule reconnection
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);

    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
    });
  }

  /**
   * Disconnect from SSE server
   */
  disconnect(): void {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.state = ConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.emit('disconnected', { willReconnect: false });
  }

  /**
   * Get connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Get last event ID
   */
  getLastEventId(): string | null {
    return this.lastEventId;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SSEClientConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
  }

  /**
   * Get statistics
   */
  getStats(): {
    state: ConnectionState;
    reconnectAttempts: number;
    lastEventId: string | null;
    isConnected: boolean;
  } {
    return {
      state: this.state,
      reconnectAttempts: this.reconnectAttempts,
      lastEventId: this.lastEventId,
      isConnected: this.isConnected(),
    };
  }
}
