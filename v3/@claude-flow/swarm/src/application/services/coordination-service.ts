/**
 * Coordination Service
 * Application service for managing coordination sessions
 */

import { EventEmitter } from 'events';
import {
  CoordinationSession,
  SessionId,
  SessionState,
  Participant,
} from '../../domain/models/coordination-session.js';
import {
  Message,
  MessageCreateParams,
  MessageType,
  MessagePriority,
} from '../../domain/models/message.js';
import {
  Proposal,
  ConsensusResult,
  ConsensusAlgorithm,
  Vote,
} from '../../domain/models/consensus.js';
import { IMessageBus } from '../../domain/interfaces/message-bus.js';

// ===== CONFIGURATION =====

export interface CoordinationConfig {
  defaultSessionTimeout?: number;
  maxParticipants?: number;
  messageBus: IMessageBus;
  consensusService: IConsensusService;
}

// ===== COORDINATION SERVICE =====

export class CoordinationService extends EventEmitter {
  private sessions: Map<string, CoordinationSession> = new Map();
  private readonly config: Required<CoordinationConfig>;

  constructor(config: CoordinationConfig) {
    super();
    this.config = {
      defaultSessionTimeout: config.defaultSessionTimeout ?? 3600000, // 1 hour
      maxParticipants: config.maxParticipants ?? 100,
      messageBus: config.messageBus,
      consensusService: config.consensusService,
    };
  }

  // ===== SESSION MANAGEMENT =====

  async createSession(options?: CreateSessionOptions): Promise<SessionId> {
    const session = CoordinationSession.create(
      options?.namespace,
      options?.metadata
    );

    this.sessions.set(session.id.toString(), session);

    // Set up automatic cleanup
    if (options?.timeoutMs ?? this.config.defaultSessionTimeout) {
      const timeout = options?.timeoutMs ?? this.config.defaultSessionTimeout;
      setTimeout(() => {
        this.cleanupSession(session.id.toString());
      }, timeout);
    }

    this.emit('session.created', {
      sessionId: session.id.toString(),
      namespace: options?.namespace,
    });

    return session.id;
  }

  async joinSession(sessionId: SessionId, agentId: string, role: Participant['role']): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    if (session.getParticipantCount() >= this.config.maxParticipants) {
      throw new Error(`Session ${sessionId} has reached maximum participants`);
    }

    session.addParticipant(agentId, role);

    // Notify other participants
    await this.broadcastMessage(sessionId, {
      from: 'system',
      type: MessageType.NOTIFICATION,
      payload: {
        event: 'participant.joined',
        agentId,
        role,
      },
      priority: MessagePriority.NORMAL,
    });

    this.emit('participant.joined', {
      sessionId: sessionId.toString(),
      agentId,
      role,
    });
  }

  async leaveSession(sessionId: SessionId, agentId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    session.removeParticipant(agentId);

    // Notify other participants if any remain
    const participants = session.getActiveParticipants();
    if (participants.length > 0) {
      await this.broadcastMessage(sessionId, {
        from: 'system',
        type: MessageType.NOTIFICATION,
        payload: {
          event: 'participant.left',
          agentId,
        },
        priority: MessagePriority.NORMAL,
      });
    }

    this.emit('participant.left', {
      sessionId: sessionId.toString(),
      agentId,
    });
  }

  async startSession(sessionId: SessionId): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    session.start();

    await this.broadcastMessage(sessionId, {
      from: 'system',
      type: MessageType.NOTIFICATION,
      payload: {
        event: 'session.started',
      },
      priority: MessagePriority.HIGH,
    });

    this.emit('session.started', { sessionId: sessionId.toString() });
  }

  async pauseSession(sessionId: SessionId): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    session.pause();

    await this.broadcastMessage(sessionId, {
      from: 'system',
      type: MessageType.NOTIFICATION,
      payload: {
        event: 'session.paused',
      },
      priority: MessagePriority.HIGH,
    });

    this.emit('session.paused', { sessionId: sessionId.toString() });
  }

  async resumeSession(sessionId: SessionId): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    session.resume();

    await this.broadcastMessage(sessionId, {
      from: 'system',
      type: MessageType.NOTIFICATION,
      payload: {
        event: 'session.resumed',
      },
      priority: MessagePriority.HIGH,
    });

    this.emit('session.resumed', { sessionId: sessionId.toString() });
  }

  async completeSession(sessionId: SessionId): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    session.complete();

    await this.broadcastMessage(sessionId, {
      from: 'system',
      type: MessageType.NOTIFICATION,
      payload: {
        event: 'session.completed',
        metrics: session.metrics,
      },
      priority: MessagePriority.HIGH,
    });

    this.emit('session.completed', {
      sessionId: sessionId.toString(),
      metrics: session.metrics,
    });
  }

  // ===== MESSAGING =====

  async broadcastMessage(
    sessionId: SessionId,
    message: Omit<MessageCreateParams, 'to'>
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const participants = session.getActiveParticipants();

    if (participants.length === 0) {
      throw new Error('No active participants to broadcast to');
    }

    const messageId = await this.config.messageBus.broadcast({
      from: message.from,
      type: message.type,
      payload: message.payload,
      priority: message.priority,
      ttlMs: message.ttlMs,
      correlationId: message.correlationId,
      replyTo: message.replyTo,
      metadata: {
        ...message.metadata,
        sessionId: sessionId.toString(),
      },
    });

    session.incrementMessagesExchanged();

    this.emit('message.broadcast', {
      sessionId: sessionId.toString(),
      messageId,
      recipientCount: participants.length,
    });
  }

  async sendDirectMessage(
    sessionId: SessionId,
    from: string,
    to: string,
    message: Omit<MessageCreateParams, 'from' | 'to'>
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    if (!session.hasParticipant(from)) {
      throw new Error(`Sender ${from} is not a participant in session ${sessionId}`);
    }

    if (!session.hasParticipant(to)) {
      throw new Error(`Recipient ${to} is not a participant in session ${sessionId}`);
    }

    const messageId = await this.config.messageBus.sendDirect({
      ...message,
      from,
      to,
      metadata: {
        ...message.metadata,
        sessionId: sessionId.toString(),
      },
    });

    session.incrementMessagesExchanged();

    this.emit('message.sent', {
      sessionId: sessionId.toString(),
      messageId,
      from,
      to,
    });
  }

  // ===== CONSENSUS =====

  async requestConsensus(
    sessionId: SessionId,
    proposerId: string,
    value: unknown,
    algorithm?: ConsensusAlgorithm,
    timeoutMs?: number
  ): Promise<ConsensusResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!session.hasParticipant(proposerId)) {
      throw new Error(`Proposer ${proposerId} is not a participant in session ${sessionId}`);
    }

    const participants = session.getActiveParticipants();
    if (participants.length < 2) {
      throw new Error('Consensus requires at least 2 active participants');
    }

    // Request consensus through consensus service
    const result = await this.config.consensusService.requestConsensus({
      sessionId: sessionId.toString(),
      proposerId,
      value,
      participants: participants.map(p => p.agentId),
      algorithm: algorithm ?? ConsensusAlgorithm.RAFT,
      timeoutMs: timeoutMs ?? 30000,
    });

    // Update session metrics
    if (result.approved) {
      session.recordConsensusReached();
    } else {
      session.recordConsensusFailed();
    }

    this.emit('consensus.completed', {
      sessionId: sessionId.toString(),
      proposalId: result.proposalId,
      approved: result.approved,
    });

    return result;
  }

  // ===== HEARTBEAT =====

  async updateHeartbeat(sessionId: SessionId, agentId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    session.updateParticipantHeartbeat(agentId);
  }

  // ===== QUERY METHODS =====

  getSession(sessionId: SessionId): CoordinationSession | undefined {
    return this.sessions.get(sessionId.toString());
  }

  getSessionOrThrow(sessionId: SessionId): CoordinationSession {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  getAllSessions(): CoordinationSession[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(): CoordinationSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.state === SessionState.ACTIVE
    );
  }

  hasSession(sessionId: SessionId): boolean {
    return this.sessions.has(sessionId.toString());
  }

  // ===== CLEANUP =====

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.state === SessionState.ACTIVE || session.state === SessionState.PAUSED) {
      session.fail('Session timeout');
    }

    this.emit('session.cleaned_up', { sessionId });
  }

  async shutdown(): Promise<void> {
    // Complete all active sessions
    for (const session of this.sessions.values()) {
      if (session.state === SessionState.ACTIVE || session.state === SessionState.PAUSED) {
        session.fail('Service shutdown');
      }
    }

    this.sessions.clear();
    this.emit('shutdown');
  }
}

// ===== OPTIONS =====

export interface CreateSessionOptions {
  namespace?: string;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

// ===== CONSENSUS SERVICE INTERFACE =====

export interface IConsensusService {
  requestConsensus(params: ConsensusRequestParams): Promise<ConsensusResult>;
}

export interface ConsensusRequestParams {
  sessionId: string;
  proposerId: string;
  value: unknown;
  participants: string[];
  algorithm: ConsensusAlgorithm;
  timeoutMs: number;
}

// ===== FACTORY =====

export function createCoordinationService(config: CoordinationConfig): CoordinationService {
  return new CoordinationService(config);
}
