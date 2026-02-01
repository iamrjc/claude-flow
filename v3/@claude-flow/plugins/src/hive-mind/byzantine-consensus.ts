/**
 * Byzantine Fault Tolerant Consensus Implementation
 * PBFT-style consensus with pre-prepare, prepare, commit phases
 */

import { EventEmitter } from 'events';
import type {
  ByzantineMessage,
  ByzantinePhase,
  ConsensusProposal,
  ViewChange,
} from './types.js';

export interface BFTConfig {
  /** Node ID */
  nodeId: string;
  /** Maximum faulty nodes (f) - tolerance is f < n/3 */
  maxFaultyNodes: number;
  /** Consensus timeout in milliseconds */
  timeoutMs: number;
  /** View change timeout in milliseconds */
  viewChangeTimeoutMs: number;
}

export class ByzantineFaultTolerant extends EventEmitter {
  private nodeId: string;
  private viewNumber: number = 0;
  private sequenceNumber: number = 0;
  private isPrimary: boolean = false;
  private maxFaultyNodes: number;
  private timeoutMs: number;
  private viewChangeTimeoutMs: number;

  // Message logs keyed by "viewNumber_sequenceNumber"
  private messageLog: Map<string, ByzantineMessage[]> = new Map();
  private proposals: Map<string, ConsensusProposal> = new Map();
  private preparedCertificates: Map<string, ByzantineMessage[]> = new Map();
  private committedCertificates: Map<string, ByzantineMessage[]> = new Map();

  // View change state
  private viewChangeVotes: Map<number, Map<string, boolean>> = new Map();
  private viewChangeTimeout?: NodeJS.Timeout;

  // Connected nodes (excludes self)
  private nodes: Set<string> = new Set();

  constructor(config: BFTConfig) {
    super();
    this.nodeId = config.nodeId;
    this.maxFaultyNodes = config.maxFaultyNodes;
    this.timeoutMs = config.timeoutMs;
    this.viewChangeTimeoutMs = config.viewChangeTimeoutMs;
  }

  // ===== INITIALIZATION =====

  async initialize(nodeIds: string[]): Promise<void> {
    this.nodes = new Set(nodeIds.filter(id => id !== this.nodeId));
    this.electPrimary();
    this.emit('initialized', { nodeId: this.nodeId, isPrimary: this.isPrimary });
  }

  async shutdown(): Promise<void> {
    if (this.viewChangeTimeout) {
      clearTimeout(this.viewChangeTimeout);
    }
    this.emit('shutdown', { nodeId: this.nodeId });
  }

  // ===== NODE MANAGEMENT =====

  addNode(nodeId: string): void {
    if (nodeId !== this.nodeId) {
      this.nodes.add(nodeId);
      this.emit('node.added', { nodeId });
    }
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.emit('node.removed', { nodeId });

    // Check if we need to trigger view change (primary failed)
    if (this.getPrimaryId() === nodeId) {
      void this.initiateViewChange('primary_failure');
    }
  }

  getTotalNodes(): number {
    return this.nodes.size + 1; // +1 for self
  }

  getMaxFaultyNodes(): number {
    const n = this.getTotalNodes();
    return Math.floor((n - 1) / 3);
  }

  canTolerateFaults(faultyCount: number): boolean {
    return faultyCount <= this.getMaxFaultyNodes();
  }

  // ===== PRIMARY ELECTION =====

  private electPrimary(): string {
    const allNodes = [this.nodeId, ...Array.from(this.nodes)].sort();
    const primaryIndex = this.viewNumber % allNodes.length;
    const primaryId = allNodes[primaryIndex];

    this.isPrimary = primaryId === this.nodeId;
    this.emit('primary.elected', { primaryId, viewNumber: this.viewNumber, isPrimary: this.isPrimary });

    return primaryId;
  }

  getPrimaryId(): string {
    const allNodes = [this.nodeId, ...Array.from(this.nodes)].sort();
    return allNodes[this.viewNumber % allNodes.length];
  }

  // ===== CONSENSUS PROTOCOL =====

  /**
   * Phase 0: Propose a value (primary only)
   */
  async propose(value: unknown): Promise<string> {
    if (!this.isPrimary) {
      throw new Error('Only primary can propose values');
    }

    this.sequenceNumber++;
    const proposalId = `bft_${this.viewNumber}_${this.sequenceNumber}`;
    const digest = this.computeDigest(value);

    const proposal: ConsensusProposal = {
      id: proposalId,
      proposerId: this.nodeId,
      value,
      phase: 'pre-prepare',
      viewNumber: this.viewNumber,
      sequenceNumber: this.sequenceNumber,
      messages: [],
      votes: new Map(),
      status: 'pending',
      createdAt: new Date(),
    };

    this.proposals.set(proposalId, proposal);

    // Phase 1: Pre-prepare (broadcast to all replicas)
    const prePrepareMsg: ByzantineMessage = {
      type: 'pre-prepare',
      viewNumber: this.viewNumber,
      sequenceNumber: this.sequenceNumber,
      digest,
      senderId: this.nodeId,
      timestamp: new Date(),
      payload: value,
    };

    await this.broadcastMessage(prePrepareMsg);
    this.storeMessage(prePrepareMsg);

    return proposalId;
  }

  /**
   * Handle incoming message (all phases)
   */
  async handleMessage(message: ByzantineMessage): Promise<void> {
    // Validate view number
    if (message.viewNumber !== this.viewNumber) {
      this.emit('message.stale', { message, currentView: this.viewNumber });
      return;
    }

    this.storeMessage(message);

    switch (message.type) {
      case 'pre-prepare':
        await this.handlePrePrepare(message);
        break;
      case 'prepare':
        await this.handlePrepare(message);
        break;
      case 'commit':
        await this.handleCommit(message);
        break;
      case 'view-change':
        await this.handleViewChange(message);
        break;
    }
  }

  /**
   * Phase 1: Handle pre-prepare message (replicas)
   */
  private async handlePrePrepare(message: ByzantineMessage): Promise<void> {
    if (this.isPrimary) {
      return; // Primary doesn't process its own pre-prepare
    }

    // Validate message is from primary
    if (message.senderId !== this.getPrimaryId()) {
      this.emit('error', { reason: 'pre-prepare from non-primary', message });
      return;
    }

    const proposalId = `bft_${message.viewNumber}_${message.sequenceNumber}`;

    // Create proposal if not exists
    if (!this.proposals.has(proposalId)) {
      const proposal: ConsensusProposal = {
        id: proposalId,
        proposerId: message.senderId,
        value: message.payload,
        phase: 'pre-prepare',
        viewNumber: message.viewNumber,
        sequenceNumber: message.sequenceNumber,
        messages: [],
        votes: new Map(),
        status: 'pending',
        createdAt: new Date(),
      };
      this.proposals.set(proposalId, proposal);
    }

    // Phase 2: Send prepare message
    const prepareMsg: ByzantineMessage = {
      type: 'prepare',
      viewNumber: message.viewNumber,
      sequenceNumber: message.sequenceNumber,
      digest: message.digest,
      senderId: this.nodeId,
      timestamp: new Date(),
    };

    await this.broadcastMessage(prepareMsg);
    this.storeMessage(prepareMsg);
  }

  /**
   * Phase 2: Handle prepare message
   */
  private async handlePrepare(message: ByzantineMessage): Promise<void> {
    const key = `${message.viewNumber}_${message.sequenceNumber}`;
    const proposalId = `bft_${message.viewNumber}_${message.sequenceNumber}`;

    // Check if we have 2f + 1 prepare messages (including self)
    const prepareMessages = this.getMessagesOfType(key, 'prepare');
    const f = this.maxFaultyNodes;
    const requiredPrepares = 2 * f + 1;

    if (prepareMessages.length >= requiredPrepares && !this.preparedCertificates.has(key)) {
      // We are now prepared
      this.preparedCertificates.set(key, prepareMessages);

      const proposal = this.proposals.get(proposalId);
      if (proposal) {
        proposal.status = 'prepared';
        proposal.phase = 'commit';
      }

      this.emit('prepared', { proposalId, prepareCount: prepareMessages.length });

      // Phase 3: Send commit message
      const commitMsg: ByzantineMessage = {
        type: 'commit',
        viewNumber: message.viewNumber,
        sequenceNumber: message.sequenceNumber,
        digest: message.digest,
        senderId: this.nodeId,
        timestamp: new Date(),
      };

      await this.broadcastMessage(commitMsg);
      this.storeMessage(commitMsg);
    }
  }

  /**
   * Phase 3: Handle commit message
   */
  private async handleCommit(message: ByzantineMessage): Promise<void> {
    const key = `${message.viewNumber}_${message.sequenceNumber}`;
    const proposalId = `bft_${message.viewNumber}_${message.sequenceNumber}`;

    // Check if we have 2f + 1 commit messages
    const commitMessages = this.getMessagesOfType(key, 'commit');
    const f = this.maxFaultyNodes;
    const requiredCommits = 2 * f + 1;

    if (commitMessages.length >= requiredCommits && !this.committedCertificates.has(key)) {
      // We have committed
      this.committedCertificates.set(key, commitMessages);

      const proposal = this.proposals.get(proposalId);
      if (proposal) {
        proposal.status = 'committed';
        proposal.phase = 'reply';
      }

      this.emit('committed', { proposalId, commitCount: commitMessages.length });
      this.emit('consensus.achieved', { proposalId, value: proposal?.value });
    }
  }

  /**
   * Check if consensus is achieved for a proposal
   */
  async awaitConsensus(proposalId: string, timeoutMs?: number): Promise<boolean> {
    const timeout = timeoutMs ?? this.timeoutMs;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const proposal = this.proposals.get(proposalId);

        if (!proposal) {
          clearInterval(checkInterval);
          reject(new Error(`Proposal ${proposalId} not found`));
          return;
        }

        if (proposal.status === 'committed') {
          clearInterval(checkInterval);
          resolve(true);
          return;
        }

        if (proposal.status === 'rejected') {
          clearInterval(checkInterval);
          resolve(false);
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          proposal.status = 'rejected';
          this.emit('consensus.timeout', { proposalId });
          resolve(false);
        }
      }, 10);
    });
  }

  // ===== VIEW CHANGE =====

  /**
   * Initiate a view change (when primary fails or timeout)
   */
  async initiateViewChange(reason: string): Promise<void> {
    this.viewNumber++;

    const viewChange: ViewChange = {
      newViewNumber: this.viewNumber,
      triggeredBy: this.nodeId,
      reason,
      timestamp: new Date(),
      votes: new Map(),
    };

    this.emit('view.changing', { viewNumber: this.viewNumber, reason });

    // Broadcast view change message
    const viewChangeMsg: ByzantineMessage = {
      type: 'view-change',
      viewNumber: this.viewNumber,
      sequenceNumber: this.sequenceNumber,
      digest: '',
      senderId: this.nodeId,
      timestamp: new Date(),
      payload: viewChange,
    };

    await this.broadcastMessage(viewChangeMsg);

    // Elect new primary
    const newPrimaryId = this.electPrimary();
    viewChange.newLeader = newPrimaryId;

    this.emit('view.changed', {
      viewNumber: this.viewNumber,
      newPrimary: newPrimaryId,
      isPrimary: this.isPrimary
    });
  }

  private async handleViewChange(message: ByzantineMessage): Promise<void> {
    const viewChange = message.payload as ViewChange;

    if (!this.viewChangeVotes.has(viewChange.newViewNumber)) {
      this.viewChangeVotes.set(viewChange.newViewNumber, new Map());
    }

    const votes = this.viewChangeVotes.get(viewChange.newViewNumber)!;
    votes.set(message.senderId, true);

    // Check if we have 2f + 1 view change votes
    const f = this.maxFaultyNodes;
    if (votes.size >= 2 * f + 1) {
      this.viewNumber = viewChange.newViewNumber;
      this.electPrimary();
      this.emit('view.changed', {
        viewNumber: this.viewNumber,
        newPrimary: this.getPrimaryId()
      });
    }
  }

  // ===== MESSAGE MANAGEMENT =====

  private storeMessage(message: ByzantineMessage): void {
    const key = `${message.viewNumber}_${message.sequenceNumber}`;

    if (!this.messageLog.has(key)) {
      this.messageLog.set(key, []);
    }

    const messages = this.messageLog.get(key)!;

    // Avoid duplicates
    const exists = messages.some(
      m => m.type === message.type && m.senderId === message.senderId
    );

    if (!exists) {
      messages.push(message);
    }
  }

  private getMessagesOfType(key: string, type: ByzantinePhase): ByzantineMessage[] {
    const messages = this.messageLog.get(key) || [];
    return messages.filter(m => m.type === type);
  }

  private async broadcastMessage(message: ByzantineMessage): Promise<void> {
    this.emit('message.broadcast', { message, recipients: Array.from(this.nodes) });
  }

  private computeDigest(value: unknown): string {
    // Simple hash function (use crypto.createHash in production)
    const str = JSON.stringify(value);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  // ===== STATE QUERIES =====

  getProposal(proposalId: string): ConsensusProposal | undefined {
    return this.proposals.get(proposalId);
  }

  getViewNumber(): number {
    return this.viewNumber;
  }

  getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  isPrimaryNode(): boolean {
    return this.isPrimary;
  }

  getStatus(): {
    nodeId: string;
    viewNumber: number;
    sequenceNumber: number;
    isPrimary: boolean;
    totalNodes: number;
    maxFaultyNodes: number;
    pendingProposals: number;
    committedProposals: number;
  } {
    const pendingProposals = Array.from(this.proposals.values())
      .filter(p => p.status === 'pending' || p.status === 'prepared').length;

    const committedProposals = Array.from(this.proposals.values())
      .filter(p => p.status === 'committed').length;

    return {
      nodeId: this.nodeId,
      viewNumber: this.viewNumber,
      sequenceNumber: this.sequenceNumber,
      isPrimary: this.isPrimary,
      totalNodes: this.getTotalNodes(),
      maxFaultyNodes: this.getMaxFaultyNodes(),
      pendingProposals,
      committedProposals,
    };
  }
}

export function createByzantineFaultTolerant(config: BFTConfig): ByzantineFaultTolerant {
  return new ByzantineFaultTolerant(config);
}
