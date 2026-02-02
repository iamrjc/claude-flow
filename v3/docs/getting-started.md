# Getting Started with Claude Flow v3

Welcome to Claude Flow v3 - a next-generation AI agent coordination system built on Domain-Driven Design principles with a 15-agent hierarchical mesh architecture.

## Table of Contents

- [Installation](#installation)
- [First Agent](#first-agent)
- [First Task](#first-task)
- [Basic Swarm](#basic-swarm)
- [Next Steps](#next-steps)

## Installation

### Prerequisites

- **Node.js**: >= 20.0.0
- **pnpm**: >= 8.0.0 (recommended) or npm >= 9.0.0
- **TypeScript**: >= 5.3.0

### Quick Install

```bash
# Clone the repository
git clone https://github.com/ruvnet/claude-flow.git
cd claude-flow/v3

# Install dependencies
pnpm install

# Build all modules
pnpm build

# Verify installation
npx @claude-flow/cli@alpha doctor
```

### Package Installation

Install Claude Flow as a dependency in your project:

```bash
# Using pnpm (recommended)
pnpm add @claude-flow/cli@alpha

# Using npm
npm install @claude-flow/cli@alpha

# Using bun
bun add @claude-flow/cli@alpha
```

## First Agent

Let's spawn your first agent using the CLI:

```bash
# Spawn a simple coder agent
npx @claude-flow/cli@alpha agent spawn -t coder --name my-first-agent

# Check agent status
npx @claude-flow/cli@alpha agent status --agent-id my-first-agent

# List all active agents
npx @claude-flow/cli@alpha agent list
```

### Programmatic Agent Creation

```typescript
import { AgentLifecycleService } from '@claude-flow/agents';
import { AgentRepository } from '@claude-flow/agents/infrastructure';

// Initialize agent lifecycle service
const agentRepo = new AgentRepository();
const lifecycle = new AgentLifecycleService(agentRepo);

// Spawn an agent
const agent = await lifecycle.spawnAgent({
  type: 'coder',
  name: 'my-coder',
  config: {
    model: 'claude-sonnet-4',
    maxTokens: 4096,
  },
  priority: 'normal',
});

console.log(`Agent spawned: ${agent.id}`);

// Check agent health
const health = await lifecycle.checkHealth(agent.id);
console.log(`Agent health: ${health.status}`);
```

## First Task

Create and execute your first task:

```bash
# Create a simple task
npx @claude-flow/cli@alpha task create \
  --title "Implement hello world function" \
  --description "Create a simple hello world function in TypeScript" \
  --priority high

# Assign task to an agent
npx @claude-flow/cli@alpha task assign --task-id <task-id> --agent-id <agent-id>

# Check task status
npx @claude-flow/cli@alpha task status --task-id <task-id>
```

### Programmatic Task Creation

```typescript
import { TaskExecutionService } from '@claude-flow/agents';
import { TaskRepository } from '@claude-flow/agents/infrastructure';

// Initialize task service
const taskRepo = new TaskRepository();
const taskService = new TaskExecutionService(taskRepo);

// Create a task
const task = await taskService.createTask({
  title: 'Implement authentication',
  description: 'Add JWT authentication to the API',
  priority: 'high',
  estimatedDuration: 3600000, // 1 hour in milliseconds
  dependencies: [],
});

console.log(`Task created: ${task.id}`);

// Execute the task
const result = await taskService.executeTask(task.id, agentId);
console.log(`Task result: ${result.status}`);
```

## Basic Swarm

Initialize a swarm for multi-agent coordination:

```bash
# Initialize hierarchical mesh swarm (recommended for v3)
npx @claude-flow/cli@alpha swarm init \
  --topology hierarchical-mesh \
  --max-agents 15 \
  --strategy adaptive

# Spawn multiple agents
npx @claude-flow/cli@alpha agent spawn -t queen-coordinator --name coordinator
npx @claude-flow/cli@alpha agent spawn -t coder --name coder-1
npx @claude-flow/cli@alpha agent spawn -t coder --name coder-2
npx @claude-flow/cli@alpha agent spawn -t tester --name tester-1
npx @claude-flow/cli@alpha agent spawn -t reviewer --name reviewer-1

# Check swarm status
npx @claude-flow/cli@alpha swarm status --include-agents --include-metrics

# Scale swarm
npx @claude-flow/cli@alpha swarm scale --target-agents 10 --strategy gradual
```

### Programmatic Swarm Setup

```typescript
import { UnifiedSwarmCoordinator } from '@claude-flow/swarm';
import { AgentRegistry } from '@claude-flow/swarm/coordination';
import { TaskOrchestrator } from '@claude-flow/swarm/coordination';

// Initialize swarm coordinator
const coordinator = new UnifiedSwarmCoordinator({
  topology: 'hierarchical-mesh',
  maxAgents: 15,
  config: {
    communicationProtocol: 'message-bus',
    consensusMechanism: 'majority',
    failureHandling: 'failover',
    loadBalancing: true,
    autoScaling: true,
  },
});

// Initialize the swarm
await coordinator.initialize();

// Spawn agents
const queenAgent = await coordinator.spawnAgent({
  agentType: 'queen-coordinator',
  id: 'queen-1',
  priority: 'critical',
});

const coderAgents = await Promise.all([
  coordinator.spawnAgent({ agentType: 'coder', priority: 'high' }),
  coordinator.spawnAgent({ agentType: 'coder', priority: 'high' }),
]);

const testerAgent = await coordinator.spawnAgent({
  agentType: 'tester',
  priority: 'normal',
});

// Submit a task to the swarm
const task = await coordinator.submitTask({
  title: 'Build authentication system',
  description: 'Implement complete JWT authentication',
  priority: 'high',
  requiredCapabilities: ['coding', 'testing', 'security'],
});

// Monitor swarm status
const status = await coordinator.getSwarmStatus({
  includeAgents: true,
  includeMetrics: true,
  includeTopology: true,
});

console.log(`Swarm has ${status.activeAgents} active agents`);
console.log(`Efficiency: ${status.metrics.efficiency}%`);
```

### Working with Memory

Store and retrieve memories across your swarm:

```bash
# Store a memory
npx @claude-flow/cli@alpha memory store \
  --key "auth-pattern" \
  --value "JWT with refresh tokens" \
  --namespace patterns \
  --tags "authentication,security"

# Search memories (semantic search with HNSW indexing)
npx @claude-flow/cli@alpha memory search \
  --query "authentication patterns" \
  --limit 5

# List memories
npx @claude-flow/cli@alpha memory list \
  --namespace patterns \
  --sort-by importance
```

### Programmatic Memory Usage

```typescript
import { HybridMemoryRepository } from '@claude-flow/memory';
import { MemoryApplicationService } from '@claude-flow/memory/application';

// Initialize hybrid memory (SQLite + AgentDB)
const memoryRepo = new HybridMemoryRepository({
  backend: 'agentdb',
  vectorSearch: true,
  hnswEnabled: true,
});

// Store a memory
await memoryRepo.store({
  content: 'Use bcrypt for password hashing with salt rounds of 12',
  type: 'procedural',
  category: 'security',
  tags: ['authentication', 'password', 'best-practice'],
  importance: 0.9,
});

// Search memories (semantic search)
const results = await memoryRepo.search({
  query: 'password security best practices',
  searchType: 'hybrid',
  limit: 10,
  minRelevance: 0.7,
});

results.results.forEach(memory => {
  console.log(`[${memory.relevance.toFixed(2)}] ${memory.content}`);
});
```

## Using Hooks for Intelligence

Hooks enable self-learning and optimization:

```bash
# Before starting work
npx @claude-flow/cli@alpha hooks pre-task \
  --description "Implement user authentication"

# After completing work
npx @claude-flow/cli@alpha hooks post-task \
  --task-id <task-id> \
  --success true \
  --store-results true

# Route tasks intelligently
npx @claude-flow/cli@alpha hooks route \
  --task "Refactor authentication module"

# Train neural patterns
npx @claude-flow/cli@alpha hooks pretrain \
  --model-type moe \
  --epochs 10
```

## Configuration

Create a `claude-flow.config.json` in your project root:

```json
{
  "version": "3.0.0",
  "swarm": {
    "topology": "hierarchical-mesh",
    "maxAgents": 15,
    "autoScaling": true
  },
  "memory": {
    "backend": "hybrid",
    "vectorSearch": true,
    "hnswEnabled": true,
    "cacheSize": 10000
  },
  "providers": {
    "default": "anthropic",
    "anthropic": {
      "apiKey": "${ANTHROPIC_API_KEY}",
      "defaultModel": "claude-sonnet-4-5"
    }
  },
  "hooks": {
    "enabled": true,
    "autoLearn": true,
    "pretraining": {
      "enabled": true,
      "modelType": "moe"
    }
  },
  "performance": {
    "flashAttention": true,
    "quantization": true,
    "batchSize": 32
  }
}
```

## Environment Variables

Create a `.env` file:

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Configuration
CLAUDE_FLOW_CONFIG=./claude-flow.config.json
CLAUDE_FLOW_LOG_LEVEL=info

# Memory
CLAUDE_FLOW_MEMORY_BACKEND=hybrid
CLAUDE_FLOW_MEMORY_PATH=./data/memory

# MCP Server
CLAUDE_FLOW_MCP_PORT=3000
CLAUDE_FLOW_MCP_HOST=localhost
CLAUDE_FLOW_MCP_TRANSPORT=stdio
```

## Health Check

Verify your installation:

```bash
# Run health diagnostics
npx @claude-flow/cli@alpha doctor --fix

# Expected output:
# ✓ Node.js version (v20.x.x)
# ✓ npm version (9.x.x)
# ✓ Git installation
# ✓ Config file validity
# ✓ Memory database initialized
# ✓ API keys configured
# ✓ Disk space (50GB available)
# ✓ TypeScript installation
```

## Next Steps

Now that you have Claude Flow v3 running:

1. **Learn the Architecture**: Read [Architecture Overview](./architecture/overview.md)
2. **Explore Agent Management**: See [Agent Management Guide](./guides/agent-management.md)
3. **Master Task Execution**: Check [Task Execution Guide](./guides/task-execution.md)
4. **Use Memory System**: Study [Memory Usage Guide](./guides/memory-usage.md)
5. **Coordinate Swarms**: Review [Swarm Coordination Guide](./guides/swarm-coordination.md)
6. **Build Plugins**: Read [Plugin Development Guide](./guides/plugin-development.md)
7. **MCP Tools Reference**: See [MCP Tools API](./api/mcp-tools.md)
8. **CLI Commands**: Check [CLI Commands Reference](./api/cli-commands.md)

## Common Patterns

### Task Workflow with Dependencies

```typescript
// Create a task graph with dependencies
const tasks = await Promise.all([
  taskService.createTask({
    title: 'Design database schema',
    priority: 'high',
  }),
  taskService.createTask({
    title: 'Implement data models',
    priority: 'high',
  }),
  taskService.createTask({
    title: 'Write tests',
    priority: 'normal',
  }),
]);

// Set up dependencies (implement → design, tests → implement)
await taskService.addDependency(tasks[1].id, tasks[0].id);
await taskService.addDependency(tasks[2].id, tasks[1].id);

// Execute in topological order
for (const task of tasks) {
  await taskService.executeTask(task.id, agentId);
}
```

### Multi-Agent Collaboration

```typescript
// Spawn specialized agents
const agents = await Promise.all([
  coordinator.spawnAgent({ agentType: 'researcher' }),
  coordinator.spawnAgent({ agentType: 'system-architect' }),
  coordinator.spawnAgent({ agentType: 'coder' }),
  coordinator.spawnAgent({ agentType: 'tester' }),
  coordinator.spawnAgent({ agentType: 'reviewer' }),
]);

// Coordinate a complex task
const task = await coordinator.submitTask({
  title: 'Build microservice',
  description: 'Design and implement a new microservice',
  priority: 'critical',
  workflow: [
    { phase: 'research', agent: agents[0].id },
    { phase: 'design', agent: agents[1].id },
    { phase: 'implementation', agent: agents[2].id },
    { phase: 'testing', agent: agents[3].id },
    { phase: 'review', agent: agents[4].id },
  ],
});

// Monitor progress
const progress = await coordinator.getTaskProgress(task.id);
console.log(`Current phase: ${progress.currentPhase}`);
console.log(`Completion: ${progress.percentComplete}%`);
```

## Troubleshooting

### Agent Won't Spawn

```bash
# Check agent pool
npx @claude-flow/cli@alpha agent pool

# Check system resources
npx @claude-flow/cli@alpha status --watch

# View agent logs
npx @claude-flow/cli@alpha agent logs --agent-id <agent-id>
```

### Memory Search Not Working

```bash
# Initialize memory database
npx @claude-flow/cli@alpha memory init --force

# Rebuild HNSW index
npx @claude-flow/cli@alpha memory rebuild-index

# Test embeddings
npx @claude-flow/cli@alpha embeddings test
```

### Swarm Coordination Issues

```bash
# Reset swarm state
npx @claude-flow/cli@alpha swarm reset

# Check consensus
npx @claude-flow/cli@alpha swarm consensus

# View message bus
npx @claude-flow/cli@alpha swarm messages --live
```

## Support

- **Documentation**: https://github.com/ruvnet/claude-flow/tree/main/v3/docs
- **Issues**: https://github.com/ruvnet/claude-flow/issues
- **Discussions**: https://github.com/ruvnet/claude-flow/discussions
- **Discord**: https://discord.gg/claude-flow

## What's Next?

Continue your journey with:

- [Architecture Overview](./architecture/overview.md) - Understand the system design
- [Domain Structure](./architecture/domains.md) - Learn about DDD architecture
- [Agent Management](./guides/agent-management.md) - Master agent lifecycle
- [Example Projects](../examples/) - See working code examples

Happy coding with Claude Flow v3!
