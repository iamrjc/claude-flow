# MCP Tools v3

Enhanced MCP server tools that expose all core domains (agents, tasks, memory, coordination) via MCP protocol.

## Overview

This package provides 28 MCP tools across 5 categories:

- **Agent Tools** (6 tools) - Agent lifecycle management
- **Task Tools** (7 tools) - Task orchestration and DAG management
- **Memory Tools** (6 tools) - Memory storage and semantic search
- **Coordination Tools** (5 tools) - Agent coordination and consensus
- **Swarm Tools** (4 tools) - Swarm initialization and management

## Installation

```typescript
import { allMCPTools, createToolRegistry, createToolExecutor } from '@claude-flow/mcp';

// Create registry and executor
const registry = createToolRegistry(logger);
registry.registerBatch(allMCPTools);

const executor = createToolExecutor(registry, logger);
```

## Agent Tools

### agent/spawn
Spawn a new agent with specified type and capabilities.

```typescript
await executor.execute('agent/spawn', {
  type: 'coder',
  name: 'my-coder',
  capabilities: {
    canCode: true,
    canReview: true,
  },
});
```

### agent/terminate
Terminate an agent by ID.

```typescript
await executor.execute('agent/terminate', {
  agentId: 'agent-123',
});
```

### agent/list
List agents with optional filters.

```typescript
await executor.execute('agent/list', {
  status: 'idle',
  type: 'coder',
  limit: 10,
});
```

### agent/health
Get agent health metrics.

```typescript
await executor.execute('agent/health', {
  agentId: 'agent-123',
});
```

### agent/pool/create
Create an agent pool with min/max size.

```typescript
await executor.execute('agent/pool/create', {
  type: 'coder',
  minSize: 2,
  maxSize: 10,
});
```

### agent/pool/scale
Scale an agent pool to target size.

```typescript
await executor.execute('agent/pool/scale', {
  poolId: 'pool-123',
  targetSize: 5,
});
```

## Task Tools

### task/create
Create a new task with description and dependencies.

```typescript
await executor.execute('task/create', {
  description: 'Implement authentication',
  priority: 8,
  dependencies: ['task-1', 'task-2'],
});
```

### task/assign
Assign a task to an agent.

```typescript
await executor.execute('task/assign', {
  taskId: 'task-123',
  agentId: 'agent-456',
});
```

### task/status
Get task status and progress.

```typescript
await executor.execute('task/status', {
  taskId: 'task-123',
});
```

### task/complete
Mark a task as completed.

```typescript
await executor.execute('task/complete', {
  taskId: 'task-123',
  success: true,
  result: { output: 'done' },
});
```

### task/cancel
Cancel a running task.

```typescript
await executor.execute('task/cancel', {
  taskId: 'task-123',
  reason: 'Obsolete requirement',
});
```

### task/list
List tasks with filters.

```typescript
await executor.execute('task/list', {
  status: 'running',
  agentId: 'agent-123',
  limit: 20,
});
```

### task/graph
Create a task dependency graph (DAG) with cycle detection.

```typescript
await executor.execute('task/graph', {
  tasks: [
    { id: 'task-1', description: 'First task' },
    { id: 'task-2', description: 'Second task', dependencies: ['task-1'] },
    { id: 'task-3', description: 'Third task', dependencies: ['task-1', 'task-2'] },
  ],
});
```

## Memory Tools

### memory/store
Store a memory entry with key-value pair.

```typescript
await executor.execute('memory/store', {
  key: 'auth-pattern',
  value: JSON.stringify({ pattern: 'JWT' }),
  namespace: 'patterns',
  ttl: 3600,
  tags: ['auth', 'security'],
});
```

### memory/retrieve
Retrieve a memory entry by key.

```typescript
await executor.execute('memory/retrieve', {
  key: 'auth-pattern',
  namespace: 'patterns',
});
```

### memory/search
Semantic search across memory entries.

```typescript
await executor.execute('memory/search', {
  query: 'authentication patterns',
  namespace: 'patterns',
  limit: 5,
  threshold: 0.7,
});
```

### memory/delete
Delete a memory entry.

```typescript
await executor.execute('memory/delete', {
  key: 'old-data',
  namespace: 'temp',
});
```

### memory/namespace/create
Create a new memory namespace.

```typescript
await executor.execute('memory/namespace/create', {
  name: 'security',
  config: { encrypted: true },
});
```

### memory/namespace/stats
Get statistics for a namespace.

```typescript
await executor.execute('memory/namespace/stats', {
  namespace: 'patterns',
});
```

## Coordination Tools

### coordination/session/create
Create a coordination session for agent collaboration.

```typescript
await executor.execute('coordination/session/create', {
  name: 'Task Session',
  topology: 'mesh',
});
```

### coordination/session/join
Join an agent to a coordination session.

```typescript
await executor.execute('coordination/session/join', {
  sessionId: 'session-123',
  agentId: 'agent-456',
});
```

### coordination/message/send
Send a message from one agent to another.

```typescript
await executor.execute('coordination/message/send', {
  sessionId: 'session-123',
  fromAgentId: 'agent-1',
  toAgentId: 'agent-2',
  message: { type: 'task-update', data: {} },
});
```

### coordination/message/broadcast
Broadcast a message to all agents in a session.

```typescript
await executor.execute('coordination/message/broadcast', {
  sessionId: 'session-123',
  fromAgentId: 'agent-1',
  message: { type: 'announcement', data: {} },
});
```

### coordination/consensus/request
Request consensus vote from all agents.

```typescript
await executor.execute('coordination/consensus/request', {
  sessionId: 'session-123',
  proposal: { action: 'scale-up', targetSize: 10 },
  timeout: 5000,
});
```

## Swarm Tools

### swarm/init
Initialize a swarm with topology and configuration.

```typescript
await executor.execute('swarm/init', {
  topology: 'hierarchical',
  maxAgents: 15,
  strategy: 'specialized',
  consensus: 'raft',
});
```

### swarm/status
Get current swarm status and metrics.

```typescript
await executor.execute('swarm/status', {
  swarmId: 'swarm-123', // Optional, defaults to current
});
```

### swarm/topology/set
Change swarm topology dynamically.

```typescript
await executor.execute('swarm/topology/set', {
  swarmId: 'swarm-123',
  topology: 'mesh',
});
```

### swarm/metrics
Get detailed swarm performance metrics.

```typescript
await executor.execute('swarm/metrics', {
  swarmId: 'swarm-123', // Optional
});
```

## Tool Executor

The `ToolExecutor` provides execution with validation, error handling, and metrics.

### Configuration

```typescript
const executor = createToolExecutor(registry, logger, {
  defaultTimeout: 30000,  // 30 seconds
  enableMetrics: true,    // Collect execution metrics
  validateInput: true,    // Validate against schemas
});
```

### Metrics

```typescript
// Get all execution metrics
const metrics = executor.getMetrics();

// Get metrics for a specific tool
const toolMetrics = executor.getToolMetrics('agent/spawn');

// Get aggregated metrics
const aggregated = executor.getAggregatedMetrics();
// Returns: { 'agent/spawn': { calls: 10, successes: 9, failures: 1, ... } }

// Get success rate
const rate = executor.getSuccessRate('agent/spawn');

// Get average execution time
const avgTime = executor.getAverageExecutionTime('agent/spawn');

// Clear metrics
executor.clearMetrics();
```

## Error Handling

All tools return standardized error responses:

```typescript
{
  content: [{
    type: 'text',
    text: JSON.stringify({
      error: {
        code: -32602,  // MCP error code
        message: 'Invalid input: type is required'
      }
    })
  }],
  isError: true
}
```

Error codes follow MCP protocol:
- `-32700` - Parse error
- `-32600` - Invalid request
- `-32601` - Method not found
- `-32602` - Invalid params
- `-32603` - Internal error

## Testing

Comprehensive test suite with 47 tests covering:

- Tool registration and validation
- All 28 tool executions
- Input validation
- Error handling
- Metrics collection
- Schema validation

```bash
npm test
```

## Architecture

```
tools/
├── agent-tools.ts       # 6 agent management tools
├── task-tools.ts        # 7 task orchestration tools
├── memory-tools.ts      # 6 memory management tools
├── coordination-tools.ts # 5 coordination tools
├── swarm-tools.ts       # 4 swarm management tools
├── schemas.ts           # JSON schemas for all tools
├── tool-executor.ts     # Execution engine with metrics
└── index.ts             # Module exports
```

## Usage in MCP Server

```typescript
import { createMCPServer, allMCPTools } from '@claude-flow/mcp';

const server = createMCPServer({
  name: 'claude-flow-server',
  version: '3.0.0',
  transport: 'stdio',
});

// Register all tools
server.getToolRegistry().registerBatch(allMCPTools);

await server.start();
```

## License

MIT
