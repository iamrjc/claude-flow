# Architecture Overview

Claude Flow v3 is built on 10 Architecture Decision Records (ADRs) that define a modular, security-first, high-performance platform for AI agent coordination.

## Table of Contents

- [Core Principles](#core-principles)
- [Architecture Decision Records](#architecture-decision-records)
- [Package Structure](#package-structure)
- [Data Flow](#data-flow)
- [Technology Stack](#technology-stack)
- [Performance Characteristics](#performance-characteristics)

## Core Principles

### 1. Domain-Driven Design (ADR-002)

Claude Flow v3 follows DDD principles with clear bounded contexts:

```
Domain Layer (Pure Business Logic)
├── Entities: Agent, Task, Memory, Swarm
├── Value Objects: AgentId, TaskStatus, MemoryType
├── Aggregates: SwarmAggregate, TaskGraph
├── Domain Services: CoordinationService, ConsensusService
└── Domain Events: AgentSpawned, TaskCompleted, MemoryStored

Application Layer (Use Cases)
├── Commands: SpawnAgentCommand, CreateTaskCommand
├── Queries: SearchMemoryQuery, GetSwarmStatusQuery
├── Services: AgentLifecycleService, TaskExecutionService
└── Event Handlers: AgentEventHandler, TaskEventHandler

Infrastructure Layer (Technical Implementation)
├── Repositories: AgentRepository, TaskRepository
├── External Services: AnthropicProvider, AgentDBAdapter
├── Message Bus: EventMessageBus
└── Persistence: SQLiteBackend, HybridMemoryRepository
```

### 2. Microkernel Plugin Architecture (ADR-004)

Core system is minimal; all features are plugins:

```typescript
// Core kernel (< 500 LOC)
interface Plugin {
  name: string;
  version: string;
  hooks: Hook[];
  commands?: Command[];
  tools?: MCPTool[];
}

// Plugins extend the kernel
const hiveMindPlugin: Plugin = {
  name: '@claude-flow/hive-mind',
  version: '3.0.0',
  hooks: [
    { name: 'pre-consensus', handler: validateConsensus },
    { name: 'post-consensus', handler: recordConsensus },
  ],
  commands: [queenCommand, workerCommand],
  tools: [byzantineTool, raftTool],
};
```

### 3. MCP-First API Design (ADR-005)

All functionality exposed via Model Context Protocol:

```
MCP Server
├── Agent Tools (spawn, list, terminate, status)
├── Swarm Tools (init, status, scale)
├── Memory Tools (store, search, list)
├── Task Tools (create, assign, status)
├── Config Tools (load, save, validate)
├── Hooks Tools (pre-edit, post-edit, route)
├── System Tools (status, metrics, health)
└── Session Tools (save, restore, list)
```

### 4. Event Sourcing (ADR-007)

All state changes are events:

```typescript
// Events are immutable facts
interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  timestamp: number;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

// Example: Agent lifecycle events
AgentSpawned → AgentConfigured → AgentStarted → TaskAssigned →
TaskInProgress → TaskCompleted → AgentIdle → AgentTerminated

// Event store for replay and audit
interface EventStore {
  append(event: DomainEvent): Promise<void>;
  getEvents(aggregateId: string): Promise<DomainEvent[]>;
  getEventsSince(timestamp: number): Promise<DomainEvent[]>;
}
```

### 5. Unified Memory Service (ADR-006)

Single memory interface with multiple backends:

```
Memory Service
├── AgentDB Backend (HNSW vector search, 150x-12,500x faster)
├── SQLite Backend (Structured storage)
├── Hybrid Backend (Best of both)
└── Cache Manager (LRU with TTL)
```

## Architecture Decision Records

### ADR-001: Agentic-Flow Foundation

**Decision**: Adopt `agentic-flow@alpha` as the core foundation.

**Rationale**:
- 75x faster embeddings with ONNX
- 352x faster edits with Agent Booster
- 95% cache hit rate
- ReasoningBank for pattern retrieval
- Q-learning optimal routing

**Impact**:
```typescript
import { getTokenOptimizer } from '@claude-flow/integration';

// Automatic integration
const optimizer = await getTokenOptimizer();
const context = await optimizer.getCompactContext("auth patterns"); // 32% fewer tokens
```

### ADR-002: Domain-Driven Design

**Decision**: Structure code using DDD patterns.

**Benefits**:
- **Bounded Contexts**: Agent, Task, Memory, Coordination domains
- **Ubiquitous Language**: Shared vocabulary between code and docs
- **Aggregate Roots**: Enforce invariants (e.g., SwarmAggregate ensures max agents)
- **Domain Events**: Track all state changes

**Example**:
```typescript
// Domain Entity
class Agent {
  private constructor(
    public readonly id: AgentId,
    public readonly type: AgentType,
    private status: AgentStatus,
    private metadata: AgentMetadata
  ) {
    // Invariant: Agent must have valid type
    this.validateType();
  }

  // Domain logic
  assignTask(task: Task): DomainEvent {
    if (this.status !== 'idle') {
      throw new Error('Agent is not idle');
    }
    this.status = 'busy';
    return new TaskAssignedEvent(this.id, task.id);
  }
}
```

### ADR-003: Unified Swarm Coordinator

**Decision**: Single `UnifiedSwarmCoordinator` instead of multiple coordinators.

**Benefits**:
- Simplified API surface
- Consistent behavior
- Easier testing
- Better performance (no coordinator switching)

**Implementation**:
```typescript
class UnifiedSwarmCoordinator {
  // Topology-agnostic interface
  async spawnAgent(spec: AgentSpec): Promise<Agent>;
  async submitTask(task: TaskSpec): Promise<Task>;
  async getSwarmStatus(): Promise<SwarmStatus>;

  // Internal topology adapters
  private topologyManager: TopologyManager;
  private consensusService: ConsensusService;
}
```

### ADR-004: Plugin Architecture

**Decision**: Microkernel with plugin system.

**Structure**:
```
Core Kernel (500 LOC)
├── Plugin Loader
├── Hook System
├── Event Bus
└── Dependency Injection

Plugins
├── @claude-flow/hive-mind (Byzantine consensus)
├── @claude-flow/neural (SONA learning)
├── @claude-flow/security (CVE fixes)
└── @claude-flow/performance (Flash Attention)
```

### ADR-005: MCP-First API

**Decision**: All features exposed via MCP tools.

**Tool Categories**:
```typescript
// 28 V3 tools + 14 V2 compatibility tools
const tools = [
  // Agent lifecycle
  'agent/spawn', 'agent/list', 'agent/terminate', 'agent/status',

  // Swarm coordination
  'swarm/init', 'swarm/status', 'swarm/scale',

  // Memory operations
  'memory/store', 'memory/search', 'memory/list',

  // Task management
  'tasks/create', 'tasks/assign', 'tasks/status', 'tasks/cancel',

  // Intelligence hooks
  'hooks/pre-edit', 'hooks/post-edit', 'hooks/route', 'hooks/pretrain',

  // System monitoring
  'system/status', 'system/metrics', 'system/health',
];
```

### ADR-006: Unified Memory Service

**Decision**: Single memory service with AgentDB integration.

**Architecture**:
```
┌─────────────────────────────────────────┐
│       Memory Application Service         │
├─────────────────────────────────────────┤
│   MemoryRepository Interface            │
├─────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ AgentDB  │  │  SQLite  │  │ Hybrid │ │
│  │ Backend  │  │ Backend  │  │Backend │ │
│  │ (HNSW)   │  │(Struct'd)│  │(Both)  │ │
│  └──────────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────────┘
```

### ADR-007: Event Sourcing

**Decision**: Store all state changes as events.

**Event Flow**:
```
Command → Domain Logic → Domain Event → Event Store → Projections
                                              ↓
                                        Event Handlers
                                              ↓
                                        Side Effects
```

**Benefits**:
- Full audit trail
- Temporal queries ("what was the state at time T?")
- Replay capability
- Easy debugging

### ADR-008: Vitest Over Jest

**Decision**: Use Vitest for 10x faster testing.

**Performance**:
```
Jest:   45-60s full test suite
Vitest: 4-6s full test suite (10x improvement)
```

### ADR-009: Hybrid Memory Default

**Decision**: Use SQLite + AgentDB by default.

**Rationale**:
- SQLite for structured data (tasks, agents)
- AgentDB for vector search (memory, patterns)
- HNSW indexing for 150x-12,500x speedup

### ADR-010: Node.js 20+ Only

**Decision**: Drop Deno support, require Node.js 20+.

**Benefits**:
- Native ESM support
- Top-level await
- Performance improvements
- Simpler build process

## Package Structure

### Monorepo Layout

```
v3/
├── @claude-flow/                    # Package namespace
│   ├── agents/                      # Agent domain
│   │   ├── domain/                  # Domain layer
│   │   │   ├── models/              # Agent, AgentPool entities
│   │   │   ├── events/              # Domain events
│   │   │   └── interfaces/          # Repository interfaces
│   │   ├── application/             # Application layer
│   │   │   ├── services/            # Use case services
│   │   │   ├── commands/            # Command handlers
│   │   │   └── queries/             # Query handlers
│   │   └── infrastructure/          # Infrastructure layer
│   │       └── repositories/        # Repository implementations
│   │
│   ├── swarm/                       # Coordination domain
│   │   ├── domain/
│   │   │   ├── entities/            # Task, Agent entities
│   │   │   ├── models/              # Consensus, Session models
│   │   │   └── services/            # Domain services
│   │   ├── application/
│   │   │   ├── services/            # Coordination, Consensus services
│   │   │   └── commands/            # Swarm commands
│   │   └── infrastructure/
│   │       └── messaging/           # Message bus, Mailbox
│   │
│   ├── memory/                      # Memory domain
│   │   ├── domain/
│   │   │   ├── entities/            # MemoryEntry entity
│   │   │   ├── models/              # MemoryId, Namespace VOs
│   │   │   └── interfaces/          # Repository interface
│   │   ├── application/
│   │   │   ├── services/            # Memory service
│   │   │   ├── commands/            # Store, Delete commands
│   │   │   └── queries/             # Search query
│   │   └── infrastructure/
│   │       ├── repositories/        # Hybrid repository
│   │       └── embeddings/          # Embedding service
│   │
│   ├── cli/                         # CLI application
│   │   ├── commands/                # 26 CLI commands
│   │   ├── parser.ts                # Argument parser
│   │   └── output.ts                # Formatted output
│   │
│   ├── mcp/                         # MCP server
│   │   ├── server.ts                # MCP server
│   │   ├── tools/                   # 42 MCP tools
│   │   └── transport/               # stdio, http, websocket
│   │
│   ├── plugins/                     # Plugin system
│   │   ├── registry.ts              # Plugin registry
│   │   └── loader.ts                # Plugin loader
│   │
│   ├── hooks/                       # Hook system
│   │   ├── pre-edit.ts              # Pre-edit hook
│   │   ├── post-edit.ts             # Post-edit hook
│   │   └── intelligence.ts          # Intelligence hooks
│   │
│   ├── neural/                      # Neural/SONA module
│   │   ├── algorithms/              # Learning algorithms
│   │   └── modes/                   # Neural modes
│   │
│   ├── performance/                 # Performance module
│   │   ├── framework/               # Benchmark framework
│   │   └── benchmarks/              # Performance tests
│   │
│   ├── security/                    # Security module
│   │   ├── validators/              # Input validators
│   │   └── cvefixes/                # CVE remediation
│   │
│   ├── integration/                 # agentic-flow bridge
│   │   ├── bridge.ts                # Core bridge
│   │   └── adapters/                # Adapters
│   │
│   ├── shared/                      # Shared utilities
│   │   ├── types/                   # Shared types
│   │   ├── events/                  # Event system
│   │   └── utils/                   # Utilities
│   │
│   └── testing/                     # Testing framework
│       ├── mocks/                   # Mock services
│       ├── fixtures/                # Test fixtures
│       └── helpers/                 # Test helpers
│
├── mcp/                             # Standalone MCP server
├── docs/                            # Documentation
├── examples/                        # Example code
└── plugins/                         # Domain-specific plugins
```

### Package Dependencies

```
┌────────────────────────────────────────┐
│            @claude-flow/cli            │
│         (User-facing CLI)              │
└────────────┬───────────────────────────┘
             │
             ├──> @claude-flow/agents
             ├──> @claude-flow/swarm
             ├──> @claude-flow/memory
             ├──> @claude-flow/hooks
             └──> @claude-flow/shared
                       │
                       ├──> @claude-flow/security
                       ├──> @claude-flow/performance
                       └──> @claude-flow/integration
                                  │
                                  └──> agentic-flow@alpha
```

## Data Flow

### Command Flow (CQRS Pattern)

```
User/MCP Client
      ↓
CLI Command / MCP Tool
      ↓
Application Service
      ↓
Command Handler
      ↓
Domain Aggregate (validates business rules)
      ↓
Domain Event (fact)
      ↓
Event Store (append-only)
      ↓
Event Handler (updates projections)
      ↓
Repository (persistence)
```

### Query Flow

```
User/MCP Client
      ↓
CLI Command / MCP Tool
      ↓
Application Service
      ↓
Query Handler
      ↓
Repository (read model)
      ↓
Response
```

### Event Flow

```
Domain Event Emitted
      ↓
Event Bus (in-memory or persistent)
      ↓
Event Handlers (parallel)
      ├──> Update Projections (read models)
      ├──> Trigger Side Effects (notifications)
      ├──> Cascade to Other Aggregates
      └──> External Integrations (webhooks)
```

## Technology Stack

### Core Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 20+ | JavaScript runtime |
| **Language** | TypeScript 5.3+ | Type safety |
| **Build** | ESBuild | Fast bundling |
| **Testing** | Vitest | 10x faster tests |
| **Validation** | Zod | Schema validation |

### Storage

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Structured Data** | SQLite (better-sqlite3) | Tasks, agents, config |
| **Vector Search** | AgentDB (HNSW) | Memory, patterns (150x faster) |
| **Cache** | LRU Cache | In-memory caching |
| **Events** | Append-only log | Event sourcing |

### Communication

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **MCP Server** | stdio/http/websocket | External API |
| **Event Bus** | In-memory pub/sub | Internal events |
| **Message Queue** | Mailbox system | Agent messaging |

### AI/ML

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **LLM Provider** | Anthropic Claude | AI reasoning |
| **Embeddings** | ONNX (agentic-flow) | 75x faster vectors |
| **Neural Learning** | SONA | Self-optimization |
| **Pattern Search** | HNSW | 150x-12,500x faster |

## Performance Characteristics

### Target Metrics

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| **CLI Startup** | < 500ms | ~300ms | ✅ |
| **MCP Response** | < 100ms | ~50ms | ✅ |
| **Event Bus** | < 50ms (100k events) | ~6ms | ✅ |
| **Map Lookup** | < 20ms (100k gets) | ~16ms | ✅ |
| **HNSW Search** | 150x-12,500x faster | Validated | ✅ |
| **Flash Attention** | 2.49x-7.47x speedup | In Progress | 🚧 |
| **Memory Reduction** | 50-75% | 3.92x (Int8) | ✅ |
| **SONA Adaptation** | < 0.05ms | In Progress | 🚧 |

### Optimization Techniques

1. **Lazy Loading**: Commands loaded on-demand (200ms startup reduction)
2. **HNSW Indexing**: Approximate nearest neighbor (150x-12,500x speedup)
3. **Agent Booster**: Skip LLM for simple transforms (352x faster)
4. **Cache Hit Rate**: 95% with ReasoningBank
5. **Quantization**: Int8 quantization (3.92x memory reduction)
6. **Batch Processing**: Optimal batch sizes (20% token reduction)

### Scalability

```
Agent Pool
├── Max Agents: 1000 (configurable)
├── Queen Coordinator: 1 (hierarchical topology)
├── Worker Agents: Up to 999
└── Auto-scaling: Enabled (adaptive topology)

Memory
├── HNSW Index: Millions of vectors
├── SQLite: Gigabytes of structured data
├── Cache: Configurable size (default: 10,000 entries)
└── TTL: Automatic expiration

Tasks
├── Task Graph: DAG with unlimited nodes
├── Dependencies: Topological sorting
├── Parallel Execution: Up to maxAgents
└── Queue: Priority-based scheduling
```

## Security Architecture

### CVE Remediation (ADR-002 in security module)

```
Input Validation (Zod schemas)
      ↓
Path Traversal Protection
      ↓
SQL Injection Prevention (parameterized queries)
      ↓
Command Injection Protection (SafeExecutor)
      ↓
Secure ID Generation (crypto.randomBytes)
      ↓
Password Hashing (bcrypt, 12 rounds)
```

### Security Layers

1. **Input Layer**: Zod validation on all external inputs
2. **Application Layer**: Business rule enforcement
3. **Infrastructure Layer**: Parameterized queries, path validation
4. **Audit Layer**: Event sourcing for full audit trail

## Next Steps

- [Domain Structure](./domains.md) - Deep dive into each domain
- [Agent Management](../guides/agent-management.md) - Agent lifecycle
- [Task Execution](../guides/task-execution.md) - Task orchestration
- [Memory Usage](../guides/memory-usage.md) - Memory patterns
- [Swarm Coordination](../guides/swarm-coordination.md) - Multi-agent coordination
