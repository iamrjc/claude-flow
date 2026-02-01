# WP10: Load Balancer

## Metadata
- **Wave:** 3 (Network Infrastructure)
- **Dependencies:** WP03 (Discovery provides agent list)
- **Effort:** Medium
- **Package:** `@claude-flow/network`

## Objective

Implement load balancing strategies for distributing requests across network agents based on capacity, latency, and workload.

## Requirements

### Functional Requirements

1. **Load Balancing Strategies**
   - Round-robin (equal distribution)
   - Least-connections (lowest load)
   - Weighted (by hardware capability)
   - Latency-based (fastest response)
   - Capability-match (task requirements)

2. **Load Tracking**
   - Track active connections per agent
   - Track request latencies
   - Update weights dynamically

3. **Capability Matching**
   - Match VRAM requirements to agent specs
   - Filter by available models
   - Consider CPU vs GPU needs

### Technical Specifications

```typescript
// v3/@claude-flow/network/src/load-balancer.ts
export type LoadBalancingStrategy =
  | 'round-robin'
  | 'least-connections'
  | 'weighted'
  | 'latency-based'
  | 'capability-match';

export interface LoadBalancingConfig {
  strategy: LoadBalancingStrategy;
  weights?: Record<string, number>;  // For weighted strategy
  stickySession?: boolean;           // Keep same agent for session
}

export interface AgentLoad {
  agentId: string;
  activeConnections: number;
  avgLatencyMs: number;
  lastRequestAt: number;
}

export class LoadBalancer {
  constructor(config: LoadBalancingConfig);

  selectAgent(
    agents: NetworkAgent[],
    task?: TaskContext
  ): NetworkAgent | null;

  // Load tracking
  recordRequestStart(agentId: string): void;
  recordRequestEnd(agentId: string, latencyMs: number): void;

  // Status
  getAgentLoads(): Map<string, AgentLoad>;
  getStatistics(): LoadBalancerStats;

  // Dynamic adjustment
  updateWeights(weights: Record<string, number>): void;
  setStrategy(strategy: LoadBalancingStrategy): void;
}
```

### Strategy Details

| Strategy | Selection Logic | Best For |
|----------|----------------|----------|
| `round-robin` | Rotate sequentially | Equal hardware |
| `least-connections` | Lowest active count | Mixed workloads |
| `weighted` | Random by VRAM weight | Heterogeneous hardware |
| `latency-based` | Lowest avg latency | Latency-sensitive |
| `capability-match` | Filter by requirements | Specialized tasks |

## Implementation Tasks

- [ ] Create `LoadBalancer` class
- [ ] Implement round-robin strategy
- [ ] Implement least-connections tracking
- [ ] Implement weighted selection
- [ ] Implement latency tracking
- [ ] Implement capability matching
- [ ] Add request start/end tracking
- [ ] Create unit tests for each strategy
- [ ] Benchmark strategy performance

## Acceptance Criteria

1. ✅ All 5 strategies implemented
2. ✅ Load tracking accurate
3. ✅ Capability matching filters correctly
4. ✅ Dynamic weight updates work
5. ✅ Unit test coverage >80%

## Files to Create

```
v3/@claude-flow/network/src/
├── load-balancer.ts
├── strategies/
│   ├── round-robin.ts
│   ├── least-connections.ts
│   ├── weighted.ts
│   ├── latency-based.ts
│   └── capability-match.ts
└── tests/load-balancer.test.ts
```

## References

- Plan Section: 2.1.6 Load Balancing Strategies
