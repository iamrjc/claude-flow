/**
 * Event-Based Message Bus
 * EventEmitter-based implementation of IMessageBus
 */

import { EventEmitter } from 'events';
import {
  IMessageBus,
  MessageHandler,
  RequestOptions,
  MessageBusStats,
  TopicSubscription,
} from '../../domain/interfaces/message-bus.js';
import {
  Message,
  MessageCreateParams,
  MessageId,
  MessageType,
  MessagePriority,
} from '../../domain/models/message.js';

// ===== EVENT MESSAGE BUS =====

export class EventMessageBus extends EventEmitter implements IMessageBus {
  private topics: Map<string, Set<TopicSubscription>> = new Map();
  private pendingMessages: Map<string, Message[]> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private deadLetterQueue: Message[] = [];
  private stats: MessageBusStats = {
    totalMessages: 0,
    messagesPerSecond: 0,
    pendingMessages: 0,
    topicCount: 0,
    subscriberCount: 0,
    averageDeliveryTime: 0,
  };
  private statsInterval?: NodeJS.Timeout;
  private messageHistory: Array<{ timestamp: number; count: number }> = [];

  constructor() {
    super();
    this.startStatsCollection();
  }

  // ===== PUBLISH/SUBSCRIBE =====

  async publish(topic: string, message: MessageCreateParams): Promise<string> {
    const fullMessage = Message.create(message);

    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set());
      this.stats.topicCount++;
    }

    const subscribers = this.topics.get(topic)!;

    // Deliver to all subscribers
    const deliveryPromises: Promise<void>[] = [];
    for (const subscription of subscribers) {
      deliveryPromises.push(this.deliverToSubscriber(subscription, fullMessage));
    }

    await Promise.allSettled(deliveryPromises);

    this.stats.totalMessages++;
    this.emit('message.published', {
      topic,
      messageId: fullMessage.id.toString(),
      subscriberCount: subscribers.size,
    });

    return fullMessage.id.toString();
  }

  subscribe(topic: string, agentId: string, handler: MessageHandler): void {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set());
      this.stats.topicCount++;
    }

    const subscription: TopicSubscription = {
      topic,
      agentId,
      handler,
    };

    this.topics.get(topic)!.add(subscription);
    this.stats.subscriberCount++;

    this.emit('subscription.added', { topic, agentId });
  }

  unsubscribe(topic: string, agentId: string): void {
    const subscribers = this.topics.get(topic);
    if (!subscribers) return;

    const toRemove = Array.from(subscribers).find(s => s.agentId === agentId);
    if (toRemove) {
      subscribers.delete(toRemove);
      this.stats.subscriberCount--;

      if (subscribers.size === 0) {
        this.topics.delete(topic);
        this.stats.topicCount--;
      }

      this.emit('subscription.removed', { topic, agentId });
    }
  }

  // ===== REQUEST/RESPONSE =====

  async request<TResponse = unknown>(
    params: MessageCreateParams,
    options?: RequestOptions
  ): Promise<TResponse> {
    const timeout = options?.timeout ?? 30000;
    const retries = options?.retries ?? 3;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this.executeRequest<TResponse>(params, timeout);
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  private async executeRequest<TResponse>(
    params: MessageCreateParams,
    timeout: number
  ): Promise<TResponse> {
    const requestMessage = Message.create({
      ...params,
      type: MessageType.REQUEST,
      replyTo: params.from,
    });

    // Set up response listener
    const responsePromise = new Promise<TResponse>((resolve, reject) => {
      const pending: PendingRequest = {
        requestId: requestMessage.id.toString(),
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pendingRequests.delete(requestMessage.id.toString());
          reject(new Error('Request timeout'));
        }, timeout),
      };

      this.pendingRequests.set(requestMessage.id.toString(), pending);
    });

    // Send request
    await this.sendDirect({
      ...params,
      type: MessageType.REQUEST,
      replyTo: params.from,
    });

    return responsePromise;
  }

  // ===== DIRECT MESSAGING =====

  async sendDirect(message: MessageCreateParams): Promise<string> {
    const fullMessage = Message.create(message);

    if (Array.isArray(message.to)) {
      throw new Error('Direct messages must have a single recipient');
    }

    // Add to recipient's pending messages
    if (!this.pendingMessages.has(message.to)) {
      this.pendingMessages.set(message.to, []);
    }

    this.pendingMessages.get(message.to)!.push(fullMessage);
    this.stats.totalMessages++;
    this.stats.pendingMessages++;

    // Check if this is a response to a pending request
    if (fullMessage.isResponse() && fullMessage.correlationId) {
      const pending = this.pendingRequests.get(fullMessage.correlationId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(fullMessage.correlationId);
        pending.resolve(fullMessage.payload);
      }
    }

    this.emit('message.sent', {
      messageId: fullMessage.id.toString(),
      from: message.from,
      to: message.to,
    });

    return fullMessage.id.toString();
  }

  // ===== BROADCAST =====

  async broadcast(message: Omit<MessageCreateParams, 'to'>): Promise<string> {
    const fullMessage = Message.create({
      ...message,
      to: 'broadcast',
      type: MessageType.BROADCAST,
    });

    // Deliver to all agents with pending message queues
    const deliveryPromises: Promise<void>[] = [];

    for (const agentId of this.pendingMessages.keys()) {
      if (agentId !== message.from) {
        this.pendingMessages.get(agentId)!.push(fullMessage);
        this.stats.pendingMessages++;
      }
    }

    this.stats.totalMessages++;

    this.emit('message.broadcast', {
      messageId: fullMessage.id.toString(),
      from: message.from,
      recipientCount: this.pendingMessages.size,
    });

    return fullMessage.id.toString();
  }

  // ===== MESSAGE RETRIEVAL =====

  getPendingMessages(agentId: string): Message[] {
    const messages = this.pendingMessages.get(agentId) ?? [];
    this.pendingMessages.set(agentId, []);
    this.stats.pendingMessages = Math.max(0, this.stats.pendingMessages - messages.length);

    // Filter expired messages
    const now = Date.now();
    const validMessages = messages.filter(msg => {
      if (msg.isExpired()) {
        this.deadLetterQueue.push(msg);
        return false;
      }
      return true;
    });

    return validMessages;
  }

  async acknowledge(messageId: string, agentId: string): Promise<void> {
    this.emit('message.acknowledged', { messageId, agentId });
  }

  // ===== STATS =====

  getStats(): MessageBusStats {
    return { ...this.stats };
  }

  private startStatsCollection(): void {
    this.statsInterval = setInterval(() => {
      this.calculateMessagesPerSecond();
    }, 1000);
  }

  private calculateMessagesPerSecond(): void {
    const now = Date.now();
    const entry = { timestamp: now, count: this.stats.totalMessages };

    this.messageHistory.push(entry);

    // Keep only last 60 seconds
    this.messageHistory = this.messageHistory.filter(
      h => now - h.timestamp < 60000
    );

    if (this.messageHistory.length >= 2) {
      const oldest = this.messageHistory[0];
      const seconds = (now - oldest.timestamp) / 1000;
      const messages = entry.count - oldest.count;
      this.stats.messagesPerSecond = seconds > 0 ? messages / seconds : 0;
    }
  }

  // ===== DELIVERY =====

  private async deliverToSubscriber(
    subscription: TopicSubscription,
    message: Message
  ): Promise<void> {
    const startTime = Date.now();

    try {
      await subscription.handler(message);

      const deliveryTime = Date.now() - startTime;
      this.updateAverageDeliveryTime(deliveryTime);

      this.emit('message.delivered', {
        messageId: message.id.toString(),
        agentId: subscription.agentId,
        deliveryTime,
      });
    } catch (error) {
      this.emit('message.delivery_failed', {
        messageId: message.id.toString(),
        agentId: subscription.agentId,
        error: (error as Error).message,
      });

      this.deadLetterQueue.push(message);
    }
  }

  private updateAverageDeliveryTime(deliveryTime: number): void {
    const alpha = 0.2;
    this.stats.averageDeliveryTime =
      alpha * deliveryTime + (1 - alpha) * this.stats.averageDeliveryTime;
  }

  // ===== DEAD LETTER QUEUE =====

  getDeadLetterQueue(): Message[] {
    return [...this.deadLetterQueue];
  }

  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }

  // ===== SHUTDOWN =====

  async shutdown(): Promise<void> {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = undefined;
    }

    // Clear all pending requests
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Message bus shutdown'));
    }

    this.topics.clear();
    this.pendingMessages.clear();
    this.pendingRequests.clear();
    this.deadLetterQueue = [];

    this.emit('shutdown');
  }
}

// ===== TYPES =====

interface PendingRequest {
  requestId: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// ===== FACTORY =====

export function createEventMessageBus(): EventMessageBus {
  return new EventMessageBus();
}
