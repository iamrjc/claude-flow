/**
 * Metrics Collector - Counters, gauges, histograms for agents/tasks/memory/providers
 *
 * Features:
 * - Counter metrics (increment-only)
 * - Gauge metrics (set to specific values)
 * - Histogram metrics (track distributions)
 * - Summary metrics (percentiles)
 * - Labels/tags for metric dimensions
 * - Low overhead (<0.1ms per metric)
 */

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricValue {
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface Histogram {
  count: number;
  sum: number;
  buckets: Map<number, number>; // bucket upper bound -> count
}

export interface Summary {
  count: number;
  sum: number;
  values: number[]; // Keep recent values for percentile calculation
  maxSize: number;
}

export interface MetricOptions {
  help?: string;
  labels?: string[];
  buckets?: number[]; // For histograms
  maxAge?: number; // For summaries (in ms)
  maxSize?: number; // For summaries (number of values)
}

export interface CollectedMetrics {
  counters: Map<string, Map<string, number>>;
  gauges: Map<string, Map<string, number>>;
  histograms: Map<string, Map<string, Histogram>>;
  summaries: Map<string, Map<string, Summary>>;
}

const DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class MetricsCollector {
  private counters = new Map<string, Map<string, number>>();
  private gauges = new Map<string, Map<string, number>>();
  private histograms = new Map<string, Map<string, Histogram>>();
  private summaries = new Map<string, Map<string, Summary>>();
  private metricOptions = new Map<string, MetricOptions>();

  /**
   * Increment a counter metric
   */
  incrementCounter(
    name: string,
    value: number = 1,
    labels: Record<string, string> = {}
  ): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.counters.get(name) ?? new Map();
    const current = metricMap.get(labelKey) ?? 0;
    metricMap.set(labelKey, current + value);
    this.counters.set(name, metricMap);
  }

  /**
   * Set a gauge metric
   */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.gauges.get(name) ?? new Map();
    metricMap.set(labelKey, value);
    this.gauges.set(name, metricMap);
  }

  /**
   * Increment a gauge metric
   */
  incrementGauge(
    name: string,
    value: number = 1,
    labels: Record<string, string> = {}
  ): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.gauges.get(name) ?? new Map();
    const current = metricMap.get(labelKey) ?? 0;
    metricMap.set(labelKey, current + value);
    this.gauges.set(name, metricMap);
  }

  /**
   * Decrement a gauge metric
   */
  decrementGauge(
    name: string,
    value: number = 1,
    labels: Record<string, string> = {}
  ): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.gauges.get(name) ?? new Map();
    const current = metricMap.get(labelKey) ?? 0;
    metricMap.set(labelKey, current - value);
    this.gauges.set(name, metricMap);
  }

  /**
   * Observe a value for a histogram
   */
  observeHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.histograms.get(name) ?? new Map();
    let histogram = metricMap.get(labelKey);

    if (!histogram) {
      const options = this.metricOptions.get(name);
      const buckets = options?.buckets ?? DEFAULT_HISTOGRAM_BUCKETS;
      histogram = {
        count: 0,
        sum: 0,
        buckets: new Map(buckets.map((b) => [b, 0])),
      };
    }

    histogram.count++;
    histogram.sum += value;

    // Update buckets
    for (const [bucket, count] of histogram.buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, count + 1);
      }
    }

    metricMap.set(labelKey, histogram);
    this.histograms.set(name, metricMap);
  }

  /**
   * Observe a value for a summary
   */
  observeSummary(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.summaries.get(name) ?? new Map();
    let summary = metricMap.get(labelKey);

    if (!summary) {
      const options = this.metricOptions.get(name);
      summary = {
        count: 0,
        sum: 0,
        values: [],
        maxSize: options?.maxSize ?? 1000,
      };
    }

    summary.count++;
    summary.sum += value;
    summary.values.push(value);

    // Trim old values
    if (summary.values.length > summary.maxSize) {
      summary.values.shift();
    }

    metricMap.set(labelKey, summary);
    this.summaries.set(name, metricMap);
  }

  /**
   * Time a function execution and record as histogram
   */
  async timeAsync<T>(
    name: string,
    fn: () => Promise<T>,
    labels: Record<string, string> = {}
  ): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = (performance.now() - start) / 1000; // Convert to seconds
      this.observeHistogram(name, duration, labels);
    }
  }

  /**
   * Time a synchronous function execution
   */
  timeSync<T>(
    name: string,
    fn: () => T,
    labels: Record<string, string> = {}
  ): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const duration = (performance.now() - start) / 1000; // Convert to seconds
      this.observeHistogram(name, duration, labels);
    }
  }

  /**
   * Register a metric with options
   */
  register(name: string, type: MetricType, options: MetricOptions = {}): void {
    this.metricOptions.set(name, options);
  }

  /**
   * Get all metrics
   */
  getMetrics(): CollectedMetrics {
    return {
      counters: new Map(this.counters),
      gauges: new Map(this.gauges),
      histograms: new Map(this.histograms),
      summaries: new Map(this.summaries),
    };
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels: Record<string, string> = {}): number {
    const labelKey = this.serializeLabels(labels);
    return this.counters.get(name)?.get(labelKey) ?? 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string, labels: Record<string, string> = {}): number {
    const labelKey = this.serializeLabels(labels);
    return this.gauges.get(name)?.get(labelKey) ?? 0;
  }

  /**
   * Get histogram
   */
  getHistogram(name: string, labels: Record<string, string> = {}): Histogram | undefined {
    const labelKey = this.serializeLabels(labels);
    return this.histograms.get(name)?.get(labelKey);
  }

  /**
   * Get summary
   */
  getSummary(name: string, labels: Record<string, string> = {}): Summary | undefined {
    const labelKey = this.serializeLabels(labels);
    return this.summaries.get(name)?.get(labelKey);
  }

  /**
   * Calculate percentile from summary
   */
  getPercentile(
    name: string,
    percentile: number,
    labels: Record<string, string> = {}
  ): number | undefined {
    const summary = this.getSummary(name, labels);
    if (!summary || summary.values.length === 0) return undefined;

    const sorted = [...summary.values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
  }

  /**
   * Reset a specific metric
   */
  resetMetric(name: string): void {
    this.counters.delete(name);
    this.gauges.delete(name);
    this.histograms.delete(name);
    this.summaries.delete(name);
  }

  /**
   * Get metric names
   */
  getMetricNames(): {
    counters: string[];
    gauges: string[];
    histograms: string[];
    summaries: string[];
  } {
    return {
      counters: Array.from(this.counters.keys()),
      gauges: Array.from(this.gauges.keys()),
      histograms: Array.from(this.histograms.keys()),
      summaries: Array.from(this.summaries.keys()),
    };
  }

  /**
   * Serialize labels to a consistent string key
   */
  private serializeLabels(labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) return '';
    const sorted = Object.keys(labels).sort();
    return sorted.map((key) => `${key}="${labels[key]}"`).join(',');
  }
}

/**
 * Global metrics collector instance
 */
export const metricsCollector = new MetricsCollector();

/**
 * Create a new metrics collector
 */
export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}

/**
 * Built-in metric names for common use cases
 */
export const METRIC_NAMES = {
  // Agent metrics
  AGENT_SPAWNED: 'claude_flow_agent_spawned_total',
  AGENT_STOPPED: 'claude_flow_agent_stopped_total',
  AGENT_ACTIVE: 'claude_flow_agent_active',
  AGENT_ERRORS: 'claude_flow_agent_errors_total',
  AGENT_DURATION: 'claude_flow_agent_duration_seconds',

  // Task metrics
  TASK_CREATED: 'claude_flow_task_created_total',
  TASK_COMPLETED: 'claude_flow_task_completed_total',
  TASK_FAILED: 'claude_flow_task_failed_total',
  TASK_DURATION: 'claude_flow_task_duration_seconds',
  TASK_ACTIVE: 'claude_flow_task_active',

  // Memory metrics
  MEMORY_OPERATIONS: 'claude_flow_memory_operations_total',
  MEMORY_SIZE: 'claude_flow_memory_size_bytes',
  MEMORY_QUERIES: 'claude_flow_memory_queries_total',
  MEMORY_QUERY_DURATION: 'claude_flow_memory_query_duration_seconds',

  // Provider metrics
  PROVIDER_REQUESTS: 'claude_flow_provider_requests_total',
  PROVIDER_ERRORS: 'claude_flow_provider_errors_total',
  PROVIDER_LATENCY: 'claude_flow_provider_latency_seconds',
  PROVIDER_TOKENS: 'claude_flow_provider_tokens_total',

  // System metrics
  SYSTEM_CPU: 'claude_flow_system_cpu_percent',
  SYSTEM_MEMORY: 'claude_flow_system_memory_bytes',
  SYSTEM_UPTIME: 'claude_flow_system_uptime_seconds',
} as const;
