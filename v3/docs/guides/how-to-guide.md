# Claude Flow V3 - Complete How-To Guide

> **ELI5 Edition**: This guide explains everything in simple terms. No PhD required!

## Table of Contents

1. [What is Claude Flow?](#what-is-claude-flow)
2. [Installation](#installation)
3. [Quick Setup](#quick-setup)
4. [Your First Agent](#your-first-agent)
5. [Your First Task](#your-first-task)
6. [Multi-Agent Swarms](#multi-agent-swarms)
7. [Admin Dashboard](#admin-dashboard)
8. [Real-Time Events](#real-time-events)
9. [Workflow Templates](#workflow-templates)
10. [Memory System](#memory-system)
11. [Multiple AI Providers](#multiple-ai-providers)
12. [Caching](#caching)
13. [Rate Limiting](#rate-limiting)
14. [Observability](#observability)
15. [Security](#security)
16. [Common Operations Reference](#common-operations-reference)

---

## What is Claude Flow?

**Think of Claude Flow as a "manager" for AI helpers (agents).**

Imagine you have a team of robot assistants:
- One writes code
- One tests code
- One reviews code
- One does research

Claude Flow coordinates them all, so they work together like a well-organized team.

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Flow V3                       │
│                                                         │
│    You ──► Claude Flow ──► Agent 1 (Coder)             │
│                       ──► Agent 2 (Tester)             │
│                       ──► Agent 3 (Reviewer)           │
│                       ──► Agent 4 (Researcher)         │
│                                                         │
│    All agents share memory and coordinate together      │
└─────────────────────────────────────────────────────────┘
```

<!-- Screenshot: Overview diagram showing Claude Flow coordinating multiple agents -->
![Claude Flow Overview](./images/overview-diagram.png)

---

## Installation

### What You Need First

| Requirement | Minimum Version | How to Check |
|-------------|-----------------|--------------|
| Node.js | 20.0.0 | `node --version` |
| npm | 9.0.0 | `npm --version` |

### Option 1: Quick Install (Recommended)

Copy and paste this into your terminal:

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/iamrjc/claude-flow@main/scripts/install.sh | bash
```

**What happens automatically:**
- ✅ Checks your Node.js version
- ✅ Installs Claude Flow
- ✅ Initializes your project
- ✅ Verifies everything works

**What you can optionally add:**

| Flag | What It Does | Command |
|------|--------------|---------|
| `--global` | Install globally (use anywhere) | `... \| bash -s -- --global` |
| `--dashboard` | Start admin dashboard | `... \| bash -s -- --dashboard` |
| `--swarm` | Initialize 15-agent swarm | `... \| bash -s -- --swarm` |
| `--full` | Everything above | `... \| bash -s -- --full` |

<!-- Screenshot: Terminal showing successful installation -->
![Installation Success](./images/install-success.png)

### Option 2: Manual Install

```bash
# Install via npm
npm install -g claude-flow@alpha

# Verify installation
claude-flow --version

# Initialize your project
claude-flow init --wizard
```

### Option 3: Use Without Installing (npx)

```bash
# Run any command without installing
npx claude-flow@alpha doctor
```

---

## Quick Setup

### Step 1: Run the Doctor

The "doctor" checks if everything is set up correctly:

```bash
npx claude-flow@alpha doctor
```

**Expected output:**

```
✓ Node.js version (v20.x.x)
✓ npm version (9.x.x)
✓ Git installation
✓ Config file validity
✓ Memory database initialized
✓ API keys configured
✓ Disk space available
```

<!-- Screenshot: Doctor command output showing all checks passing -->
![Doctor Output](./images/doctor-output.png)

### Step 2: Initialize Your Project

```bash
npx claude-flow@alpha init --wizard
```

The wizard will ask you:

1. **Project name** - Just press Enter for default
2. **Topology** - Choose `hierarchical` (recommended)
3. **Max agents** - Choose `15` (default)
4. **Memory backend** - Choose `hybrid` (recommended)

**This creates automatically:**
- ✅ `claude-flow.config.json` - Your settings
- ✅ `.env` file template - For API keys
- ✅ Memory database - For agent memory

<!-- Screenshot: Init wizard prompts -->
![Init Wizard](./images/init-wizard.png)

### Step 3: Add Your API Keys

Edit your `.env` file:

```bash
# Required - at least one provider
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional - additional providers
OPENAI_API_KEY=sk-your-key-here
GOOGLE_API_KEY=your-key-here
```

> **Where to get API keys:**
> - Anthropic: https://console.anthropic.com/
> - OpenAI: https://platform.openai.com/api-keys
> - Google: https://makersuite.google.com/app/apikey

---

## Your First Agent

### What is an Agent?

An agent is an AI helper that can do specific tasks. Think of it like hiring a specialist:

| Agent Type | What They Do |
|------------|--------------|
| `coder` | Writes code |
| `tester` | Writes and runs tests |
| `reviewer` | Reviews code quality |
| `researcher` | Gathers information |
| `architect` | Designs systems |

### Spawning Your First Agent

**YOU RUN THIS:**

```bash
npx claude-flow@alpha agent spawn -t coder --name my-first-agent
```

**What happens:**
- Creates a new "coder" type agent
- Names it "my-first-agent"
- Agent is now ready to work

<!-- Screenshot: Agent spawn command and output -->
![Agent Spawn](./images/agent-spawn.png)

### Checking Agent Status

**YOU RUN THIS:**

```bash
npx claude-flow@alpha agent status --agent-id my-first-agent
```

**Output shows:**
- Agent state (idle, working, stopped)
- Tasks completed
- Memory usage

### Listing All Agents

**YOU RUN THIS:**

```bash
npx claude-flow@alpha agent list
```

<!-- Screenshot: Agent list output -->
![Agent List](./images/agent-list.png)

### Stopping an Agent

**YOU RUN THIS:**

```bash
npx claude-flow@alpha agent stop --agent-id my-first-agent
```

---

## Your First Task

### What is a Task?

A task is a job you give to an agent. Like asking someone to "write a login function."

### Creating a Task

**YOU RUN THIS:**

```bash
npx claude-flow@alpha task create \
  --title "Write hello world function" \
  --description "Create a TypeScript function that returns 'Hello, World!'" \
  --priority high
```

**Output:**
```
Task created: task-abc123
Status: pending
Priority: high
```

<!-- Screenshot: Task create output -->
![Task Create](./images/task-create.png)

### Assigning a Task to an Agent

**YOU RUN THIS:**

```bash
npx claude-flow@alpha task assign \
  --task-id task-abc123 \
  --agent-id my-first-agent
```

**What happens automatically:**
- ✅ Task moves from "pending" to "assigned"
- ✅ Agent receives the task
- ✅ Agent starts working

### Checking Task Status

**YOU RUN THIS:**

```bash
npx claude-flow@alpha task status --task-id task-abc123
```

**Possible statuses:**

| Status | Meaning |
|--------|---------|
| `pending` | Created, waiting for assignment |
| `assigned` | Given to an agent |
| `running` | Agent is working on it |
| `completed` | Done! |
| `failed` | Something went wrong |

---

## Multi-Agent Swarms

### What is a Swarm?

A swarm is a group of agents working together. Like a team of specialists collaborating on a project.

```
┌────────────────────────────────────────────────────────────┐
│                    15-Agent Swarm                          │
│                                                            │
│                    ┌─────────┐                             │
│                    │  Queen  │ ← Coordinator               │
│                    └────┬────┘                             │
│           ┌─────────────┼─────────────┐                    │
│           ▼             ▼             ▼                    │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│    │ Security │  │   Core   │  │Integration│               │
│    │ Domain   │  │  Domain  │  │  Domain   │               │
│    │ (2-4)    │  │  (5-9)   │  │ (10-12)   │               │
│    └──────────┘  └──────────┘  └──────────┘               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Initializing a Swarm

**YOU RUN THIS:**

```bash
npx claude-flow@alpha swarm init \
  --topology hierarchical \
  --max-agents 15 \
  --strategy adaptive
```

**What happens automatically:**
- ✅ Creates swarm coordinator
- ✅ Sets up communication channels
- ✅ Prepares agent pools

<!-- Screenshot: Swarm init output -->
![Swarm Init](./images/swarm-init.png)

### Topology Options

| Topology | Best For | Max Agents |
|----------|----------|------------|
| `hierarchical` | Most projects (recommended) | 100+ |
| `mesh` | Small teams, peer work | 20 |
| `centralized` | Simple coordination | 50 |
| `hybrid` | Large enterprise | 200 |

### Spawning All 15 Agents

**YOU RUN THIS:**

```bash
npx claude-flow@alpha swarm spawn-all
```

**What spawns automatically:**

| Domain | Agents | Roles |
|--------|--------|-------|
| Queen | 1 | Top coordinator |
| Security | 2-4 | Security, CVE fixes |
| Core | 5-9 | Main development |
| Integration | 10-12 | APIs, CLI |
| Support | 13-15 | Testing, deployment |

### Checking Swarm Status

**YOU RUN THIS:**

```bash
npx claude-flow@alpha swarm status --include-agents --include-metrics
```

<!-- Screenshot: Swarm status with agents and metrics -->
![Swarm Status](./images/swarm-status.png)

### Scaling the Swarm

**YOU RUN THIS:**

```bash
# Scale up
npx claude-flow@alpha swarm scale --target-agents 20

# Scale down
npx claude-flow@alpha swarm scale --target-agents 5
```

---

## Admin Dashboard

### What is the Dashboard?

A web-based control panel where you can see everything at a glance:
- All agents and their status
- Running tasks
- System metrics
- Real-time logs

### Starting the Dashboard

**YOU RUN THIS:**

```bash
npx claude-flow@alpha dashboard start --port 3000
```

**Then open:** http://localhost:3000

<!-- Screenshot: Dashboard main view -->
![Dashboard Main](./images/dashboard-main.png)

### Dashboard Features

| Feature | Location | What It Shows |
|---------|----------|---------------|
| Agents | `/api/agents` | All agents, status |
| Tasks | `/api/tasks` | All tasks, progress |
| Metrics | `/api/metrics` | Performance stats |
| Events | `/events` | Live updates (SSE) |

### Dashboard API Endpoints

**These run automatically when dashboard is running:**

| Endpoint | Method | What It Does |
|----------|--------|--------------|
| `GET /api/status` | Auto | System overview |
| `GET /api/agents` | Auto | List agents |
| `GET /api/tasks` | Auto | List tasks |
| `POST /api/agents/:id/terminate` | You call | Stop an agent |
| `POST /api/tasks/:id/cancel` | You call | Cancel a task |
| `POST /api/swarm/scale` | You call | Scale swarm |

<!-- Screenshot: Dashboard API responses -->
![Dashboard API](./images/dashboard-api.png)

### Stopping the Dashboard

**YOU RUN THIS:**

```bash
# If running in foreground, press Ctrl+C

# If running in background
npx claude-flow@alpha dashboard stop
```

---

## Real-Time Events

### What are Real-Time Events?

Instant updates when something happens - like getting a text message instead of checking email.

Claude Flow supports two types:
1. **WebSocket** - Two-way communication (chat style)
2. **SSE** - One-way updates (news feed style)

### WebSocket Events

**Server setup (YOU RUN THIS in your code):**

```typescript
import { WSServer, WSRouter } from '@claude-flow/realtime';

// Create server
const server = new WSServer({
  port: 8080,
  heartbeatInterval: 30000,
});

const router = new WSRouter(server);
await server.start();

console.log('WebSocket server running on port 8080');
```

**Client setup (YOU RUN THIS in your code):**

```typescript
import { WSClient } from '@claude-flow/realtime';

const client = new WSClient({
  url: 'ws://localhost:8080',
  reconnect: true,  // Auto-reconnect if disconnected
});

await client.connect();

// Subscribe to topics
await client.subscribe(['agent.*.status', 'task.#']);

// Listen for events (RUNS AUTOMATICALLY when events arrive)
client.on('event', (event) => {
  console.log('Got event:', event.topic, event.data);
});
```

### Topic Patterns

| Pattern | Matches | Example |
|---------|---------|---------|
| `agent.123.status` | Exact match | Only agent 123 status |
| `agent.*.status` | Any single segment | Any agent's status |
| `agent.#` | Any segments | All agent events |
| `task.*.progress` | Task progress | Any task's progress |

<!-- Screenshot: WebSocket events in terminal -->
![WebSocket Events](./images/websocket-events.png)

### SSE (Server-Sent Events)

**Best for:** One-way updates to browsers

**Server (YOU RUN THIS):**

```typescript
import { SSEServer, TaskStream } from '@claude-flow/streaming';

const server = new SSEServer({ port: 3001 });
const taskStream = new TaskStream(server);

await server.start();
taskStream.start();

// Send events (call when something happens)
taskStream.emitProgress('task-123', {
  percentage: 50,
  currentStep: 'Processing...',
});
```

**Client (RUNS IN BROWSER):**

```typescript
import { SSEClient } from '@claude-flow/streaming';

const client = new SSEClient({
  url: 'http://localhost:3001',
  filters: ['task:*'],
  autoReconnect: true,
});

// These run automatically when events arrive
client.on('task:progress', (data) => {
  console.log(`Task ${data.taskId}: ${data.percentage}%`);
});

await client.connect();
```

---

## Workflow Templates

### What are Workflows?

Pre-built recipes for common tasks. Instead of manually coordinating agents, use a template!

### Available Templates

| Template | Steps | What It Does |
|----------|-------|--------------|
| `code-review` | 7 | Reviews code quality |
| `research` | 7 | Researches a topic |
| `refactoring` | 8 | Improves code structure |
| `testing` | 7 | Creates and runs tests |
| `documentation` | 8 | Generates docs |

### Running a Workflow

**YOU RUN THIS:**

```bash
npx claude-flow@alpha workflow run code-review \
  --target ./src \
  --depth deep \
  --focus security,performance
```

**What happens automatically:**

1. ✅ Static analysis runs
2. ✅ Multiple reviewers spawn
3. ✅ Each reviews different aspects
4. ✅ Coverage checked
5. ✅ Findings aggregated
6. ✅ Report generated

<!-- Screenshot: Workflow running with progress -->
![Workflow Running](./images/workflow-running.png)

### Workflow Progress

**YOU RUN THIS to check:**

```bash
npx claude-flow@alpha workflow status --workflow-id wf-123
```

**Output:**
```
Workflow: code-review
Status: running
Progress: 65%
Current Step: Parallel Review (3/5 reviewers complete)
```

### Using Workflows in Code

**YOU WRITE THIS:**

```typescript
import { WorkflowEngine, codeReviewTemplate } from '@claude-flow/workflows';

const engine = new WorkflowEngine();
engine.registerTemplate(codeReviewTemplate);

// Start workflow
const workflowId = await engine.startWorkflow('code-review', {
  target: '/src',
  depth: 'deep',
});

// These run automatically as workflow progresses
engine.on('workflow-progress', (progress) => {
  console.log(`${progress.progress}% - ${progress.message}`);
});

engine.on('workflow-completed', (event) => {
  console.log('Done!', event.result);
});
```

---

## Memory System

### What is Memory?

Where agents store and find information. Like a shared brain!

```
┌────────────────────────────────────────┐
│           Memory System                │
│                                        │
│  Agent 1 ──► Store: "User likes dark"  │
│                     ▼                  │
│  Agent 2 ◄── Search: "user preferences"│
│                                        │
│  150x faster than v2 with HNSW index!  │
└────────────────────────────────────────┘
```

### Storing Memory

**YOU RUN THIS:**

```bash
npx claude-flow@alpha memory store \
  --key "auth-pattern" \
  --value "Use JWT with refresh tokens" \
  --namespace patterns \
  --tags "authentication,security"
```

### Searching Memory

**YOU RUN THIS:**

```bash
npx claude-flow@alpha memory search \
  --query "authentication best practices" \
  --limit 5
```

**What happens automatically:**
- ✅ Converts query to vector
- ✅ Uses HNSW index (150x faster!)
- ✅ Returns similar memories

<!-- Screenshot: Memory search results -->
![Memory Search](./images/memory-search.png)

### Memory in Code

**YOU WRITE THIS:**

```typescript
import { HNSWIndex, AgentDBAdapter } from '@claude-flow/memory';

// Create adapter
const memory = new AgentDBAdapter({
  dimension: 1536,
  indexType: 'hnsw',
  metric: 'cosine',
});

await memory.initialize();

// Store (YOU CALL THIS)
await memory.store({
  id: 'mem-1',
  content: 'User prefers dark mode',
  embedding: vectorFromYourEmbeddingModel,
  metadata: { type: 'preference' },
});

// Search (YOU CALL THIS)
const results = await memory.search(queryVector, {
  limit: 10,
  threshold: 0.7,
});
```

---

## Multiple AI Providers

### What are Providers?

Different AI services you can use. Claude Flow supports 6+:

| Provider | Models | Best For |
|----------|--------|----------|
| Anthropic | Claude 3.5 Sonnet, Opus, Haiku | Most tasks |
| OpenAI | GPT-4o, o1-preview | Alternative |
| Google | Gemini 1.5 Pro | Multimodal |
| Cohere | Command R+ | Cost-effective |
| Ollama | Llama 3.2, Mistral | Local/private |

### Setting Up Providers

**Step 1: Add API keys to `.env`:**

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

**Step 2: Configure in code (YOU WRITE THIS):**

```typescript
import { createProviderManager } from '@claude-flow/providers';

const manager = await createProviderManager({
  providers: [
    { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-5-sonnet-latest' },
    { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' },
  ],
  loadBalancing: {
    enabled: true,
    strategy: 'cost-based',  // Uses cheapest available
  },
  fallback: {
    enabled: true,           // Auto-switch if one fails
    maxAttempts: 3,
  },
});
```

### Load Balancing Strategies

| Strategy | What It Does |
|----------|--------------|
| `round-robin` | Takes turns using each provider |
| `cost-based` | Uses cheapest provider (RUNS AUTOMATICALLY) |
| `latency-based` | Uses fastest provider (RUNS AUTOMATICALLY) |
| `least-loaded` | Uses least busy provider (RUNS AUTOMATICALLY) |

### Making Requests

**YOU CALL THIS:**

```typescript
const response = await manager.complete({
  messages: [{ role: 'user', content: 'Hello!' }],
  maxTokens: 100,
});

console.log('Response:', response.content);
console.log('Provider used:', response.provider);  // Shows which one was picked
console.log('Cost:', response.cost?.totalCost);
```

<!-- Screenshot: Provider manager showing provider selection -->
![Provider Selection](./images/provider-selection.png)

---

## Caching

### What is Caching?

Saving answers so you don't ask the same question twice. Saves time and money!

```
Without cache:   You ──► AI ──► Response (slow, costs $)
With cache:      You ──► Cache ──► Response (fast, free!)
```

### Cache Types

| Type | Speed | Size | Best For |
|------|-------|------|----------|
| Memory | <1ms | Small | Hot data |
| Disk | <10ms | Large | Persistence |
| Redis | <5ms | Huge | Distributed |

### Setting Up Caching

**In your config (claude-flow.config.json):**

```json
{
  "cache": {
    "memory": { "maxSize": 1000, "ttl": 3600000 },
    "disk": { "enabled": true, "path": "./cache.db" }
  }
}
```

**RUNS AUTOMATICALLY:**
- ✅ Checks cache before making API calls
- ✅ Stores responses in cache
- ✅ Evicts old entries when full

### Caching in Code

**YOU WRITE THIS:**

```typescript
import { MemoryCache, ResponseCache } from '@claude-flow/cache';

// Simple cache
const cache = new MemoryCache({
  maxSize: 1000,
  ttl: 3600000, // 1 hour
});

// Set
cache.set('my-key', 'my-value');

// Get (returns undefined if not found)
const value = cache.get('my-key');

// Response cache with semantic matching
const responseCache = new ResponseCache({
  semanticThreshold: 0.85, // Match similar prompts!
});

responseCache.set('What is TypeScript?', 'TypeScript is...');

// This ALSO matches! (similar enough)
const cached = responseCache.get('What is Typescript?');
```

---

## Rate Limiting

### What is Rate Limiting?

Preventing too many requests too fast. Like a bouncer at a club.

```
Without limits:  100 requests → API overloaded → Errors!
With limits:     100 requests → Queue → 10/sec → Success
```

### Built-in Limits (RUN AUTOMATICALLY)

| Provider | Requests/Min | Tokens/Min | Cost/Min |
|----------|--------------|------------|----------|
| Anthropic | 50 | 100,000 | $1.00 |
| OpenAI | 60 | 150,000 | $2.00 |
| Google | 60 | 120,000 | $1.50 |

### Configuring Limits

**In your config:**

```json
{
  "throttle": {
    "globalRpm": 500,
    "globalTpm": 1000000,
    "emergencyThreshold": 0.9
  }
}
```

### Rate Limiting in Code

**YOU WRITE THIS:**

```typescript
import { GlobalRateLimiter, QueueManager } from '@claude-flow/throttle';

const limiter = new GlobalRateLimiter({
  totalRPM: 500,
  totalCostPerHour: 100, // $100/hour max
  enableEmergencyThrottle: true,
  emergencyThreshold: 0.9,  // Slow down at 90% usage
  degradationMode: 'queue', // Queue requests instead of rejecting
});

// Check before making request (YOU CALL THIS)
const check = await limiter.canMakeRequest(1000, 0.01);

if (check.allowed) {
  // Make your request
} else {
  console.log(`Wait ${check.waitTimeMs}ms`);
}
```

### Queue Manager

**For handling backpressure (YOU WRITE THIS):**

```typescript
import { QueueManager } from '@claude-flow/throttle';

const queue = new QueueManager({
  maxSize: 100,
  enableRetry: true,
  maxRetries: 3,
  circuitBreaker: {
    failureThreshold: 5,    // Open after 5 failures
    openTimeoutMs: 60000,   // Try again after 1 min
  },
});

// Enqueue work (YOU CALL THIS)
const result = await queue.enqueue(
  async () => await makeApiCall(),
  'high',  // Priority
  10000    // Timeout
);
```

---

## Observability

### What is Observability?

Being able to see what's happening inside your system. Three pillars:

1. **Logs** - What happened
2. **Metrics** - How much/how fast
3. **Traces** - The journey of a request

### Logging

**RUNS AUTOMATICALLY with your logger:**

```typescript
import { createLogger } from '@claude-flow/observability';

const logger = createLogger({
  level: 'info',
  enableRedaction: true,  // Hides passwords automatically!
});

// YOU CALL THESE:
logger.info('User logged in', { userId: '123' });
logger.error('Something went wrong', { error: err.message });

// Child logger inherits context
const agentLogger = logger.child({ agentId: 'agent-1' });
agentLogger.info('Processing task');  // Includes agentId automatically
```

<!-- Screenshot: Log output with redaction -->
![Logging Output](./images/logging-output.png)

### Metrics

**YOU WRITE THIS:**

```typescript
import { createMetricsCollector, METRIC_NAMES } from '@claude-flow/observability';

const metrics = createMetricsCollector();

// Counter (things that only go up)
metrics.incrementCounter(METRIC_NAMES.AGENT_SPAWNED, 1, { type: 'coder' });

// Gauge (things that go up and down)
metrics.setGauge(METRIC_NAMES.AGENT_ACTIVE, 5);

// Histogram (distributions)
metrics.observeHistogram(METRIC_NAMES.TASK_DURATION, 1.5, { status: 'success' });

// Time something (AUTOMATICALLY records duration)
await metrics.timeAsync('database_query', async () => {
  return await db.query('...');
});
```

### Exporting Metrics

**YOU CALL THIS:**

```typescript
import { metricsExporter } from '@claude-flow/observability';

// Export for Prometheus (for Grafana dashboards)
const prometheus = metricsExporter.exportPrometheus(metrics.getMetrics());
console.log(prometheus);
```

<!-- Screenshot: Prometheus metrics output -->
![Prometheus Metrics](./images/prometheus-metrics.png)

### Tracing

**YOU WRITE THIS:**

```typescript
import { createTraceManager } from '@claude-flow/observability';

const tracer = createTraceManager();

// Wrap operations in spans
await tracer.withSpan('handle-request', async (span) => {
  tracer.addEvent(span, 'started');

  // Nested span (SHOWS PARENT-CHILD relationship)
  await tracer.withSpan('database-query', async (child) => {
    const result = await db.query('...');
    tracer.setAttributes(child, { rows: result.length });
    return result;
  });

  tracer.addEvent(span, 'completed');
});
```

### Health Checks

**YOU WRITE THIS:**

```typescript
import { createHealthDashboard, memoryHealthCheck } from '@claude-flow/observability';

const health = createHealthDashboard();

// Register checks
health.registerComponent('memory', memoryHealthCheck(1000)); // 1GB threshold
health.registerComponent('database', async () => ({
  status: (await db.ping()) ? 'healthy' : 'unhealthy',
}));

health.start();  // RUNS CHECKS AUTOMATICALLY every 30s

// Get status (YOU CALL THIS)
const status = await health.getHealth();
console.log(status.status);  // 'healthy', 'degraded', or 'unhealthy'
```

---

## Security

### What Security Features?

| Feature | What It Protects Against |
|---------|--------------------------|
| Password Hashing | Stolen passwords |
| Path Validation | File system attacks |
| Input Validation | Injection attacks |
| Command Safety | Command injection |

### Password Hashing

**YOU WRITE THIS:**

```typescript
import { createSecurityModule } from '@claude-flow/security';

const security = createSecurityModule({
  bcryptRounds: 12,  // Higher = more secure, slower
});

// Hash password (YOU CALL THIS when user registers)
const hash = await security.passwordHasher.hash('userPassword123');

// Verify password (YOU CALL THIS when user logs in)
const isValid = await security.passwordHasher.verify('userPassword123', hash);
```

### Path Validation

**PREVENTS:** `../../../etc/passwd` attacks

```typescript
const security = createSecurityModule({
  projectRoot: '/my/project',
});

// Check path (YOU CALL THIS before file operations)
const result = await security.pathValidator.validate('../../../etc/passwd');
// { valid: false, reason: 'Path traversal detected' }

const result2 = await security.pathValidator.validate('./src/index.ts');
// { valid: true, normalized: '/my/project/src/index.ts' }
```

### Input Validation

**YOU WRITE THIS:**

```typescript
import { EmailSchema, PasswordSchema, sanitizeHtml } from '@claude-flow/security';

// Validate email (throws if invalid)
const email = EmailSchema.parse('user@example.com');

// Validate password (throws if too weak)
const password = PasswordSchema.parse('SecurePass123!');

// Sanitize HTML (removes scripts)
const safe = sanitizeHtml('<script>alert("xss")</script>Hello');
// Result: 'Hello'
```

### Safe Command Execution

**PREVENTS:** `; rm -rf /` attacks

```typescript
const security = createSecurityModule({
  allowedCommands: ['git', 'npm', 'node'],  // Only these are allowed
});

// Execute safely (YOU CALL THIS)
const output = await security.safeExecutor.execute('git', ['status']);

// This would fail:
// await security.safeExecutor.execute('rm', ['-rf', '/']);
// Error: Command 'rm' not in allowlist
```

---

## Common Operations Reference

### Quick Reference Card

| What You Want | Command | Auto/Manual |
|---------------|---------|-------------|
| **INSTALLATION** | | |
| Install Claude Flow | `curl ... \| bash` | You run once |
| Check installation | `claude-flow doctor` | You run |
| Initialize project | `claude-flow init --wizard` | You run once |
| **AGENTS** | | |
| Spawn agent | `agent spawn -t coder --name X` | You run |
| List agents | `agent list` | You run |
| Check agent | `agent status --agent-id X` | You run |
| Stop agent | `agent stop --agent-id X` | You run |
| **TASKS** | | |
| Create task | `task create --title X` | You run |
| Assign task | `task assign --task-id X --agent-id Y` | You run |
| Check task | `task status --task-id X` | You run |
| Task execution | - | Auto after assign |
| **SWARM** | | |
| Initialize swarm | `swarm init --topology hierarchical` | You run once |
| Spawn all agents | `swarm spawn-all` | You run |
| Check swarm | `swarm status` | You run |
| Scale swarm | `swarm scale --target-agents N` | You run |
| **DASHBOARD** | | |
| Start dashboard | `dashboard start --port 3000` | You run |
| View dashboard | Open http://localhost:3000 | You do |
| Stop dashboard | `dashboard stop` or Ctrl+C | You run |
| Real-time updates | - | Auto via SSE |
| **WORKFLOWS** | | |
| Run workflow | `workflow run code-review --target ./src` | You run |
| Check progress | `workflow status --workflow-id X` | You run |
| Workflow steps | - | Auto |
| **MEMORY** | | |
| Store memory | `memory store --key X --value Y` | You run |
| Search memory | `memory search --query X` | You run |
| HNSW indexing | - | Auto |
| **PROVIDERS** | | |
| Add API keys | Edit `.env` file | You do once |
| Load balancing | - | Auto |
| Failover | - | Auto |
| **CACHE** | | |
| Configure | Edit config file | You do once |
| Cache hits/misses | - | Auto |
| Eviction | - | Auto |
| **RATE LIMITING** | | |
| Configure | Edit config file | You do once |
| Request throttling | - | Auto |
| Emergency mode | - | Auto at 90% |
| **OBSERVABILITY** | | |
| Create logger | In code | You write |
| Log messages | `logger.info(...)` | You call |
| Collect metrics | `metrics.increment(...)` | You call |
| Health checks | - | Auto every 30s |
| **SECURITY** | | |
| Hash password | `security.passwordHasher.hash(...)` | You call |
| Validate path | `security.pathValidator.validate(...)` | You call |
| Sanitize input | `sanitizeHtml(...)` | You call |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | - | Anthropic API key |
| `OPENAI_API_KEY` | No | - | OpenAI API key |
| `GOOGLE_API_KEY` | No | - | Google API key |
| `CLAUDE_FLOW_LOG_LEVEL` | No | `info` | Log verbosity |
| `CLAUDE_FLOW_MEMORY_PATH` | No | `./data/memory` | Memory database path |
| `HMAC_SECRET` | No | - | Token signing secret |
| `DASHBOARD_TOKEN` | No | - | Dashboard auth token |

*At least one provider API key required

### Config File Template

```json
{
  "version": "3.0.0",
  "swarm": {
    "topology": "hierarchical",
    "maxAgents": 15,
    "autoScaling": true
  },
  "memory": {
    "backend": "hybrid",
    "hnswEnabled": true
  },
  "cache": {
    "memory": { "maxSize": 1000, "ttl": 3600000 },
    "disk": { "enabled": true }
  },
  "throttle": {
    "globalRpm": 500,
    "emergencyThreshold": 0.9
  },
  "observability": {
    "logging": { "level": "info" },
    "metrics": { "enabled": true },
    "tracing": { "enabled": true }
  },
  "security": {
    "bcryptRounds": 12,
    "inputValidation": true
  }
}
```

---

## Getting Help

**Run into issues?**

1. **Check the doctor:** `npx claude-flow@alpha doctor --fix`
2. **View logs:** Check `/tmp/claude-flow-*.log`
3. **GitHub Issues:** https://github.com/iamrjc/claude-flow/issues
4. **Documentation:** https://github.com/iamrjc/claude-flow/tree/main/v3/docs

---

**That's it!** You now know everything about Claude Flow V3. Start with the basics (spawn an agent, create a task) and work your way up to swarms and workflows.

Happy orchestrating! 🌊
