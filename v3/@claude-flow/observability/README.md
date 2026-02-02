# @claude-flow/observability

Comprehensive observability module for claude-flow v3 (WP26).

## Features

### Structured Logging
- JSON formatted logs with multiple levels (debug, info, warn, error, fatal)
- Automatic correlation ID tracking
- Sensitive data redaction
- Multiple transport support (console, file, custom)
- Child loggers with inherited context
- Zero-config defaults with <1ms overhead

### Log Aggregation
- Cross-agent log correlation
- Session-based log grouping
- Full-text search across logs
- Time range queries
- Export to JSON/CSV/NDJSON
- Indexed lookup by correlation ID, agent ID, session ID, task ID

### Metrics Collection
- Counter metrics (increment-only)
- Gauge metrics (set to specific values)
- Histogram metrics (track distributions)
- Summary metrics (percentiles)
- Labels/tags for metric dimensions
- Built-in timing helpers
- Low overhead (<0.1ms per metric)

### Metrics Export
- Prometheus text format
- JSON export
- StatsD protocol support
- Webhook push
- Batch export with configurable intervals

### Distributed Tracing
- OpenTelemetry-compatible spans
- Parent-child span relationships
- Context propagation
- Multiple sampling strategies
- Span attributes and events
- Exception recording

### Trace Export
- OpenTelemetry OTLP format
- Jaeger format
- Zipkin v2 format
- HTTP export
- Batch export with buffering

### Health Monitoring
- HTTP health endpoints
- Component health checks
- Liveness probes (is it running?)
- Readiness probes (can it serve traffic?)
- Startup probes (has it finished starting?)
- Aggregated health status
- Built-in health checks (memory, database, API, disk space)

## Installation

```bash
npm install @claude-flow/observability
```

## Quick Start

### Structured Logging

```typescript
import { createLogger } from '@claude-flow/observability';

// Create logger
const logger = createLogger({
  level: 'info',
  enableRedaction: true,
});

// Log messages
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
import { createMetricsCollector, METRIC_NAMES } from '@claude-flow/observability';

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
import { metricsExporter } from '@claude-flow/observability';
const prometheus = metricsExporter.exportPrometheus(metrics.getMetrics());
console.log(prometheus);
```

### Distributed Tracing

```typescript
import { createTraceManager } from '@claude-flow/observability';

const tracer = createTraceManager();

// Manual span management
const span = tracer.startSpan('process-task', {
  kind: 'internal',
  attributes: { taskId: '123' },
});

try {
  // Do work
  tracer.addEvent(span, 'task-started');
  // More work
  tracer.setAttributes(span, { status: 'completed' });
  tracer.endSpan(span, 'ok');
} catch (error) {
  tracer.recordException(span, error);
  tracer.endSpan(span, 'error');
}

// Or use helper
await tracer.withSpan('async-operation', async (span) => {
  tracer.setAttributes(span, { user: 'john' });
  return await someAsyncWork();
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

// Start periodic checks
dashboard.start();

// Get health status
const health = await dashboard.getHealth();
console.log(health.status); // 'healthy', 'degraded', or 'unhealthy'

// Kubernetes-style probes
const liveness = await dashboard.liveness();
const readiness = await dashboard.readiness();
```

## Complete Observability Stack

```typescript
import { createObservabilityStack } from '@claude-flow/observability';

const { logger, metrics, tracer, health } = createObservabilityStack({
  serviceName: 'my-service',
  enableLogging: true,
  enableMetrics: true,
  enableTracing: true,
  enableHealth: true,
});

// Use all components together
logger.info('Service started');
metrics.incrementCounter('service_starts_total');

await tracer.withSpan('handle-request', async (span) => {
  const startTime = Date.now();

  try {
    // Handle request
    logger.info('Processing request');

    // Record metrics
    metrics.observeHistogram('request_duration', (Date.now() - startTime) / 1000);
    metrics.incrementCounter('requests_total', 1, { status: '200' });

  } catch (error) {
    logger.error('Request failed', { error });
    tracer.recordException(span, error);
    metrics.incrementCounter('requests_total', 1, { status: '500' });
  }
});
```

## Built-in Metric Names

```typescript
import { METRIC_NAMES } from '@claude-flow/observability';

// Agent metrics
METRIC_NAMES.AGENT_SPAWNED      // 'claude_flow_agent_spawned_total'
METRIC_NAMES.AGENT_STOPPED      // 'claude_flow_agent_stopped_total'
METRIC_NAMES.AGENT_ACTIVE       // 'claude_flow_agent_active'
METRIC_NAMES.AGENT_DURATION     // 'claude_flow_agent_duration_seconds'

// Task metrics
METRIC_NAMES.TASK_CREATED       // 'claude_flow_task_created_total'
METRIC_NAMES.TASK_COMPLETED     // 'claude_flow_task_completed_total'
METRIC_NAMES.TASK_DURATION      // 'claude_flow_task_duration_seconds'

// Memory metrics
METRIC_NAMES.MEMORY_OPERATIONS  // 'claude_flow_memory_operations_total'
METRIC_NAMES.MEMORY_SIZE        // 'claude_flow_memory_size_bytes'

// Provider metrics
METRIC_NAMES.PROVIDER_REQUESTS  // 'claude_flow_provider_requests_total'
METRIC_NAMES.PROVIDER_LATENCY   // 'claude_flow_provider_latency_seconds'
```

## Advanced Usage

### Custom Transports

```typescript
import { createLogger } from '@claude-flow/observability';

const logger = createLogger({
  transports: [
    {
      name: 'file',
      write: (entry) => {
        fs.appendFileSync('app.log', JSON.stringify(entry) + '\n');
      },
    },
    {
      name: 'webhook',
      write: async (entry) => {
        await fetch('https://logs.example.com', {
          method: 'POST',
          body: JSON.stringify(entry),
        });
      },
    },
  ],
});
```

### Sampling Strategies

```typescript
import { createTraceManager, probabilitySampler, traceIdRatioSampler } from '@claude-flow/observability';

// Sample 10% of traces
const tracer1 = createTraceManager({
  sampler: probabilitySampler(0.1),
});

// Sample based on trace ID (consistent for same trace)
const tracer2 = createTraceManager({
  sampler: traceIdRatioSampler(0.1),
});
```

### Metrics Export

```typescript
import { metricsExporter, createMetricsCollector } from '@claude-flow/observability';

const metrics = createMetricsCollector();

// Export to Prometheus
const prometheus = metricsExporter.exportPrometheus(metrics.getMetrics());

// Export to JSON
const json = metricsExporter.exportJSON(metrics.getMetrics(), true);

// Export to StatsD
const statsd = metricsExporter.exportStatsD(metrics.getMetrics(), 'myapp');

// Push to webhook periodically
metricsExporter.startWebhookPush(() => metrics.getMetrics(), {
  url: 'https://metrics.example.com/push',
  interval: 60000, // Every 60 seconds
});
```

### Trace Export

```typescript
import { createTraceExporter } from '@claude-flow/observability';

// OTLP exporter (OpenTelemetry)
const exporter = createTraceExporter({
  endpoint: 'http://localhost:4318/v1/traces',
  format: 'otlp',
  batchSize: 100,
  batchInterval: 5000,
});

// Start periodic export
exporter.start();

// Export spans
const span = tracer.startSpan('operation');
// ... do work
tracer.endSpan(span);
await exporter.export(span);

// Stop and flush
await exporter.stop();
```

## Configuration

### Logger Config

```typescript
interface LoggerConfig {
  level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  enableConsole?: boolean;
  enableRedaction?: boolean;
  redactKeys?: string[];
  transports?: LogTransport[];
  correlationIdProvider?: () => string;
}
```

### Trace Config

```typescript
interface TraceConfig {
  sampler?: Sampler;
  maxSpansPerTrace?: number;
  maxAttributeLength?: number;
}
```

### Health Config

```typescript
interface HealthDashboardConfig {
  port?: number;
  path?: string;
  enableHTTP?: boolean;
  checkInterval?: number;
  timeout?: number;
}
```

## Performance

- **Logging**: <1ms per log entry
- **Metrics**: <0.1ms per metric operation
- **Tracing**: <0.5ms per span (with sampling)
- **Health checks**: Configurable timeout (default 5s)

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## API Documentation

See the TypeScript types for full API documentation. All exports are fully typed.

## License

MIT

## Version

3.0.0-alpha.1
