/**
 * Consensus Domain Models
 * Defines proposals, votes, and consensus results
 */

// ===== ENUMS =====

export enum ConsensusAlgorithm {
  RAFT = 'raft',
  BYZANTINE = 'byzantine',
  GOSSIP = 'gossip',
  QUORUM = 'quorum',
}

export enum ProposalStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

// ===== VALUE OBJECTS =====

export class ProposalId {
  private constructor(public readonly value: string) {}

  static create(proposerId: string): ProposalId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return new ProposalId(`proposal_${proposerId}_${timestamp}_${random}`);
  }

  static from(value: string): ProposalId {
    if (!value || typeof value !== 'string') {
      throw new Error('Invalid proposal ID');
    }
    return new ProposalId(value);
  }

  equals(other: ProposalId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// ===== VOTE ENTITY =====

export class Vote {
  constructor(
    public readonly voterId: string,
    public readonly approve: boolean,
    public readonly confidence: number,
    public readonly timestamp: Date,
    public readonly reason?: string,
    public readonly metadata: Record<string, unknown> = {}
  ) {
    if (confidence < 0 || confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }
  }

  static create(params: VoteCreateParams): Vote {
    return new Vote(
      params.voterId,
      params.approve,
      params.confidence ?? 1.0,
      new Date(),
      params.reason,
      params.metadata ?? {}
    );
  }

  static fromSnapshot(snapshot: VoteSnapshot): Vote {
    return new Vote(
      snapshot.voterId,
      snapshot.approve,
      snapshot.confidence,
      new Date(snapshot.timestamp),
      snapshot.reason,
      snapshot.metadata
    );
  }

  toSnapshot(): VoteSnapshot {
    return {
      voterId: this.voterId,
      approve: this.approve,
      confidence: this.confidence,
      timestamp: this.timestamp.toISOString(),
      reason: this.reason,
      metadata: this.metadata,
    };
  }
}

// ===== PROPOSAL ENTITY =====

export class Proposal {
  private constructor(
    public readonly id: ProposalId,
    public readonly proposerId: string,
    public readonly value: unknown,
    public readonly term: number,
    public readonly timestamp: Date,
    private _status: ProposalStatus,
    private readonly _votes: Map<string, Vote>,
    public readonly timeoutMs: number,
    public readonly metadata: Record<string, unknown> = {}
  ) {}

  static create(params: ProposalCreateParams): Proposal {
    return new Proposal(
      ProposalId.create(params.proposerId),
      params.proposerId,
      params.value,
      params.term ?? 1,
      new Date(),
      ProposalStatus.PENDING,
      new Map(),
      params.timeoutMs ?? 30000,
      params.metadata ?? {}
    );
  }

  static fromSnapshot(snapshot: ProposalSnapshot): Proposal {
    const votes = new Map<string, Vote>();
    for (const [voterId, voteSnapshot] of Object.entries(snapshot.votes)) {
      votes.set(voterId, Vote.fromSnapshot(voteSnapshot));
    }

    return new Proposal(
      ProposalId.from(snapshot.id),
      snapshot.proposerId,
      snapshot.value,
      snapshot.term,
      new Date(snapshot.timestamp),
      snapshot.status,
      votes,
      snapshot.timeoutMs,
      snapshot.metadata
    );
  }

  // ===== STATE MANAGEMENT =====

  get status(): ProposalStatus {
    return this._status;
  }

  isPending(): boolean {
    return this._status === ProposalStatus.PENDING;
  }

  isAccepted(): boolean {
    return this._status === ProposalStatus.ACCEPTED;
  }

  isRejected(): boolean {
    return this._status === ProposalStatus.REJECTED;
  }

  isExpired(): boolean {
    if (this._status === ProposalStatus.EXPIRED) {
      return true;
    }
    return Date.now() - this.timestamp.getTime() > this.timeoutMs;
  }

  accept(): void {
    if (!this.isPending()) {
      throw new Error(`Cannot accept proposal in status: ${this._status}`);
    }
    this._status = ProposalStatus.ACCEPTED;
  }

  reject(): void {
    if (!this.isPending()) {
      throw new Error(`Cannot reject proposal in status: ${this._status}`);
    }
    this._status = ProposalStatus.REJECTED;
  }

  expire(): void {
    if (!this.isPending()) {
      throw new Error(`Cannot expire proposal in status: ${this._status}`);
    }
    this._status = ProposalStatus.EXPIRED;
  }

  // ===== VOTE MANAGEMENT =====

  addVote(vote: Vote): void {
    if (!this.isPending()) {
      throw new Error(`Cannot add vote to proposal in status: ${this._status}`);
    }

    if (this.isExpired()) {
      this.expire();
      throw new Error('Cannot add vote to expired proposal');
    }

    this._votes.set(vote.voterId, vote);
  }

  hasVote(voterId: string): boolean {
    return this._votes.has(voterId);
  }

  getVote(voterId: string): Vote | undefined {
    return this._votes.get(voterId);
  }

  getAllVotes(): Vote[] {
    return Array.from(this._votes.values());
  }

  getVoteCount(): number {
    return this._votes.size;
  }

  getApprovalCount(): number {
    return Array.from(this._votes.values()).filter(v => v.approve).length;
  }

  getRejectionCount(): number {
    return Array.from(this._votes.values()).filter(v => !v.approve).length;
  }

  getApprovalRate(): number {
    const total = this._votes.size;
    return total > 0 ? this.getApprovalCount() / total : 0;
  }

  getWeightedApprovalRate(): number {
    const votes = Array.from(this._votes.values());
    if (votes.length === 0) return 0;

    const totalWeight = votes.reduce((sum, v) => sum + v.confidence, 0);
    const approvalWeight = votes
      .filter(v => v.approve)
      .reduce((sum, v) => sum + v.confidence, 0);

    return totalWeight > 0 ? approvalWeight / totalWeight : 0;
  }

  // ===== SNAPSHOT =====

  toSnapshot(): ProposalSnapshot {
    const votes: Record<string, VoteSnapshot> = {};
    for (const [voterId, vote] of this._votes) {
      votes[voterId] = vote.toSnapshot();
    }

    return {
      id: this.id.toString(),
      proposerId: this.proposerId,
      value: this.value,
      term: this.term,
      timestamp: this.timestamp.toISOString(),
      status: this._status,
      votes,
      timeoutMs: this.timeoutMs,
      metadata: this.metadata,
    };
  }
}

// ===== CONSENSUS RESULT =====

export class ConsensusResult {
  constructor(
    public readonly proposalId: string,
    public readonly approved: boolean,
    public readonly approvalRate: number,
    public readonly participationRate: number,
    public readonly finalValue: unknown,
    public readonly rounds: number,
    public readonly durationMs: number,
    public readonly algorithm: ConsensusAlgorithm,
    public readonly metadata: Record<string, unknown> = {}
  ) {}

  static create(params: ConsensusResultParams): ConsensusResult {
    return new ConsensusResult(
      params.proposalId,
      params.approved,
      params.approvalRate,
      params.participationRate,
      params.finalValue,
      params.rounds,
      params.durationMs,
      params.algorithm,
      params.metadata ?? {}
    );
  }

  toSnapshot(): ConsensusResultSnapshot {
    return {
      proposalId: this.proposalId,
      approved: this.approved,
      approvalRate: this.approvalRate,
      participationRate: this.participationRate,
      finalValue: this.finalValue,
      rounds: this.rounds,
      durationMs: this.durationMs,
      algorithm: this.algorithm,
      metadata: this.metadata,
    };
  }
}

// ===== CREATION PARAMETERS =====

export interface VoteCreateParams {
  voterId: string;
  approve: boolean;
  confidence?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ProposalCreateParams {
  proposerId: string;
  value: unknown;
  term?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface ConsensusResultParams {
  proposalId: string;
  approved: boolean;
  approvalRate: number;
  participationRate: number;
  finalValue: unknown;
  rounds: number;
  durationMs: number;
  algorithm: ConsensusAlgorithm;
  metadata?: Record<string, unknown>;
}

// ===== SERIALIZATION TYPES =====

export interface VoteSnapshot {
  voterId: string;
  approve: boolean;
  confidence: number;
  timestamp: string;
  reason?: string;
  metadata: Record<string, unknown>;
}

export interface ProposalSnapshot {
  id: string;
  proposerId: string;
  value: unknown;
  term: number;
  timestamp: string;
  status: ProposalStatus;
  votes: Record<string, VoteSnapshot>;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

export interface ConsensusResultSnapshot {
  proposalId: string;
  approved: boolean;
  approvalRate: number;
  participationRate: number;
  finalValue: unknown;
  rounds: number;
  durationMs: number;
  algorithm: ConsensusAlgorithm;
  metadata: Record<string, unknown>;
}
