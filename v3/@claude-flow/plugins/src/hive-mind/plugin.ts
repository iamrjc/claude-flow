/**
 * HiveMind Plugin
 * Queen-led Byzantine fault-tolerant swarm coordination with collective intelligence
 */

import type {
  PluginMetadata,
  PluginContext,
  PluginLifecycleState,
  AgentTypeDefinition,
  MCPToolDefinition,
  HealthCheckResult,
} from '../types/index.js';
import type { IPlugin } from '../core/plugin-interface.js';
import { createQueenAgent, type QueenAgent } from './queen.js';
import { createWorkerAgent, type WorkerAgent } from './worker.js';
import { createTopologyManager, type TopologyManager } from './topology.js';
import {
  CollectiveMemoryStore,
  ConsensusBuilder,
  KnowledgeAggregator,
  PatternEmergence,
} from './collective-intelligence.js';
import type { HiveMindConfig, SwarmTopology } from './types.js';

export class HiveMindPlugin implements IPlugin {
  readonly metadata: PluginMetadata = {
    name: '@claude-flow/hive-mind',
    version: '1.0.0-alpha.1',
    description: 'Queen-led Byzantine fault-tolerant swarm coordination with collective intelligence',
    author: 'Claude Flow Team',
    license: 'MIT',
    tags: ['swarm', 'consensus', 'byzantine', 'hive-mind', 'coordination'],
  };

  private _state: PluginLifecycleState = 'uninitialized';
  private context?: PluginContext;
  private queen?: QueenAgent;
  private workers: Map<string, WorkerAgent> = new Map();
  private topologyManager?: TopologyManager;
  private collectiveMemory?: CollectiveMemoryStore;
  private consensusBuilder?: ConsensusBuilder;
  private knowledgeAggregator?: KnowledgeAggregator;
  private patternEmergence?: PatternEmergence;

  get state(): PluginLifecycleState {
    return this._state;
  }

  // ===== LIFECYCLE =====

  async initialize(context: PluginContext): Promise<void> {
    this._state = 'initializing';
    this.context = context;

    context.logger.info('Initializing HiveMind plugin...');

    // Get configuration
    const config = context.config.settings as Partial<HiveMindConfig>;

    const hivemindConfig: HiveMindConfig = {
      maxWorkers: config.maxWorkers || 15,
      faultTolerance: config.faultTolerance || 1,
      topology: config.topology || 'hierarchical-mesh',
      heartbeatIntervalMs: config.heartbeatIntervalMs || 5000,
      workerTimeoutMs: config.workerTimeoutMs || 15000,
      electionTimeoutMs: config.electionTimeoutMs || 10000,
      consensusTimeoutMs: config.consensusTimeoutMs || 30000,
      enableFailover: config.enableFailover ?? true,
      memoryCapacity: config.memoryCapacity || 10000,
    };

    // Initialize topology manager
    this.topologyManager = createTopologyManager({
      type: hivemindConfig.topology,
      maxConnectionsPerWorker: 5,
      hierarchyLevels: 2,
      adaptIntervalMs: 60000,
    });

    await this.topologyManager.initialize();

    // Initialize collective intelligence components
    this.collectiveMemory = new CollectiveMemoryStore('hive-mind');
    this.consensusBuilder = new ConsensusBuilder();
    this.knowledgeAggregator = new KnowledgeAggregator();
    this.patternEmergence = new PatternEmergence();

    // Store services in context
    context.services.set('hivemind.config', hivemindConfig);
    context.services.set('hivemind.topology', this.topologyManager);
    context.services.set('hivemind.memory', this.collectiveMemory);
    context.services.set('hivemind.consensus', this.consensusBuilder);
    context.services.set('hivemind.aggregator', this.knowledgeAggregator);
    context.services.set('hivemind.patterns', this.patternEmergence);

    this._state = 'initialized';
    context.logger.info('HiveMind plugin initialized successfully');
  }

  async shutdown(): Promise<void> {
    this._state = 'shutting-down';
    this.context?.logger.info('Shutting down HiveMind plugin...');

    // Shutdown queen
    if (this.queen) {
      await this.queen.shutdown();
    }

    // Shutdown all workers
    for (const worker of this.workers.values()) {
      await worker.shutdown();
    }

    // Shutdown topology manager
    if (this.topologyManager) {
      await this.topologyManager.shutdown();
    }

    this.workers.clear();
    this._state = 'shutdown';
    this.context?.logger.info('HiveMind plugin shutdown complete');
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};

    // Check queen health
    if (this.queen) {
      const isLeader = this.queen.isLeader();
      checks['queen'] = {
        healthy: isLeader,
        message: isLeader ? 'Queen is leader' : 'Queen is not leader',
      };
    } else {
      checks['queen'] = {
        healthy: false,
        message: 'Queen not initialized',
      };
    }

    // Check worker health
    const activeWorkers = Array.from(this.workers.values())
      .filter(w => w.isAvailable()).length;

    checks['workers'] = {
      healthy: activeWorkers > 0,
      message: `${activeWorkers}/${this.workers.size} workers active`,
    };

    // Check topology
    if (this.topologyManager) {
      const partitions = await this.topologyManager.detectPartitions();
      checks['topology'] = {
        healthy: partitions.length === 1,
        message: partitions.length === 1 ? 'Network connected' : `${partitions.length} partitions detected`,
      };
    }

    // Check collective memory
    if (this.collectiveMemory) {
      const stats = this.collectiveMemory.getStats();
      checks['memory'] = {
        healthy: true,
        message: `${stats.totalEntries} entries, ${stats.totalPatterns} patterns`,
      };
    }

    const allHealthy = Object.values(checks).every(c => c.healthy);

    return {
      healthy: allHealthy,
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date(),
    };
  }

  // ===== EXTENSION POINTS =====

  registerAgentTypes(): AgentTypeDefinition[] {
    return [
      {
        type: 'hive-queen',
        name: 'Hive Queen',
        description: 'Central coordinator for Byzantine fault-tolerant swarm with directive distribution and collective decision aggregation',
        capabilities: [
          'leadership-election',
          'directive-distribution',
          'collective-decisions',
          'worker-monitoring',
          'consensus-coordination',
          'health-monitoring',
        ],
        systemPrompt: `You are a Hive Queen coordinator. Your role is to:
- Lead the swarm through Byzantine fault-tolerant consensus
- Distribute directives to workers based on their capabilities
- Monitor worker health and handle failures gracefully
- Aggregate collective decisions from the swarm
- Coordinate consensus on critical decisions
- Maintain swarm cohesion and efficiency`,
        metadata: {
          role: 'queen',
          faultTolerance: 'byzantine',
        },
      },
      {
        type: 'hive-worker',
        name: 'Hive Worker',
        description: 'Worker agent that receives tasks from queen, executes them, and reports results with heartbeat mechanism',
        capabilities: [
          'task-execution',
          'result-reporting',
          'heartbeat',
          'graceful-degradation',
          'collective-voting',
        ],
        systemPrompt: `You are a Hive Worker. Your role is to:
- Receive and execute tasks from the queen
- Report results and maintain regular heartbeat
- Participate in collective decision-making
- Handle graceful degradation when queen is unavailable
- Collaborate with other workers when needed`,
        metadata: {
          role: 'worker',
          autonomy: 'low',
        },
      },
    ];
  }

  registerMCPTools(): MCPToolDefinition[] {
    return [
      {
        name: 'hive_mind_init',
        description: 'Initialize a new hive-mind swarm with queen and workers',
        inputSchema: {
          type: 'object',
          properties: {
            topology: {
              type: 'string',
              enum: ['hierarchical', 'mesh', 'hierarchical-mesh', 'adaptive'],
              description: 'Network topology type',
            },
            maxWorkers: {
              type: 'number',
              description: 'Maximum number of workers',
            },
            faultTolerance: {
              type: 'number',
              description: 'Number of Byzantine faults to tolerate (f < n/3)',
            },
          },
          required: ['topology'],
        },
        handler: async (input) => {
          const topology = input.topology as SwarmTopology;
          const maxWorkers = (input.maxWorkers as number) || 15;
          const faultTolerance = (input.faultTolerance as number) || 1;

          // Initialize queen
          this.queen = createQueenAgent({
            id: 'queen_1',
            maxWorkers,
            heartbeatIntervalMs: 5000,
            workerTimeoutMs: 15000,
            electionTimeoutMs: 10000,
            consensusTimeoutMs: 30000,
            faultTolerance,
          });

          await this.queen.initialize();
          await this.topologyManager?.addNode('queen_1', 'queen');

          return {
            content: [{
              type: 'text',
              text: `Hive-mind initialized with topology: ${topology}, max workers: ${maxWorkers}, fault tolerance: ${faultTolerance}`
            }]
          };
        },
      },
      {
        name: 'hive_mind_spawn_worker',
        description: 'Spawn a new worker and register it with the queen',
        inputSchema: {
          type: 'object',
          properties: {
            workerId: {
              type: 'string',
              description: 'Unique worker ID',
            },
            capabilities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Worker capabilities',
            },
          },
          required: ['workerId', 'capabilities'],
        },
        handler: async (input) => {
          const workerId = input.workerId as string;
          const capabilities = input.capabilities as string[];

          if (!this.queen) {
            return {
              content: [{ type: 'text', text: 'Error: Queen not initialized. Call hive_mind_init first.' }],
              isError: true,
            };
          }

          // Create worker
          const worker = createWorkerAgent({
            id: workerId,
            capabilities,
            heartbeatIntervalMs: 5000,
            maxConcurrentTasks: 5,
            degradationThreshold: 0.5,
          });

          await worker.initialize();
          await worker.connectToQueen('queen_1');

          // Register with queen
          await this.queen.registerWorker(workerId, capabilities);

          // Add to topology
          await this.topologyManager?.addNode(workerId, 'worker');

          this.workers.set(workerId, worker);

          return {
            content: [{
              type: 'text',
              text: `Worker ${workerId} spawned with capabilities: ${capabilities.join(', ')}`
            }]
          };
        },
      },
      {
        name: 'hive_mind_issue_directive',
        description: 'Issue a directive from queen to workers',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['task', 'query', 'coordination', 'consensus'],
              description: 'Directive type',
            },
            payload: {
              type: 'object',
              description: 'Directive payload',
            },
            capabilities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Required capabilities',
            },
            priority: {
              type: 'number',
              description: 'Priority (0-100)',
            },
          },
          required: ['type', 'payload'],
        },
        handler: async (input) => {
          if (!this.queen) {
            return {
              content: [{ type: 'text', text: 'Error: Queen not initialized' }],
              isError: true,
            };
          }

          const directiveId = await this.queen.issueDirective(
            input.type as any,
            input.payload,
            input.capabilities as string[],
            (input.priority as number) || 50
          );

          return {
            content: [{
              type: 'text',
              text: `Directive issued: ${directiveId}`
            }]
          };
        },
      },
      {
        name: 'hive_mind_propose_decision',
        description: 'Propose a collective decision to the swarm',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Decision question',
            },
            options: {
              type: 'array',
              description: 'Decision options',
            },
            consensusType: {
              type: 'string',
              enum: ['majority', 'supermajority', 'unanimous', 'weighted', 'byzantine'],
              description: 'Consensus type',
            },
          },
          required: ['question', 'options'],
        },
        handler: async (input) => {
          if (!this.queen) {
            return {
              content: [{ type: 'text', text: 'Error: Queen not initialized' }],
              isError: true,
            };
          }

          const decisionId = await this.queen.proposeDecision(
            input.question as string,
            input.options as unknown[],
            (input.consensusType as any) || 'majority'
          );

          return {
            content: [{
              type: 'text',
              text: `Decision proposed: ${decisionId}. Awaiting votes from workers...`
            }]
          };
        },
      },
      {
        name: 'hive_mind_get_metrics',
        description: 'Get hive-mind performance metrics',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          if (!this.queen) {
            return {
              content: [{ type: 'text', text: 'Error: Queen not initialized' }],
              isError: true,
            };
          }

          const metrics = this.queen.getMetrics();

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(metrics, null, 2)
            }]
          };
        },
      },
      {
        name: 'hive_mind_detect_partitions',
        description: 'Detect network partitions in the swarm',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          if (!this.topologyManager) {
            return {
              content: [{ type: 'text', text: 'Error: Topology manager not initialized' }],
              isError: true,
            };
          }

          const partitions = await this.topologyManager.detectPartitions();

          return {
            content: [{
              type: 'text',
              text: partitions.length === 1
                ? 'Network is fully connected'
                : `${partitions.length} partitions detected: ${JSON.stringify(partitions)}`
            }]
          };
        },
      },
    ];
  }
}

// ===== FACTORY =====

export function createHiveMindPlugin(): HiveMindPlugin {
  return new HiveMindPlugin();
}

export default createHiveMindPlugin;
