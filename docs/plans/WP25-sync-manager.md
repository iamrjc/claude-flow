# WP25: Sync Manager

## Metadata
- **Wave:** 8 (Persistence)
- **Dependencies:** WP09 (Network Provider), WP24 (Registry)
- **Effort:** Large
- **Package:** `@claude-flow/network`

## Objective

Implement distributed memory synchronization that replicates state from coordinator to worker nodes with configurable consistency levels.

## Requirements

### Functional Requirements

1. **Delta Replication**
   - Track changes since last sync
   - Send only modified entries
   - Efficient network transfer

2. **Consistency Levels**
   - Strong: Wait for all acks
   - Eventual: Fire-and-forget
   - Session: Sync session-related only

3. **Conflict Resolution**
   - Last-write-wins default
   - Version vectors for ordering
   - Coordinator authority

### Technical Specifications

```typescript
// v3/@claude-flow/network/src/sync-manager.ts
import { HybridBackend } from '@claude-flow/memory';

export type ConsistencyLevel = 'strong' | 'eventual' | 'session';

export interface SyncConfig {
  intervalMs?: number;           // default: 5000
  consistencyLevel?: ConsistencyLevel;
  replicationFactor?: number;    // default: 2
  conflictResolution?: 'last-write-wins' | 'coordinator-authority';
}

export interface ReplicationResult {
  succeeded: number;
  failed: number;
  errors?: Array<{ agentId: string; error: string }>;
}

export class SyncManager extends EventEmitter {
  constructor(backend: HybridBackend, config?: SyncConfig);

  /**
   * Start automatic sync loop
   */
  startSync(): void;
  stopSync(): void;

  /**
   * Replicate entries to workers
   */
  async replicateToWorkers(
    entries: MemoryEntry[],
    workers: NetworkAgent[]
  ): Promise<ReplicationResult>;

  /**
   * Handle write from worker node
   */
  async handleWorkerWrite(
    workerId: string,
    entry: MemoryEntryInput
  ): Promise<MemoryEntry>;

  /**
   * Force full sync to specific worker
   */
  async fullSync(worker: NetworkAgent): Promise<void>;

  /**
   * Sync based on consistency level
   */
  async sync(level?: ConsistencyLevel): Promise<void>;

  /**
   * Get sync status
   */
  getSyncStatus(): Map<string, SyncStatus>;

  // Events
  on(event: 'sync-started', listener: () => void): this;
  on(event: 'sync-completed', listener: (result: ReplicationResult) => void): this;
  on(event: 'sync-failed', listener: (error: Error) => void): this;
  on(event: 'conflict-resolved', listener: (entry: MemoryEntry) => void): this;
}
```

### Sync Flow

```
Coordinator
    │
    ├── Detect changes (delta tracking)
    │
    ├── Based on consistency level:
    │   ├── Strong: syncAll() and wait
    │   ├── Eventual: syncAll() no wait
    │   └── Session: syncSession() only
    │
    └── Replicate to workers
        ├── Worker 1: receive delta
        ├── Worker 2: receive delta
        └── Worker 3: receive delta
```

## Implementation Tasks

- [ ] Create `SyncManager` class
- [ ] Implement delta tracking
- [ ] Implement replication protocol
- [ ] Implement consistency levels
- [ ] Add conflict resolution
- [ ] Implement worker write handling
- [ ] Add sync status tracking
- [ ] Create unit tests
- [ ] Test distributed scenarios

## Acceptance Criteria

1. ✅ Delta sync minimizes data transfer
2. ✅ Consistency levels work correctly
3. ✅ Conflicts resolved deterministically
4. ✅ Worker writes propagate to coordinator

## Files to Create

```
v3/@claude-flow/network/src/
├── sync-manager.ts
├── delta-tracker.ts
├── conflict-resolver.ts
└── tests/sync-manager.test.ts
```

## References

- Plan Section: 2.1.7 Sync Manager
