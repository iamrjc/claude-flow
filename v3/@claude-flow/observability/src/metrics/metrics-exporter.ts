/**
 * Metrics Exporter - Prometheus format, JSON, StatsD, webhooks
 *
 * Features:
 * - Prometheus text format export
 * - JSON export
 * - StatsD protocol support
 * - Webhook push
 * - Multiple export destinations
 */

import type { CollectedMetrics, Histogram, Summary } from './metrics-collector.js';

export type ExportFormat = 'prometheus' | 'json' | 'statsd';

export interface ExportOptions {
  format: ExportFormat;
  includeTimestamp?: boolean;
  includeHelp?: boolean;
}

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  interval?: number; // Push interval in ms
}

export interface StatsDConfig {
  host: string;
  port: number;
  prefix?: string;
}

export class MetricsExporter {
  private webhooks: WebhookConfig[] = [];
  private intervals: NodeJS.Timeout[] = [];

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(metrics: CollectedMetrics, includeHelp: boolean = true): string {
    const lines: string[] = [];

    // Export counters
    for (const [name, labelMap] of metrics.counters) {
      if (includeHelp) {
        lines.push(`# HELP ${name} Counter metric`);
        lines.push(`# TYPE ${name} counter`);
      }
      for (const [labels, value] of labelMap) {
        const labelsStr = labels ? `{${labels}}` : '';
        lines.push(`${name}${labelsStr} ${value}`);
      }
    }

    // Export gauges
    for (const [name, labelMap] of metrics.gauges) {
      if (includeHelp) {
        lines.push(`# HELP ${name} Gauge metric`);
        lines.push(`# TYPE ${name} gauge`);
      }
      for (const [labels, value] of labelMap) {
        const labelsStr = labels ? `{${labels}}` : '';
        lines.push(`${name}${labelsStr} ${value}`);
      }
    }

    // Export histograms
    for (const [name, labelMap] of metrics.histograms) {
      if (includeHelp) {
        lines.push(`# HELP ${name} Histogram metric`);
        lines.push(`# TYPE ${name} histogram`);
      }
      for (const [labels, histogram] of labelMap) {
        lines.push(...this.formatHistogram(name, labels, histogram));
      }
    }

    // Export summaries
    for (const [name, labelMap] of metrics.summaries) {
      if (includeHelp) {
        lines.push(`# HELP ${name} Summary metric`);
        lines.push(`# TYPE ${name} summary`);
      }
      for (const [labels, summary] of labelMap) {
        lines.push(...this.formatSummary(name, labels, summary));
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Export metrics in JSON format
   */
  exportJSON(metrics: CollectedMetrics, pretty: boolean = false): string {
    const data = {
      timestamp: new Date().toISOString(),
      counters: this.mapToObject(metrics.counters),
      gauges: this.mapToObject(metrics.gauges),
      histograms: this.histogramsToObject(metrics.histograms),
      summaries: this.summariesToObject(metrics.summaries),
    };

    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }

  /**
   * Export metrics in StatsD format
   */
  exportStatsD(metrics: CollectedMetrics, prefix: string = ''): string[] {
    const lines: string[] = [];
    const prefixStr = prefix ? `${prefix}.` : '';

    // Export counters
    for (const [name, labelMap] of metrics.counters) {
      for (const [labels, value] of labelMap) {
        const metricName = this.formatStatsDName(prefixStr + name, labels);
        lines.push(`${metricName}:${value}|c`);
      }
    }

    // Export gauges
    for (const [name, labelMap] of metrics.gauges) {
      for (const [labels, value] of labelMap) {
        const metricName = this.formatStatsDName(prefixStr + name, labels);
        lines.push(`${metricName}:${value}|g`);
      }
    }

    // Export histograms as timing metrics
    for (const [name, labelMap] of metrics.histograms) {
      for (const [labels, histogram] of labelMap) {
        const metricName = this.formatStatsDName(prefixStr + name, labels);
        const avg = histogram.sum / histogram.count;
        lines.push(`${metricName}:${avg}|ms`);
      }
    }

    // Export summaries as timing metrics
    for (const [name, labelMap] of metrics.summaries) {
      for (const [labels, summary] of labelMap) {
        const metricName = this.formatStatsDName(prefixStr + name, labels);
        const avg = summary.sum / summary.count;
        lines.push(`${metricName}:${avg}|ms`);
      }
    }

    return lines;
  }

  /**
   * Send metrics to StatsD server
   */
  async sendToStatsD(
    metrics: CollectedMetrics,
    config: StatsDConfig
  ): Promise<void> {
    const lines = this.exportStatsD(metrics, config.prefix);
    const message = lines.join('\n');

    // In a real implementation, this would use dgram to send UDP packets
    // For now, we'll just log the operation
    console.log(`Would send to ${config.host}:${config.port}:`, message);
  }

  /**
   * Push metrics to webhook
   */
  async pushToWebhook(
    metrics: CollectedMetrics,
    config: WebhookConfig
  ): Promise<void> {
    const body = this.exportJSON(metrics);

    try {
      const response = await fetch(config.url, {
        method: config.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`Webhook push failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to push metrics to webhook:', error);
      throw error;
    }
  }

  /**
   * Start periodic webhook push
   */
  startWebhookPush(
    getMetrics: () => CollectedMetrics,
    config: WebhookConfig
  ): void {
    const interval = setInterval(async () => {
      try {
        const metrics = getMetrics();
        await this.pushToWebhook(metrics, config);
      } catch (error) {
        console.error('Periodic webhook push failed:', error);
      }
    }, config.interval ?? 60000); // Default 60s

    this.intervals.push(interval);
    this.webhooks.push(config);
  }

  /**
   * Stop all periodic pushes
   */
  stopAllPushes(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
  }

  /**
   * Format histogram for Prometheus
   */
  private formatHistogram(name: string, labels: string, histogram: Histogram): string[] {
    const lines: string[] = [];
    const baseLabels = labels ? labels : '';

    // Bucket counts
    for (const [bucket, count] of histogram.buckets) {
      const bucketLabels = baseLabels
        ? `${baseLabels},le="${bucket}"`
        : `le="${bucket}"`;
      lines.push(`${name}_bucket{${bucketLabels}} ${count}`);
    }

    // +Inf bucket
    const infLabels = baseLabels ? `${baseLabels},le="+Inf"` : `le="+Inf"`;
    lines.push(`${name}_bucket{${infLabels}} ${histogram.count}`);

    // Sum and count
    const labelsStr = labels ? `{${labels}}` : '';
    lines.push(`${name}_sum${labelsStr} ${histogram.sum}`);
    lines.push(`${name}_count${labelsStr} ${histogram.count}`);

    return lines;
  }

  /**
   * Format summary for Prometheus
   */
  private formatSummary(name: string, labels: string, summary: Summary): string[] {
    const lines: string[] = [];
    const labelsStr = labels ? `{${labels}}` : '';

    // Calculate percentiles
    const percentiles = [0.5, 0.9, 0.95, 0.99];
    const sorted = [...summary.values].sort((a, b) => a - b);

    for (const p of percentiles) {
      const index = Math.ceil(p * sorted.length) - 1;
      const value = sorted[Math.max(0, index)] ?? 0;
      const quantileLabels = labels
        ? `${labels},quantile="${p}"`
        : `quantile="${p}"`;
      lines.push(`${name}{${quantileLabels}} ${value}`);
    }

    // Sum and count
    lines.push(`${name}_sum${labelsStr} ${summary.sum}`);
    lines.push(`${name}_count${labelsStr} ${summary.count}`);

    return lines;
  }

  /**
   * Format metric name for StatsD
   */
  private formatStatsDName(name: string, labels: string): string {
    if (!labels) return name;

    // Convert labels to tags
    const tags = labels
      .split(',')
      .map((pair) => pair.replace(/"/g, ''))
      .join(',');

    return `${name}|#${tags}`;
  }

  /**
   * Convert Map to plain object
   */
  private mapToObject(map: Map<string, Map<string, number>>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, labelMap] of map) {
      result[name] = {};
      for (const [labels, value] of labelMap) {
        const key = labels || 'default';
        result[name][key] = value;
      }
    }
    return result;
  }

  /**
   * Convert histograms Map to plain object
   */
  private histogramsToObject(
    map: Map<string, Map<string, Histogram>>
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, labelMap] of map) {
      result[name] = {};
      for (const [labels, histogram] of labelMap) {
        const key = labels || 'default';
        result[name][key] = {
          count: histogram.count,
          sum: histogram.sum,
          buckets: Object.fromEntries(histogram.buckets),
        };
      }
    }
    return result;
  }

  /**
   * Convert summaries Map to plain object
   */
  private summariesToObject(
    map: Map<string, Map<string, Summary>>
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, labelMap] of map) {
      result[name] = {};
      for (const [labels, summary] of labelMap) {
        const key = labels || 'default';
        result[name][key] = {
          count: summary.count,
          sum: summary.sum,
          mean: summary.count > 0 ? summary.sum / summary.count : 0,
        };
      }
    }
    return result;
  }
}

/**
 * Global metrics exporter instance
 */
export const metricsExporter = new MetricsExporter();

/**
 * Create a new metrics exporter
 */
export function createMetricsExporter(): MetricsExporter {
  return new MetricsExporter();
}
