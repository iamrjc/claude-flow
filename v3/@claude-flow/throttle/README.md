# @claude-flow/throttle

Rate Limiting & Throttling for Claude Flow V3 (WP28)

## Features

- **Multiple Algorithms**: Token bucket, sliding window, and leaky bucket rate limiters
- **Provider Limits**: Per-provider rate limits (RPM, TPM, concurrent, cost)
- **Agent Limits**: Per-agent task, memory ops, and message rate limits
- **Global Limits**: System-wide caps with emergency throttling
- **Backpressure**: Priority queue with retry, timeout, and circuit breaker
- **Graceful Degradation**: Queue, reject, shed, or priority-based strategies

## Installation

```bash
npm install @claude-flow/throttle
```

## Usage

### Token Bucket

Classic token bucket algorithm with configurable rate and burst capacity:

```typescript
import { TokenBucket } from '@claude-flow/throttle';

const bucket = new TokenBucket({
  capacity: 100,        // Max tokens (burst capacity)
  refillRate: 10,       // Tokens per second
  tokensPerRequest: 1   // Tokens per request
});

// Synchronous consumption
if (bucket.consume(5)) {
  console.log('Request allowed');
}

// Async consumption with wait
const allowed = await bucket.consumeAsync(5, 1000); // Wait up to 1 second

// Check wait time
const waitMs = bucket.getWaitTime(10);
```

### Sliding Window

Sliding window counter that prevents bursts at window boundaries:

```typescript
import { SlidingWindow } from '@claude-flow/throttle';

const window = new SlidingWindow({
  maxRequests: 100,    // Max requests in window
  windowMs: 60_000,    // Window size (1 minute)
  buckets: 12,         // Sub-windows for accuracy
  fixedWindow: false   // Use sliding (not fixed) window
});

if (window.tryAcquire(5)) {
  console.log('Request allowed');
}

// Async with wait
const allowed = await window.tryAcquireAsync(5, 1000);
```

### Leaky Bucket

Queue-based limiter with constant output rate:

```typescript
import { LeakyBucket } from '@claude-flow/throttle';

const bucket = new LeakyBucket({
  capacity: 50,           // Max queue size
  leakRate: 10,           // Requests per second
  maxWaitMs: 30_000,      // Max time in queue
  autoProcess: true       // Auto-process queue
});

// Non-blocking
if (bucket.tryAdd()) {
  console.log('Added to queue');
}

// Async (waits for processing)
const processed = await bucket.add();
```

### Provider Rate Limits

Enforce per-provider limits (RPM, TPM, cost, concurrent):

```typescript
import { ProviderRateLimiter } from '@claude-flow/throttle';

const limiter = new ProviderRateLimiter('anthropic', {
  rpm: 50,                    // 50 requests/minute
  tpm: 100_000,               // 100k tokens/minute
  concurrentLimit: 5,         // Max 5 concurrent
  costPerMinuteLimit: 1.0,    // $1/minute
  allowBurst: true            // Allow 150% burst
});

// Check if request can be made
const check = await limiter.canMakeRequest(1000, 0.01); // tokens, cost
if (check.allowed) {
  limiter.acquireConcurrentSlot();
  // ... make request ...
  limiter.recordRequest({ tokens: 1000, cost: 0.01, timestamp: Date.now() });
  limiter.releaseConcurrentSlot();
} else {
  console.log(`Blocked: ${check.reason}, wait ${check.waitTimeMs}ms`);
}
```

### Agent Rate Limits

Per-agent limits for task execution:

```typescript
import { AgentRateLimiter } from '@claude-flow/throttle';

const limiter = new AgentRateLimiter('agent-1', {
  tasksPerMinute: 30,         // 30 tasks/minute
  memoryOpsPerMinute: 100,    // 100 memory ops/minute
  messagesPerMinute: 60,      // 60 messages/minute
  maxConcurrentTasks: 5,      // Max 5 concurrent tasks
  memoryQuotaBytes: 100_000_000, // 100 MB
  cpuQuotaMs: 60_000          // 1 minute CPU/minute
});

// Check task limit
if (limiter.canStartTask().allowed) {
  limiter.startTask();
  // ... execute task ...
  limiter.completeTask();
}

// Check memory
if (limiter.canPerformMemoryOp(1024).allowed) {
  limiter.allocateMemory(1024);
  limiter.recordMemoryOp();
}
```

### Global Rate Limits

System-wide limits with emergency throttling:

```typescript
import { GlobalRateLimiter } from '@claude-flow/throttle';

const limiter = new GlobalRateLimiter({
  totalRPM: 500,                   // Total 500 req/min
  totalTPM: 1_000_000,             // Total 1M tokens/min
  totalConcurrent: 50,             // Total 50 concurrent
  totalCostPerHour: 100,           // $100/hour
  enableEmergencyThrottle: true,   // Enable emergency mode
  emergencyThreshold: 0.9,         // Trigger at 90% load
  degradationMode: 'queue'         // Strategy: queue|reject|shed|priority
});

const check = await limiter.canMakeRequest(1000, 0.01);
if (check.allowed) {
  limiter.acquireConcurrentSlot();
  // ... make request ...
  limiter.recordRequest(1000, 0.01);
  limiter.releaseConcurrentSlot();
}

// Monitor system state
const state = limiter.getState();
console.log(`System load: ${state.current.systemLoad}`);
console.log(`Throttle mode: ${state.throttleMode}`); // normal|emergency|critical
```

### Queue Manager with Backpressure

Priority queue with retry, timeout, and circuit breaker:

```typescript
import { QueueManager } from '@claude-flow/throttle';

const queue = new QueueManager({
  maxSize: 100,               // Max queue size
  defaultTimeoutMs: 30_000,   // Default timeout
  enableRetry: true,          // Enable retry
  maxRetries: 3,              // Max 3 retries
  initialBackoffMs: 1000,     // Initial backoff 1s
  backoffMultiplier: 2,       // Exponential backoff
  circuitBreaker: {
    failureThreshold: 5,      // Open after 5 failures
    successThreshold: 2,      // Close after 2 successes
    openTimeoutMs: 60_000     // Try half-open after 1 min
  }
});

// Enqueue with priority
const result = await queue.enqueue(
  async () => {
    // Your async operation
    return await someAsyncOperation();
  },
  'high',  // Priority: low|normal|high|critical
  10_000   // Timeout override
);

// Monitor queue
const state = queue.getState();
console.log(`Queue size: ${state.queueSize}`);
console.log(`Circuit: ${state.circuitState}`); // closed|open|half-open
console.log(`Stats:`, state.stats);
```

## Integration Example

Coordinating all limiters:

```typescript
import {
  GlobalRateLimiter,
  ProviderRateLimiter,
  AgentRateLimiter,
  QueueManager
} from '@claude-flow/throttle';

// Setup limiters
const global = new GlobalRateLimiter({
  totalRPM: 500,
  degradationMode: 'queue'
});

const provider = new ProviderRateLimiter('anthropic', {
  rpm: 50,
  tpm: 100_000
});

const agent = new AgentRateLimiter('agent-1', {
  tasksPerMinute: 30
});

const queue = new QueueManager({ maxSize: 100 });

// Request coordinator
async function makeRequest(tokens: number, cost: number) {
  // Check all limiters
  const globalCheck = await global.canMakeRequest(tokens, cost);
  const providerCheck = await provider.canMakeRequest(tokens, cost);
  const agentCheck = agent.canStartTask();

  if (!globalCheck.allowed && globalCheck.degraded) {
    // Queue the request
    return await queue.enqueue(
      () => executeRequest(tokens, cost),
      'normal',
      30_000
    );
  }

  if (globalCheck.allowed && providerCheck.allowed && agentCheck.allowed) {
    return await executeRequest(tokens, cost);
  }

  throw new Error('Request blocked by rate limits');
}

async function executeRequest(tokens: number, cost: number) {
  global.acquireConcurrentSlot();
  provider.acquireConcurrentSlot();
  agent.startTask();

  try {
    // Make actual request
    const result = await actualRequest();

    // Record metrics
    global.recordRequest(tokens, cost);
    provider.recordRequest({ tokens, cost, timestamp: Date.now() });
    agent.completeTask();

    return result;
  } finally {
    global.releaseConcurrentSlot();
    provider.releaseConcurrentSlot();
  }
}
```

## Default Limits

### Provider Limits

| Provider | RPM | TPM | Concurrent | Cost/Min | Cost/Hour | Cost/Day |
|----------|-----|-----|------------|----------|-----------|----------|
| Anthropic | 50 | 100k | 5 | $1.00 | $50.00 | $1000.00 |
| OpenAI | 60 | 150k | 10 | $2.00 | $100.00 | $2000.00 |
| Google | 60 | 120k | 10 | $1.50 | $75.00 | $1500.00 |
| Cohere | 40 | 100k | 5 | $1.00 | $50.00 | $1000.00 |
| Ollama | 1000 | 1M | 50 | N/A | N/A | N/A |

### Agent Limits

- Tasks per minute: 30
- Memory ops per minute: 100
- Messages per minute: 60
- Max concurrent tasks: 5
- Memory quota: 100 MB
- CPU quota: 60s per minute

### Global Limits

- Total RPM: 500
- Total TPM: 1M
- Total concurrent: 50
- Cost per hour: $100
- Cost per day: $2000
- Emergency threshold: 90% load

## Testing

```bash
npm test                 # Run tests
npm run test:coverage    # With coverage report
npm run test:watch       # Watch mode
```

30+ comprehensive tests with >80% coverage.

## License

MIT
