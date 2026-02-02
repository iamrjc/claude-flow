# Getting Started with Claude Flow v3

Welcome to Claude Flow v3 - a next-generation AI agent coordination system built on Domain-Driven Design principles with a 15-agent hierarchical mesh architecture.

## Table of Contents

- [Installation](#installation)
- [First Agent](#first-agent)
- [First Task](#first-task)
- [Basic Swarm](#basic-swarm)
- [Multi-Provider LLM Support](#multi-provider-llm-support)
- [Memory System](#memory-system)
- [Real-time WebSocket Events](#real-time-websocket-events)
- [Event Streaming (SSE)](#event-streaming-sse)
- [Workflow Templates](#workflow-templates)
- [Admin Dashboard](#admin-dashboard)
- [Caching](#caching)
- [Rate Limiting & Throttling](#rate-limiting--throttling)
- [Observability](#observability)
- [Security](#security)
- [Hooks for Intelligence](#hooks-for-intelligence)
- [Configuration](#configuration)
- [Next Steps](#next-steps)

## Installation

### Prerequisites

- **Node.js**: >= 20.0.0
- **pnpm**: >= 8.0.0 (recommended) or npm >= 9.0.0
- **TypeScript**: >= 5.3.0

### Quick Install

```bash
# Clone the repository
git clone https://github.com/iamrjc/claude-flow.git
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
import { createUnifiedSwarmCoordinator } from '@claude-flow/swarm';

// Initialize swarm coordinator
const coordinator = createUnifiedSwarmCoordinator({
  topology: { type: 'hierarchical', maxAgents: 15 },
  consensus: { algorithm: 'raft', threshold: 0.66 },
});

// Initialize the swarm
await coordinator.initialize();

// Spawn 15-agent hierarchy across 5 domains
const agents = await coordinator.spawnFullHierarchy();
console.log(`Spawned ${agents.size} agents`);

// Submit tasks to specific domains
const securityTaskId = await coordinator.submitTask({
  type: 'review',
  name: 'Security Audit',
  priority: 'critical',
});

await coordinator.assignTaskToDomain(securityTaskId, 'security');

// Execute tasks in parallel across domains
const results = await coordinator.executeParallel([
  { task: { type: 'coding', name: 'Core Implementation' }, domain: 'core' },
  { task: { type: 'testing', name: 'Security Tests' }, domain: 'security' },
  { task: { type: 'documentation', name: 'API Docs' }, domain: 'integration' },
]);

console.log(`Completed ${results.filter(r => r.success).length} tasks in parallel`);

// Get swarm status
const status = coordinator.getStatus();
console.log(`Active agents: ${status.metrics.agentUtilization}%`);

// Shutdown
await coordinator.shutdown();
```

## Multi-Provider LLM Support

V3 supports 6+ LLM providers with intelligent load balancing and automatic failover:

```typescript
import { createProviderManager } from '@claude-flow/providers';

// Create provider manager with multiple providers
const manager = await createProviderManager({
  providers: [
    {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-5-sonnet-latest',
    },
    {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o',
    },
    {
      provider: 'google',
      apiKey: process.env.GOOGLE_API_KEY!,
      model: 'gemini-1.5-pro',
    },
  ],
  loadBalancing: {
    enabled: true,
    strategy: 'cost-based', // 'round-robin' | 'least-loaded' | 'latency-based' | 'cost-based'
  },
  fallback: {
    enabled: true,
    maxAttempts: 3,
  },
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutes
    maxSize: 1000,
  },
});

// Make a completion request (automatically routes to optimal provider)
const response = await manager.complete({
  messages: [{ role: 'user', content: 'Hello, how are you?' }],
  maxTokens: 100,
});

console.log('Response:', response.content);
console.log('Provider used:', response.provider);
console.log('Cost:', response.cost?.totalCost);

// Stream completion
for await (const event of manager.streamComplete({
  messages: [{ role: 'user', content: 'Tell me a story' }],
})) {
  if (event.type === 'content') {
    process.stdout.write(event.delta?.content || '');
  }
}

// Get cost estimates across all providers
const estimates = await manager.estimateCost(request);
estimates.forEach((estimate, provider) => {
  console.log(`${provider}: $${estimate.estimatedCost.total.toFixed(4)}`);
});
```

### Supported Providers

| Provider | Models | Features |
|----------|--------|----------|
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku | Streaming, Tool Calling, Vision |
| **OpenAI** | GPT-4o, GPT-4 Turbo, o1-preview, o3-mini | Streaming, Tool Calling, Vision |
| **Google** | Gemini 2.0 Flash, Gemini 1.5 Pro | Streaming, Tool Calling |
| **Cohere** | Command R+, Command R | Streaming |
| **Ollama** | Llama 3.2, Mistral, CodeLlama | Local, Streaming |
| **RuVector** | Custom models | Specialized |

## Memory System

Store and retrieve memories with 150x-12,500x faster search via HNSW indexing:

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
import { HNSWIndex, AgentDBAdapter, CacheManager } from '@claude-flow/memory';

// Create HNSW index for ultra-fast vector search
const index = new HNSWIndex({
  dimensions: 1536,      // OpenAI embedding size
  M: 16,                 // Max connections per node
  efConstruction: 200,   // Construction-time search depth
  metric: 'cosine',      // 'cosine' | 'euclidean' | 'dot' | 'manhattan'
  quantization: {        // Optional: 4-32x memory reduction
    type: 'scalar',
    bits: 8,
  },
});

// Add vectors
await index.addPoint('memory-1', new Float32Array(embedding));
await index.addPoint('memory-2', new Float32Array(embedding2));

// Search (150x faster than v2)
const results = await index.search(queryVector, 10);
// [{ id: 'memory-1', distance: 0.05 }, { id: 'memory-2', distance: 0.12 }]

// Or use the AgentDB adapter for full memory management
const adapter = new AgentDBAdapter({
  dimension: 1536,
  indexType: 'hnsw',
  metric: 'cosine',
  enableCache: true,
  cacheSizeMb: 256,
});

await adapter.initialize();

// Store memory with metadata
await adapter.store({
  id: 'mem-123',
  content: 'User prefers dark mode',
  embedding: vector,
  metadata: { type: 'preference', agentId: 'agent-1' },
});

// Semantic search with filters
const memories = await adapter.search(queryVector, {
  limit: 10,
  threshold: 0.7,
  filter: { type: 'preference' },
});
```

## Real-time WebSocket Events

Subscribe to real-time agent, task, and swarm events via WebSocket:

### Server Setup

```typescript
import { WSServer, WSRouter } from '@claude-flow/realtime';
import { AgentChannelServer, TaskChannelServer, SwarmChannelServer } from '@claude-flow/realtime';

// Create WebSocket server
const server = new WSServer({
  port: 8080,
  heartbeatInterval: 30000,
  authenticate: async (token) => token === 'valid-token',
});

// Create router for topic-based subscriptions
const router = new WSRouter(server, { enablePatterns: true });

// Set up domain-specific channels
const agentChannel = new AgentChannelServer(router);
const taskChannel = new TaskChannelServer(router);
const swarmChannel = new SwarmChannelServer(router);

await server.start();

// Publish events
await agentChannel.publishStatusChange({
  agentId: 'agent-1',
  status: 'busy',
  timestamp: Date.now(),
});

await taskChannel.publishProgress({
  taskId: 'task-1',
  progress: 50,
  status: 'in-progress',
  timestamp: Date.now(),
});

await swarmChannel.publishConsensus({
  swarmId: 'swarm-1',
  proposalId: 'prop-1',
  type: 'proposed',
  proposal: { action: 'scale-up' },
  timestamp: Date.now(),
});
```

### Client Setup

```typescript
import { WSClient, AgentChannelClient, TaskChannelClient } from '@claude-flow/realtime';

// Create client with auto-reconnect
const client = new WSClient({
  url: 'ws://localhost:8080',
  token: 'valid-token',
  reconnect: true,
  reconnectInterval: 5000,
});

const agentClient = new AgentChannelClient(client);
const taskClient = new TaskChannelClient(client);

await client.connect();

// Subscribe to topics with wildcards
await client.subscribe(['agent.*.status', 'task.#']);

// Listen for events
client.on('event', (event) => {
  console.log('Received:', event.topic, event.data);
});

// Or use typed channel clients
agentClient.on('status-change', (event) => {
  console.log('Agent status:', event.agentId, event.status);
});

// Wait for task completion
const result = await taskClient.waitForCompletion('task-1', 30000);
console.log('Task completed:', result);
```

### Pattern Matching

The router supports MQTT-style wildcards:
- `*` - Matches exactly one segment (`agent.*.status` matches `agent.123.status`)
- `#` - Matches zero or more segments (`agent.#` matches `agent.123.status.health`)

## Event Streaming (SSE)

For one-way real-time streaming, use Server-Sent Events with HTTP/2 support:

### Server

```typescript
import { SSEServer, TaskStream, AgentStream, LLMStream } from '@claude-flow/streaming';

const server = new SSEServer({
  port: 3000,
  http2: true,
  certPath: './cert.pem',
  keyPath: './key.pem',
  compression: true,
  maxClients: 1000,
});

await server.start();

// Task streaming
const taskStream = new TaskStream(server, {
  includeProgress: true,
  includeIntermediateResults: true,
});

taskStream.start();
taskStream.emitProgress('task-123', {
  percentage: 50,
  currentStep: 'Analyzing requirements',
});

// Agent output streaming
const agentStream = new AgentStream(server, {
  includeOutput: true,
  includeLogs: true,
  includeMetrics: true,
});

agentStream.start();
agentStream.emitOutput('agent-1', 'stdout', 'Processing file: main.ts');

// LLM token streaming
const llmStream = new LLMStream(server, {
  includeTokens: true,
  includeToolCalls: true,
  includeUsage: true,
});

llmStream.start();
llmStream.emitToken('req-123', { token: 'Hello', index: 0 });
```

### Client

```typescript
import { SSEClient } from '@claude-flow/streaming';

const client = new SSEClient({
  url: 'http://localhost:3000',
  filters: ['task:*', 'agent:*', 'llm:*'],
  autoReconnect: true,
  reconnectBackoff: 2,
});

// Task events
client.on('task:progress', (data) => {
  console.log(`Task ${data.taskId}: ${data.progress.percentage}%`);
});

// Agent events
client.on('agent:output:stdout', (output) => {
  console.log(`[${output.agentId}] ${output.data}`);
});

// LLM token streaming
client.on('llm:token', (token) => {
  process.stdout.write(token.token);
});

await client.connect();
```

## Workflow Templates

Use pre-built workflow templates for common development tasks:

```typescript
import {
  WorkflowEngine,
  WorkflowValidator,
  codeReviewTemplate,
  researchTemplate,
  refactoringTemplate,
  testingTemplate,
  documentationTemplate,
} from '@claude-flow/workflows';

// Create engine and register templates
const engine = new WorkflowEngine();
const validator = new WorkflowValidator();

engine.registerTemplate(codeReviewTemplate);
engine.registerTemplate(researchTemplate);
engine.registerTemplate(refactoringTemplate);
engine.registerTemplate(testingTemplate);
engine.registerTemplate(documentationTemplate);

// Start a code review workflow
const workflowId = await engine.startWorkflow('code-review', {
  target: '/src',
  depth: 'deep',
  reviewerCount: 5,
  focusAreas: ['security', 'performance', 'maintainability'],
  minCoverage: 80,
});

// Track progress
engine.on('workflow-progress', (progress) => {
  console.log(`Progress: ${progress.progress}% - ${progress.message}`);
});

engine.on('workflow-completed', (event) => {
  console.log('Workflow completed:', event.result);
});

// Pause and resume
await engine.pauseWorkflow(workflowId);
await engine.resumeWorkflow(workflowId);

// Get status and results
const status = engine.getWorkflowStatus(workflowId);
const result = engine.getWorkflowResult(workflowId);
```

### Available Templates

| Template | Steps | Description |
|----------|-------|-------------|
| **code-review** | 7 | Static analysis, parallel reviewers, coverage check, aggregated report |
| **research** | 7 | Query analysis, parallel gathering, verification, citations, synthesis |
| **refactoring** | 8 | Code analysis, pattern detection, backup, transformations, test verification |
| **testing** | 7 | Gap analysis, test generation, execution, coverage, mutation testing |
| **documentation** | 8 | Code scan, API docs, examples, diagrams, consistency checks |

### Resource Estimation

```typescript
const estimation = validator.estimateResources(codeReviewTemplate);
console.log('Estimated duration:', estimation.estimatedDuration);
console.log('Estimated cost:', estimation.estimatedCost);
console.log('Required agents:', estimation.requiredAgents);
```

## Admin Dashboard

Start the built-in admin dashboard for real-time monitoring:

```typescript
import { startDashboard } from '@claude-flow/dashboard';

const dashboard = await startDashboard({
  port: 3000,
  host: 'localhost',
  authEnabled: true,
  authToken: process.env.DASHBOARD_TOKEN,
  corsEnabled: true,
});

console.log('Dashboard running at http://localhost:3000');
```

### Dashboard Features

- **Real-time Monitoring**: Live updates via Server-Sent Events
- **Zero External Dependencies**: Vanilla Node.js and JavaScript
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark/Light Mode**: User preference with localStorage persistence

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | System status overview |
| `/api/agents` | GET | List all agents |
| `/api/tasks` | GET | List all tasks |
| `/api/metrics` | GET | Performance metrics |
| `/api/config` | GET/PUT | Configuration management |
| `/api/agents/:id/terminate` | POST | Terminate an agent |
| `/api/tasks/:id/cancel` | POST | Cancel a task |
| `/api/swarm/scale` | POST | Scale swarm up/down |
| `/events` | GET | Server-Sent Events stream |

## Caching

Implement multi-layer caching for LLM responses, embeddings, and tool results:

```typescript
import {
  MemoryCache,
  DiskCache,
  RedisAdapter,
  ResponseCache,
  EmbeddingCache,
  ToolResultCache,
  CacheInvalidator,
} from '@claude-flow/cache';

// L1: In-memory LRU cache (fast)
const memoryCache = new MemoryCache({
  maxSize: 1000,
  ttl: 3600000, // 1 hour
  evictionPolicy: 'lru', // 'lru' | 'lfu' | 'fifo'
});

// L2: SQLite disk cache (persistent)
const diskCache = new DiskCache({
  dbPath: './cache.db',
  maxSize: 1024 * 1024 * 1024, // 1GB
  compression: true,
});

// L3: Redis (distributed)
const redisCache = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  keyPrefix: 'cf:cache:',
  enablePubSub: true, // Cross-node invalidation
});

// Specialized caches
const responseCache = new ResponseCache({
  ttl: 3600000,
  semanticThreshold: 0.85, // Match similar prompts
});

const embeddingCache = new EmbeddingCache({
  maxVectors: 10000,
  dimensions: 384,
  enableWarming: true,
});

const toolCache = new ToolResultCache({
  defaultTtl: 300000, // 5 minutes
});

// Intelligent invalidation
const invalidator = new CacheInvalidator({ enableCascade: true });
invalidator.addPatternRule(/user:.*/);
invalidator.addEventRule('user:updated', /user:.*/);
invalidator.addCascadeRule(/user:.*/, ['session:*', 'cache:*']);
```

## Rate Limiting & Throttling

Protect your system with multi-layer rate limiting:

```typescript
import {
  TokenBucket,
  SlidingWindow,
  LeakyBucket,
  ProviderRateLimiter,
  AgentRateLimiter,
  GlobalRateLimiter,
  QueueManager,
} from '@claude-flow/throttle';

// Token bucket for burst handling
const bucket = new TokenBucket({
  capacity: 100,
  refillRate: 10, // tokens per second
});

if (bucket.consume(5)) {
  console.log('Request allowed');
}

// Provider-specific limits
const providerLimiter = new ProviderRateLimiter('anthropic', {
  rpm: 50,                    // 50 requests/minute
  tpm: 100_000,               // 100k tokens/minute
  concurrentLimit: 5,
  costPerMinuteLimit: 1.0,    // $1/minute
  allowBurst: true,
});

// Agent-specific limits
const agentLimiter = new AgentRateLimiter('agent-1', {
  tasksPerMinute: 30,
  memoryOpsPerMinute: 100,
  messagesPerMinute: 60,
  maxConcurrentTasks: 5,
});

// Global system limits
const globalLimiter = new GlobalRateLimiter({
  totalRPM: 500,
  totalTPM: 1_000_000,
  totalConcurrent: 50,
  totalCostPerHour: 100, // $100/hour
  enableEmergencyThrottle: true,
  emergencyThreshold: 0.9,
  degradationMode: 'queue', // 'queue' | 'reject' | 'shed' | 'priority'
});

// Queue manager with backpressure
const queue = new QueueManager({
  maxSize: 100,
  enableRetry: true,
  maxRetries: 3,
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 2,
    openTimeoutMs: 60_000,
  },
});

const result = await queue.enqueue(
  async () => someOperation(),
  'high', // Priority: 'low' | 'normal' | 'high' | 'critical'
  10_000  // Timeout
);
```

## Observability

Comprehensive logging, metrics, and distributed tracing:

### Structured Logging

```typescript
import { createLogger } from '@claude-flow/observability';

const logger = createLogger({
  level: 'info',
  enableRedaction: true, // Redact sensitive data
});

logger.info('User logged in', { userId: '123', email: 'user@example.com' });
logger.error('Database connection failed', { error: err.message });

// Child logger with context
const agentLogger = logger.child({
  agentId: 'agent-1',
  taskId: 'task-123',
});
agentLogger.info('Processing task');
```

### Metrics Collection

```typescript
import { createMetricsCollector, metricsExporter, METRIC_NAMES } from '@claude-flow/observability';

const metrics = createMetricsCollector();

// Counter
metrics.incrementCounter(METRIC_NAMES.AGENT_SPAWNED, 1, { type: 'coder' });

// Gauge
metrics.setGauge(METRIC_NAMES.AGENT_ACTIVE, 5);

// Histogram
metrics.observeHistogram(METRIC_NAMES.TASK_DURATION, 1.5, { status: 'success' });

// Time a function
await metrics.timeAsync('database_query', async () => {
  return await db.query('SELECT * FROM users');
});

// Export to Prometheus
const prometheus = metricsExporter.exportPrometheus(metrics.getMetrics());
```

### Distributed Tracing

```typescript
import { createTraceManager } from '@claude-flow/observability';

const tracer = createTraceManager();

// Create spans
await tracer.withSpan('process-task', async (span) => {
  tracer.addEvent(span, 'task-started');
  tracer.setAttributes(span, { taskId: '123' });

  // Nested spans for sub-operations
  await tracer.withSpan('database-query', async (childSpan) => {
    const result = await db.query('...');
    tracer.setAttributes(childSpan, { rowCount: result.rows.length });
    return result;
  });

  tracer.addEvent(span, 'task-completed');
});
```

### Health Monitoring

```typescript
import { createHealthDashboard, memoryHealthCheck, apiHealthCheck } from '@claude-flow/observability';

const dashboard = createHealthDashboard();

// Register health checks
dashboard.registerComponent('memory', memoryHealthCheck(1000)); // 1GB threshold
dashboard.registerComponent('api', apiHealthCheck('https://api.example.com/health'));
dashboard.registerComponent('database', async () => {
  const connected = await db.ping();
  return {
    status: connected ? 'healthy' : 'unhealthy',
    message: connected ? 'Database connected' : 'Database unreachable',
  };
});

dashboard.start();

// Kubernetes-style probes
const liveness = await dashboard.liveness();
const readiness = await dashboard.readiness();
const health = await dashboard.getHealth();
console.log(health.status); // 'healthy', 'degraded', or 'unhealthy'
```

## Security

Comprehensive security with CVE fixes, input validation, and secure credential management:

```typescript
import { createSecurityModule } from '@claude-flow/security';

// Create a complete security module
const security = createSecurityModule({
  projectRoot: '/workspaces/project',
  hmacSecret: process.env.HMAC_SECRET!,
  bcryptRounds: 12,
  allowedCommands: ['git', 'npm', 'npx', 'node'],
});

// Password hashing (CVE-2 fix)
const hash = await security.passwordHasher.hash('userPassword123');
const isValid = await security.passwordHasher.verify('userPassword123', hash);

// Path validation (HIGH-2 fix - prevents traversal attacks)
const pathResult = await security.pathValidator.validate('../../../etc/passwd');
// { valid: false, reason: 'Path traversal detected' }

// Safe command execution (HIGH-1 fix - prevents injection)
const output = await security.safeExecutor.execute('git', ['status']);

// Secure credential generation (CVE-3 fix)
const creds = await security.credentialGenerator.generate();
const apiKey = await security.credentialGenerator.generateApiKey({
  prefix: 'cf',
  length: 32,
});
```

### Input Validation

```typescript
import {
  InputValidator,
  EmailSchema,
  PasswordSchema,
  SpawnAgentSchema,
  sanitizeHtml,
} from '@claude-flow/security';

// Validate email
const email = EmailSchema.parse('user@example.com');

// Validate password (min 8 chars, complexity requirements)
const password = PasswordSchema.parse('SecurePass123!');

// Validate agent spawn request
const agentRequest = SpawnAgentSchema.parse({
  type: 'coder',
  name: 'code-agent-1',
});

// Sanitize HTML (prevent XSS)
const safe = sanitizeHtml('<script>alert("xss")</script>Hello');
// 'Hello'
```

## Hooks for Intelligence

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
  "realtime": {
    "websocket": {
      "enabled": true,
      "port": 8080
    },
    "sse": {
      "enabled": true,
      "port": 3001
    }
  },
  "cache": {
    "memory": { "maxSize": 1000, "ttl": 3600000 },
    "disk": { "enabled": true, "path": "./cache.db" }
  },
  "throttle": {
    "globalRpm": 500,
    "globalTpm": 1000000,
    "emergencyThreshold": 0.9
  },
  "observability": {
    "logging": { "level": "info", "redaction": true },
    "metrics": { "enabled": true, "exportInterval": 60000 },
    "tracing": { "enabled": true, "sampleRate": 0.1 }
  },
  "security": {
    "bcryptRounds": 12,
    "pathValidation": true,
    "inputValidation": true
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

# Security
HMAC_SECRET=your-32-char-minimum-secret-key
DASHBOARD_TOKEN=your-dashboard-auth-token
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

### Rate Limiting Issues

```bash
# Check current limits
npx @claude-flow/cli@alpha throttle status

# View rate limit metrics
npx @claude-flow/cli@alpha throttle metrics --provider anthropic

# Reset rate limit counters
npx @claude-flow/cli@alpha throttle reset
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
