/**
 * Coordination Session Domain Model
 * Manages multi-agent coordination session state
 */

// ===== VALUE OBJECTS =====

export class SessionId {
  private constructor(public readonly value: string) {}

  static create(namespace: string = 'default'): SessionId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return new SessionId(`session_${namespace}_${timestamp}_${random}`);
  }

  static from(value: string): SessionId {
    if (!value || typeof value !== 'string') {
      throw new Error('Invalid session ID');
    }
    return new SessionId(value);
  }

  equals(other: SessionId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// ===== ENUMS =====

export enum SessionState {
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// ===== PARTICIPANT TRACKING =====

export interface Participant {
  readonly agentId: string;
  readonly joinedAt: Date;
  readonly role: 'coordinator' | 'worker' | 'observer';
  lastHeartbeat: Date;
  status: 'active' | 'idle' | 'disconnected';
  metadata: Record<string, unknown>;
}

export interface SessionMetrics {
  messagesExchanged: number;
  consensusReached: number;
  consensusFailed: number;
  averageResponseTime: number;
  participationRate: number;
}

// ===== COORDINATION SESSION ENTITY =====

export class CoordinationSession {
  private constructor(
    public readonly id: SessionId,
    private _state: SessionState,
    private readonly _participants: Map<string, Participant>,
    private readonly _createdAt: Date,
    private _completedAt?: Date,
    private _metrics: SessionMetrics = {
      messagesExchanged: 0,
      consensusReached: 0,
      consensusFailed: 0,
      averageResponseTime: 0,
      participationRate: 0,
    },
    private readonly _metadata: Record<string, unknown> = {}
  ) {}

  static create(namespace?: string, metadata?: Record<string, unknown>): CoordinationSession {
    return new CoordinationSession(
      SessionId.create(namespace),
      SessionState.INITIALIZING,
      new Map(),
      new Date(),
      undefined,
      {
        messagesExchanged: 0,
        consensusReached: 0,
        consensusFailed: 0,
        averageResponseTime: 0,
        participationRate: 0,
      },
      metadata ?? {}
    );
  }

  static fromSnapshot(snapshot: SessionSnapshot): CoordinationSession {
    const participants = new Map<string, Participant>();
    for (const [id, participant] of Object.entries(snapshot.participants)) {
      participants.set(id, {
        ...participant,
        joinedAt: new Date(participant.joinedAt),
        lastHeartbeat: new Date(participant.lastHeartbeat),
      });
    }

    return new CoordinationSession(
      SessionId.from(snapshot.id),
      snapshot.state,
      participants,
      new Date(snapshot.createdAt),
      snapshot.completedAt ? new Date(snapshot.completedAt) : undefined,
      snapshot.metrics,
      snapshot.metadata
    );
  }

  // ===== STATE MANAGEMENT =====

  get state(): SessionState {
    return this._state;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get completedAt(): Date | undefined {
    return this._completedAt;
  }

  get metrics(): Readonly<SessionMetrics> {
    return { ...this._metrics };
  }

  get metadata(): Readonly<Record<string, unknown>> {
    return { ...this._metadata };
  }

  start(): void {
    if (this._state !== SessionState.INITIALIZING) {
      throw new Error(`Cannot start session in state: ${this._state}`);
    }
    this._state = SessionState.ACTIVE;
  }

  pause(): void {
    if (this._state !== SessionState.ACTIVE) {
      throw new Error(`Cannot pause session in state: ${this._state}`);
    }
    this._state = SessionState.PAUSED;
  }

  resume(): void {
    if (this._state !== SessionState.PAUSED) {
      throw new Error(`Cannot resume session in state: ${this._state}`);
    }
    this._state = SessionState.ACTIVE;
  }

  complete(): void {
    if (this._state !== SessionState.ACTIVE && this._state !== SessionState.PAUSED) {
      throw new Error(`Cannot complete session in state: ${this._state}`);
    }
    this._state = SessionState.COMPLETED;
    this._completedAt = new Date();
  }

  fail(reason?: string): void {
    this._state = SessionState.FAILED;
    this._completedAt = new Date();
    if (reason) {
      this._metadata.failureReason = reason;
    }
  }

  // ===== PARTICIPANT MANAGEMENT =====

  addParticipant(agentId: string, role: Participant['role'], metadata?: Record<string, unknown>): void {
    if (this._participants.has(agentId)) {
      throw new Error(`Participant ${agentId} already exists`);
    }

    const participant: Participant = {
      agentId,
      joinedAt: new Date(),
      role,
      lastHeartbeat: new Date(),
      status: 'active',
      metadata: metadata ?? {},
    };

    this._participants.set(agentId, participant);
    this.updateParticipationRate();
  }

  removeParticipant(agentId: string): void {
    if (!this._participants.has(agentId)) {
      throw new Error(`Participant ${agentId} not found`);
    }

    this._participants.delete(agentId);
    this.updateParticipationRate();
  }

  updateParticipantHeartbeat(agentId: string): void {
    const participant = this._participants.get(agentId);
    if (!participant) {
      throw new Error(`Participant ${agentId} not found`);
    }

    participant.lastHeartbeat = new Date();
    participant.status = 'active';
  }

  updateParticipantStatus(agentId: string, status: Participant['status']): void {
    const participant = this._participants.get(agentId);
    if (!participant) {
      throw new Error(`Participant ${agentId} not found`);
    }

    participant.status = status;
    this.updateParticipationRate();
  }

  getParticipant(agentId: string): Participant | undefined {
    return this._participants.get(agentId);
  }

  getAllParticipants(): Participant[] {
    return Array.from(this._participants.values());
  }

  getActiveParticipants(): Participant[] {
    return Array.from(this._participants.values()).filter(p => p.status === 'active');
  }

  getParticipantCount(): number {
    return this._participants.size;
  }

  getActiveParticipantCount(): number {
    return this.getActiveParticipants().length;
  }

  hasParticipant(agentId: string): boolean {
    return this._participants.has(agentId);
  }

  // ===== METRICS MANAGEMENT =====

  incrementMessagesExchanged(): void {
    this._metrics.messagesExchanged++;
  }

  recordConsensusReached(): void {
    this._metrics.consensusReached++;
  }

  recordConsensusFailed(): void {
    this._metrics.consensusFailed++;
  }

  updateAverageResponseTime(responseTime: number): void {
    const alpha = 0.2; // Exponential moving average weight
    this._metrics.averageResponseTime =
      alpha * responseTime + (1 - alpha) * this._metrics.averageResponseTime;
  }

  private updateParticipationRate(): void {
    const total = this._participants.size;
    const active = this.getActiveParticipantCount();
    this._metrics.participationRate = total > 0 ? active / total : 1.0;
  }

  // ===== SNAPSHOT =====

  toSnapshot(): SessionSnapshot {
    const participants: Record<string, SerializableParticipant> = {};
    for (const [id, participant] of this._participants) {
      participants[id] = {
        agentId: participant.agentId,
        joinedAt: participant.joinedAt.toISOString(),
        role: participant.role,
        lastHeartbeat: participant.lastHeartbeat.toISOString(),
        status: participant.status,
        metadata: participant.metadata,
      };
    }

    return {
      id: this.id.toString(),
      state: this._state,
      participants,
      createdAt: this._createdAt.toISOString(),
      completedAt: this._completedAt?.toISOString(),
      metrics: this._metrics,
      metadata: this._metadata,
    };
  }
}

// ===== SERIALIZATION TYPES =====

interface SerializableParticipant {
  agentId: string;
  joinedAt: string;
  role: 'coordinator' | 'worker' | 'observer';
  lastHeartbeat: string;
  status: 'active' | 'idle' | 'disconnected';
  metadata: Record<string, unknown>;
}

export interface SessionSnapshot {
  id: string;
  state: SessionState;
  participants: Record<string, SerializableParticipant>;
  createdAt: string;
  completedAt?: string;
  metrics: SessionMetrics;
  metadata: Record<string, unknown>;
}
