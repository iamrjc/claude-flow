/**
 * WebSocket Protocol Message Types
 * Version-negotiated message format with serialization support
 */

export const PROTOCOL_VERSION = '1.0.0';

export type MessageType =
  | 'ping'
  | 'pong'
  | 'subscribe'
  | 'unsubscribe'
  | 'publish'
  | 'event'
  | 'ack'
  | 'error'
  | 'auth'
  | 'version-negotiation';

export interface BaseMessage {
  id: string;
  type: MessageType;
  version: string;
  timestamp: number;
}

export interface PingMessage extends BaseMessage {
  type: 'ping';
}

export interface PongMessage extends BaseMessage {
  type: 'pong';
  latency?: number;
}

export interface SubscribeMessage extends BaseMessage {
  type: 'subscribe';
  topics: string[];
  patterns?: string[];
}

export interface UnsubscribeMessage extends BaseMessage {
  type: 'unsubscribe';
  topics: string[];
}

export interface PublishMessage extends BaseMessage {
  type: 'publish';
  topic: string;
  data: unknown;
  broadcast?: boolean;
}

export interface EventMessage extends BaseMessage {
  type: 'event';
  topic: string;
  data: unknown;
  sequenceNumber?: number;
}

export interface AckMessage extends BaseMessage {
  type: 'ack';
  messageId: string;
  success: boolean;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: string;
  message: string;
  details?: unknown;
}

export interface AuthMessage extends BaseMessage {
  type: 'auth';
  token: string;
  metadata?: Record<string, unknown>;
}

export interface VersionNegotiationMessage extends BaseMessage {
  type: 'version-negotiation';
  supportedVersions: string[];
  selectedVersion?: string;
}

export type Message =
  | PingMessage
  | PongMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | PublishMessage
  | EventMessage
  | AckMessage
  | ErrorMessage
  | AuthMessage
  | VersionNegotiationMessage;

/**
 * Message serialization
 */
export class MessageSerializer {
  /**
   * Serialize a message to JSON string
   */
  static serialize(message: Message): string {
    return JSON.stringify(message);
  }

  /**
   * Deserialize JSON string to message
   */
  static deserialize(data: string): Message {
    const parsed = JSON.parse(data);

    // Validate required fields
    if (!parsed.id || !parsed.type || !parsed.version || !parsed.timestamp) {
      throw new Error('Invalid message format: missing required fields');
    }

    return parsed as Message;
  }

  /**
   * Create a new message with defaults
   */
  static create<T extends MessageType>(
    type: T,
    partial: Partial<Extract<Message, { type: T }>>
  ): Extract<Message, { type: T }> {
    return {
      id: MessageSerializer.generateId(),
      type,
      version: PROTOCOL_VERSION,
      timestamp: Date.now(),
      ...partial,
    } as Extract<Message, { type: T }>;
  }

  /**
   * Generate unique message ID
   */
  static generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Version negotiation
 */
export class VersionNegotiator {
  private static readonly SUPPORTED_VERSIONS = ['1.0.0'];

  /**
   * Check if version is supported
   */
  static isSupported(version: string): boolean {
    return this.SUPPORTED_VERSIONS.includes(version);
  }

  /**
   * Select best version from client list
   */
  static selectVersion(clientVersions: string[]): string | null {
    // Find highest supported version that client also supports
    for (const version of this.SUPPORTED_VERSIONS) {
      if (clientVersions.includes(version)) {
        return version;
      }
    }
    return null;
  }

  /**
   * Create version negotiation message
   */
  static createNegotiationMessage(selectedVersion?: string): VersionNegotiationMessage {
    return MessageSerializer.create('version-negotiation', {
      supportedVersions: this.SUPPORTED_VERSIONS,
      selectedVersion,
    });
  }
}

/**
 * Message validation
 */
export class MessageValidator {
  /**
   * Validate message structure
   */
  static validate(message: unknown): message is Message {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const msg = message as Partial<Message>;

    // Check required base fields
    if (
      typeof msg.id !== 'string' ||
      typeof msg.type !== 'string' ||
      typeof msg.version !== 'string' ||
      typeof msg.timestamp !== 'number'
    ) {
      return false;
    }

    // Type-specific validation
    switch (msg.type) {
      case 'subscribe':
      case 'unsubscribe':
        return Array.isArray((msg as SubscribeMessage).topics);

      case 'publish':
      case 'event':
        return typeof (msg as PublishMessage).topic === 'string';

      case 'ack':
        return typeof (msg as AckMessage).messageId === 'string' &&
               typeof (msg as AckMessage).success === 'boolean';

      case 'error':
        return typeof (msg as ErrorMessage).code === 'string' &&
               typeof (msg as ErrorMessage).message === 'string';

      case 'auth':
        return typeof (msg as AuthMessage).token === 'string';

      case 'version-negotiation':
        return Array.isArray((msg as VersionNegotiationMessage).supportedVersions);

      case 'ping':
      case 'pong':
        return true;

      default:
        return false;
    }
  }
}

/**
 * Error codes
 */
export const ErrorCodes = {
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  SUBSCRIPTION_FAILED: 'SUBSCRIPTION_FAILED',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
