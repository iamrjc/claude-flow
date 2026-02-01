/**
 * Consensus Service
 * Implements multiple consensus algorithms for distributed decision-making
 */

import { EventEmitter } from 'events';
import {
  Proposal,
  Vote,
  ConsensusResult,
  ConsensusAlgorithm,
  ProposalStatus,
} from '../../domain/models/consensus.js';
import { RaftConsensus } from '../../consensus/raft.js';
import { IConsensusService, ConsensusRequestParams } from './coordination-service.js';

// ===== CONSENSUS SERVICE =====

export class ConsensusService extends EventEmitter implements IConsensusService {
  private proposals: Map<string, Proposal> = new Map();
  private raftInstances: Map<string, RaftConsensus> = new Map();
  private pendingRequests: Map<string, PendingConsensus> = new Map();

  constructor() {
    super();
  }

  async requestConsensus(params: ConsensusRequestParams): Promise<ConsensusResult> {
    const startTime = Date.now();

    // Create proposal
    const proposal = Proposal.create({
      proposerId: params.proposerId,
      value: params.value,
      timeoutMs: params.timeoutMs,
      metadata: {
        sessionId: params.sessionId,
        algorithm: params.algorithm,
      },
    });

    this.proposals.set(proposal.id.toString(), proposal);

    // Execute consensus based on algorithm
    let result: ConsensusResult;
    switch (params.algorithm) {
      case ConsensusAlgorithm.RAFT:
        result = await this.executeRaftConsensus(proposal, params);
        break;
      case ConsensusAlgorithm.QUORUM:
        result = await this.executeQuorumConsensus(proposal, params);
        break;
      case ConsensusAlgorithm.BYZANTINE:
        result = await this.executeByzantineConsensus(proposal, params);
        break;
      case ConsensusAlgorithm.GOSSIP:
        result = await this.executeGossipConsensus(proposal, params);
        break;
      default:
        throw new Error(`Unsupported consensus algorithm: ${params.algorithm}`);
    }

    // Update proposal status
    if (result.approved) {
      proposal.accept();
    } else {
      proposal.reject();
    }

    this.emit('consensus.completed', {
      proposalId: proposal.id.toString(),
      approved: result.approved,
      durationMs: Date.now() - startTime,
    });

    return result;
  }

  // ===== RAFT CONSENSUS =====

  private async executeRaftConsensus(
    proposal: Proposal,
    params: ConsensusRequestParams
  ): Promise<ConsensusResult> {
    const startTime = Date.now();

    // Get or create Raft instance for this session
    let raft = this.raftInstances.get(params.sessionId);
    if (!raft) {
      raft = new RaftConsensus(params.proposerId, {
        threshold: 0.5, // Simple majority
        timeoutMs: params.timeoutMs,
      });
      await raft.initialize();

      // Add peers
      for (const participantId of params.participants) {
        if (participantId !== params.proposerId) {
          raft.addPeer(participantId);
        }
      }

      this.raftInstances.set(params.sessionId, raft);
    }

    try {
      // Propose value if leader
      if (raft.isLeader()) {
        const raftProposal = await raft.propose(params.value);

        // Simulate peer votes (in real implementation, this would be distributed)
        await this.simulateRaftVotes(raft, raftProposal.id, params.participants);

        // Wait for consensus
        const raftResult = await raft.awaitConsensus(raftProposal.id);

        return ConsensusResult.create({
          proposalId: proposal.id.toString(),
          approved: raftResult.approved,
          approvalRate: raftResult.approvalRate,
          participationRate: raftResult.participationRate,
          finalValue: raftResult.finalValue,
          rounds: raftResult.rounds,
          durationMs: Date.now() - startTime,
          algorithm: ConsensusAlgorithm.RAFT,
        });
      } else {
        throw new Error('Only Raft leader can propose values');
      }
    } catch (error) {
      return ConsensusResult.create({
        proposalId: proposal.id.toString(),
        approved: false,
        approvalRate: 0,
        participationRate: 0,
        finalValue: undefined,
        rounds: 1,
        durationMs: Date.now() - startTime,
        algorithm: ConsensusAlgorithm.RAFT,
        metadata: { error: (error as Error).message },
      });
    }
  }

  private async simulateRaftVotes(
    raft: RaftConsensus,
    proposalId: string,
    participants: string[]
  ): Promise<void> {
    // Simulate majority approval (in real implementation, this would be peer-to-peer)
    const approvalCount = Math.ceil(participants.length * 0.66);

    for (let i = 0; i < approvalCount; i++) {
      if (i < participants.length) {
        await raft.vote(proposalId, {
          voterId: participants[i],
          approve: true,
          confidence: 1.0,
          timestamp: new Date(),
        });
      }
    }
  }

  // ===== SIMPLE MAJORITY VOTING (QUORUM) =====

  private async executeQuorumConsensus(
    proposal: Proposal,
    params: ConsensusRequestParams
  ): Promise<ConsensusResult> {
    const startTime = Date.now();

    // Create pending consensus request
    const pending: PendingConsensus = {
      proposal,
      participants: new Set(params.participants),
      requiredVotes: Math.ceil(params.participants.length * 0.66), // 2/3 quorum
      resolve: null as any,
      reject: null as any,
    };

    this.pendingRequests.set(proposal.id.toString(), pending);

    // Simulate vote collection (in real implementation, votes would come from participants)
    const result = await this.simulateQuorumVotes(proposal, params);

    this.pendingRequests.delete(proposal.id.toString());

    return ConsensusResult.create({
      proposalId: proposal.id.toString(),
      approved: result.approved,
      approvalRate: proposal.getApprovalRate(),
      participationRate: proposal.getVoteCount() / params.participants.length,
      finalValue: result.approved ? params.value : undefined,
      rounds: 1,
      durationMs: Date.now() - startTime,
      algorithm: ConsensusAlgorithm.QUORUM,
    });
  }

  private async simulateQuorumVotes(
    proposal: Proposal,
    params: ConsensusRequestParams
  ): Promise<{ approved: boolean }> {
    return new Promise((resolve) => {
      // Simulate votes coming in
      setTimeout(() => {
        const approvalRate = 0.75; // 75% approval
        const votingParticipants = Math.floor(params.participants.length * 0.9); // 90% participation

        for (let i = 0; i < votingParticipants; i++) {
          const approve = Math.random() < approvalRate;
          const vote = Vote.create({
            voterId: params.participants[i],
            approve,
            confidence: 0.8 + Math.random() * 0.2,
          });

          proposal.addVote(vote);
        }

        const approved = proposal.getApprovalCount() >= Math.ceil(params.participants.length * 0.66);
        resolve({ approved });
      }, 10);
    });
  }

  // ===== BYZANTINE FAULT TOLERANT =====

  private async executeByzantineConsensus(
    proposal: Proposal,
    params: ConsensusRequestParams
  ): Promise<ConsensusResult> {
    const startTime = Date.now();

    // Byzantine requires f < n/3 faulty nodes
    const maxFaulty = Math.floor(params.participants.length / 3);
    const requiredVotes = params.participants.length - maxFaulty;

    // Simulate Byzantine voting rounds
    const result = await this.simulateByzantineRounds(proposal, params, requiredVotes);

    return ConsensusResult.create({
      proposalId: proposal.id.toString(),
      approved: result.approved,
      approvalRate: proposal.getApprovalRate(),
      participationRate: proposal.getVoteCount() / params.participants.length,
      finalValue: result.approved ? params.value : undefined,
      rounds: result.rounds,
      durationMs: Date.now() - startTime,
      algorithm: ConsensusAlgorithm.BYZANTINE,
    });
  }

  private async simulateByzantineRounds(
    proposal: Proposal,
    params: ConsensusRequestParams,
    requiredVotes: number
  ): Promise<{ approved: boolean; rounds: number }> {
    let rounds = 0;
    const maxRounds = 3;

    while (rounds < maxRounds) {
      rounds++;

      // Simulate voting with potential Byzantine failures
      for (const participantId of params.participants) {
        if (!proposal.hasVote(participantId)) {
          const isByzantine = Math.random() < 0.1; // 10% Byzantine nodes
          const approve = isByzantine ? Math.random() < 0.5 : Math.random() < 0.8;

          const vote = Vote.create({
            voterId: participantId,
            approve,
            confidence: isByzantine ? 0.5 : 0.9,
          });

          proposal.addVote(vote);
        }
      }

      // Check if consensus reached
      if (proposal.getApprovalCount() >= requiredVotes) {
        return { approved: true, rounds };
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return { approved: false, rounds };
  }

  // ===== GOSSIP PROTOCOL =====

  private async executeGossipConsensus(
    proposal: Proposal,
    params: ConsensusRequestParams
  ): Promise<ConsensusResult> {
    const startTime = Date.now();

    // Gossip protocol: eventual consistency
    const result = await this.simulateGossipPropagation(proposal, params);

    return ConsensusResult.create({
      proposalId: proposal.id.toString(),
      approved: result.approved,
      approvalRate: proposal.getApprovalRate(),
      participationRate: proposal.getVoteCount() / params.participants.length,
      finalValue: result.approved ? params.value : undefined,
      rounds: result.rounds,
      durationMs: Date.now() - startTime,
      algorithm: ConsensusAlgorithm.GOSSIP,
    });
  }

  private async simulateGossipPropagation(
    proposal: Proposal,
    params: ConsensusRequestParams
  ): Promise<{ approved: boolean; rounds: number }> {
    let rounds = 0;
    const maxRounds = 5;
    const reached = new Set<string>([params.proposerId]);

    while (rounds < maxRounds && reached.size < params.participants.length) {
      rounds++;

      // Each node gossips to random peers
      const currentReached = Array.from(reached);
      for (const nodeId of currentReached) {
        // Gossip to 2-3 random peers
        const gossipCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < gossipCount; i++) {
          const randomPeer = params.participants[
            Math.floor(Math.random() * params.participants.length)
          ];
          reached.add(randomPeer);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // Once propagated, collect votes
    for (const participantId of reached) {
      if (!proposal.hasVote(participantId)) {
        const vote = Vote.create({
          voterId: participantId,
          approve: Math.random() < 0.7,
          confidence: 0.7 + Math.random() * 0.3,
        });

        proposal.addVote(vote);
      }
    }

    const approved = proposal.getApprovalCount() >= Math.ceil(params.participants.length * 0.5);
    return { approved, rounds };
  }

  // ===== UTILITY METHODS =====

  getProposal(proposalId: string): Proposal | undefined {
    return this.proposals.get(proposalId);
  }

  async shutdown(): Promise<void> {
    // Shutdown all Raft instances
    for (const raft of this.raftInstances.values()) {
      await raft.shutdown();
    }

    this.raftInstances.clear();
    this.proposals.clear();
    this.pendingRequests.clear();
    this.emit('shutdown');
  }
}

// ===== TYPES =====

interface PendingConsensus {
  proposal: Proposal;
  participants: Set<string>;
  requiredVotes: number;
  resolve: (result: ConsensusResult) => void;
  reject: (error: Error) => void;
}

// ===== FACTORY =====

export function createConsensusService(): ConsensusService {
  return new ConsensusService();
}
