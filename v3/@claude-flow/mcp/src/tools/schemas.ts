/**
 * @claude-flow/mcp - Tool Schemas
 *
 * JSON schemas for all MCP tools following MCP protocol spec
 */

import type { JSONSchema } from '../types.js';

// ============================================================================
// Agent Tool Schemas
// ============================================================================

export const agentSpawnSchema: JSONSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Agent type (coder, researcher, reviewer, tester, architect, etc.)',
      enum: [
        'coder',
        'researcher',
        'reviewer',
        'tester',
        'architect',
        'planner',
        'coordinator',
        'security-architect',
        'security-auditor',
        'memory-specialist',
        'performance-engineer',
      ],
    },
    name: {
      type: 'string',
      description: 'Optional agent name',
    },
    capabilities: {
      type: 'object',
      description: 'Agent capabilities configuration',
      properties: {
        canCode: { type: 'boolean' },
        canReview: { type: 'boolean' },
        canTest: { type: 'boolean' },
        canResearch: { type: 'boolean' },
        canArchitect: { type: 'boolean' },
        canCoordinate: { type: 'boolean' },
        specializations: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    config: {
      type: 'object',
      description: 'Additional agent configuration',
    },
  },
  required: ['type'],
};

export const agentTerminateSchema: JSONSchema = {
  type: 'object',
  properties: {
    agentId: {
      type: 'string',
      description: 'Agent ID to terminate',
    },
  },
  required: ['agentId'],
};

export const agentListSchema: JSONSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      description: 'Filter by agent status',
      enum: ['initializing', 'idle', 'busy', 'terminated', 'error'],
    },
    type: {
      type: 'string',
      description: 'Filter by agent type',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of agents to return',
      minimum: 1,
      maximum: 100,
    },
  },
};

export const agentHealthSchema: JSONSchema = {
  type: 'object',
  properties: {
    agentId: {
      type: 'string',
      description: 'Agent ID to check health',
    },
  },
  required: ['agentId'],
};

export const agentPoolCreateSchema: JSONSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Agent type for the pool',
    },
    minSize: {
      type: 'number',
      description: 'Minimum pool size',
      minimum: 1,
    },
    maxSize: {
      type: 'number',
      description: 'Maximum pool size',
      minimum: 1,
    },
    config: {
      type: 'object',
      description: 'Pool configuration',
    },
  },
  required: ['type', 'minSize', 'maxSize'],
};

export const agentPoolScaleSchema: JSONSchema = {
  type: 'object',
  properties: {
    poolId: {
      type: 'string',
      description: 'Pool ID to scale',
    },
    targetSize: {
      type: 'number',
      description: 'Target pool size',
      minimum: 0,
    },
  },
  required: ['poolId', 'targetSize'],
};

// ============================================================================
// Task Tool Schemas
// ============================================================================

export const taskCreateSchema: JSONSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'Task description',
    },
    priority: {
      type: 'number',
      description: 'Task priority (0-10)',
      minimum: 0,
      maximum: 10,
    },
    requirements: {
      type: 'object',
      description: 'Task requirements',
    },
    dependencies: {
      type: 'array',
      description: 'Task dependencies (other task IDs)',
      items: { type: 'string' },
    },
    metadata: {
      type: 'object',
      description: 'Additional metadata',
    },
  },
  required: ['description'],
};

export const taskAssignSchema: JSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      description: 'Task ID to assign',
    },
    agentId: {
      type: 'string',
      description: 'Agent ID to assign to',
    },
  },
  required: ['taskId', 'agentId'],
};

export const taskStatusSchema: JSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      description: 'Task ID to check status',
    },
  },
  required: ['taskId'],
};

export const taskCompleteSchema: JSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      description: 'Task ID to mark complete',
    },
    result: {
      type: 'object',
      description: 'Task result data',
    },
    success: {
      type: 'boolean',
      description: 'Whether task completed successfully',
    },
  },
  required: ['taskId'],
};

export const taskCancelSchema: JSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      description: 'Task ID to cancel',
    },
    reason: {
      type: 'string',
      description: 'Cancellation reason',
    },
  },
  required: ['taskId'],
};

export const taskListSchema: JSONSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      description: 'Filter by task status',
      enum: ['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled'],
    },
    agentId: {
      type: 'string',
      description: 'Filter by assigned agent',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of tasks to return',
      minimum: 1,
      maximum: 100,
    },
  },
};

export const taskGraphSchema: JSONSchema = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      description: 'Array of task definitions',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          description: { type: 'string' },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['id', 'description'],
      },
    },
  },
  required: ['tasks'],
};

// ============================================================================
// Memory Tool Schemas
// ============================================================================

export const memoryStoreSchema: JSONSchema = {
  type: 'object',
  properties: {
    key: {
      type: 'string',
      description: 'Memory key',
    },
    value: {
      type: 'string',
      description: 'Memory value (JSON string or text)',
    },
    namespace: {
      type: 'string',
      description: 'Memory namespace',
    },
    ttl: {
      type: 'number',
      description: 'Time-to-live in seconds',
      minimum: 0,
    },
    tags: {
      type: 'array',
      description: 'Tags for categorization',
      items: { type: 'string' },
    },
  },
  required: ['key', 'value'],
};

export const memoryRetrieveSchema: JSONSchema = {
  type: 'object',
  properties: {
    key: {
      type: 'string',
      description: 'Memory key to retrieve',
    },
    namespace: {
      type: 'string',
      description: 'Memory namespace',
    },
  },
  required: ['key'],
};

export const memorySearchSchema: JSONSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search query for semantic search',
    },
    namespace: {
      type: 'string',
      description: 'Memory namespace',
    },
    limit: {
      type: 'number',
      description: 'Maximum results',
      minimum: 1,
      maximum: 100,
    },
    threshold: {
      type: 'number',
      description: 'Similarity threshold (0-1)',
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['query'],
};

export const memoryDeleteSchema: JSONSchema = {
  type: 'object',
  properties: {
    key: {
      type: 'string',
      description: 'Memory key to delete',
    },
    namespace: {
      type: 'string',
      description: 'Memory namespace',
    },
  },
  required: ['key'],
};

export const memoryNamespaceCreateSchema: JSONSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Namespace name',
    },
    config: {
      type: 'object',
      description: 'Namespace configuration',
    },
  },
  required: ['name'],
};

export const memoryNamespaceStatsSchema: JSONSchema = {
  type: 'object',
  properties: {
    namespace: {
      type: 'string',
      description: 'Namespace to get stats for',
    },
  },
  required: ['namespace'],
};

// ============================================================================
// Coordination Tool Schemas
// ============================================================================

export const coordinationSessionCreateSchema: JSONSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Session name',
    },
    topology: {
      type: 'string',
      description: 'Coordination topology',
      enum: ['hierarchical', 'mesh', 'ring', 'star', 'hybrid'],
    },
    config: {
      type: 'object',
      description: 'Session configuration',
    },
  },
  required: ['name'],
};

export const coordinationSessionJoinSchema: JSONSchema = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Session ID to join',
    },
    agentId: {
      type: 'string',
      description: 'Agent ID joining the session',
    },
  },
  required: ['sessionId', 'agentId'],
};

export const coordinationMessageSendSchema: JSONSchema = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Session ID',
    },
    fromAgentId: {
      type: 'string',
      description: 'Sender agent ID',
    },
    toAgentId: {
      type: 'string',
      description: 'Recipient agent ID',
    },
    message: {
      type: 'object',
      description: 'Message payload',
    },
  },
  required: ['sessionId', 'fromAgentId', 'toAgentId', 'message'],
};

export const coordinationMessageBroadcastSchema: JSONSchema = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Session ID',
    },
    fromAgentId: {
      type: 'string',
      description: 'Sender agent ID',
    },
    message: {
      type: 'object',
      description: 'Message payload',
    },
  },
  required: ['sessionId', 'fromAgentId', 'message'],
};

export const coordinationConsensusRequestSchema: JSONSchema = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Session ID',
    },
    proposal: {
      type: 'object',
      description: 'Proposal for consensus vote',
    },
    timeout: {
      type: 'number',
      description: 'Timeout in milliseconds',
      minimum: 0,
    },
  },
  required: ['sessionId', 'proposal'],
};

// ============================================================================
// Swarm Tool Schemas
// ============================================================================

export const swarmInitSchema: JSONSchema = {
  type: 'object',
  properties: {
    topology: {
      type: 'string',
      description: 'Swarm topology',
      enum: ['hierarchical', 'mesh', 'ring', 'star', 'hybrid'],
    },
    maxAgents: {
      type: 'number',
      description: 'Maximum number of agents',
      minimum: 1,
    },
    strategy: {
      type: 'string',
      description: 'Agent coordination strategy',
      enum: ['balanced', 'specialized', 'adaptive'],
    },
    consensus: {
      type: 'string',
      description: 'Consensus mechanism',
      enum: ['byzantine', 'raft', 'gossip', 'crdt', 'quorum'],
    },
    config: {
      type: 'object',
      description: 'Additional swarm configuration',
    },
  },
  required: ['topology'],
};

export const swarmStatusSchema: JSONSchema = {
  type: 'object',
  properties: {
    swarmId: {
      type: 'string',
      description: 'Swarm ID (optional, defaults to current)',
    },
  },
};

export const swarmTopologySetSchema: JSONSchema = {
  type: 'object',
  properties: {
    swarmId: {
      type: 'string',
      description: 'Swarm ID',
    },
    topology: {
      type: 'string',
      description: 'New topology',
      enum: ['hierarchical', 'mesh', 'ring', 'star', 'hybrid'],
    },
  },
  required: ['swarmId', 'topology'],
};

export const swarmMetricsSchema: JSONSchema = {
  type: 'object',
  properties: {
    swarmId: {
      type: 'string',
      description: 'Swarm ID (optional, defaults to current)',
    },
  },
};
