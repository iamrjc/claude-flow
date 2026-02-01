/**
 * @claude-flow/hive-mind Plugin
 * Queen-led Byzantine fault-tolerant swarm coordination with collective intelligence
 */

// Plugin
export { HiveMindPlugin, createHiveMindPlugin } from './plugin.js';
export { default } from './plugin.js';

// Core Components
export { QueenAgent, createQueenAgent } from './queen.js';
export { WorkerAgent, createWorkerAgent } from './worker.js';
export { ByzantineFaultTolerant, createByzantineFaultTolerant } from './byzantine-consensus.js';
export { TopologyManager, createTopologyManager } from './topology.js';

// Collective Intelligence
export {
  CollectiveMemoryStore,
  ConsensusBuilder,
  KnowledgeAggregator,
  PatternEmergence,
} from './collective-intelligence.js';

// Types
export type * from './types.js';
