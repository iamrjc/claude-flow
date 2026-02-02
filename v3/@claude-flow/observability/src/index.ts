/**
 * @claude-flow/observability
 *
 * Observability Module - WP26
 *
 * Comprehensive observability solution for claude-flow v3 with:
 * - Structured logging with correlation IDs
 * - Metrics collection and export
 * - Distributed tracing
 * - Health monitoring and probes
 *
 * Zero-config defaults, low overhead (<1ms per operation)
 */

// Logging
export {
  StructuredLogger,
  createLogger,
  logger,
  type LogLevel,
  type LogEntry,
  type LoggerConfig,
  type LogTransport,
} from './logging/structured-logger.js';

// Import for local use
import { createLogger } from './logging/structured-logger.js';

export {
  LogAggregator,
  createLogAggregator,
  logAggregator,
  type LogQuery,
  type LogStats,
  type ExportOptions,
} from './logging/log-aggregator.js';

// Metrics
export {
  MetricsCollector,
  createMetricsCollector,
  metricsCollector,
  METRIC_NAMES,
  type MetricType,
  type MetricValue,
  type MetricOptions,
  type CollectedMetrics,
  type Histogram,
  type Summary,
} from './metrics/metrics-collector.js';

// Import for local use
import { createMetricsCollector } from './metrics/metrics-collector.js';

export {
  MetricsExporter,
  createMetricsExporter,
  metricsExporter,
  type ExportFormat,
  type ExportOptions as MetricsExportOptions,
  type WebhookConfig,
  type StatsDConfig,
} from './metrics/metrics-exporter.js';

// Tracing
export {
  TraceManager,
  createTraceManager,
  traceManager,
  alwaysOnSampler,
  alwaysOffSampler,
  probabilitySampler,
  traceIdRatioSampler,
  type Span,
  type SpanContext,
  type SpanEvent,
  type SpanKind,
  type SpanStatus,
  type Sampler,
  type SamplingResult,
  type TraceConfig,
} from './tracing/trace-manager.js';

// Import for local use
import { createTraceManager } from './tracing/trace-manager.js';

export {
  TraceExporter,
  createTraceExporter,
  type ExportFormat as TraceExportFormat,
  type ExportConfig,
  type OTLPSpan,
  type JaegerSpan,
  type ZipkinSpan,
} from './tracing/trace-exporter.js';

// Health Dashboard
export {
  HealthDashboard,
  createHealthDashboard,
  healthDashboard,
  memoryHealthCheck,
  databaseHealthCheck,
  apiHealthCheck,
  diskSpaceHealthCheck,
  type HealthStatus,
  type ComponentHealth,
  type HealthCheckResult,
  type HealthCheck,
  type HealthDashboardConfig,
  type AggregatedHealth,
} from './dashboards/health-dashboard.js';

// Import for local use
import { createHealthDashboard, memoryHealthCheck } from './dashboards/health-dashboard.js';

/**
 * Create a fully configured observability stack
 */
export function createObservabilityStack(config?: {
  serviceName?: string;
  enableLogging?: boolean;
  enableMetrics?: boolean;
  enableTracing?: boolean;
  enableHealth?: boolean;
}) {
  const serviceName = config?.serviceName ?? 'claude-flow';

  // Create logger with service name
  const serviceLogger = createLogger({
    enableConsole: config?.enableLogging ?? true,
  }).child({ context: serviceName });

  // Create metrics collector
  const serviceMetrics = config?.enableMetrics !== false ? createMetricsCollector() : null;

  // Create trace manager
  const serviceTracer = config?.enableTracing !== false ? createTraceManager() : null;

  // Create health dashboard
  const serviceHealth =
    config?.enableHealth !== false ? createHealthDashboard() : null;

  // Register health checks if enabled
  if (serviceHealth) {
    serviceHealth.registerComponent('memory', memoryHealthCheck(1000));
    serviceHealth.start();
  }

  return {
    logger: serviceLogger,
    metrics: serviceMetrics,
    tracer: serviceTracer,
    health: serviceHealth,
  };
}

/**
 * Version
 */
export const VERSION = '3.0.0-alpha.1';
