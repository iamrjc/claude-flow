/**
 * HiveMind Plugin Types
 * Type definitions for queen-led Byzantine fault-tolerant swarm coordination
 */

// ============================================================================
// Configuration
// ============================================================================

export interface HiveMindConfig {
  /** Maximum number of workers in the hive */
  maxWorkers: number;
  /** Byzantine fault tolerance (max faulty nodes = floor((n-1)/3)) */
  faultTolerance: number;
  /** Network topology type */
  topology: SwarmTopology;
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
  /** Worker timeout in milliseconds */
  workerTimeoutMs: number;
  /** Queen election timeout in milliseconds */
  electionTimeoutMs: number;
  /** Consensus timeout in milliseconds */
  consensusTimeoutMs: number;
  /** Enable automatic queen failover */
  enableFailover: boolean;
  /** Collective memory capacity */
  memoryCapacity: number;
}

// ============================================================================
// Topology
// ============================================================================

export type SwarmTopology =
  | 'hierarchical'
  | 'mesh'
  | 'hierarchical-mesh'
  | 'adaptive';

export interface TopologyConfig {
  type: SwarmTopology;
  /** Maximum connections per worker in mesh topology */
  maxConnectionsPerWorker?: number;
  /** Number of hierarchy levels (hierarchical only) */
  hierarchyLevels?: number;
  /** Adaptation interval for adaptive topology */
  adaptIntervalMs?: number;
}

// ============================================================================
// Queen State
// ============================================================================

export interface QueenState {
  id: string;
  term: number;
  status: 'candidate' | 'leader' | 'follower';
  workers: Map<string, WorkerInfo>;
  activeDirectives: Map<string, Directive>;
  lastHeartbeat: Date;
  electionVotes: Map<string, boolean>;
  consensusProposals: Map<string, string>;
}

export interface WorkerInfo {
  id: string;
  status: WorkerStatus;
  capabilities: string[];
  load: number;
  lastHeartbeat: Date;
  health: WorkerHealth;
  metrics: WorkerMetrics;
}

export type WorkerStatus = 'idle' | 'busy' | 'degraded' | 'failed' | 'offline';

export interface WorkerHealth {
  score: number; // 0-1
  cpuUsage: number;
  memoryUsage: number;
  errorRate: number;
  responseTime: number;
}

export interface WorkerMetrics {
  tasksCompleted: number;
  tasksFailedCount: number;
  avgResponseTime: number;
  totalUptime: number;
  lastTaskAt?: Date;
}

// ============================================================================
// Worker State
// ============================================================================

export interface WorkerState {
  id: string;
  queenId?: string;
  status: WorkerStatus;
  capabilities: string[];
  currentTask?: TaskAssignment;
  taskQueue: TaskAssignment[];
  lastHeartbeatSent: Date;
  degradationReason?: string;
}

export interface TaskAssignment {
  id: string;
  directiveId: string;
  description: string;
  priority: number;
  timeout: number;
  startedAt: Date;
  expectedCompletionAt: Date;
}

// ============================================================================
// Directives & Results
// ============================================================================

export interface Directive {
  id: string;
  type: 'task' | 'query' | 'coordination' | 'consensus';
  issuedBy: string;
  issuedAt: Date;
  priority: number;
  payload: unknown;
  targetWorkers: string[];
  requiredResponses: number;
  timeout: number;
  status: DirectiveStatus;
}

export type DirectiveStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'timeout';

export interface DirectiveResult {
  directiveId: string;
  workerId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  completedAt: Date;
  metrics: {
    duration: number;
    tokensUsed?: number;
  };
}

// ============================================================================
// Collective Intelligence
// ============================================================================

export interface CollectiveMemory {
  id: string;
  namespace: string;
  entries: Map<string, MemoryEntry>;
  patterns: Map<string, Pattern>;
  createdAt: Date;
  lastUpdated: Date;
}

export interface MemoryEntry {
  key: string;
  value: unknown;
  contributors: string[];
  confidence: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface Pattern {
  id: string;
  type: string;
  description: string;
  occurrences: number;
  confidence: number;
  detectedBy: string[];
  firstSeen: Date;
  lastSeen: Date;
  metadata?: Record<string, unknown>;
}

export interface CollectiveDecision {
  id: string;
  question: string;
  proposedBy: string;
  votes: Map<string, Vote>;
  consensusType: ConsensusType;
  result?: DecisionResult;
  startedAt: Date;
  completedAt?: Date;
  timeout: number;
}

export type ConsensusType = 'majority' | 'supermajority' | 'unanimous' | 'weighted' | 'byzantine';

export interface Vote {
  voterId: string;
  choice: unknown;
  confidence: number;
  reasoning?: string;
  timestamp: Date;
}

export interface DecisionResult {
  consensus: boolean;
  finalChoice: unknown;
  approvalRate: number;
  participationRate: number;
  confidenceScore: number;
}

// ============================================================================
// Byzantine Consensus
// ============================================================================

export interface ByzantineMessage {
  type: ByzantinePhase;
  viewNumber: number;
  sequenceNumber: number;
  digest: string;
  senderId: string;
  timestamp: Date;
  payload?: unknown;
  signature?: string;
}

export type ByzantinePhase = 'pre-prepare' | 'prepare' | 'commit' | 'reply' | 'view-change';

export interface ConsensusProposal {
  id: string;
  proposerId: string;
  value: unknown;
  phase: ByzantinePhase;
  viewNumber: number;
  sequenceNumber: number;
  messages: ByzantineMessage[];
  votes: Map<string, boolean>;
  status: 'pending' | 'prepared' | 'committed' | 'rejected';
  createdAt: Date;
}

export interface ViewChange {
  newViewNumber: number;
  triggeredBy: string;
  reason: string;
  timestamp: Date;
  votes: Map<string, boolean>;
  newLeader?: string;
}

// ============================================================================
// Network Messages
// ============================================================================

export interface HiveMindMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string | string[];
  payload: unknown;
  timestamp: Date;
  priority: number;
  requiresAck: boolean;
}

export type MessageType =
  | 'heartbeat'
  | 'directive'
  | 'result'
  | 'election'
  | 'vote'
  | 'consensus'
  | 'view-change'
  | 'sync'
  | 'error';

// ============================================================================
// Events
// ============================================================================

export interface HiveMindEvent {
  type: HiveMindEventType;
  data: unknown;
  timestamp: Date;
}

export type HiveMindEventType =
  | 'queen.elected'
  | 'queen.failed'
  | 'worker.joined'
  | 'worker.left'
  | 'worker.failed'
  | 'directive.issued'
  | 'directive.completed'
  | 'consensus.started'
  | 'consensus.achieved'
  | 'consensus.failed'
  | 'pattern.detected'
  | 'topology.changed'
  | 'partition.detected'
  | 'partition.healed';

// ============================================================================
// Metrics & Monitoring
// ============================================================================

export interface HiveMindMetrics {
  totalWorkers: number;
  activeWorkers: number;
  failedWorkers: number;
  queenUptime: number;
  totalDirectives: number;
  completedDirectives: number;
  failedDirectives: number;
  avgDirectiveTime: number;
  consensusOperations: number;
  consensusSuccessRate: number;
  avgConsensusTime: number;
  topologyType: SwarmTopology;
  networkPartitions: number;
  timestamp: Date;
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  components: {
    queen: ComponentHealth;
    workers: ComponentHealth;
    consensus: ComponentHealth;
    topology: ComponentHealth;
    memory: ComponentHealth;
  };
  timestamp: Date;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'critical';
  score: number;
  issues: string[];
  metrics?: Record<string, number>;
}
