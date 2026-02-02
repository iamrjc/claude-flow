# Agent Management Guide

Complete guide to managing AI agents in Claude Flow v3, covering agent types, pools, health monitoring, and scaling strategies.

## Table of Contents

- [Agent Types](#agent-types)
- [Agent Lifecycle](#agent-lifecycle)
- [Agent Pools](#agent-pools)
- [Health Monitoring](#health-monitoring)
- [Agent Scaling](#agent-scaling)
- [Best Practices](#best-practices)

## Agent Types

Claude Flow v3 supports 60+ specialized agent types across multiple categories.

### Core Development Agents

```bash
# Spawn basic development agents
npx @claude-flow/cli@alpha agent spawn -t coder --name main-coder
npx @claude-flow/cli@alpha agent spawn -t reviewer --name code-reviewer
npx @claude-flow/cli@alpha agent spawn -t tester --name unit-tester
npx @claude-flow/cli@alpha agent spawn -t planner --name task-planner
npx @claude-flow/cli@alpha agent spawn -t researcher --name tech-researcher
```

**Use cases**:
- `coder`: Implement features, write code
- `reviewer`: Code review, quality checks
- `tester`: Write and run tests
- `planner`: Break down tasks, create roadmaps
- `researcher`: Investigate solutions, gather information

### V3 Specialized Agents

```typescript
import { AgentLifecycleService } from '@claude-flow/agents';

const lifecycle = new AgentLifecycleService(agentRepo);

// Security specialist
const securityArchitect = await lifecycle.spawnAgent({
  type: 'security-architect',
  name: 'security-lead',
  config: {
    model: 'claude-opus-4-5',
    capabilities: ['threat-modeling', 'security-audit', 'cve-analysis'],
  },
});

// Memory optimization specialist
const memorySpecialist = await lifecycle.spawnAgent({
  type: 'memory-specialist',
  name: 'memory-optimizer',
  config: {
    model: 'claude-sonnet-4-5',
    capabilities: ['memory-profiling', 'cache-optimization', 'agentdb-tuning'],
  },
});

// Performance engineer
const perfEngineer = await lifecycle.spawnAgent({
  type: 'performance-engineer',
  name: 'perf-lead',
  config: {
    model: 'claude-opus-4-5',
    capabilities: ['profiling', 'benchmarking', 'optimization'],
  },
});
```

### Swarm Coordination Agents

```bash
# Spawn queen coordinator (hierarchical topology)
npx @claude-flow/cli@alpha agent spawn \
  -t queen-coordinator \
  --name queen-1 \
  --priority critical

# Spawn mesh coordinator (mesh topology)
npx @claude-flow/cli@alpha agent spawn \
  -t mesh-coordinator \
  --name mesh-coord-1
```

### Agent Selection Matrix

| Task Type | Recommended Agent | Model | Priority |
|-----------|------------------|-------|----------|
| Feature implementation | coder | sonnet | high |
| Security audit | security-auditor | opus | critical |
| Performance optimization | performance-engineer | opus | high |
| Code review | reviewer | sonnet | normal |
| Test writing | tester | haiku | normal |
| Documentation | api-docs | haiku | low |
| Research | researcher | sonnet | normal |
| Architecture | system-architect | opus | high |

## Agent Lifecycle

### Spawn

```typescript
import { AgentLifecycleService } from '@claude-flow/agents';
import { AgentType } from '@claude-flow/agents/domain';

class AgentManager {
  async spawnCodingTeam(): Promise<void> {
    const agents = await Promise.all([
      this.lifecycle.spawnAgent({
        type: AgentType.from('coder'),
        name: 'senior-coder',
        config: {
          model: 'claude-opus-4-5',
          maxTokens: 8192,
          temperature: 0.7,
        },
        priority: 'high',
        metadata: {
          team: 'backend',
          seniority: 'senior',
        },
      }),
      this.lifecycle.spawnAgent({
        type: AgentType.from('reviewer'),
        name: 'code-reviewer',
        config: {
          model: 'claude-sonnet-4-5',
          maxTokens: 4096,
        },
        priority: 'normal',
      }),
      this.lifecycle.spawnAgent({
        type: AgentType.from('tester'),
        name: 'test-specialist',
        config: {
          model: 'claude-haiku-4',
          maxTokens: 2048,
        },
        priority: 'normal',
      }),
    ]);

    console.log(`Spawned ${agents.length} agents`);
  }
}
```

### Monitor

```bash
# Get agent status
npx @claude-flow/cli@alpha agent status \
  --agent-id agent-123 \
  --include-metrics \
  --include-history

# List all agents
npx @claude-flow/cli@alpha agent list \
  --status active \
  --type coder

# View agent logs
npx @claude-flow/cli@alpha agent logs \
  --agent-id agent-123 \
  --tail 100
```

```typescript
// Programmatic monitoring
const status = await lifecycle.getAgentStatus(agentId, {
  includeMetrics: true,
  includeHistory: true,
});

console.log(`Agent: ${status.agent.name}`);
console.log(`Status: ${status.status}`);
console.log(`Tasks completed: ${status.metrics.tasksCompleted}`);
console.log(`Average task time: ${status.metrics.avgTaskDuration}ms`);
console.log(`Success rate: ${status.metrics.successRate}%`);
```

### Terminate

```bash
# Graceful termination
npx @claude-flow/cli@alpha agent terminate \
  --agent-id agent-123 \
  --graceful \
  --reason "Task complete"

# Force termination
npx @claude-flow/cli@alpha agent terminate \
  --agent-id agent-123 \
  --force
```

```typescript
// Programmatic termination
await lifecycle.terminateAgent(agentId, {
  graceful: true,
  reason: 'Maintenance window',
  waitForCompletion: true,
});
```

## Agent Pools

### Pool Management

```typescript
import { AgentPool } from '@claude-flow/agents/domain';

class PoolManager {
  private pool: AgentPool;

  constructor() {
    this.pool = new AgentPool({
      maxSize: 100,
      minIdleAgents: 5,
      maxIdleAgents: 20,
      evictionPolicy: 'lru',
    });
  }

  async getAvailableAgent(type?: AgentType): Promise<Agent> {
    // Check for available agent
    const available = this.pool.getAvailableAgents(type);
    if (available.length > 0) {
      return available[0];
    }

    // Spawn new agent if pool not full
    if (this.pool.size() < this.pool.maxSize) {
      const agent = await this.lifecycle.spawnAgent({
        type: type || AgentType.from('coder'),
      });
      this.pool.add(agent);
      return agent;
    }

    // Wait for agent to become available
    return this.pool.waitForAvailable(type);
  }

  async releaseAgent(agentId: AgentId): Promise<void> {
    const agent = this.pool.get(agentId);
    if (agent) {
      agent.markIdle();
    }
  }

  getPoolMetrics(): PoolMetrics {
    return {
      total: this.pool.size(),
      idle: this.pool.countByStatus('idle'),
      busy: this.pool.countByStatus('busy'),
      error: this.pool.countByStatus('error'),
      utilization: this.pool.utilizationRate(),
    };
  }
}
```

### Pool Strategies

#### Pre-warming

```typescript
// Pre-warm pool with commonly used agents
async function prewarmPool(pool: AgentPool): Promise<void> {
  const types: AgentType[] = [
    AgentType.from('coder'),
    AgentType.from('coder'),
    AgentType.from('coder'),
    AgentType.from('reviewer'),
    AgentType.from('tester'),
  ];

  await Promise.all(
    types.map(type => lifecycle.spawnAgent({ type }))
  );

  console.log(`Pool pre-warmed with ${types.length} agents`);
}
```

#### Auto-scaling

```typescript
class AutoScalingPool {
  private pool: AgentPool;
  private config = {
    minAgents: 5,
    maxAgents: 50,
    targetUtilization: 0.7,
    scaleUpThreshold: 0.8,
    scaleDownThreshold: 0.3,
    cooldownPeriod: 60000, // 1 minute
  };

  async checkAndScale(): Promise<void> {
    const metrics = this.pool.getPoolMetrics();
    const utilization = metrics.busy / metrics.total;

    if (utilization > this.config.scaleUpThreshold && 
        metrics.total < this.config.maxAgents) {
      await this.scaleUp();
    } else if (utilization < this.config.scaleDownThreshold &&
               metrics.total > this.config.minAgents) {
      await this.scaleDown();
    }
  }

  private async scaleUp(): Promise<void> {
    const newAgents = Math.min(
      Math.ceil(this.pool.size() * 0.5), // 50% increase
      this.config.maxAgents - this.pool.size()
    );

    console.log(`Scaling up by ${newAgents} agents`);

    await Promise.all(
      Array(newAgents).fill(null).map(() => 
        lifecycle.spawnAgent({ type: AgentType.from('coder') })
      )
    );
  }

  private async scaleDown(): Promise<void> {
    const removeAgents = Math.ceil(this.pool.size() * 0.25); // 25% decrease
    const idleAgents = this.pool.getIdleAgents()
      .slice(0, removeAgents);

    console.log(`Scaling down by ${idleAgents.length} agents`);

    await Promise.all(
      idleAgents.map(agent => lifecycle.terminateAgent(agent.id))
    );
  }
}
```

## Health Monitoring

### Health Checks

```typescript
class HealthMonitor {
  async checkAgentHealth(agentId: AgentId): Promise<HealthStatus> {
    try {
      // Ping agent
      const pingStart = Date.now();
      await this.pingAgent(agentId);
      const latency = Date.now() - pingStart;

      // Get metrics
      const metrics = await this.getAgentMetrics(agentId);

      // Determine health
      const isHealthy = 
        latency < 5000 && // < 5s response
        metrics.errorRate < 0.1 && // < 10% error rate
        metrics.memoryUsage < 0.9; // < 90% memory

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        latency,
        metrics,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  async monitorPool(pool: AgentPool): Promise<PoolHealth> {
    const agents = pool.getAllAgents();
    const healthChecks = await Promise.all(
      agents.map(agent => this.checkAgentHealth(agent.id))
    );

    const healthy = healthChecks.filter(h => h.status === 'healthy').length;
    const unhealthy = healthChecks.filter(h => h.status === 'unhealthy').length;
    const errors = healthChecks.filter(h => h.status === 'error').length;

    return {
      healthy,
      unhealthy,
      errors,
      totalAgents: agents.length,
      healthPercentage: (healthy / agents.length) * 100,
      checks: healthChecks,
    };
  }

  async autoHeal(agentId: AgentId): Promise<void> {
    const health = await this.checkAgentHealth(agentId);

    if (health.status === 'error') {
      // Restart agent
      console.log(`Restarting unhealthy agent ${agentId}`);
      await lifecycle.restartAgent(agentId);
    } else if (health.status === 'unhealthy') {
      // Clear tasks and reset
      console.log(`Resetting unhealthy agent ${agentId}`);
      await lifecycle.resetAgent(agentId);
    }
  }
}
```

### Metrics Collection

```bash
# View agent metrics
npx @claude-flow/cli@alpha agent metrics \
  --agent-id agent-123 \
  --window 1h \
  --format table

# Pool metrics
npx @claude-flow/cli@alpha agent pool \
  --show-metrics \
  --show-health
```

```typescript
interface AgentMetrics {
  // Performance
  tasksCompleted: number;
  tasksFailed: number;
  avgTaskDuration: number;
  successRate: number;

  // Resource usage
  cpuUsage: number;
  memoryUsage: number;
  tokenUsage: number;

  // Health
  errorRate: number;
  lastError?: Error;
  uptime: number;

  // Activity
  lastActive: Date;
  idleTime: number;
}
```

## Agent Scaling

### Manual Scaling

```bash
# Scale to specific number
npx @claude-flow/cli@alpha swarm scale \
  --target-agents 20 \
  --strategy gradual

# Scale specific agent type
npx @claude-flow/cli@alpha swarm scale \
  --agent-type coder \
  --count 5
```

### Auto-scaling Policies

```typescript
interface AutoScalingPolicy {
  minAgents: number;
  maxAgents: number;
  targetUtilization: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownPeriod: number;
  metrics: ('cpu' | 'memory' | 'queue' | 'latency')[];
}

const policy: AutoScalingPolicy = {
  minAgents: 5,
  maxAgents: 50,
  targetUtilization: 0.7,
  scaleUpThreshold: 0.8,
  scaleDownThreshold: 0.3,
  cooldownPeriod: 60000,
  metrics: ['queue', 'latency'],
};

// Apply policy
await coordinator.applyAutoScalingPolicy(policy);
```

## Best Practices

### 1. Agent Naming Conventions

```typescript
// Good: Descriptive, unique names
const agent = await lifecycle.spawnAgent({
  type: 'coder',
  name: 'backend-api-coder-1',
});

// Bad: Generic names
const agent = await lifecycle.spawnAgent({
  type: 'coder',
  name: 'agent1',
});
```

### 2. Resource Limits

```typescript
// Set appropriate resource limits
const agent = await lifecycle.spawnAgent({
  type: 'coder',
  config: {
    maxTokens: 4096,        // Prevent excessive token usage
    timeout: 300000,        // 5 minute timeout
    maxMemory: 512 * 1024,  // 512MB memory limit
  },
});
```

### 3. Error Handling

```typescript
try {
  const agent = await lifecycle.spawnAgent(spec);
} catch (error) {
  if (error instanceof PoolCapacityExceededError) {
    // Wait for available agent
    await pool.waitForAvailable();
    const agent = await lifecycle.spawnAgent(spec);
  } else if (error instanceof InvalidAgentTypeError) {
    // Use fallback type
    spec.type = AgentType.from('coder');
    const agent = await lifecycle.spawnAgent(spec);
  } else {
    throw error;
  }
}
```

### 4. Graceful Shutdown

```typescript
async function gracefulShutdown(pool: AgentPool): Promise<void> {
  console.log('Starting graceful shutdown...');

  // Stop accepting new tasks
  pool.stopAcceptingTasks();

  // Wait for in-progress tasks
  await pool.waitForTaskCompletion({ timeout: 300000 });

  // Terminate idle agents
  const idleAgents = pool.getIdleAgents();
  await Promise.all(
    idleAgents.map(agent => 
      lifecycle.terminateAgent(agent.id, { graceful: true })
    )
  );

  console.log('Graceful shutdown complete');
}
```

### 5. Cost Optimization

```typescript
// Use appropriate models for agent types
const agentConfigs = {
  'coder': { model: 'claude-sonnet-4-5' },      // Medium cost
  'reviewer': { model: 'claude-sonnet-4-5' },   // Medium cost
  'tester': { model: 'claude-haiku-4' },        // Low cost
  'architect': { model: 'claude-opus-4-5' },    // High cost
  'security-auditor': { model: 'claude-opus-4-5' }, // High cost
};

function getOptimalModel(agentType: string): string {
  return agentConfigs[agentType]?.model || 'claude-haiku-4';
}
```

## Next Steps

- [Task Execution Guide](./task-execution.md) - Assign tasks to agents
- [Swarm Coordination Guide](./swarm-coordination.md) - Multi-agent patterns
- [Memory Usage Guide](./memory-usage.md) - Share context between agents
