# Domain Architecture

Claude Flow v3 is organized into four core domains following Domain-Driven Design principles: Agent, Task, Memory, and Coordination. Each domain has clear boundaries, its own ubiquitous language, and well-defined interfaces.

## Table of Contents

- [Agent Domain](#agent-domain)
- [Task Domain](#task-domain)
- [Memory Domain](#memory-domain)
- [Coordination Domain](#coordination-domain)
- [Cross-Domain Communication](#cross-domain-communication)

## Agent Domain

The Agent domain manages the lifecycle, configuration, and health of AI agents.

### Bounded Context

**Ubiquitous Language**:
- **Agent**: An autonomous AI entity that can execute tasks
- **Agent Pool**: A collection of agents available for work
- **Agent Type**: The specialization of an agent (coder, tester, reviewer, etc.)
- **Agent Status**: Current state (idle, busy, error, terminated)
- **Health Check**: Periodic verification of agent availability

### Domain Model

```typescript
// Entities
class Agent {
  constructor(
    public readonly id: AgentId,              // Value Object
    public readonly type: AgentType,          // Value Object
    private status: AgentStatus,              // Value Object
    private config: AgentConfig,              // Value Object
    private metadata: AgentMetadata           // Value Object
  ) {}

  // Domain methods (business logic)
  assignTask(task: Task): void {
    if (this.status !== AgentStatus.Idle) {
      throw new AgentNotAvailableError();
    }
    this.status = AgentStatus.Busy;
    this.emit(new TaskAssignedEvent(this.id, task.id));
  }

  completeTask(): void {
    if (this.status !== AgentStatus.Busy) {
      throw new InvalidStateTransitionError();
    }
    this.status = AgentStatus.Idle;
    this.emit(new TaskCompletedEvent(this.id));
  }

  terminate(reason?: string): void {
    this.status = AgentStatus.Terminated;
    this.emit(new AgentTerminatedEvent(this.id, reason));
  }
}

class AgentPool {
  private agents: Map<AgentId, Agent> = new Map();

  spawn(spec: AgentSpec): Agent {
    const agent = Agent.create(spec);
    this.agents.set(agent.id, agent);
    this.emit(new AgentSpawnedEvent(agent.id, agent.type));
    return agent;
  }

  getAvailableAgents(type?: AgentType): Agent[] {
    return Array.from(this.agents.values())
      .filter(a => a.isAvailable() && (!type || a.type === type));
  }

  getPoolMetrics(): PoolMetrics {
    return {
      total: this.agents.size,
      idle: this.countByStatus(AgentStatus.Idle),
      busy: this.countByStatus(AgentStatus.Busy),
      error: this.countByStatus(AgentStatus.Error),
    };
  }
}
```

### Value Objects

```typescript
// Immutable value objects
class AgentId {
  private constructor(private readonly value: string) {
    if (!AgentId.isValid(value)) {
      throw new InvalidAgentIdError(value);
    }
  }

  static create(): AgentId {
    const id = `agent-${Date.now()}-${randomBytes(12).toString('hex')}`;
    return new AgentId(id);
  }

  static from(value: string): AgentId {
    return new AgentId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: AgentId): boolean {
    return this.value === other.value;
  }
}

enum AgentStatus {
  Idle = 'idle',
  Busy = 'busy',
  Error = 'error',
  Terminated = 'terminated',
}

class AgentType {
  private static readonly ALLOWED_TYPES = [
    'coder', 'reviewer', 'tester', 'planner', 'researcher',
    'queen-coordinator', 'security-architect', 'performance-engineer',
    // ... more types
  ] as const;

  private constructor(private readonly value: string) {}

  static from(value: string): AgentType {
    if (!this.ALLOWED_TYPES.includes(value as any)) {
      throw new InvalidAgentTypeError(value);
    }
    return new AgentType(value);
  }
}
```

### Domain Events

```typescript
// Agent lifecycle events
class AgentSpawnedEvent implements DomainEvent {
  constructor(
    public readonly agentId: AgentId,
    public readonly agentType: AgentType,
    public readonly timestamp: number = Date.now()
  ) {}
}

class AgentTerminatedEvent implements DomainEvent {
  constructor(
    public readonly agentId: AgentId,
    public readonly reason?: string,
    public readonly timestamp: number = Date.now()
  ) {}
}

class TaskAssignedEvent implements DomainEvent {
  constructor(
    public readonly agentId: AgentId,
    public readonly taskId: TaskId,
    public readonly timestamp: number = Date.now()
  ) {}
}
```

### Application Services

```typescript
class AgentLifecycleService {
  constructor(
    private agentRepo: AgentRepository,
    private eventBus: EventBus
  ) {}

  async spawnAgent(spec: AgentSpec): Promise<Agent> {
    // Validate spec
    const validated = await this.validateSpec(spec);

    // Create agent (domain logic)
    const agent = Agent.create(validated);

    // Persist
    await this.agentRepo.save(agent);

    // Publish events
    agent.getUncommittedEvents().forEach(event => {
      this.eventBus.publish(event);
    });

    return agent;
  }

  async terminateAgent(agentId: AgentId, reason?: string): Promise<void> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new AgentNotFoundError(agentId);
    }

    agent.terminate(reason);
    await this.agentRepo.save(agent);

    agent.getUncommittedEvents().forEach(event => {
      this.eventBus.publish(event);
    });
  }

  async checkHealth(agentId: AgentId): Promise<HealthStatus> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      return { status: 'not_found' };
    }

    // Health check logic
    const isResponsive = await this.pingAgent(agent);
    const hasErrors = agent.status === AgentStatus.Error;

    return {
      status: isResponsive && !hasErrors ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      agent: agent.toDTO(),
    };
  }
}
```

### Repository Interface

```typescript
interface AgentRepository {
  save(agent: Agent): Promise<void>;
  findById(id: AgentId): Promise<Agent | null>;
  findByType(type: AgentType): Promise<Agent[]>;
  findByStatus(status: AgentStatus): Promise<Agent[]>;
  delete(id: AgentId): Promise<void>;
  count(): Promise<number>;
}
```

## Task Domain

The Task domain manages work units, dependencies, scheduling, and execution.

### Bounded Context

**Ubiquitous Language**:
- **Task**: A unit of work to be executed
- **Task Graph**: A DAG of tasks with dependencies
- **Task Queue**: Priority-ordered list of pending tasks
- **Task Status**: Current state (pending, in_progress, completed, failed)
- **Task Assignment**: Binding a task to an agent

### Domain Model

```typescript
class Task {
  constructor(
    public readonly id: TaskId,
    private title: string,
    private description: string,
    private status: TaskStatus,
    private priority: TaskPriority,
    private assignedAgent: AgentId | null,
    private dependencies: Set<TaskId>,
    private metadata: TaskMetadata
  ) {}

  assign(agentId: AgentId): void {
    if (this.status !== TaskStatus.Pending) {
      throw new InvalidTaskStateError('Can only assign pending tasks');
    }
    if (!this.dependenciesSatisfied()) {
      throw new DependenciesNotSatisfiedError();
    }

    this.assignedAgent = agentId;
    this.status = TaskStatus.InProgress;
    this.emit(new TaskAssignedEvent(this.id, agentId));
  }

  complete(result: TaskResult): void {
    if (this.status !== TaskStatus.InProgress) {
      throw new InvalidTaskStateError('Can only complete in-progress tasks');
    }

    this.status = TaskStatus.Completed;
    this.emit(new TaskCompletedEvent(this.id, result));
  }

  fail(error: Error): void {
    this.status = TaskStatus.Failed;
    this.emit(new TaskFailedEvent(this.id, error));
  }

  addDependency(taskId: TaskId): void {
    if (this.wouldCreateCycle(taskId)) {
      throw new CyclicDependencyError();
    }
    this.dependencies.add(taskId);
  }

  dependenciesSatisfied(): boolean {
    // Check if all dependencies are completed
    return Array.from(this.dependencies).every(depId => {
      const dep = this.taskRepo.findById(depId);
      return dep?.status === TaskStatus.Completed;
    });
  }
}

class TaskGraph {
  private tasks: Map<TaskId, Task> = new Map();

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
  }

  addDependency(taskId: TaskId, dependsOn: TaskId): void {
    const task = this.tasks.get(taskId);
    const dependency = this.tasks.get(dependsOn);

    if (!task || !dependency) {
      throw new TaskNotFoundError();
    }

    task.addDependency(dependsOn);
  }

  getExecutionOrder(): TaskId[] {
    // Topological sort (Kahn's algorithm)
    const inDegree = new Map<TaskId, number>();
    const queue: TaskId[] = [];
    const result: TaskId[] = [];

    // Initialize in-degrees
    for (const task of this.tasks.values()) {
      inDegree.set(task.id, task.dependencies.size);
      if (task.dependencies.size === 0) {
        queue.push(task.id);
      }
    }

    // Process tasks
    while (queue.length > 0) {
      const taskId = queue.shift()!;
      result.push(taskId);

      // Reduce in-degree of dependents
      for (const task of this.tasks.values()) {
        if (task.dependencies.has(taskId)) {
          const newInDegree = inDegree.get(task.id)! - 1;
          inDegree.set(task.id, newInDegree);
          if (newInDegree === 0) {
            queue.push(task.id);
          }
        }
      }
    }

    if (result.length !== this.tasks.size) {
      throw new CyclicDependencyError();
    }

    return result;
  }
}

class TaskQueue {
  private queue: Task[] = [];

  enqueue(task: Task): void {
    this.queue.push(task);
    this.sort();
  }

  dequeue(): Task | null {
    return this.queue.shift() || null;
  }

  private sort(): void {
    // Priority: critical > high > normal > low
    // Secondary sort by creation time (FIFO)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return this.priorityValue(b.priority) - this.priorityValue(a.priority);
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }
}
```

### Application Services

```typescript
class TaskExecutionService {
  constructor(
    private taskRepo: TaskRepository,
    private agentRepo: AgentRepository,
    private eventBus: EventBus
  ) {}

  async createTask(spec: TaskSpec): Promise<Task> {
    const task = Task.create(spec);
    await this.taskRepo.save(task);

    task.getUncommittedEvents().forEach(event => {
      this.eventBus.publish(event);
    });

    return task;
  }

  async assignTask(taskId: TaskId, agentId: AgentId): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    const agent = await this.agentRepo.findById(agentId);

    if (!task) throw new TaskNotFoundError(taskId);
    if (!agent) throw new AgentNotFoundError(agentId);

    // Domain logic
    task.assign(agentId);
    agent.assignTask(task);

    // Persist
    await Promise.all([
      this.taskRepo.save(task),
      this.agentRepo.save(agent),
    ]);

    // Publish events
    [...task.getUncommittedEvents(), ...agent.getUncommittedEvents()]
      .forEach(event => this.eventBus.publish(event));
  }

  async executeTaskGraph(graph: TaskGraph): Promise<void> {
    const executionOrder = graph.getExecutionOrder();

    for (const taskId of executionOrder) {
      const task = await this.taskRepo.findById(taskId);
      if (!task) continue;

      // Find available agent
      const agent = await this.findAvailableAgent(task);
      if (!agent) {
        throw new NoAvailableAgentError();
      }

      // Assign and wait for completion
      await this.assignTask(taskId, agent.id);
      await this.waitForCompletion(taskId);
    }
  }
}
```

## Memory Domain

The Memory domain manages storage, retrieval, and semantic search of agent memories.

### Bounded Context

**Ubiquitous Language**:
- **Memory**: A stored piece of information
- **Memory Type**: Classification (episodic, semantic, procedural, working)
- **Memory Namespace**: Logical grouping of memories
- **Semantic Search**: Vector similarity search
- **HNSW Index**: Hierarchical Navigable Small World graph for fast ANN search

### Domain Model

```typescript
class MemoryEntry {
  constructor(
    public readonly id: MemoryId,
    private content: string,
    private type: MemoryType,
    private namespace: MemoryNamespace,
    private embedding: number[] | null,
    private metadata: MemoryMetadata,
    private importance: number,
    private createdAt: Date,
    private accessedAt: Date,
    private accessCount: number
  ) {}

  access(): void {
    this.accessedAt = new Date();
    this.accessCount++;
    this.emit(new MemoryAccessedEvent(this.id));
  }

  updateImportance(score: number): void {
    if (score < 0 || score > 1) {
      throw new InvalidImportanceScoreError();
    }
    this.importance = score;
  }

  shouldExpire(ttl: number): boolean {
    const age = Date.now() - this.createdAt.getTime();
    return age > ttl;
  }
}

class MemoryNamespace {
  private constructor(private readonly value: string) {
    if (!MemoryNamespace.isValid(value)) {
      throw new InvalidNamespaceError(value);
    }
  }

  static readonly DEFAULT = new MemoryNamespace('default');
  static readonly PATTERNS = new MemoryNamespace('patterns');
  static readonly SOLUTIONS = new MemoryNamespace('solutions');
  static readonly KNOWLEDGE = new MemoryNamespace('knowledge');

  static from(value: string): MemoryNamespace {
    return new MemoryNamespace(value);
  }

  private static isValid(value: string): boolean {
    return /^[a-z][a-z0-9_-]*$/.test(value) && value.length <= 64;
  }

  toString(): string {
    return this.value;
  }
}

enum MemoryType {
  Episodic = 'episodic',     // Specific events/experiences
  Semantic = 'semantic',     // Facts and knowledge
  Procedural = 'procedural', // How-to knowledge
  Working = 'working',       // Temporary/session-specific
}
```

### Vector Search

```typescript
class HNSWIndex {
  private index: Map<MemoryId, HNSWNode> = new Map();
  private entryPoint: MemoryId | null = null;

  insert(memoryId: MemoryId, embedding: number[]): void {
    const node = new HNSWNode(memoryId, embedding);

    if (!this.entryPoint) {
      this.entryPoint = memoryId;
      this.index.set(memoryId, node);
      return;
    }

    // Insert into HNSW graph
    const neighbors = this.findNeighbors(embedding);
    node.connectTo(neighbors);
    this.index.set(memoryId, node);
  }

  search(queryEmbedding: number[], k: number): MemoryId[] {
    if (!this.entryPoint) return [];

    const visited = new Set<MemoryId>();
    const candidates = new PriorityQueue<MemoryId>();

    // Start from entry point
    const entryNode = this.index.get(this.entryPoint)!;
    const entrySim = this.similarity(queryEmbedding, entryNode.embedding);
    candidates.insert(this.entryPoint, entrySim);

    while (!candidates.isEmpty() && visited.size < k * 10) {
      const current = candidates.pop();
      if (visited.has(current)) continue;
      visited.add(current);

      const currentNode = this.index.get(current)!;
      for (const neighborId of currentNode.neighbors) {
        if (visited.has(neighborId)) continue;

        const neighbor = this.index.get(neighborId)!;
        const sim = this.similarity(queryEmbedding, neighbor.embedding);
        candidates.insert(neighborId, sim);
      }
    }

    return Array.from(visited).slice(0, k);
  }

  private similarity(a: number[], b: number[]): number {
    // Cosine similarity
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magA * magB);
  }
}
```

### Application Services

```typescript
class MemoryApplicationService {
  constructor(
    private memoryRepo: MemoryRepository,
    private embeddingService: EmbeddingService,
    private hnswIndex: HNSWIndex,
    private eventBus: EventBus
  ) {}

  async store(content: string, options: StoreOptions): Promise<MemoryId> {
    // Generate embedding
    const embedding = await this.embeddingService.embed(content);

    // Create memory entry
    const memory = MemoryEntry.create({
      content,
      type: options.type,
      namespace: options.namespace,
      embedding,
      importance: options.importance ?? 0.5,
      metadata: options.metadata,
    });

    // Persist
    await this.memoryRepo.save(memory);

    // Update HNSW index
    this.hnswIndex.insert(memory.id, embedding);

    // Publish event
    this.eventBus.publish(new MemoryStoredEvent(memory.id));

    return memory.id;
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embed(query);

    // Search HNSW index
    const candidateIds = this.hnswIndex.search(queryEmbedding, options.limit * 2);

    // Fetch and filter candidates
    const memories = await Promise.all(
      candidateIds.map(id => this.memoryRepo.findById(id))
    );

    // Apply filters
    const filtered = memories
      .filter(m => m !== null)
      .filter(m => !options.namespace || m.namespace.equals(options.namespace))
      .filter(m => !options.type || m.type === options.type)
      .filter(m => !options.minRelevance || m.relevance >= options.minRelevance);

    // Sort by relevance and slice
    return filtered
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, options.limit)
      .map(m => ({
        memory: m,
        relevance: m.relevance,
        highlights: this.extractHighlights(m, query),
      }));
  }
}
```

## Coordination Domain

The Coordination domain manages multi-agent orchestration, consensus, and swarm behaviors.

### Bounded Context

**Ubiquitous Language**:
- **Swarm**: A coordinated group of agents
- **Topology**: The communication structure (hierarchical, mesh, etc.)
- **Consensus**: Agreement protocol (Byzantine, Raft, Gossip)
- **Coordination Session**: A period of multi-agent collaboration
- **Message Bus**: Event-driven communication channel

### Domain Model

```typescript
class SwarmAggregate {
  constructor(
    public readonly id: SwarmId,
    private topology: Topology,
    private maxAgents: number,
    private agents: Map<AgentId, SwarmAgent>,
    private config: SwarmConfig
  ) {}

  // Invariant: Cannot exceed maxAgents
  addAgent(agent: Agent): void {
    if (this.agents.size >= this.maxAgents) {
      throw new SwarmCapacityExceededError();
    }

    const swarmAgent = new SwarmAgent(agent, this.determineRole(agent));
    this.agents.set(agent.id, swarmAgent);
    this.emit(new AgentJoinedSwarmEvent(this.id, agent.id));

    // Update topology
    this.topology.connect(swarmAgent);
  }

  removeAgent(agentId: AgentId): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    this.agents.delete(agentId);
    this.topology.disconnect(agent);
    this.emit(new AgentLeftSwarmEvent(this.id, agentId));
  }

  scale(targetAgents: number, strategy: ScaleStrategy): void {
    if (targetAgents > this.maxAgents) {
      throw new SwarmCapacityExceededError();
    }

    const delta = targetAgents - this.agents.size;

    if (delta > 0) {
      this.scaleUp(delta, strategy);
    } else if (delta < 0) {
      this.scaleDown(Math.abs(delta), strategy);
    }
  }

  reachConsensus(proposal: Proposal): ConsensusResult {
    return this.config.consensusMechanism.decide(proposal, this.agents);
  }

  getMetrics(): SwarmMetrics {
    return {
      agentCount: this.agents.size,
      capacity: this.maxAgents,
      utilization: this.agents.size / this.maxAgents,
      topology: this.topology.describe(),
      health: this.calculateHealth(),
    };
  }
}

class Topology {
  abstract connect(agent: SwarmAgent): void;
  abstract disconnect(agent: SwarmAgent): void;
  abstract getNeighbors(agentId: AgentId): AgentId[];
  abstract describe(): TopologyDescription;
}

class HierarchicalMeshTopology extends Topology {
  private queen: AgentId | null = null;
  private workers: Set<AgentId> = new Set();
  private peerConnections: Map<AgentId, Set<AgentId>> = new Map();

  connect(agent: SwarmAgent): void {
    if (agent.role === 'queen-coordinator' && !this.queen) {
      this.queen = agent.id;
    } else {
      this.workers.add(agent.id);
      // Connect to queen
      this.connectToQueen(agent.id);
      // Connect to peer workers (mesh within workers)
      this.connectToPeers(agent.id);
    }
  }

  disconnect(agent: SwarmAgent): void {
    if (agent.id === this.queen) {
      this.queen = null;
      // Elect new queen
      this.electNewQueen();
    } else {
      this.workers.delete(agent.id);
      this.peerConnections.delete(agent.id);
    }
  }

  getNeighbors(agentId: AgentId): AgentId[] {
    if (agentId === this.queen) {
      return Array.from(this.workers);
    } else {
      const peers = this.peerConnections.get(agentId) || new Set();
      return [this.queen, ...peers].filter(Boolean) as AgentId[];
    }
  }
}
```

### Consensus Mechanisms

```typescript
interface ConsensusMechanism {
  decide(proposal: Proposal, agents: Map<AgentId, SwarmAgent>): ConsensusResult;
}

class ByzantineConsensus implements ConsensusMechanism {
  decide(proposal: Proposal, agents: Map<AgentId, SwarmAgent>): ConsensusResult {
    const votes = this.collectVotes(proposal, agents);

    // Byzantine fault tolerance: need 2f + 1 votes (where f is max faulty nodes)
    const f = Math.floor((agents.size - 1) / 3);
    const required = 2 * f + 1;

    const approvals = votes.filter(v => v.decision === 'approve').length;

    return {
      approved: approvals >= required,
      votes,
      requiredVotes: required,
      actualVotes: approvals,
    };
  }
}

class RaftConsensus implements ConsensusMechanism {
  private leader: AgentId | null = null;
  private term: number = 0;

  decide(proposal: Proposal, agents: Map<AgentId, SwarmAgent>): ConsensusResult {
    // Ensure we have a leader
    if (!this.leader) {
      this.electLeader(agents);
    }

    // Leader proposes
    const leaderAgent = agents.get(this.leader!);
    if (!leaderAgent) {
      this.electLeader(agents);
    }

    // Collect majority votes
    const votes = this.collectVotes(proposal, agents);
    const majority = Math.floor(agents.size / 2) + 1;
    const approvals = votes.filter(v => v.decision === 'approve').length;

    return {
      approved: approvals >= majority,
      votes,
      leader: this.leader,
      term: this.term,
    };
  }

  private electLeader(agents: Map<AgentId, SwarmAgent>): void {
    this.term++;
    // Simple election: highest priority agent becomes leader
    const candidates = Array.from(agents.values())
      .sort((a, b) => b.priority - a.priority);

    this.leader = candidates[0]?.id || null;
  }
}
```

## Cross-Domain Communication

### Event Bus

Domains communicate via domain events published to an event bus:

```typescript
class EventMessageBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  publish(event: DomainEvent): void {
    const handlers = this.handlers.get(event.type) || [];
    handlers.forEach(handler => handler(event));
  }
}
```

### Example: Cross-Domain Workflow

```typescript
// Agent domain emits TaskAssignedEvent
agent.assignTask(task);

// Event bus routes to multiple handlers
eventBus.publish(new TaskAssignedEvent(agent.id, task.id));

// Task domain listens and updates task status
class TaskEventHandler {
  @EventHandler(TaskAssignedEvent)
  async handle(event: TaskAssignedEvent): Promise<void> {
    const task = await this.taskRepo.findById(event.taskId);
    if (task) {
      task.markInProgress();
      await this.taskRepo.save(task);
    }
  }
}

// Memory domain listens and stores context
class MemoryEventHandler {
  @EventHandler(TaskAssignedEvent)
  async handle(event: TaskAssignedEvent): Promise<void> {
    await this.memoryService.store(
      `Agent ${event.agentId} assigned to task ${event.taskId}`,
      { type: 'episodic', namespace: 'tasks' }
    );
  }
}

// Coordination domain listens and updates swarm metrics
class SwarmEventHandler {
  @EventHandler(TaskAssignedEvent)
  async handle(event: TaskAssignedEvent): Promise<void> {
    await this.swarmService.updateAgentMetrics(event.agentId, {
      tasksAssigned: 1,
    });
  }
}
```

## Domain Relationships

```
┌─────────────────────────────────────────────────────────┐
│                   Coordination Domain                    │
│  (Swarm, Topology, Consensus, CoordinationSession)      │
└──────────┬────────────────────────────────┬─────────────┘
           │ orchestrates                    │ coordinates
           ↓                                 ↓
┌──────────────────────┐          ┌──────────────────────┐
│    Agent Domain      │          │     Task Domain      │
│  (Agent, AgentPool)  │←─────────│  (Task, TaskGraph)   │
└──────────┬───────────┘  assigns └──────────┬───────────┘
           │                                  │
           │ stores/retrieves                │ stores/retrieves
           ↓                                  ↓
┌─────────────────────────────────────────────────────────┐
│                    Memory Domain                         │
│       (MemoryEntry, HNSW, MemoryNamespace)              │
└─────────────────────────────────────────────────────────┘
```

## Summary

Each domain in Claude Flow v3:

1. **Has clear boundaries** - Well-defined responsibilities
2. **Uses ubiquitous language** - Shared vocabulary
3. **Encapsulates business logic** - Domain models contain rules
4. **Communicates via events** - Loose coupling
5. **Has dedicated infrastructure** - Repository patterns

This architecture enables:
- **Modularity**: Change one domain without affecting others
- **Testability**: Mock domain boundaries
- **Scalability**: Optimize domains independently
- **Maintainability**: Clear structure and responsibilities

## Next Steps

- [Agent Management Guide](../guides/agent-management.md) - Deep dive into agent lifecycle
- [Task Execution Guide](../guides/task-execution.md) - Task orchestration patterns
- [Memory Usage Guide](../guides/memory-usage.md) - Memory system usage
- [Swarm Coordination Guide](../guides/swarm-coordination.md) - Multi-agent patterns
