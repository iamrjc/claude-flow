# WP27: Partition Handler

## Metadata
- **Wave:** 8 (Persistence)
- **Dependencies:** WP11 (Health Checker), WP24-26
- **Effort:** Medium
- **Package:** `@claude-flow/network`

## Objective

Implement network partition detection and handling to maintain swarm operation when agents become unreachable.

## Requirements

### Functional Requirements

1. **Partition Detection**
   - Detect unreachable agents
   - Identify partition boundaries
   - Track partition duration

2. **Partition Handling**
   - Mark partitioned agents degraded
   - Reassign orphaned tasks
   - Maintain operation with available agents

3. **Partition Healing**
   - Detect when agents reconnect
   - Reconcile state differences
   - Restore normal operation

### Technical Specifications

```typescript
// v3/@claude-flow/network/src/partition-handler.ts
export interface PartitionInfo {
  partitioned: string[];     // Unreachable agent IDs
  reachable: string[];       // Reachable agent IDs
  detectedAt: number;
  duration?: number;
}

export interface ReconciliationResult {
  healedAgents: string[];
  conflictsResolved: number;
  tasksReassigned: number;
}

export class PartitionHandler extends EventEmitter {
  constructor(
    registry: NetworkAgentRegistry,
    orchestrator: NetworkTaskOrchestrator,
    syncManager: SyncManager,
    config?: PartitionConfig
  );

  /**
   * Check for network partition
   */
  async detectPartition(): Promise<PartitionInfo | null>;

  /**
   * Handle detected partition
   */
  async handlePartition(partition: PartitionInfo): Promise<void>;

  /**
   * Reconcile state when partition heals
   */
  async reconcile(healedAgents: string[]): Promise<ReconciliationResult>;

  /**
   * Check if currently partitioned
   */
  isPartitioned(): boolean;

  /**
   * Get current partition info
   */
  getPartitionInfo(): PartitionInfo | null;

  // Events
  on(event: 'partition-detected', listener: (info: PartitionInfo) => void): this;
  on(event: 'partition-healed', listener: (result: ReconciliationResult) => void): this;
  on(event: 'agent-isolated', listener: (agentId: string) => void): this;
}

export interface PartitionConfig {
  detectionIntervalMs?: number;  // default: 10000
  partitionTimeoutMs?: number;   // default: 30000
  autoReconcile?: boolean;       // default: true
}
```

### Partition State Machine

```
    ┌──────────────┐
    │   NORMAL     │
    │ (all agents  │
    │  reachable)  │
    └──────┬───────┘
           │ agents unreachable
           ▼
    ┌──────────────┐
    │  PARTITIONED │
    │ (some agents │
    │ unreachable) │
    └──────┬───────┘
           │ agents reconnect
           ▼
    ┌──────────────┐
    │  RECONCILING │
    │ (syncing     │
    │  state)      │
    └──────┬───────┘
           │ sync complete
           ▼
    ┌──────────────┐
    │   NORMAL     │
    └──────────────┘
```

## Implementation Tasks

- [ ] Create `PartitionHandler` class
- [ ] Implement partition detection
- [ ] Implement agent marking/unmarking
- [ ] Implement task reassignment
- [ ] Implement reconciliation
- [ ] Add continuous monitoring
- [ ] Create unit tests
- [ ] Test partition scenarios

## Acceptance Criteria

1. ✅ Partitions detected within timeout
2. ✅ Tasks reassigned correctly
3. ✅ Reconciliation restores consistency
4. ✅ Events emitted appropriately

## Files to Create

```
v3/@claude-flow/network/src/
├── partition-handler.ts
├── reconciliation.ts
└── tests/partition-handler.test.ts
```

## References

- Plan Section: 2.1.7 Partition Handler
