# WP11: Health Checker

## Metadata
- **Wave:** 3 (Network Infrastructure)
- **Dependencies:** WP03 (Discovery for agent list)
- **Effort:** Medium
- **Package:** `@claude-flow/network`

## Objective

Implement continuous health monitoring for network agents, detecting failures and marking agents as degraded or offline.

## Requirements

### Functional Requirements

1. **Health Checks**
   - Periodic ping to agent endpoints
   - Ollama API health verification
   - Response time measurement

2. **Status Tracking**
   - Healthy/Degraded/Offline states
   - Consecutive failure counting
   - Recovery detection

3. **Alerting**
   - Events on status change
   - Integration with discovery updates

### Technical Specifications

```typescript
// v3/@claude-flow/network/src/health-checker.ts
export interface HealthCheckConfig {
  intervalMs?: number;           // default: 10000
  timeoutMs?: number;            // default: 5000
  unhealthyThreshold?: number;   // default: 3
  healthyThreshold?: number;     // default: 2
}

export interface HealthStatus {
  agentId: string;
  healthy: boolean;
  status: 'healthy' | 'degraded' | 'offline';
  latencyMs?: number;
  lastCheck: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  errorMessage?: string;
}

export class HealthChecker extends EventEmitter {
  constructor(config?: HealthCheckConfig);

  start(): void;
  stop(): void;

  // Manual checks
  async checkAgent(agent: NetworkAgent): Promise<HealthStatus>;
  async checkAll(): Promise<Map<string, HealthStatus>>;

  // Status queries
  isHealthy(agentId: string): boolean;
  getStatus(agentId: string): HealthStatus | undefined;
  getHealthyAgents(): string[];
  getDegradedAgents(): string[];

  // Events
  on(event: 'healthy', listener: (agentId: string) => void): this;
  on(event: 'degraded', listener: (agentId: string) => void): this;
  on(event: 'offline', listener: (agentId: string) => void): this;
  on(event: 'recovered', listener: (agentId: string) => void): this;
}
```

### State Transitions

```
                    ┌──────────────┐
         success    │              │   failure
    ┌───────────────│   HEALTHY    │───────────────┐
    │               │              │               │
    │               └──────────────┘               │
    │                      ▲                       ▼
    │                      │               ┌──────────────┐
    │                success×2             │              │
    │                      │               │   DEGRADED   │
    │                      │               │              │
    │               ┌──────────────┐       └──────────────┘
    │               │              │               │
    └───────────────│   OFFLINE    │◄──────────────┘
                    │              │    failure×3
                    └──────────────┘
```

## Implementation Tasks

- [ ] Create `HealthChecker` class
- [ ] Implement periodic check loop
- [ ] Implement Ollama health endpoint check
- [ ] Add latency measurement
- [ ] Implement state machine logic
- [ ] Add consecutive failure/success tracking
- [ ] Emit events on state changes
- [ ] Create unit tests
- [ ] Test with real network agents

## Acceptance Criteria

1. ✅ Periodic checks run on schedule
2. ✅ State transitions correct
3. ✅ Events emitted on changes
4. ✅ Graceful handling of timeouts
5. ✅ Recovery detection works

## Files to Create

```
v3/@claude-flow/network/src/
├── health-checker.ts
└── tests/health-checker.test.ts
```

## References

- Plan Section: 2.1.6 Networked Local Agents
