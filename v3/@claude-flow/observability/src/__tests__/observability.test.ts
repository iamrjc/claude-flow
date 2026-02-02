/**
 * Observability Module Tests
 *
 * Comprehensive test suite covering:
 * - Structured logging
 * - Log aggregation
 * - Metrics collection
 * - Metrics export
 * - Distributed tracing
 * - Trace export
 * - Health monitoring
 *
 * Target: 35+ tests with >80% coverage
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createLogger,
  LogAggregator,
  createMetricsCollector,
  MetricsExporter,
  createTraceManager,
  TraceExporter,
  createHealthDashboard,
  memoryHealthCheck,
  probabilitySampler,
  traceIdRatioSampler,
  METRIC_NAMES,
} from '../index.js';

// ============================================================================
// Structured Logger Tests
// ============================================================================

describe('StructuredLogger', () => {
  it('should create logger with default config', () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(logger.getLevel()).toBe('info');
  });

  it('should log at different levels', () => {
    const logs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      transports: [
        {
          name: 'test',
          write: (entry) => logs.push(entry),
        },
      ],
    });

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');
    logger.fatal('fatal message');

    expect(logs.length).toBe(4); // debug filtered by default level
    expect(logs[0].level).toBe('info');
    expect(logs[1].level).toBe('warn');
    expect(logs[2].level).toBe('error');
    expect(logs[3].level).toBe('fatal');
  });

  it('should respect log level filtering', () => {
    const logs: any[] = [];
    const logger = createLogger({
      level: 'warn',
      enableConsole: false,
      transports: [
        {
          name: 'test',
          write: (entry) => logs.push(entry),
        },
      ],
    });

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(logs.length).toBe(2); // Only warn and error
    expect(logs[0].level).toBe('warn');
    expect(logs[1].level).toBe('error');
  });

  it('should include correlation ID', () => {
    const logs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      transports: [
        {
          name: 'test',
          write: (entry) => logs.push(entry),
        },
      ],
    });

    logger.info('test message');

    expect(logs[0].correlationId).toBeDefined();
    expect(typeof logs[0].correlationId).toBe('string');
  });

  it('should redact sensitive data', () => {
    const logs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      enableRedaction: true,
      transports: [
        {
          name: 'test',
          write: (entry) => logs.push(entry),
        },
      ],
    });

    logger.info('login', {
      username: 'user',
      password: 'secret123',
      token: 'abc123',
      apiKey: 'key123',
    });

    expect(logs[0].metadata?.password).toBe('[REDACTED]');
    expect(logs[0].metadata?.token).toBe('[REDACTED]');
    expect(logs[0].metadata?.apiKey).toBe('[REDACTED]');
    expect(logs[0].metadata?.username).toBe('user');
  });

  it('should support child loggers with context', () => {
    const logs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      transports: [
        {
          name: 'test',
          write: (entry) => logs.push(entry),
        },
      ],
    });

    const child = logger.child({
      agentId: 'agent-1',
      taskId: 'task-1',
    });

    child.info('child message');

    expect(logs[0].metadata?.agentId).toBe('agent-1');
    expect(logs[0].metadata?.taskId).toBe('task-1');
  });

  it('should support custom transports', () => {
    const customLogs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      transports: [
        {
          name: 'custom',
          write: (entry) => customLogs.push(entry),
        },
      ],
    });

    logger.info('test');
    expect(customLogs.length).toBe(1);
  });

  it('should handle async transports', async () => {
    const asyncLogs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      transports: [
        {
          name: 'async',
          write: async (entry) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            asyncLogs.push(entry);
          },
        },
      ],
    });

    logger.info('async test');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asyncLogs.length).toBe(1);
  });

  it('should handle transport errors gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger({
      enableConsole: false,
      transports: [
        {
          name: 'failing',
          write: () => {
            throw new Error('Transport error');
          },
        },
      ],
    });

    logger.info('test');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should add and remove transports', () => {
    const logs: any[] = [];
    const logger = createLogger({ enableConsole: false });

    const transport = {
      name: 'custom',
      write: (entry: any) => logs.push(entry),
    };

    logger.addTransport(transport);
    logger.info('test1');

    logger.removeTransport('custom');
    logger.info('test2');

    expect(logs.length).toBe(1); // Only first log
  });

  it('should use custom correlation ID provider', () => {
    const logs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      correlationIdProvider: () => 'custom-id',
      transports: [
        {
          name: 'test',
          write: (entry) => logs.push(entry),
        },
      ],
    });

    logger.info('test');
    expect(logs[0].correlationId).toBe('custom-id');
  });

  it('should log with explicit correlation ID', () => {
    const logs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      transports: [
        {
          name: 'test',
          write: (entry) => logs.push(entry),
        },
      ],
    });

    logger.logWithCorrelation('info', 'test', 'my-corr-id');
    expect(logs[0].correlationId).toBe('my-corr-id');
  });

  it('should set and get log level', () => {
    const logger = createLogger({ level: 'info' });
    expect(logger.getLevel()).toBe('info');

    logger.setLevel('debug');
    expect(logger.getLevel()).toBe('debug');
  });

  it('should redact nested sensitive data', () => {
    const logs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      enableRedaction: true,
      transports: [
        {
          name: 'test',
          write: (entry) => logs.push(entry),
        },
      ],
    });

    logger.info('nested', {
      user: {
        name: 'John',
        password: 'secret',
      },
    });

    expect(logs[0].metadata?.user?.password).toBe('[REDACTED]');
    expect(logs[0].metadata?.user?.name).toBe('John');
  });

  it('should include timestamp in ISO format', () => {
    const logs: any[] = [];
    const logger = createLogger({
      enableConsole: false,
      transports: [
        {
          name: 'test',
          write: (entry) => logs.push(entry),
        },
      ],
    });

    logger.info('test');
    expect(logs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Observability Integration', () => {
  it('should integrate logger with aggregator', () => {
    const aggregator = new LogAggregator();
    const logger = createLogger({
      enableConsole: false,
      transports: [
        {
          name: 'aggregator',
          write: (entry) => aggregator.addLog(entry),
        },
      ],
    });

    logger.info('integration test', { key: 'value' });

    const logs = aggregator.query({ searchTerm: 'integration' });
    expect(logs.length).toBe(1);
    expect(logs[0].metadata?.key).toBe('value');
  });

  it('should integrate metrics with tracing', async () => {
    const metrics = createMetricsCollector();
    const tracer = createTraceManager();

    await tracer.withSpan('operation', async (span) => {
      metrics.incrementCounter('operations', 1, {
        operation: span.name,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(metrics.getCounter('operations', { operation: 'operation' })).toBe(1);
  });

  it('should integrate health checks with metrics', async () => {
    const metrics = createMetricsCollector();
    const health = createHealthDashboard();

    health.registerComponent('metrics', async () => {
      const allMetrics = metrics.getMetrics();
      const hasMetrics =
        allMetrics.counters.size > 0 || allMetrics.gauges.size > 0;

      return hasMetrics
        ? { status: 'healthy' as const, message: 'Metrics available' }
        : { status: 'degraded' as const, message: 'No metrics' };
    });

    metrics.incrementCounter('test', 1);

    const componentHealth = await health.checkComponent('metrics');
    expect(componentHealth.status).toBe('healthy');

    health.stop();
  });
});

// ============================================================================
// Observability Stack Tests
// ============================================================================

import { createObservabilityStack, VERSION } from '../index.js';

describe('ObservabilityStack', () => {
  it('should create a full observability stack', () => {
    const stack = createObservabilityStack({
      serviceName: 'test-service',
    });

    expect(stack.logger).toBeDefined();
    expect(stack.metrics).toBeDefined();
    expect(stack.tracer).toBeDefined();
    expect(stack.health).toBeDefined();
  });

  it('should create stack with all components enabled by default', () => {
    const stack = createObservabilityStack();

    expect(stack.logger).toBeDefined();
    expect(stack.metrics).not.toBeNull();
    expect(stack.tracer).not.toBeNull();
    expect(stack.health).not.toBeNull();

    if (stack.health) {
      stack.health.stop();
    }
  });

  it('should allow disabling specific components', () => {
    const stack = createObservabilityStack({
      enableMetrics: false,
      enableTracing: false,
      enableHealth: false,
    });

    expect(stack.logger).toBeDefined();
    expect(stack.metrics).toBeNull();
    expect(stack.tracer).toBeNull();
    expect(stack.health).toBeNull();
  });

  it('should have correct version', () => {
    expect(VERSION).toBe('3.0.0-alpha.1');
  });

  it('should create logger with service name context', () => {
    const stack = createObservabilityStack({
      serviceName: 'my-service',
    });

    expect(stack.logger).toBeDefined();

    if (stack.health) {
      stack.health.stop();
    }
  });

  it('should register memory health check when health is enabled', async () => {
    const stack = createObservabilityStack({
      enableHealth: true,
    });

    if (stack.health) {
      const health = await stack.health.getHealth();
      expect(health.components.some((c) => c.name === 'memory')).toBe(true);
      stack.health.stop();
    }
  });
});

// ============================================================================
// Log Aggregator Tests
// ============================================================================

describe('LogAggregator', () => {
  let aggregator: LogAggregator;

  beforeEach(() => {
    aggregator = new LogAggregator();
  });

  it('should add and retrieve logs', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
      correlationId: 'corr-1',
    });

    expect(aggregator.size()).toBe(1);
    const logs = aggregator.query();
    expect(logs.length).toBe(1);
  });

  it('should query by correlation ID', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test 1',
      correlationId: 'corr-1',
    });

    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test 2',
      correlationId: 'corr-2',
    });

    const logs = aggregator.getByCorrelation('corr-1');
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe('test 1');
  });

  it('should query by agent ID', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
      agentId: 'agent-1',
    });

    const logs = aggregator.getByAgent('agent-1');
    expect(logs.length).toBe(1);
  });

  it('should query by session ID', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
      sessionId: 'session-1',
    });

    const logs = aggregator.getBySession('session-1');
    expect(logs.length).toBe(1);
  });

  it('should filter by log level', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'info',
    });

    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'error',
    });

    const errorLogs = aggregator.query({ level: 'error' });
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0].level).toBe('error');
  });

  it('should filter by time range', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 3600000); // 1 hour ago

    aggregator.addLog({
      timestamp: past.toISOString(),
      level: 'info',
      message: 'old',
    });

    aggregator.addLog({
      timestamp: now.toISOString(),
      level: 'info',
      message: 'new',
    });

    const recentLogs = aggregator.query({
      startTime: new Date(now.getTime() - 1800000), // 30 minutes ago
    });

    expect(recentLogs.length).toBe(1);
    expect(recentLogs[0].message).toBe('new');
  });

  it('should search log content', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'user logged in',
    });

    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'data processed',
    });

    const logs = aggregator.query({ searchTerm: 'logged' });
    expect(logs.length).toBe(1);
    expect(logs[0].message).toContain('logged');
  });

  it('should export to JSON', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
    });

    const json = aggregator.export({}, { format: 'json' });
    expect(json).toBeDefined();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('should export to CSV', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
    });

    const csv = aggregator.export({}, { format: 'csv' });
    expect(csv).toContain('timestamp');
    expect(csv).toContain('level');
    expect(csv).toContain('message');
  });

  it('should provide statistics', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
      agentId: 'agent-1',
    });

    const stats = aggregator.getStats();
    expect(stats.total).toBe(1);
    expect(stats.byLevel.info).toBe(1);
    expect(stats.byAgent['agent-1']).toBe(1);
  });

  it('should export to NDJSON', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test1',
    });
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test2',
    });

    const ndjson = aggregator.export({}, { format: 'ndjson' });
    const lines = ndjson.split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).message).toBe('test1');
  });

  it('should apply offset and limit', () => {
    for (let i = 0; i < 10; i++) {
      aggregator.addLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `test${i}`,
      });
    }

    const logs = aggregator.query({ offset: 5, limit: 3 });
    expect(logs.length).toBe(3);
  });

  it('should clear all logs', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
    });

    aggregator.clear();
    expect(aggregator.size()).toBe(0);
  });

  it('should get all correlation IDs', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test1',
      correlationId: 'corr-1',
    });
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test2',
      correlationId: 'corr-2',
    });

    const ids = aggregator.getCorrelationIds();
    expect(ids).toContain('corr-1');
    expect(ids).toContain('corr-2');
  });

  it('should get all agent IDs', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
      agentId: 'agent-1',
    });

    const ids = aggregator.getAgentIds();
    expect(ids).toContain('agent-1');
  });

  it('should get all session IDs', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
      sessionId: 'session-1',
    });

    const ids = aggregator.getSessionIds();
    expect(ids).toContain('session-1');
  });

  it('should get logs by task ID', () => {
    aggregator.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'test',
      taskId: 'task-1',
    });

    const logs = aggregator.getByTask('task-1');
    expect(logs.length).toBe(1);
  });

  it('should trim old logs when max size reached', () => {
    const smallAggregator = new LogAggregator(5);

    for (let i = 0; i < 10; i++) {
      smallAggregator.addLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `test${i}`,
      });
    }

    expect(smallAggregator.size()).toBe(5);
  });
});

// ============================================================================
// Metrics Collector Tests
// ============================================================================

describe('MetricsCollector', () => {
  let collector: ReturnType<typeof createMetricsCollector>;

  beforeEach(() => {
    collector = createMetricsCollector();
  });

  it('should increment counter', () => {
    collector.incrementCounter('test_counter');
    expect(collector.getCounter('test_counter')).toBe(1);

    collector.incrementCounter('test_counter', 5);
    expect(collector.getCounter('test_counter')).toBe(6);
  });

  it('should set gauge', () => {
    collector.setGauge('test_gauge', 42);
    expect(collector.getGauge('test_gauge')).toBe(42);
  });

  it('should increment/decrement gauge', () => {
    collector.incrementGauge('test_gauge', 10);
    expect(collector.getGauge('test_gauge')).toBe(10);

    collector.decrementGauge('test_gauge', 3);
    expect(collector.getGauge('test_gauge')).toBe(7);
  });

  it('should observe histogram', () => {
    collector.observeHistogram('test_histogram', 0.5);
    collector.observeHistogram('test_histogram', 1.5);

    const histogram = collector.getHistogram('test_histogram');
    expect(histogram?.count).toBe(2);
    expect(histogram?.sum).toBe(2.0);
  });

  it('should observe summary', () => {
    collector.observeSummary('test_summary', 10);
    collector.observeSummary('test_summary', 20);
    collector.observeSummary('test_summary', 30);

    const summary = collector.getSummary('test_summary');
    expect(summary?.count).toBe(3);
    expect(summary?.sum).toBe(60);
  });

  it('should calculate percentiles', () => {
    for (let i = 1; i <= 100; i++) {
      collector.observeSummary('test_percentiles', i);
    }

    const p50 = collector.getPercentile('test_percentiles', 50);
    const p95 = collector.getPercentile('test_percentiles', 95);
    const p99 = collector.getPercentile('test_percentiles', 99);

    expect(p50).toBeGreaterThan(40);
    expect(p50).toBeLessThan(60);
    expect(p95).toBeGreaterThan(90);
    expect(p99).toBeGreaterThan(95);
  });

  it('should support labels', () => {
    collector.incrementCounter('requests', 1, { method: 'GET', status: '200' });
    collector.incrementCounter('requests', 1, { method: 'POST', status: '201' });

    expect(collector.getCounter('requests', { method: 'GET', status: '200' })).toBe(1);
    expect(collector.getCounter('requests', { method: 'POST', status: '201' })).toBe(1);
  });

  it('should time async functions', async () => {
    await collector.timeAsync('async_operation', async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const histogram = collector.getHistogram('async_operation');
    expect(histogram?.count).toBe(1);
    expect(histogram?.sum).toBeGreaterThan(0.09); // ~100ms in seconds
  });

  it('should time sync functions', () => {
    collector.timeSync('sync_operation', () => {
      // Simulate work
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      return sum;
    });

    const histogram = collector.getHistogram('sync_operation');
    expect(histogram?.count).toBe(1);
  });

  it('should reset metrics', () => {
    collector.incrementCounter('test');
    collector.reset();
    expect(collector.getCounter('test')).toBe(0);
  });

  it('should use built-in metric names', () => {
    collector.incrementCounter(METRIC_NAMES.AGENT_SPAWNED);
    expect(collector.getCounter(METRIC_NAMES.AGENT_SPAWNED)).toBe(1);
  });
});

// ============================================================================
// Metrics Exporter Tests
// ============================================================================

describe('MetricsExporter', () => {
  let exporter: MetricsExporter;
  let collector: ReturnType<typeof createMetricsCollector>;

  beforeEach(() => {
    exporter = new MetricsExporter();
    collector = createMetricsCollector();
  });

  it('should export to Prometheus format', () => {
    collector.incrementCounter('test_counter', 5);
    collector.setGauge('test_gauge', 42);

    const metrics = collector.getMetrics();
    const prometheus = exporter.exportPrometheus(metrics);

    expect(prometheus).toContain('test_counter');
    expect(prometheus).toContain('test_gauge');
    expect(prometheus).toContain('5');
    expect(prometheus).toContain('42');
  });

  it('should export to JSON format', () => {
    collector.incrementCounter('test_counter', 5);

    const metrics = collector.getMetrics();
    const json = exporter.exportJSON(metrics);
    const parsed = JSON.parse(json);

    expect(parsed.timestamp).toBeDefined();
    expect(parsed.counters).toBeDefined();
  });

  it('should export to StatsD format', () => {
    collector.incrementCounter('test_counter', 5);
    collector.setGauge('test_gauge', 42);

    const metrics = collector.getMetrics();
    const statsd = exporter.exportStatsD(metrics, 'myapp');

    expect(statsd.some((line) => line.includes('myapp.test_counter'))).toBe(true);
    expect(statsd.some((line) => line.includes('myapp.test_gauge'))).toBe(true);
  });

  it('should export Prometheus format with labels', () => {
    collector.incrementCounter('requests', 1, { method: 'GET' });
    collector.setGauge('active_connections', 10, { host: 'localhost' });

    const metrics = collector.getMetrics();
    const prometheus = exporter.exportPrometheus(metrics);

    expect(prometheus).toContain('requests');
    expect(prometheus).toContain('method="GET"');
  });

  it('should export histograms in Prometheus format', () => {
    collector.observeHistogram('request_duration', 0.5);
    collector.observeHistogram('request_duration', 1.5);

    const metrics = collector.getMetrics();
    const prometheus = exporter.exportPrometheus(metrics);

    expect(prometheus).toContain('request_duration_bucket');
    expect(prometheus).toContain('request_duration_sum');
    expect(prometheus).toContain('request_duration_count');
  });

  it('should export summaries in Prometheus format', () => {
    for (let i = 1; i <= 100; i++) {
      collector.observeSummary('response_size', i);
    }

    const metrics = collector.getMetrics();
    const prometheus = exporter.exportPrometheus(metrics);

    expect(prometheus).toContain('response_size{quantile="0.5"}');
    expect(prometheus).toContain('response_size{quantile="0.99"}');
  });

  it('should export JSON with pretty formatting', () => {
    collector.incrementCounter('test', 1);

    const metrics = collector.getMetrics();
    const json = exporter.exportJSON(metrics, true);

    expect(json).toContain('\n'); // Pretty formatting includes newlines
  });

  it('should send to StatsD server', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    collector.incrementCounter('test', 1);
    const metrics = collector.getMetrics();

    await exporter.sendToStatsD(metrics, {
      host: 'localhost',
      port: 8125,
      prefix: 'myapp',
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should push to webhook', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch;

    collector.incrementCounter('test', 1);
    const metrics = collector.getMetrics();

    await exporter.pushToWebhook(metrics, {
      url: 'http://localhost:3000/metrics',
    });

    expect(mockFetch).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('should handle webhook push failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    global.fetch = mockFetch;

    collector.incrementCounter('test', 1);
    const metrics = collector.getMetrics();

    await expect(
      exporter.pushToWebhook(metrics, {
        url: 'http://localhost:3000/metrics',
      })
    ).rejects.toThrow();

    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('should start and stop periodic webhook push', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch;

    collector.incrementCounter('test', 1);

    exporter.startWebhookPush(() => collector.getMetrics(), {
      url: 'http://localhost:3000/metrics',
      interval: 100,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    exporter.stopAllPushes();

    expect(mockFetch).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

// ============================================================================
// Trace Manager Tests
// ============================================================================

describe('TraceManager', () => {
  let traceManager: ReturnType<typeof createTraceManager>;

  beforeEach(() => {
    traceManager = createTraceManager();
  });

  it('should create a span', () => {
    const span = traceManager.startSpan('test-operation');

    expect(span.name).toBe('test-operation');
    expect(span.context.traceId).toBeDefined();
    expect(span.context.spanId).toBeDefined();
    expect(span.startTime).toBeDefined();
  });

  it('should end a span', () => {
    const span = traceManager.startSpan('test-operation');
    traceManager.endSpan(span);

    expect(span.endTime).toBeDefined();
    expect(span.status).toBe('ok');
  });

  it('should create parent-child spans', () => {
    const parent = traceManager.startSpan('parent');
    const child = traceManager.startSpan('child', { parent: parent.context });

    expect(child.context.traceId).toBe(parent.context.traceId);
    expect(child.context.parentSpanId).toBe(parent.context.spanId);
  });

  it('should add events to span', () => {
    const span = traceManager.startSpan('test');
    traceManager.addEvent(span, 'test-event', { key: 'value' });

    expect(span.events.length).toBe(1);
    expect(span.events[0].name).toBe('test-event');
  });

  it('should set span attributes', () => {
    const span = traceManager.startSpan('test');
    traceManager.setAttributes(span, { user: 'john', action: 'login' });

    expect(span.attributes.user).toBe('john');
    expect(span.attributes.action).toBe('login');
  });

  it('should record exceptions', () => {
    const span = traceManager.startSpan('test');
    const error = new Error('Test error');
    traceManager.recordException(span, error);

    expect(span.events.length).toBe(1);
    expect(span.events[0].name).toBe('exception');
    expect(span.status).toBe('error');
  });

  it('should support withSpan helper', async () => {
    const result = await traceManager.withSpan('async-op', async (span) => {
      expect(span.name).toBe('async-op');
      return 'success';
    });

    expect(result).toBe('success');
  });

  it('should handle errors in withSpan', async () => {
    await expect(
      traceManager.withSpan('failing-op', async () => {
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');

    const spans = traceManager.getSpans();
    expect(spans[0].status).toBe('error');
  });

  it('should support probability sampler', () => {
    const sampler = probabilitySampler(0);
    const result = sampler(
      { traceId: 'test', spanId: 'test', traceFlags: 1 },
      'test'
    );
    expect(result.decision).toBe('drop');
  });

  it('should support trace ID ratio sampler', () => {
    const sampler = traceIdRatioSampler(0);
    const result = sampler(
      { traceId: 'ffffffffffffffffffffffffffffffff', spanId: 'test', traceFlags: 1 },
      'test'
    );
    expect(result.decision).toBe('drop');
  });

  it('should create child spans with context propagation', () => {
    const parent = traceManager.startSpan('parent');
    traceManager.setCurrentContext(parent.context);

    const child = traceManager.startSpan('child');

    expect(child.context.traceId).toBe(parent.context.traceId);
    expect(child.context.parentSpanId).toBe(parent.context.spanId);
  });

  it('should support different span kinds', () => {
    const kinds = ['internal', 'server', 'client', 'producer', 'consumer'] as const;

    for (const kind of kinds) {
      const span = traceManager.startSpan(`test-${kind}`, { kind });
      expect(span.kind).toBe(kind);
    }
  });

  it('should get spans by trace ID', () => {
    const span1 = traceManager.startSpan('test1');
    const span2 = traceManager.startSpan('test2', { parent: span1.context });

    const spans = traceManager.getSpansByTrace(span1.context.traceId);
    expect(spans.length).toBe(2);
  });

  it('should get span by ID', () => {
    const span = traceManager.startSpan('test');
    const retrieved = traceManager.getSpan(span.context.spanId);

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('test');
  });

  it('should clear all spans', () => {
    traceManager.startSpan('test1');
    traceManager.startSpan('test2');

    traceManager.clear();

    expect(traceManager.getSpans().length).toBe(0);
  });

  it('should clear old spans', () => {
    const span = traceManager.startSpan('old');
    traceManager.endSpan(span);

    // Make span appear old
    span.endTime = Date.now() - 10000;

    traceManager.clearOldSpans(5000); // Clear spans older than 5 seconds

    expect(traceManager.getSpan(span.context.spanId)).toBeUndefined();
  });

  it('should get trace tree structure', () => {
    const parent = traceManager.startSpan('parent');
    traceManager.startSpan('child1', { parent: parent.context });
    traceManager.startSpan('child2', { parent: parent.context });

    const tree = traceManager.getTraceTree(parent.context.traceId);
    expect(tree.length).toBe(1); // One root
    expect(tree[0].name).toBe('parent');
  });

  it('should set span status', () => {
    const span = traceManager.startSpan('test');
    traceManager.setStatus(span, 'error', 'Something went wrong');

    expect(span.status).toBe('error');
    expect(span.attributes['status.message']).toBe('Something went wrong');
  });

  it('should handle withSpanSync for synchronous operations', () => {
    const result = traceManager.withSpanSync('sync-op', (span) => {
      expect(span.name).toBe('sync-op');
      return 42;
    });

    expect(result).toBe(42);
  });

  it('should handle errors in withSpanSync', () => {
    expect(() => {
      traceManager.withSpanSync('failing-op', () => {
        throw new Error('Test error');
      });
    }).toThrow('Test error');

    const spans = traceManager.getSpans();
    const failedSpan = spans.find((s) => s.name === 'failing-op');
    expect(failedSpan?.status).toBe('error');
  });

  it('should sanitize long attribute values', () => {
    const longString = 'a'.repeat(2000);
    const span = traceManager.startSpan('test');
    traceManager.setAttributes(span, { longValue: longString });

    const value = span.attributes.longValue as string;
    expect(value.length).toBeLessThan(2000);
    expect(value.endsWith('...')).toBe(true);
  });

  it('should limit array attributes', () => {
    const largeArray = Array.from({ length: 200 }, (_, i) => i);
    const span = traceManager.startSpan('test');
    traceManager.setAttributes(span, { array: largeArray });

    const value = span.attributes.array as number[];
    expect(value.length).toBeLessThanOrEqual(100);
  });

  it('should create no-op spans when sampled out', () => {
    const sampledOut = createTraceManager({
      sampler: () => ({ decision: 'drop' }),
    });

    const span = sampledOut.startSpan('test');
    expect(span.context.spanId).toBe('');
  });

  it('should not record operations on no-op spans', () => {
    const sampledOut = createTraceManager({
      sampler: () => ({ decision: 'drop' }),
    });

    const span = sampledOut.startSpan('test');
    sampledOut.addEvent(span, 'event');
    sampledOut.setAttributes(span, { key: 'value' });
    sampledOut.setStatus(span, 'error');

    // No-op span should have empty attributes and events
    expect(span.attributes).toEqual({});
    expect(span.events).toEqual([]);
  });

  it('should support span links', () => {
    const span1 = traceManager.startSpan('span1');
    const span2 = traceManager.startSpan('span2', {
      links: [span1.context],
    });

    expect(span2.links.length).toBe(1);
    expect(span2.links[0].spanId).toBe(span1.context.spanId);
  });

  it('should get current context', () => {
    const span = traceManager.startSpan('test');
    traceManager.setCurrentContext(span.context);

    const current = traceManager.getCurrentContext();
    expect(current?.spanId).toBe(span.context.spanId);
  });
});

// ============================================================================
// Trace Exporter Tests
// ============================================================================

describe('TraceExporter', () => {
  let mockFetch: any;

  beforeEach(() => {
    // Mock fetch
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create exporter with config', () => {
    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      format: 'otlp',
    });

    expect(exporter).toBeDefined();
  });

  it('should create exporter with default config', () => {
    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
    });

    expect(exporter).toBeDefined();
  });

  it('should buffer spans', async () => {
    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      batchSize: 10,
    });

    const traceManager = createTraceManager();
    const span = traceManager.startSpan('test');
    traceManager.endSpan(span);

    await exporter.export(span);
    // Span should be buffered
  });

  it('should export batch when size reached', async () => {
    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      batchSize: 2,
      format: 'otlp',
    });

    const traceManager = createTraceManager();
    const span1 = traceManager.startSpan('test1');
    const span2 = traceManager.startSpan('test2');
    traceManager.endSpan(span1);
    traceManager.endSpan(span2);

    await exporter.export(span1);
    await exporter.export(span2);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should export to Jaeger format', async () => {
    const exporter = new TraceExporter({
      endpoint: 'http://localhost:14268/api/traces',
      format: 'jaeger',
      batchSize: 1,
    });

    const traceManager = createTraceManager();
    const span = traceManager.startSpan('jaeger-test');
    traceManager.setAttributes(span, { userId: '123' });
    traceManager.endSpan(span);

    await exporter.export(span);

    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('http://localhost:14268/api/traces');
  });

  it('should export to Zipkin format', async () => {
    const exporter = new TraceExporter({
      endpoint: 'http://localhost:9411/api/v2/spans',
      format: 'zipkin',
      batchSize: 1,
    });

    const traceManager = createTraceManager();
    const span = traceManager.startSpan('zipkin-test');
    traceManager.endSpan(span);

    await exporter.export(span);

    expect(mockFetch).toHaveBeenCalled();
  });

  it('should handle export errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      batchSize: 1,
    });

    const traceManager = createTraceManager();
    const span = traceManager.startSpan('test');
    traceManager.endSpan(span);

    await exporter.export(span);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to export traces:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('should flush on batch size', async () => {
    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      batchSize: 2,
    });

    const traceManager = createTraceManager();
    const spans = [];
    for (let i = 0; i < 3; i++) {
      const span = traceManager.startSpan(`test-${i}`);
      traceManager.endSpan(span);
      spans.push(span);
    }

    await exporter.exportBatch(spans);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should manually flush', async () => {
    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      batchSize: 100,
    });

    const traceManager = createTraceManager();
    const span = traceManager.startSpan('test');
    traceManager.endSpan(span);

    await exporter.export(span);
    await exporter.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should start and stop periodic export', async () => {
    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      batchInterval: 100,
      batchSize: 100,
    });

    exporter.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await exporter.stop();

    expect(exporter).toBeDefined();
  });

  it(
    'should handle timeout',
    async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock fetch to simulate timeout
      const slowFetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({ ok: true, status: 200 });
            }, 200);
          })
      );
      global.fetch = slowFetch;

      const exporter = new TraceExporter({
        endpoint: 'http://localhost:4318/v1/traces',
        batchSize: 1,
        timeout: 50,
      });

      const traceManager = createTraceManager();
      const span = traceManager.startSpan('test');
      traceManager.endSpan(span);

      // This should trigger export and timeout
      await exporter.export(span);

      // Wait for timeout to occur
      await new Promise((resolve) => setTimeout(resolve, 100));

      consoleSpy.mockRestore();
      vi.restoreAllMocks();
    },
    15000
  );

  it('should export spans with events', async () => {
    // Create fresh mock for this test
    const testFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    global.fetch = testFetch;

    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      batchSize: 100, // Large batch size
      format: 'otlp',
    });

    const traceManager = createTraceManager();
    const span = traceManager.startSpan('test-with-events');
    traceManager.addEvent(span, 'user-action', { action: 'click' });
    traceManager.endSpan(span);

    await exporter.export(span);
    await exporter.flush(); // Manually flush

    expect(testFetch).toHaveBeenCalled();
  });

  it('should export spans with various attribute types', async () => {
    // Create fresh mock for this test
    const testFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    global.fetch = testFetch;

    const exporter = new TraceExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      batchSize: 100, // Large batch size
      format: 'otlp',
    });

    const traceManager = createTraceManager();
    const span = traceManager.startSpan('test-attributes');
    traceManager.setAttributes(span, {
      string: 'value',
      number: 42,
      boolean: true,
      array: [1, 2, 3],
    });
    traceManager.endSpan(span);

    await exporter.export(span);
    await exporter.flush(); // Manually flush

    expect(testFetch).toHaveBeenCalled();
  });
});

// ============================================================================
// Health Dashboard Tests
// ============================================================================

describe('HealthDashboard', () => {
  let dashboard: ReturnType<typeof createHealthDashboard>;

  beforeEach(() => {
    dashboard = createHealthDashboard();
  });

  afterEach(() => {
    dashboard.stop();
  });

  it('should create health dashboard', () => {
    expect(dashboard).toBeDefined();
  });

  it('should register health check', () => {
    dashboard.registerComponent('test', async () => ({
      status: 'healthy',
      message: 'OK',
    }));

    // Check is registered
  });

  it('should check component health', async () => {
    dashboard.registerComponent('test', async () => ({
      status: 'healthy',
      message: 'All good',
    }));

    const health = await dashboard.checkComponent('test');
    expect(health.status).toBe('healthy');
    expect(health.message).toBe('All good');
  });

  it('should handle unhealthy components', async () => {
    dashboard.registerComponent('failing', async () => ({
      status: 'unhealthy',
      message: 'Service down',
    }));

    const health = await dashboard.checkComponent('failing');
    expect(health.status).toBe('unhealthy');
  });

  it('should aggregate health status', async () => {
    dashboard.registerComponent('healthy1', async () => ({
      status: 'healthy',
    }));
    dashboard.registerComponent('healthy2', async () => ({
      status: 'healthy',
    }));

    const aggregated = await dashboard.getHealth();
    expect(aggregated.status).toBe('healthy');
    expect(aggregated.components.length).toBe(2);
  });

  it('should report degraded if any component degraded', async () => {
    dashboard.registerComponent('healthy', async () => ({
      status: 'healthy',
    }));
    dashboard.registerComponent('degraded', async () => ({
      status: 'degraded',
    }));

    const aggregated = await dashboard.getHealth();
    expect(aggregated.status).toBe('degraded');
  });

  it('should report unhealthy if any component unhealthy', async () => {
    dashboard.registerComponent('healthy', async () => ({
      status: 'healthy',
    }));
    dashboard.registerComponent('unhealthy', async () => ({
      status: 'unhealthy',
    }));

    const aggregated = await dashboard.getHealth();
    expect(aggregated.status).toBe('unhealthy');
  });

  it('should check liveness', async () => {
    const liveness = await dashboard.liveness();
    expect(liveness.alive).toBe(true);
  });

  it('should check readiness', async () => {
    dashboard.registerComponent('service', async () => ({
      status: 'healthy',
    }));

    const readiness = await dashboard.readiness();
    expect(readiness.ready).toBe(true);
  });

  it('should use memory health check', async () => {
    const check = memoryHealthCheck(10000); // 10GB threshold
    const result = await check();
    expect(result.status).toBe('healthy');
  });

  it('should get uptime', () => {
    const uptime = dashboard.getUptime();
    expect(uptime).toBeGreaterThanOrEqual(0);
  });

  it('should format uptime', () => {
    const formatted = dashboard.getUptimeFormatted();
    expect(formatted).toContain('s');
  });

  it(
    'should handle health check timeout',
    async () => {
      dashboard.registerComponent('slow', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return { status: 'healthy' };
      });

      const health = await dashboard.checkComponent('slow');
      expect(health.status).toBe('unhealthy');
      expect(health.message).toContain('timeout');
    },
    10000
  );

  it('should handle health check errors', async () => {
    dashboard.registerComponent('erroring', async () => {
      throw new Error('Check failed');
    });

    const health = await dashboard.checkComponent('erroring');
    expect(health.status).toBe('unhealthy');
    expect(health.message).toBe('Check failed');
  });

  it('should unregister components', async () => {
    dashboard.registerComponent('temp', async () => ({
      status: 'healthy',
    }));

    dashboard.unregisterComponent('temp');

    const health = await dashboard.checkComponent('temp');
    expect(health.status).toBe('unhealthy');
    expect(health.message).toBe('Component not registered');
  });

  it('should cache component health', async () => {
    dashboard.registerComponent('cached', async () => ({
      status: 'healthy',
    }));

    await dashboard.checkComponent('cached');
    const cached = dashboard.getCachedHealth('cached');

    expect(cached).toBeDefined();
    expect(cached?.status).toBe('healthy');
  });

  it('should get all cached health', async () => {
    dashboard.registerComponent('c1', async () => ({ status: 'healthy' }));
    dashboard.registerComponent('c2', async () => ({ status: 'healthy' }));

    await dashboard.checkAll();
    const allCached = dashboard.getAllCachedHealth();

    expect(allCached.length).toBe(2);
  });

  it('should create health response', async () => {
    dashboard.registerComponent('test', async () => ({
      status: 'healthy',
    }));

    const response = await dashboard.createHealthResponse();

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  it('should return 503 for unhealthy status', async () => {
    dashboard.registerComponent('unhealthy', async () => ({
      status: 'unhealthy',
    }));

    const response = await dashboard.createHealthResponse();

    expect(response.status).toBe(503);
  });

  it('should check startup status', async () => {
    dashboard.registerComponent('service', async () => ({
      status: 'healthy',
    }));

    const startup = await dashboard.startup();
    expect(startup.started).toBe(true);
  });

  it('should run periodic health checks', async () => {
    let checkCount = 0;
    dashboard.registerComponent('periodic', async () => {
      checkCount++;
      return { status: 'healthy' };
    });

    dashboard.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    dashboard.stop();

    expect(checkCount).toBeGreaterThan(0);
  });
});
