# WP29: Hybrid Swarm Coordinator

## Metadata
- **Wave:** 9 (Integration)
- **Dependencies:** All provider and network WPs
- **Effort:** Large
- **Package:** `@claude-flow/swarm`

## Objective

Create a unified coordinator that manages hybrid swarms with cloud (Claude, Gemini), local (Ollama), and networked agents.

## Requirements

### Functional Requirements

1. **Multi-Provider Orchestration**
   - Coordinate cloud + local + network agents
   - Intelligent task routing
   - Fallback chain management

2. **Hybrid Topology**
   - Cloud queen with local workers
   - Mixed capability agents
   - Dynamic scaling

3. **Resource Management**
   - Token budget tracking
   - Cost optimization
   - Rate limit handling

### Technical Specifications

```typescript
// v3/@claude-flow/swarm/src/hybrid-coordinator.ts
export interface HybridSwarmConfig {
  topology: 'hierarchical' | 'mesh' | 'hierarchical-mesh';
  queen?: {
    provider: 'anthropic' | 'gemini';
    model: string;
  };
  workers: Array<{
    type: string;
    provider: 'anthropic' | 'gemini' | 'ollama' | 'network';
    model: string;
    count?: number;
  }>;
  fallback?: {
    anthropicRateLimited: { provider: string; model: string };
    localUnavailable: { provider: string; model: string };
  };
}

export class HybridSwarmCoordinator {
  constructor(
    providerSelector: ProviderSelector,
    networkProvider: NetworkAgentProvider,
    config: HybridSwarmConfig
  );

  /**
   * Initialize hybrid swarm
   */
  async initialize(): Promise<SwarmStatus>;

  /**
   * Assign task to best available agent
   */
  async assignTask(task: Task): Promise<TaskAssignment>;

  /**
   * Handle provider rate limits
   */
  async handleRateLimit(provider: string): Promise<void>;

  /**
   * Get swarm status across all providers
   */
  getStatus(): HybridSwarmStatus;

  /**
   * Get cost/token usage breakdown
   */
  getUsage(): UsageBreakdown;

  /**
   * Scale workers up/down
   */
  async scale(workerType: string, delta: number): Promise<void>;

  /**
   * Shutdown swarm gracefully
   */
  async shutdown(): Promise<void>;
}
```

### Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID COORDINATOR                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Cloud Layer                Network Layer              Local     │
│  ┌─────────────┐           ┌─────────────┐           ┌───────┐  │
│  │ Claude Opus │           │ Laptop 1    │           │Ollama │  │
│  │ (Queen)     │           │ (Qwen 14B)  │           │(local)│  │
│  └─────────────┘           ├─────────────┤           └───────┘  │
│  ┌─────────────┐           │ Desktop 2   │                      │
│  │ Gemini-3-Pro│           │ (Qwen 32B)  │                      │
│  │ (Fallback)  │           ├─────────────┤                      │
│  └─────────────┘           │ Server 3    │                      │
│                            │ (Llama 70B) │                      │
│                            └─────────────┘                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    TASK ROUTER                            │   │
│  │  Complex reasoning → Claude Opus                          │   │
│  │  High context → Gemini-3-Pro                              │   │
│  │  Fast tasks → Network/Local                               │   │
│  │  Rate limited → Fallback chain                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

- [ ] Create `HybridSwarmCoordinator` class
- [ ] Integrate all provider types
- [ ] Implement task routing logic
- [ ] Add rate limit handling
- [ ] Implement fallback chains
- [ ] Add usage tracking
- [ ] Create scaling logic
- [ ] Create unit tests
- [ ] Integration test with all providers

## Acceptance Criteria

1. ✅ Cloud + local + network work together
2. ✅ Rate limits trigger fallback
3. ✅ Task routing optimal
4. ✅ Usage tracking accurate

## Files to Create

```
v3/@claude-flow/swarm/src/
├── hybrid-coordinator.ts
├── task-router.ts
├── usage-tracker.ts
└── tests/hybrid-coordinator.test.ts
```

## References

- Plan Section: 2.3 Hybrid Swarm Architecture
