# WP26: Network Task Orchestrator

## Metadata
- **Wave:** 8 (Persistence)
- **Dependencies:** WP09 (Network Provider), existing TaskOrchestrator
- **Effort:** Medium
- **Package:** `@claude-flow/network`

## Objective

Extend TaskOrchestrator with checkpointing and recovery capabilities for network-distributed tasks.

## Requirements

### Functional Requirements

1. **Task Checkpointing**
   - Periodic state snapshots
   - Progress tracking
   - Resumable execution

2. **Failure Recovery**
   - Detect worker failures
   - Reassign tasks to healthy workers
   - Resume from checkpoint

3. **Network Assignment**
   - Track which worker handles task
   - Monitor task execution
   - Handle worker disconnection

### Technical Specifications

```typescript
// v3/@claude-flow/network/src/network-task-orchestrator.ts
import { TaskOrchestrator } from '@claude-flow/swarm';

export interface TaskCheckpoint {
  taskId: string;
  progress: number;          // 0-100
  state: object;             // Task-specific state
  lastUpdated: number;
  checkpointNumber: number;
}

export interface TaskRecovery {
  action: 'restart' | 'resume';
  fromCheckpoint?: TaskCheckpoint;
  newWorker?: NetworkAgent;
  fromBeginning?: boolean;
}

export class NetworkTaskOrchestrator extends TaskOrchestrator {
  /**
   * Assign task to network agent
   */
  async assignToNetworkAgent(
    taskId: string,
    agentId: string,
    node: NetworkAgent
  ): Promise<void>;

  /**
   * Save task checkpoint
   */
  async checkpoint(taskId: string, state: TaskCheckpoint): Promise<void>;

  /**
   * Get latest checkpoint for task
   */
  async getCheckpoint(taskId: string): Promise<TaskCheckpoint | null>;

  /**
   * Recover task after worker failure
   */
  async recoverTask(taskId: string): Promise<TaskRecovery>;

  /**
   * Get tasks assigned to specific worker
   */
  async getTasksByWorker(workerId: string): Promise<Task[]>;

  /**
   * Handle worker disconnect
   */
  async handleWorkerDisconnect(workerId: string): Promise<void>;
}
```

### Recovery Flow

```
Worker Failure Detected
    │
    ├── Get tasks from failed worker
    │
    ├── For each task:
    │   ├── Check for checkpoint
    │   │   ├── Has checkpoint → resume
    │   │   └── No checkpoint → restart
    │   │
    │   └── Find new capable worker
    │       └── Reassign task
    │
    └── Emit recovery events
```

## Implementation Tasks

- [ ] Extend `TaskOrchestrator`
- [ ] Implement checkpoint storage
- [ ] Implement checkpoint retrieval
- [ ] Implement task recovery logic
- [ ] Add worker task tracking
- [ ] Handle worker disconnection
- [ ] Create unit tests
- [ ] Test failure scenarios

## Acceptance Criteria

1. ✅ Checkpoints persist correctly
2. ✅ Recovery finds latest checkpoint
3. ✅ Tasks reassigned on failure
4. ✅ No duplicate task execution

## Files to Create

```
v3/@claude-flow/network/src/
├── network-task-orchestrator.ts
├── checkpoint-store.ts
└── tests/network-task-orchestrator.test.ts
```

## References

- Plan Section: 2.1.7 Network Task Orchestrator
- Existing: `@claude-flow/swarm/src/coordination/task-orchestrator.ts`
