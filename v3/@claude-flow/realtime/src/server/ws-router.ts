/**
 * WebSocket Router
 * Message routing, topic subscriptions, pattern matching, broadcast
 */

import { EventEmitter } from 'events';
import type { WSServer, ClientConnection } from './ws-server.js';
import { MessageSerializer, EventMessage } from '../protocol/message-types.js';

export interface RouterOptions {
  enablePatterns?: boolean;
  maxSubscriptionsPerClient?: number;
  queueSize?: number;
}

export interface TopicSubscription {
  clientId: string;
  topic: string;
  pattern?: string;
}

export interface RouteConfig {
  topic: string;
  handler?: (data: unknown, clientId: string) => Promise<void> | void;
  middleware?: Array<(data: unknown, clientId: string) => Promise<boolean> | boolean>;
}

export class WSRouter extends EventEmitter {
  private subscriptions = new Map<string, Set<string>>(); // topic -> Set<clientId>
  private patterns = new Map<string, Set<string>>(); // pattern -> Set<clientId>
  private routes = new Map<string, RouteConfig>();
  private messageQueue = new Map<string, EventMessage[]>(); // clientId -> messages
  private sequenceNumbers = new Map<string, number>(); // topic -> sequence

  constructor(
    private server: WSServer,
    private options: RouterOptions = {}
  ) {
    super();
    this.options = {
      enablePatterns: true,
      maxSubscriptionsPerClient: 100,
      queueSize: 1000,
      ...options,
    };

    this.setupServerListeners();
  }

  /**
   * Setup server event listeners
   */
  private setupServerListeners(): void {
    // Handle subscriptions
    this.server.on('subscribe', ({ clientId, topics }) => {
      this.handleSubscribe(clientId, topics);
    });

    // Handle unsubscriptions
    this.server.on('unsubscribe', ({ clientId, topics }) => {
      this.handleUnsubscribe(clientId, topics);
    });

    // Handle publishes
    this.server.on('publish', ({ clientId, topic, data, broadcast }) => {
      this.handlePublish(clientId, topic, data, broadcast);
    });

    // Handle disconnects
    this.server.on('disconnect', ({ clientId }) => {
      this.handleDisconnect(clientId);
    });
  }

  /**
   * Register a route
   */
  route(config: RouteConfig): void {
    this.routes.set(config.topic, config);
  }

  /**
   * Unregister a route
   */
  unroute(topic: string): void {
    this.routes.delete(topic);
  }

  /**
   * Handle subscribe
   */
  private handleSubscribe(clientId: string, topics: string[]): void {
    const client = this.server.getClient(clientId);
    if (!client) return;

    // Check subscription limit
    const currentSubs = this.getClientSubscriptions(clientId);
    if (currentSubs.length + topics.length > this.options.maxSubscriptionsPerClient!) {
      this.emit('subscription-limit-exceeded', { clientId, topics });
      return;
    }

    for (const topic of topics) {
      if (this.isPattern(topic)) {
        // Pattern subscription
        if (this.options.enablePatterns) {
          if (!this.patterns.has(topic)) {
            this.patterns.set(topic, new Set());
          }
          this.patterns.get(topic)!.add(clientId);
        }
      } else {
        // Exact topic subscription
        if (!this.subscriptions.has(topic)) {
          this.subscriptions.set(topic, new Set());
        }
        this.subscriptions.get(topic)!.add(clientId);
      }
    }

    this.emit('subscribed', { clientId, topics });
  }

  /**
   * Handle unsubscribe
   */
  private handleUnsubscribe(clientId: string, topics: string[]): void {
    for (const topic of topics) {
      if (this.isPattern(topic)) {
        const clients = this.patterns.get(topic);
        if (clients) {
          clients.delete(clientId);
          if (clients.size === 0) {
            this.patterns.delete(topic);
          }
        }
      } else {
        const clients = this.subscriptions.get(topic);
        if (clients) {
          clients.delete(clientId);
          if (clients.size === 0) {
            this.subscriptions.delete(topic);
          }
        }
      }
    }

    this.emit('unsubscribed', { clientId, topics });
  }

  /**
   * Handle publish
   */
  private async handlePublish(
    publisherId: string,
    topic: string,
    data: unknown,
    broadcast: boolean = false
  ): Promise<void> {
    // Check route
    const route = this.routes.get(topic);
    if (route) {
      // Run middleware
      if (route.middleware) {
        for (const middleware of route.middleware) {
          const passed = await middleware(data, publisherId);
          if (!passed) {
            this.emit('publish-blocked', { publisherId, topic, data });
            return;
          }
        }
      }

      // Run handler
      if (route.handler) {
        await route.handler(data, publisherId);
      }
    }

    // Get subscribers
    const subscribers = this.getSubscribers(topic, publisherId, broadcast);

    // Create event message with sequence number
    const sequenceNumber = this.getNextSequence(topic);
    const eventMsg = MessageSerializer.create('event', {
      topic,
      data,
      sequenceNumber,
    });

    // Send to subscribers with backpressure handling
    for (const clientId of subscribers) {
      await this.sendWithBackpressure(clientId, eventMsg);
    }

    this.emit('published', { publisherId, topic, subscribers: subscribers.size, sequenceNumber });
  }

  /**
   * Get subscribers for a topic
   */
  private getSubscribers(topic: string, publisherId: string, broadcast: boolean): Set<string> {
    const subscribers = new Set<string>();

    // Exact matches
    const exactSubs = this.subscriptions.get(topic);
    if (exactSubs) {
      for (const clientId of exactSubs) {
        if (broadcast || clientId !== publisherId) {
          subscribers.add(clientId);
        }
      }
    }

    // Pattern matches
    if (this.options.enablePatterns) {
      for (const [pattern, clients] of this.patterns.entries()) {
        if (this.matchPattern(pattern, topic)) {
          for (const clientId of clients) {
            if (broadcast || clientId !== publisherId) {
              subscribers.add(clientId);
            }
          }
        }
      }
    }

    return subscribers;
  }

  /**
   * Send message with backpressure handling
   */
  private async sendWithBackpressure(clientId: string, message: EventMessage): Promise<void> {
    const client = this.server.getClient(clientId);
    if (!client) return;

    // Check queue size
    const queue = this.messageQueue.get(clientId) || [];
    if (queue.length >= this.options.queueSize!) {
      // Drop oldest message
      queue.shift();
      this.emit('message-dropped', { clientId, topic: message.topic });
    }

    // Add to queue
    queue.push(message);
    this.messageQueue.set(clientId, queue);

    // Try to send
    await this.flushQueue(clientId);
  }

  /**
   * Flush message queue for client
   */
  private async flushQueue(clientId: string): Promise<void> {
    const queue = this.messageQueue.get(clientId);
    if (!queue || queue.length === 0) return;

    const client = this.server.getClient(clientId);
    if (!client) return;

    // Send messages in order
    while (queue.length > 0) {
      const message = queue[0];
      const sent = this.server.sendMessage(clientId, message);

      if (sent) {
        queue.shift();
      } else {
        // Can't send, backpressure
        break;
      }
    }

    if (queue.length === 0) {
      this.messageQueue.delete(clientId);
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    // Remove from all subscriptions
    for (const clients of this.subscriptions.values()) {
      clients.delete(clientId);
    }

    for (const clients of this.patterns.values()) {
      clients.delete(clientId);
    }

    // Clear message queue
    this.messageQueue.delete(clientId);
  }

  /**
   * Check if topic is a pattern
   */
  private isPattern(topic: string): boolean {
    return topic.includes('*') || topic.includes('#');
  }

  /**
   * Match pattern against topic
   * Supports:
   * - * matches one segment
   * - # matches multiple segments
   * - Example: agent/star/status matches agent/123/status
   * - Example: agent/# matches agent/123/status/health
   * - Supports both / and . as delimiters
   */
  private matchPattern(pattern: string, topic: string): boolean {
    // Auto-detect delimiter (prefer / over .)
    const delimiter = pattern.includes('/') || topic.includes('/') ? '/' : '.';
    const patternParts = pattern.split(delimiter);
    const topicParts = topic.split(delimiter);

    let pi = 0;
    let ti = 0;

    while (pi < patternParts.length && ti < topicParts.length) {
      const pp = patternParts[pi];

      if (pp === '#') {
        // Multi-segment wildcard
        if (pi === patternParts.length - 1) {
          // Last segment, matches everything remaining
          return true;
        }
        // Try to match next pattern segment
        pi++;
        const nextPp = patternParts[pi];
        while (ti < topicParts.length && topicParts[ti] !== nextPp) {
          ti++;
        }
      } else if (pp === '*') {
        // Single-segment wildcard
        pi++;
        ti++;
      } else if (pp === topicParts[ti]) {
        // Exact match
        pi++;
        ti++;
      } else {
        // No match
        return false;
      }
    }

    return pi === patternParts.length && ti === topicParts.length;
  }

  /**
   * Get next sequence number for topic
   */
  private getNextSequence(topic: string): number {
    const current = this.sequenceNumbers.get(topic) || 0;
    const next = current + 1;
    this.sequenceNumbers.set(topic, next);
    return next;
  }

  /**
   * Get client subscriptions
   */
  private getClientSubscriptions(clientId: string): string[] {
    const subs: string[] = [];

    for (const [topic, clients] of this.subscriptions.entries()) {
      if (clients.has(clientId)) {
        subs.push(topic);
      }
    }

    for (const [pattern, clients] of this.patterns.entries()) {
      if (clients.has(clientId)) {
        subs.push(pattern);
      }
    }

    return subs;
  }

  /**
   * Get topic subscribers
   */
  getTopicSubscribers(topic: string): string[] {
    const subscribers = this.subscriptions.get(topic);
    return subscribers ? Array.from(subscribers) : [];
  }

  /**
   * Get all subscriptions
   */
  getAllSubscriptions(): Map<string, string[]> {
    const result = new Map<string, string[]>();

    for (const [topic, clients] of this.subscriptions.entries()) {
      result.set(topic, Array.from(clients));
    }

    return result;
  }

  /**
   * Publish to topic
   */
  async publish(topic: string, data: unknown, publisherId: string = 'server'): Promise<void> {
    await this.handlePublish(publisherId, topic, data, true);
  }
}
