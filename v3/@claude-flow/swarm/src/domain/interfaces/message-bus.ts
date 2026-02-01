/**
 * Message Bus Interface
 * Defines the contract for inter-agent messaging
 */

import { Message, MessageCreateParams } from '../models/message.js';

// ===== MESSAGE BUS INTERFACE =====

export interface IMessageBus {
  /**
   * Publish a message to a topic
   */
  publish(topic: string, message: MessageCreateParams): Promise<string>;

  /**
   * Subscribe to a topic
   */
  subscribe(topic: string, agentId: string, handler: MessageHandler): void;

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topic: string, agentId: string): void;

  /**
   * Send a request and wait for response (request-response pattern)
   */
  request<TResponse = unknown>(
    params: MessageCreateParams,
    options?: RequestOptions
  ): Promise<TResponse>;

  /**
   * Send a direct message to an agent
   */
  sendDirect(message: MessageCreateParams): Promise<string>;

  /**
   * Broadcast a message to all subscribers
   */
  broadcast(message: Omit<MessageCreateParams, 'to'>): Promise<string>;

  /**
   * Get pending messages for an agent
   */
  getPendingMessages(agentId: string): Message[];

  /**
   * Acknowledge message receipt
   */
  acknowledge(messageId: string, agentId: string): Promise<void>;

  /**
   * Get message bus statistics
   */
  getStats(): MessageBusStats;

  /**
   * Shutdown the message bus
   */
  shutdown(): Promise<void>;
}

// ===== TYPES =====

export type MessageHandler = (message: Message) => void | Promise<void>;

export interface RequestOptions {
  timeout?: number;
  retries?: number;
}

export interface MessageBusStats {
  totalMessages: number;
  messagesPerSecond: number;
  pendingMessages: number;
  topicCount: number;
  subscriberCount: number;
  averageDeliveryTime: number;
}

// ===== TOPIC ROUTING =====

export interface TopicSubscription {
  topic: string;
  agentId: string;
  handler: MessageHandler;
  filter?: MessageFilter;
}

export interface MessageFilter {
  types?: string[];
  priorities?: string[];
  fromAgents?: string[];
}

// ===== MESSAGE QUEUE =====

export interface MessageQueue {
  enqueue(message: Message): void;
  dequeue(): Message | undefined;
  peek(): Message | undefined;
  size(): number;
  clear(): void;
}

// ===== DELIVERY OPTIONS =====

export interface DeliveryOptions {
  guaranteed?: boolean;
  ordered?: boolean;
  deduplication?: boolean;
  compression?: boolean;
}

// ===== EVENTS =====

export interface MessageBusEvent {
  type: MessageBusEventType;
  timestamp: Date;
  data: unknown;
}

export enum MessageBusEventType {
  MESSAGE_PUBLISHED = 'message_published',
  MESSAGE_DELIVERED = 'message_delivered',
  MESSAGE_FAILED = 'message_failed',
  SUBSCRIPTION_ADDED = 'subscription_added',
  SUBSCRIPTION_REMOVED = 'subscription_removed',
  TOPIC_CREATED = 'topic_created',
  TOPIC_REMOVED = 'topic_removed',
}
