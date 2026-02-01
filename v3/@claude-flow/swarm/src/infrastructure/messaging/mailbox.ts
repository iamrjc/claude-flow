/**
 * Agent Mailbox
 * Per-agent message queue with priority ordering and acknowledgment
 */

import { EventEmitter } from 'events';
import { Message, MessagePriority } from '../../domain/models/message.js';

// ===== PRIORITY QUEUE =====

interface QueuedMessage {
  message: Message;
  enqueuedAt: Date;
  attempts: number;
  acknowledged: boolean;
}

class PriorityQueue {
  private queues: Map<MessagePriority, QueuedMessage[]> = new Map([
    [MessagePriority.CRITICAL, []],
    [MessagePriority.HIGH, []],
    [MessagePriority.NORMAL, []],
    [MessagePriority.LOW, []],
  ]);

  enqueue(item: QueuedMessage): void {
    const queue = this.queues.get(item.message.priority)!;
    queue.push(item);
  }

  dequeue(): QueuedMessage | undefined {
    // Dequeue from highest priority non-empty queue
    for (const priority of [
      MessagePriority.CRITICAL,
      MessagePriority.HIGH,
      MessagePriority.NORMAL,
      MessagePriority.LOW,
    ]) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue.shift();
      }
    }
    return undefined;
  }

  peek(): QueuedMessage | undefined {
    for (const priority of [
      MessagePriority.CRITICAL,
      MessagePriority.HIGH,
      MessagePriority.NORMAL,
      MessagePriority.LOW,
    ]) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return undefined;
  }

  size(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
  }

  getAll(): QueuedMessage[] {
    const all: QueuedMessage[] = [];
    for (const priority of [
      MessagePriority.CRITICAL,
      MessagePriority.HIGH,
      MessagePriority.NORMAL,
      MessagePriority.LOW,
    ]) {
      all.push(...this.queues.get(priority)!);
    }
    return all;
  }
}

// ===== MAILBOX =====

export interface MailboxConfig {
  maxSize?: number;
  maxRetries?: number;
  ackTimeoutMs?: number;
  cleanupIntervalMs?: number;
}

export interface MailboxStats {
  totalReceived: number;
  totalDelivered: number;
  totalExpired: number;
  currentSize: number;
  oldestMessageAge: number;
  averageWaitTime: number;
}

export class Mailbox extends EventEmitter {
  private readonly agentId: string;
  private readonly queue: PriorityQueue;
  private readonly config: Required<MailboxConfig>;
  private stats: MailboxStats = {
    totalReceived: 0,
    totalDelivered: 0,
    totalExpired: 0,
    currentSize: 0,
    oldestMessageAge: 0,
    averageWaitTime: 0,
  };
  private cleanupInterval?: NodeJS.Timeout;
  private pendingAcks: Map<string, NodeJS.Timeout> = new Map();

  constructor(agentId: string, config: MailboxConfig = {}) {
    super();
    this.agentId = agentId;
    this.queue = new PriorityQueue();
    this.config = {
      maxSize: config.maxSize ?? 1000,
      maxRetries: config.maxRetries ?? 3,
      ackTimeoutMs: config.ackTimeoutMs ?? 30000,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60000,
    };

    this.startCleanup();
  }

  // ===== MESSAGE OPERATIONS =====

  enqueue(message: Message): boolean {
    // Check if mailbox is full
    if (this.queue.size() >= this.config.maxSize) {
      this.emit('mailbox.full', {
        agentId: this.agentId,
        messageId: message.id.toString(),
      });
      return false;
    }

    const queuedMessage: QueuedMessage = {
      message,
      enqueuedAt: new Date(),
      attempts: 0,
      acknowledged: false,
    };

    this.queue.enqueue(queuedMessage);
    this.stats.totalReceived++;
    this.stats.currentSize = this.queue.size();

    this.emit('message.enqueued', {
      agentId: this.agentId,
      messageId: message.id.toString(),
      priority: message.priority,
    });

    return true;
  }

  dequeue(): Message | undefined {
    const item = this.queue.dequeue();
    if (!item) return undefined;

    item.attempts++;
    this.stats.totalDelivered++;
    this.stats.currentSize = this.queue.size();

    const waitTime = Date.now() - item.enqueuedAt.getTime();
    this.updateAverageWaitTime(waitTime);

    // Set up acknowledgment timeout
    this.setupAckTimeout(item);

    this.emit('message.dequeued', {
      agentId: this.agentId,
      messageId: item.message.id.toString(),
      waitTime,
    });

    return item.message;
  }

  peek(): Message | undefined {
    const item = this.queue.peek();
    return item?.message;
  }

  acknowledge(messageId: string): void {
    // Clear acknowledgment timeout
    const timeout = this.pendingAcks.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAcks.delete(messageId);
    }

    this.emit('message.acknowledged', {
      agentId: this.agentId,
      messageId,
    });
  }

  // ===== QUERY METHODS =====

  getSize(): number {
    return this.queue.size();
  }

  isEmpty(): boolean {
    return this.queue.size() === 0;
  }

  isFull(): boolean {
    return this.queue.size() >= this.config.maxSize;
  }

  getStats(): MailboxStats {
    // Update oldest message age
    const oldest = this.queue.peek();
    if (oldest) {
      this.stats.oldestMessageAge = Date.now() - oldest.enqueuedAt.getTime();
    } else {
      this.stats.oldestMessageAge = 0;
    }

    return { ...this.stats };
  }

  // ===== BATCH OPERATIONS =====

  dequeueBatch(count: number): Message[] {
    const messages: Message[] = [];

    for (let i = 0; i < count && !this.isEmpty(); i++) {
      const message = this.dequeue();
      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  peekBatch(count: number): Message[] {
    const all = this.queue.getAll();
    return all.slice(0, count).map(item => item.message);
  }

  // ===== CLEANUP =====

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredMessages();
    }, this.config.cleanupIntervalMs);
  }

  private cleanupExpiredMessages(): void {
    const all = this.queue.getAll();
    let expiredCount = 0;

    for (const item of all) {
      if (item.message.isExpired()) {
        expiredCount++;
      }
    }

    // Rebuild queue without expired messages
    if (expiredCount > 0) {
      const newQueue = new PriorityQueue();
      for (const item of all) {
        if (!item.message.isExpired()) {
          newQueue.enqueue(item);
        }
      }

      this.queue.clear();
      for (const item of newQueue.getAll()) {
        this.queue.enqueue(item);
      }

      this.stats.totalExpired += expiredCount;
      this.stats.currentSize = this.queue.size();

      this.emit('cleanup.completed', {
        agentId: this.agentId,
        expiredCount,
      });
    }
  }

  private setupAckTimeout(item: QueuedMessage): void {
    const timeout = setTimeout(() => {
      if (!item.acknowledged && item.attempts < this.config.maxRetries) {
        // Re-enqueue for retry
        this.queue.enqueue(item);

        this.emit('message.retry', {
          agentId: this.agentId,
          messageId: item.message.id.toString(),
          attempt: item.attempts,
        });
      } else if (item.attempts >= this.config.maxRetries) {
        this.emit('message.max_retries', {
          agentId: this.agentId,
          messageId: item.message.id.toString(),
        });
      }

      this.pendingAcks.delete(item.message.id.toString());
    }, this.config.ackTimeoutMs);

    this.pendingAcks.set(item.message.id.toString(), timeout);
  }

  private updateAverageWaitTime(waitTime: number): void {
    const alpha = 0.2;
    this.stats.averageWaitTime =
      alpha * waitTime + (1 - alpha) * this.stats.averageWaitTime;
  }

  // ===== SHUTDOWN =====

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // Clear all pending acks
    for (const timeout of this.pendingAcks.values()) {
      clearTimeout(timeout);
    }
    this.pendingAcks.clear();

    this.queue.clear();
    this.stats.currentSize = 0;

    this.emit('shutdown', { agentId: this.agentId });
  }
}

// ===== FACTORY =====

export function createMailbox(agentId: string, config?: MailboxConfig): Mailbox {
  return new Mailbox(agentId, config);
}
