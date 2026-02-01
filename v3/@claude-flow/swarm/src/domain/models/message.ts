/**
 * Inter-Agent Message Domain Model
 * Defines message structure for agent communication
 */

// ===== VALUE OBJECTS =====

export class MessageId {
  private constructor(public readonly value: string) {}

  static create(): MessageId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 12);
    return new MessageId(`msg_${timestamp}_${random}`);
  }

  static from(value: string): MessageId {
    if (!value || typeof value !== 'string') {
      throw new Error('Invalid message ID');
    }
    return new MessageId(value);
  }

  equals(other: MessageId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// ===== ENUMS =====

export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  BROADCAST = 'broadcast',
  NOTIFICATION = 'notification',
}

export enum MessagePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

// ===== MESSAGE ENTITY =====

export class Message {
  private constructor(
    public readonly id: MessageId,
    public readonly from: string,
    public readonly to: string | string[],
    public readonly type: MessageType,
    public readonly payload: unknown,
    public readonly timestamp: Date,
    public readonly priority: MessagePriority,
    public readonly ttlMs: number,
    public readonly correlationId?: string,
    public readonly replyTo?: string,
    public readonly metadata: Record<string, unknown> = {}
  ) {}

  static create(params: MessageCreateParams): Message {
    return new Message(
      MessageId.create(),
      params.from,
      params.to,
      params.type,
      params.payload,
      new Date(),
      params.priority ?? MessagePriority.NORMAL,
      params.ttlMs ?? 60000,
      params.correlationId,
      params.replyTo,
      params.metadata ?? {}
    );
  }

  static fromSnapshot(snapshot: MessageSnapshot): Message {
    return new Message(
      MessageId.from(snapshot.id),
      snapshot.from,
      snapshot.to,
      snapshot.type,
      snapshot.payload,
      new Date(snapshot.timestamp),
      snapshot.priority,
      snapshot.ttlMs,
      snapshot.correlationId,
      snapshot.replyTo,
      snapshot.metadata
    );
  }

  // ===== QUERY METHODS =====

  isExpired(): boolean {
    return Date.now() - this.timestamp.getTime() > this.ttlMs;
  }

  isBroadcast(): boolean {
    return this.type === MessageType.BROADCAST || Array.isArray(this.to);
  }

  isDirectMessage(): boolean {
    return !this.isBroadcast() && typeof this.to === 'string';
  }

  isRequest(): boolean {
    return this.type === MessageType.REQUEST;
  }

  isResponse(): boolean {
    return this.type === MessageType.RESPONSE;
  }

  hasCorrelation(): boolean {
    return this.correlationId !== undefined;
  }

  getRecipients(): string[] {
    return Array.isArray(this.to) ? this.to : [this.to];
  }

  shouldReply(): boolean {
    return this.replyTo !== undefined;
  }

  // ===== RESPONSE CREATION =====

  createResponse(payload: unknown, metadata?: Record<string, unknown>): Message {
    if (!this.shouldReply()) {
      throw new Error('Message does not require a reply');
    }

    return Message.create({
      from: this.to as string,
      to: this.replyTo!,
      type: MessageType.RESPONSE,
      payload,
      priority: this.priority,
      ttlMs: this.ttlMs,
      correlationId: this.id.toString(),
      metadata: metadata ?? {},
    });
  }

  // ===== SNAPSHOT =====

  toSnapshot(): MessageSnapshot {
    return {
      id: this.id.toString(),
      from: this.from,
      to: this.to,
      type: this.type,
      payload: this.payload,
      timestamp: this.timestamp.toISOString(),
      priority: this.priority,
      ttlMs: this.ttlMs,
      correlationId: this.correlationId,
      replyTo: this.replyTo,
      metadata: this.metadata,
    };
  }
}

// ===== CREATION PARAMETERS =====

export interface MessageCreateParams {
  from: string;
  to: string | string[];
  type: MessageType;
  payload: unknown;
  priority?: MessagePriority;
  ttlMs?: number;
  correlationId?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

// ===== SERIALIZATION TYPES =====

export interface MessageSnapshot {
  id: string;
  from: string;
  to: string | string[];
  type: MessageType;
  payload: unknown;
  timestamp: string;
  priority: MessagePriority;
  ttlMs: number;
  correlationId?: string;
  replyTo?: string;
  metadata: Record<string, unknown>;
}

// ===== REQUEST-RESPONSE PATTERN =====

export interface RequestOptions {
  timeout?: number;
  retries?: number;
}

export interface MessageEnvelope {
  message: Message;
  deliveredAt?: Date;
  acknowledgedAt?: Date;
  error?: Error;
}
