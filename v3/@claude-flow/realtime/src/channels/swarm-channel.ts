/**
 * Swarm Channel
 * Topology changes, consensus events, collective decisions
 */

import { EventEmitter } from 'events';
import type { WSRouter } from '../server/ws-router.js';
import type { WSClient } from '../client/ws-client.js';

export type SwarmTopology = 'hierarchical' | 'mesh' | 'hierarchical-mesh' | 'adaptive';

export interface TopologyChangeEvent {
  swarmId: string;
  oldTopology: SwarmTopology;
  newTopology: SwarmTopology;
  reason?: string;
  timestamp: number;
}

export interface AgentJoinedEvent {
  swarmId: string;
  agentId: string;
  role?: string;
  timestamp: number;
}

export interface AgentLeftEvent {
  swarmId: string;
  agentId: string;
  reason?: string;
  timestamp: number;
}

export interface ConsensusEvent {
  swarmId: string;
  proposalId: string;
  type: 'proposed' | 'voting' | 'accepted' | 'rejected';
  proposal?: unknown;
  votes?: {
    agentId: string;
    vote: 'yes' | 'no' | 'abstain';
  }[];
  result?: {
    accepted: boolean;
    votesFor: number;
    votesAgainst: number;
    abstentions: number;
  };
  timestamp: number;
}

export interface CollectiveDecisionEvent {
  swarmId: string;
  decisionId: string;
  question: string;
  options: string[];
  votes: {
    agentId: string;
    option: string;
    confidence?: number;
  }[];
  result?: {
    selectedOption: string;
    confidence: number;
  };
  timestamp: number;
}

export interface SwarmStateEvent {
  swarmId: string;
  state: {
    topology: SwarmTopology;
    agentCount: number;
    activeAgents: number;
    queueSize: number;
    healthScore: number;
  };
  timestamp: number;
}

export interface CoordinationEvent {
  swarmId: string;
  type: 'task-assignment' | 'resource-allocation' | 'priority-change' | 'workload-balance';
  data: unknown;
  timestamp: number;
}

/**
 * Server-side swarm channel
 */
export class SwarmChannelServer extends EventEmitter {
  private readonly topicPrefix = 'swarm';

  constructor(private router: WSRouter) {
    super();
    this.setupRoutes();
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Topology changes
    this.router.route({
      topic: `${this.topicPrefix}.topology`,
      handler: async (data, clientId) => {
        this.emit('topology-change', data);
      },
    });

    // Agent join/leave
    this.router.route({
      topic: `${this.topicPrefix}.agent-joined`,
      handler: async (data, clientId) => {
        this.emit('agent-joined', data);
      },
    });

    this.router.route({
      topic: `${this.topicPrefix}.agent-left`,
      handler: async (data, clientId) => {
        this.emit('agent-left', data);
      },
    });

    // Consensus
    this.router.route({
      topic: `${this.topicPrefix}.consensus`,
      handler: async (data, clientId) => {
        this.emit('consensus-event', data);
      },
    });

    // Collective decisions
    this.router.route({
      topic: `${this.topicPrefix}.decision`,
      handler: async (data, clientId) => {
        this.emit('collective-decision', data);
      },
    });

    // State updates
    this.router.route({
      topic: `${this.topicPrefix}.state`,
      handler: async (data, clientId) => {
        this.emit('state-update', data);
      },
    });

    // Coordination
    this.router.route({
      topic: `${this.topicPrefix}.coordination`,
      handler: async (data, clientId) => {
        this.emit('coordination-event', data);
      },
    });
  }

  /**
   * Publish topology change
   */
  async publishTopologyChange(event: TopologyChangeEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.swarmId}.topology`, event);
    await this.router.publish(`${this.topicPrefix}.topology`, event); // Broadcast
  }

  /**
   * Publish agent joined
   */
  async publishAgentJoined(event: AgentJoinedEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.swarmId}.agent-joined`, event);
    await this.router.publish(`${this.topicPrefix}.agent-joined`, event); // Broadcast
  }

  /**
   * Publish agent left
   */
  async publishAgentLeft(event: AgentLeftEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.swarmId}.agent-left`, event);
    await this.router.publish(`${this.topicPrefix}.agent-left`, event); // Broadcast
  }

  /**
   * Publish consensus event
   */
  async publishConsensus(event: ConsensusEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.swarmId}.consensus`, event);
    await this.router.publish(`${this.topicPrefix}.consensus`, event); // Broadcast
  }

  /**
   * Publish collective decision
   */
  async publishCollectiveDecision(event: CollectiveDecisionEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.swarmId}.decision`, event);
    await this.router.publish(`${this.topicPrefix}.decision`, event); // Broadcast
  }

  /**
   * Publish swarm state
   */
  async publishState(event: SwarmStateEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.swarmId}.state`, event);
    await this.router.publish(`${this.topicPrefix}.state`, event); // Broadcast
  }

  /**
   * Publish coordination event
   */
  async publishCoordination(event: CoordinationEvent): Promise<void> {
    await this.router.publish(`${this.topicPrefix}.${event.swarmId}.coordination`, event);
    await this.router.publish(`${this.topicPrefix}.coordination`, event); // Broadcast
  }

  /**
   * Publish swarm initialized
   */
  async publishSwarmInitialized(
    swarmId: string,
    topology: SwarmTopology,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event: SwarmStateEvent = {
      swarmId,
      state: {
        topology,
        agentCount: 0,
        activeAgents: 0,
        queueSize: 0,
        healthScore: 100,
      },
      timestamp: Date.now(),
    };
    await this.publishState(event);
  }

  /**
   * Publish consensus proposal
   */
  async publishConsensusProposal(
    swarmId: string,
    proposalId: string,
    proposal: unknown
  ): Promise<void> {
    const event: ConsensusEvent = {
      swarmId,
      proposalId,
      type: 'proposed',
      proposal,
      timestamp: Date.now(),
    };
    await this.publishConsensus(event);
  }

  /**
   * Publish consensus result
   */
  async publishConsensusResult(
    swarmId: string,
    proposalId: string,
    accepted: boolean,
    votes: { agentId: string; vote: 'yes' | 'no' | 'abstain' }[]
  ): Promise<void> {
    const votesFor = votes.filter((v) => v.vote === 'yes').length;
    const votesAgainst = votes.filter((v) => v.vote === 'no').length;
    const abstentions = votes.filter((v) => v.vote === 'abstain').length;

    const event: ConsensusEvent = {
      swarmId,
      proposalId,
      type: accepted ? 'accepted' : 'rejected',
      votes,
      result: {
        accepted,
        votesFor,
        votesAgainst,
        abstentions,
      },
      timestamp: Date.now(),
    };
    await this.publishConsensus(event);
  }
}

/**
 * Client-side swarm channel
 */
export class SwarmChannelClient extends EventEmitter {
  private readonly topicPrefix = 'swarm';
  private subscribedSwarms = new Set<string>();

  constructor(private client: WSClient) {
    super();
    this.setupListeners();
  }

  /**
   * Setup event listeners
   */
  private setupListeners(): void {
    // Topology events
    this.client.on('event:swarm.topology', (event) => {
      const data = event.data as TopologyChangeEvent;
      this.emit('topology-change', data);
      this.emit(`topology-change:${data.swarmId}`, data);
    });

    // Agent join/leave
    this.client.on('event:swarm.agent-joined', (event) => {
      const data = event.data as AgentJoinedEvent;
      this.emit('agent-joined', data);
      this.emit(`agent-joined:${data.swarmId}`, data);
    });

    this.client.on('event:swarm.agent-left', (event) => {
      const data = event.data as AgentLeftEvent;
      this.emit('agent-left', data);
      this.emit(`agent-left:${data.swarmId}`, data);
    });

    // Consensus events
    this.client.on('event:swarm.consensus', (event) => {
      const data = event.data as ConsensusEvent;
      this.emit('consensus', data);
      this.emit(`consensus:${data.swarmId}`, data);
    });

    // Decision events
    this.client.on('event:swarm.decision', (event) => {
      const data = event.data as CollectiveDecisionEvent;
      this.emit('decision', data);
      this.emit(`decision:${data.swarmId}`, data);
    });

    // State events
    this.client.on('event:swarm.state', (event) => {
      const data = event.data as SwarmStateEvent;
      this.emit('state-update', data);
      this.emit(`state-update:${data.swarmId}`, data);
    });

    // Coordination events
    this.client.on('event:swarm.coordination', (event) => {
      const data = event.data as CoordinationEvent;
      this.emit('coordination', data);
      this.emit(`coordination:${data.swarmId}`, data);
    });

    // Swarm-specific events
    this.client.on('event', (event) => {
      const topic = event.topic;
      if (topic.startsWith(`${this.topicPrefix}.`)) {
        const parts = topic.split('.');
        if (parts.length === 3) {
          const swarmId = parts[1];
          const eventType = parts[2];
          this.emit(`${eventType}:${swarmId}`, event.data);
        }
      }
    });
  }

  /**
   * Subscribe to all swarm events
   */
  async subscribeAll(): Promise<void> {
    await this.client.subscribe([
      `${this.topicPrefix}.topology`,
      `${this.topicPrefix}.agent-joined`,
      `${this.topicPrefix}.agent-left`,
      `${this.topicPrefix}.consensus`,
      `${this.topicPrefix}.decision`,
      `${this.topicPrefix}.state`,
      `${this.topicPrefix}.coordination`,
    ]);
  }

  /**
   * Subscribe to specific swarm
   */
  async subscribeToSwarm(swarmId: string): Promise<void> {
    if (this.subscribedSwarms.has(swarmId)) {
      return;
    }

    await this.client.subscribe([
      `${this.topicPrefix}.${swarmId}.topology`,
      `${this.topicPrefix}.${swarmId}.agent-joined`,
      `${this.topicPrefix}.${swarmId}.agent-left`,
      `${this.topicPrefix}.${swarmId}.consensus`,
      `${this.topicPrefix}.${swarmId}.decision`,
      `${this.topicPrefix}.${swarmId}.state`,
      `${this.topicPrefix}.${swarmId}.coordination`,
    ]);

    this.subscribedSwarms.add(swarmId);
  }

  /**
   * Unsubscribe from specific swarm
   */
  async unsubscribeFromSwarm(swarmId: string): Promise<void> {
    if (!this.subscribedSwarms.has(swarmId)) {
      return;
    }

    await this.client.unsubscribe([
      `${this.topicPrefix}.${swarmId}.topology`,
      `${this.topicPrefix}.${swarmId}.agent-joined`,
      `${this.topicPrefix}.${swarmId}.agent-left`,
      `${this.topicPrefix}.${swarmId}.consensus`,
      `${this.topicPrefix}.${swarmId}.decision`,
      `${this.topicPrefix}.${swarmId}.state`,
      `${this.topicPrefix}.${swarmId}.coordination`,
    ]);

    this.subscribedSwarms.delete(swarmId);
  }

  /**
   * Subscribe to pattern
   */
  async subscribePattern(pattern: string): Promise<void> {
    await this.client.subscribe([`${this.topicPrefix}.${pattern}`]);
  }

  /**
   * Submit consensus vote
   */
  async submitVote(
    swarmId: string,
    proposalId: string,
    vote: 'yes' | 'no' | 'abstain',
    agentId: string
  ): Promise<void> {
    await this.client.publish(`${this.topicPrefix}.${swarmId}.consensus`, {
      swarmId,
      proposalId,
      type: 'voting',
      votes: [{ agentId, vote }],
      timestamp: Date.now(),
    });
  }

  /**
   * Submit decision vote
   */
  async submitDecision(
    swarmId: string,
    decisionId: string,
    agentId: string,
    option: string,
    confidence?: number
  ): Promise<void> {
    await this.client.publish(`${this.topicPrefix}.${swarmId}.decision`, {
      swarmId,
      decisionId,
      votes: [{ agentId, option, confidence }],
      timestamp: Date.now(),
    });
  }

  /**
   * Get subscribed swarms
   */
  getSubscribedSwarms(): string[] {
    return Array.from(this.subscribedSwarms);
  }

  /**
   * Wait for consensus result
   */
  async waitForConsensus(
    swarmId: string,
    proposalId: string,
    timeout?: number
  ): Promise<ConsensusEvent> {
    return new Promise((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | undefined;

      const onConsensus = (event: ConsensusEvent) => {
        if (event.proposalId === proposalId && (event.type === 'accepted' || event.type === 'rejected')) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          this.off(`consensus:${swarmId}`, onConsensus);
          resolve(event);
        }
      };

      this.on(`consensus:${swarmId}`, onConsensus);

      if (timeout) {
        timeoutHandle = setTimeout(() => {
          this.off(`consensus:${swarmId}`, onConsensus);
          reject(new Error(`Consensus timeout for proposal ${proposalId}`));
        }, timeout);
      }
    });
  }
}
