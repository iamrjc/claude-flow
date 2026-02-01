/**
 * Queen Agent - Central Coordinator
 * Leads the swarm with directive distribution and collective decision aggregation
 */

import { EventEmitter } from 'events';
import { ByzantineFaultTolerant, createByzantineFaultTolerant } from './byzantine-consensus.js';
import type {
  QueenState,
  WorkerInfo,
  Directive,
  DirectiveResult,
  CollectiveDecision,
  HiveMindMessage,
  WorkerStatus,
  HiveMindMetrics,
  ConsensusType,
  DecisionResult,
  Vote,
} from './types.js';

export interface QueenConfig {
  id: string;
  maxWorkers: number;
  heartbeatIntervalMs: number;
  workerTimeoutMs: number;
  electionTimeoutMs: number;
  consensusTimeoutMs: number;
  faultTolerance: number;
}

export class QueenAgent extends EventEmitter {
  private state: QueenState;
  private config: QueenConfig;
  private consensus: ByzantineFaultTolerant;
  private heartbeatInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private directiveCounter: number = 0;

  constructor(config: QueenConfig) {
    super();
    this.config = config;

    this.state = {
      id: config.id,
      term: 0,
      status: 'follower',
      workers: new Map(),
      activeDirectives: new Map(),
      lastHeartbeat: new Date(),
      electionVotes: new Map(),
      consensusProposals: new Map(),
    };

    this.consensus = createByzantineFaultTolerant({
      nodeId: config.id,
      maxFaultyNodes: config.faultTolerance,
      timeoutMs: config.consensusTimeoutMs,
      viewChangeTimeoutMs: config.electionTimeoutMs,
    });
  }

  // ===== LIFECYCLE =====

  async initialize(): Promise<void> {
    this.emit('initializing', { queenId: this.state.id });

    // Start as candidate and attempt election
    await this.startElection();

    // Initialize consensus layer
    const workerIds = Array.from(this.state.workers.keys());
    await this.consensus.initialize(workerIds);

    this.emit('initialized', {
      queenId: this.state.id,
      status: this.state.status,
      term: this.state.term
    });
  }

  async shutdown(): Promise<void> {
    this.emit('shutting-down', { queenId: this.state.id });

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    await this.consensus.shutdown();

    this.state.status = 'follower';
    this.emit('shutdown', { queenId: this.state.id });
  }

  // ===== LEADERSHIP ELECTION =====

  async startElection(): Promise<void> {
    this.state.status = 'candidate';
    this.state.term++;
    this.state.electionVotes.clear();

    // Vote for self
    this.state.electionVotes.set(this.state.id, true);

    this.emit('election.started', {
      queenId: this.state.id,
      term: this.state.term
    });

    // Request votes from workers
    await this.requestVotes();

    // Set election timeout
    setTimeout(() => {
      this.checkElectionResult();
    }, this.config.electionTimeoutMs);
  }

  private async requestVotes(): Promise<void> {
    const voteRequest: HiveMindMessage = {
      id: `vote_req_${this.state.term}_${Date.now()}`,
      type: 'election',
      from: this.state.id,
      to: Array.from(this.state.workers.keys()),
      payload: {
        candidateId: this.state.id,
        term: this.state.term,
      },
      timestamp: new Date(),
      priority: 100,
      requiresAck: true,
    };

    this.emit('message.broadcast', { message: voteRequest });
  }

  async receiveVote(workerId: string, granted: boolean): Promise<void> {
    if (this.state.status !== 'candidate') {
      return;
    }

    this.state.electionVotes.set(workerId, granted);
    this.emit('vote.received', { workerId, granted, totalVotes: this.state.electionVotes.size });

    // Check if we have majority
    this.checkElectionResult();
  }

  private checkElectionResult(): void {
    if (this.state.status !== 'candidate') {
      return;
    }

    const totalNodes = this.state.workers.size + 1; // +1 for self
    const votesGranted = Array.from(this.state.electionVotes.values())
      .filter(v => v).length;

    const majority = Math.floor(totalNodes / 2) + 1;

    if (votesGranted >= majority) {
      this.becomeLeader();
    } else if (this.state.electionVotes.size >= totalNodes) {
      // All votes counted but no majority
      this.emit('election.failed', {
        queenId: this.state.id,
        term: this.state.term,
        votesGranted
      });

      // Restart election with backoff
      setTimeout(() => {
        void this.startElection();
      }, Math.random() * 1000 + 500);
    }
  }

  private becomeLeader(): void {
    this.state.status = 'leader';

    this.emit('leader.elected', {
      queenId: this.state.id,
      term: this.state.term
    });

    // Start heartbeat
    this.startHeartbeat();

    // Start health monitoring
    this.startHealthMonitoring();
  }

  // ===== WORKER MANAGEMENT =====

  async registerWorker(workerId: string, capabilities: string[]): Promise<void> {
    const workerInfo: WorkerInfo = {
      id: workerId,
      status: 'idle',
      capabilities,
      load: 0,
      lastHeartbeat: new Date(),
      health: {
        score: 1.0,
        cpuUsage: 0,
        memoryUsage: 0,
        errorRate: 0,
        responseTime: 0,
      },
      metrics: {
        tasksCompleted: 0,
        tasksFailedCount: 0,
        avgResponseTime: 0,
        totalUptime: 0,
      },
    };

    this.state.workers.set(workerId, workerInfo);
    this.consensus.addNode(workerId);

    this.emit('worker.registered', { workerId, capabilities });
  }

  async unregisterWorker(workerId: string): Promise<void> {
    this.state.workers.delete(workerId);
    this.consensus.removeNode(workerId);

    this.emit('worker.unregistered', { workerId });
  }

  async receiveHeartbeat(workerId: string, health: WorkerInfo['health']): Promise<void> {
    const worker = this.state.workers.get(workerId);
    if (!worker) {
      return;
    }

    worker.lastHeartbeat = new Date();
    worker.health = health;

    // Update status based on health
    if (health.score < 0.3) {
      worker.status = 'failed';
    } else if (health.score < 0.6) {
      worker.status = 'degraded';
    } else if (worker.load === 0) {
      worker.status = 'idle';
    } else {
      worker.status = 'busy';
    }

    this.emit('heartbeat.received', { workerId, health });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const heartbeat: HiveMindMessage = {
        id: `hb_${this.state.id}_${Date.now()}`,
        type: 'heartbeat',
        from: this.state.id,
        to: Array.from(this.state.workers.keys()),
        payload: {
          term: this.state.term,
          timestamp: new Date(),
        },
        timestamp: new Date(),
        priority: 10,
        requiresAck: false,
      };

      this.state.lastHeartbeat = new Date();
      this.emit('message.broadcast', { message: heartbeat });
    }, this.config.heartbeatIntervalMs);
  }

  // ===== HEALTH MONITORING =====

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.checkWorkerHealth();
    }, this.config.workerTimeoutMs);
  }

  private checkWorkerHealth(): void {
    const now = Date.now();
    const timeout = this.config.workerTimeoutMs;

    for (const [workerId, worker] of this.state.workers) {
      const timeSinceHeartbeat = now - worker.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > timeout) {
        if (worker.status !== 'offline') {
          worker.status = 'offline';
          this.emit('worker.timeout', { workerId, timeSinceHeartbeat });

          // Mark any active directives from this worker as failed
          for (const directive of this.state.activeDirectives.values()) {
            if (directive.targetWorkers.includes(workerId)) {
              this.handleWorkerFailure(workerId, directive.id);
            }
          }
        }
      }
    }
  }

  private handleWorkerFailure(workerId: string, directiveId: string): void {
    this.emit('worker.failed', { workerId, directiveId });

    // Potentially reassign to another worker
    const directive = this.state.activeDirectives.get(directiveId);
    if (directive && directive.status === 'in-progress') {
      const availableWorkers = this.getHealthyWorkers(directive.targetWorkers);
      if (availableWorkers.length > 0) {
        // Reassign to first available worker
        this.emit('directive.reassigned', {
          directiveId,
          from: workerId,
          to: availableWorkers[0].id
        });
      } else {
        directive.status = 'failed';
        this.emit('directive.failed', { directiveId, reason: 'no_workers_available' });
      }
    }
  }

  // ===== DIRECTIVE DISTRIBUTION =====

  async issueDirective(
    type: Directive['type'],
    payload: unknown,
    targetCapabilities?: string[],
    priority: number = 50
  ): Promise<string> {
    if (this.state.status !== 'leader') {
      throw new Error('Only leader can issue directives');
    }

    this.directiveCounter++;
    const directiveId = `dir_${this.state.id}_${this.state.term}_${this.directiveCounter}`;

    // Select target workers based on capabilities
    const targetWorkers = this.selectWorkers(targetCapabilities);

    if (targetWorkers.length === 0) {
      throw new Error('No workers available for directive');
    }

    const directive: Directive = {
      id: directiveId,
      type,
      issuedBy: this.state.id,
      issuedAt: new Date(),
      priority,
      payload,
      targetWorkers: targetWorkers.map(w => w.id),
      requiredResponses: Math.max(1, Math.floor(targetWorkers.length * 0.67)), // 2/3 majority
      timeout: 30000,
      status: 'pending',
    };

    this.state.activeDirectives.set(directiveId, directive);

    // Broadcast directive
    const message: HiveMindMessage = {
      id: `msg_${directiveId}`,
      type: 'directive',
      from: this.state.id,
      to: directive.targetWorkers,
      payload: directive,
      timestamp: new Date(),
      priority,
      requiresAck: true,
    };

    directive.status = 'in-progress';

    this.emit('directive.issued', { directiveId, targetWorkers: directive.targetWorkers });
    this.emit('message.broadcast', { message });

    return directiveId;
  }

  private selectWorkers(capabilities?: string[]): WorkerInfo[] {
    const workers = Array.from(this.state.workers.values());

    // Filter by capability if specified
    let candidates = capabilities
      ? workers.filter(w =>
          capabilities.some(cap => w.capabilities.includes(cap))
        )
      : workers;

    // Filter by health and status
    candidates = candidates.filter(w =>
      (w.status === 'idle' || w.status === 'busy') &&
      w.health.score > 0.5
    );

    // Sort by load (ascending) and health score (descending)
    candidates.sort((a, b) => {
      if (a.load !== b.load) {
        return a.load - b.load;
      }
      return b.health.score - a.health.score;
    });

    return candidates;
  }

  private getHealthyWorkers(excludeIds: string[] = []): WorkerInfo[] {
    return Array.from(this.state.workers.values())
      .filter(w =>
        !excludeIds.includes(w.id) &&
        (w.status === 'idle' || w.status === 'busy') &&
        w.health.score > 0.5
      );
  }

  // ===== RESULT AGGREGATION =====

  async receiveResult(result: DirectiveResult): Promise<void> {
    const directive = this.state.activeDirectives.get(result.directiveId);
    if (!directive) {
      return;
    }

    this.emit('result.received', { result });

    // Update worker metrics
    const worker = this.state.workers.get(result.workerId);
    if (worker) {
      worker.metrics.tasksCompleted++;
      if (!result.success) {
        worker.metrics.tasksFailedCount++;
      }
      worker.load = Math.max(0, worker.load - 0.1);
    }

    // Check if directive is complete
    const results = await this.getDirectiveResults(directive.id);
    if (results.length >= directive.requiredResponses) {
      directive.status = 'completed';
      this.emit('directive.completed', {
        directiveId: directive.id,
        results: results.length
      });
    }
  }

  private async getDirectiveResults(directiveId: string): Promise<DirectiveResult[]> {
    // In a real implementation, this would fetch from a result store
    // For now, we'll just return an empty array
    return [];
  }

  // ===== COLLECTIVE DECISION =====

  async proposeDecision(
    question: string,
    options: unknown[],
    consensusType: ConsensusType = 'majority'
  ): Promise<string> {
    if (this.state.status !== 'leader') {
      throw new Error('Only leader can propose decisions');
    }

    const decisionId = `dec_${this.state.id}_${Date.now()}`;

    const decision: CollectiveDecision = {
      id: decisionId,
      question,
      proposedBy: this.state.id,
      votes: new Map(),
      consensusType,
      startedAt: new Date(),
      timeout: this.config.consensusTimeoutMs,
    };

    this.emit('decision.proposed', { decisionId, question, consensusType });

    // Use Byzantine consensus for critical decisions
    if (consensusType === 'byzantine') {
      const proposalId = await this.consensus.propose({ question, options });
      this.state.consensusProposals.set(decisionId, proposalId);
    }

    // Broadcast decision request to workers
    const message: HiveMindMessage = {
      id: `msg_${decisionId}`,
      type: 'consensus',
      from: this.state.id,
      to: Array.from(this.state.workers.keys()),
      payload: { decisionId, question, options, consensusType },
      timestamp: new Date(),
      priority: 75,
      requiresAck: true,
    };

    this.emit('message.broadcast', { message });

    return decisionId;
  }

  async receiveVoteForDecision(decisionId: string, vote: Vote): Promise<void> {
    this.emit('vote.received', { decisionId, vote });

    // For Byzantine consensus, handle through consensus layer
    const consensusProposalId = this.state.consensusProposals.get(decisionId);
    if (consensusProposalId) {
      await this.consensus.handleMessage({
        type: 'prepare',
        viewNumber: this.consensus.getViewNumber(),
        sequenceNumber: this.consensus.getSequenceNumber(),
        digest: '',
        senderId: vote.voterId,
        timestamp: new Date(),
        payload: vote,
      });
    }
  }

  async awaitDecision(decisionId: string): Promise<DecisionResult> {
    const consensusProposalId = this.state.consensusProposals.get(decisionId);

    if (consensusProposalId) {
      // Wait for Byzantine consensus
      const achieved = await this.consensus.awaitConsensus(consensusProposalId);

      return {
        consensus: achieved,
        finalChoice: achieved ? 'approved' : 'rejected',
        approvalRate: achieved ? 1.0 : 0.0,
        participationRate: 1.0,
        confidenceScore: achieved ? 1.0 : 0.0,
      };
    }

    // Fallback for other consensus types
    return {
      consensus: false,
      finalChoice: null,
      approvalRate: 0,
      participationRate: 0,
      confidenceScore: 0,
    };
  }

  // ===== METRICS =====

  getMetrics(): HiveMindMetrics {
    const activeWorkers = Array.from(this.state.workers.values())
      .filter(w => w.status !== 'offline' && w.status !== 'failed').length;

    const failedWorkers = Array.from(this.state.workers.values())
      .filter(w => w.status === 'failed').length;

    const completedDirectives = Array.from(this.state.activeDirectives.values())
      .filter(d => d.status === 'completed').length;

    const failedDirectives = Array.from(this.state.activeDirectives.values())
      .filter(d => d.status === 'failed').length;

    return {
      totalWorkers: this.state.workers.size,
      activeWorkers,
      failedWorkers,
      queenUptime: Date.now() - this.state.lastHeartbeat.getTime(),
      totalDirectives: this.state.activeDirectives.size,
      completedDirectives,
      failedDirectives,
      avgDirectiveTime: 0, // Would calculate from directive history
      consensusOperations: this.state.consensusProposals.size,
      consensusSuccessRate: 1.0, // Would track actual success rate
      avgConsensusTime: 0, // Would calculate from consensus history
      topologyType: 'hierarchical', // Would get from topology manager
      networkPartitions: 0, // Would track from partition detector
      timestamp: new Date(),
    };
  }

  // ===== STATE QUERIES =====

  isLeader(): boolean {
    return this.state.status === 'leader';
  }

  getTerm(): number {
    return this.state.term;
  }

  getWorkerCount(): number {
    return this.state.workers.size;
  }

  getActiveDirectiveCount(): number {
    return Array.from(this.state.activeDirectives.values())
      .filter(d => d.status === 'in-progress').length;
  }

  getWorkerStatus(workerId: string): WorkerStatus | undefined {
    return this.state.workers.get(workerId)?.status;
  }
}

export function createQueenAgent(config: QueenConfig): QueenAgent {
  return new QueenAgent(config);
}
