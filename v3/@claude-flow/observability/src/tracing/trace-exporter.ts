/**
 * Trace Exporter - OpenTelemetry format, Jaeger/Zipkin compatible
 *
 * Features:
 * - OpenTelemetry OTLP format
 * - Jaeger format
 * - Zipkin v2 format
 * - HTTP export
 * - Batch export with configurable intervals
 */

import type { Span, SpanContext, SpanEvent } from './trace-manager.js';

export type ExportFormat = 'otlp' | 'jaeger' | 'zipkin';

export interface ExportConfig {
  endpoint: string;
  format?: ExportFormat;
  headers?: Record<string, string>;
  batchSize?: number;
  batchInterval?: number;
  timeout?: number;
}

export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: Array<{ key: string; value: any }>;
  events: Array<{
    timeUnixNano: string;
    name: string;
    attributes: Array<{ key: string; value: any }>;
  }>;
  status: { code: number; message?: string };
  links: Array<{
    traceId: string;
    spanId: string;
  }>;
}

export interface JaegerSpan {
  traceIdLow: string;
  traceIdHigh: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  references?: Array<{
    refType: string;
    traceIdLow: string;
    traceIdHigh: string;
    spanId: string;
  }>;
  startTime: number;
  duration: number;
  tags: Array<{ key: string; type: string; value: any }>;
  logs: Array<{
    timestamp: number;
    fields: Array<{ key: string; type: string; value: any }>;
  }>;
}

export interface ZipkinSpan {
  traceId: string;
  id: string;
  parentId?: string;
  name: string;
  kind: string;
  timestamp: number;
  duration?: number;
  localEndpoint?: { serviceName: string };
  remoteEndpoint?: { serviceName: string };
  tags?: Record<string, string>;
  annotations?: Array<{ timestamp: number; value: string }>;
}

export class TraceExporter {
  private config: Required<ExportConfig>;
  private buffer: Span[] = [];
  private intervalHandle?: NodeJS.Timeout;

  constructor(config: ExportConfig) {
    this.config = {
      endpoint: config.endpoint,
      format: config.format ?? 'otlp',
      headers: config.headers ?? {},
      batchSize: config.batchSize ?? 100,
      batchInterval: config.batchInterval ?? 5000,
      timeout: config.timeout ?? 10000,
    };
  }

  /**
   * Export a single span
   */
  async export(span: Span): Promise<void> {
    this.buffer.push(span);

    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Export multiple spans
   */
  async exportBatch(spans: Span[]): Promise<void> {
    this.buffer.push(...spans);

    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flush buffered spans
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const spans = this.buffer.splice(0, this.config.batchSize);

    try {
      switch (this.config.format) {
        case 'otlp':
          await this.exportOTLP(spans);
          break;
        case 'jaeger':
          await this.exportJaeger(spans);
          break;
        case 'zipkin':
          await this.exportZipkin(spans);
          break;
      }
    } catch (error) {
      console.error('Failed to export traces:', error);
      // Re-add failed spans to buffer (optional)
      // this.buffer.unshift(...spans);
    }
  }

  /**
   * Start periodic export
   */
  start(): void {
    if (this.intervalHandle) return;

    this.intervalHandle = setInterval(() => {
      this.flush().catch((error) => {
        console.error('Periodic flush failed:', error);
      });
    }, this.config.batchInterval);
  }

  /**
   * Stop periodic export
   */
  async stop(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    // Flush remaining spans
    await this.flush();
  }

  /**
   * Export in OTLP format
   */
  private async exportOTLP(spans: Span[]): Promise<void> {
    const otlpSpans = spans.map((span) => this.toOTLP(span));

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'claude-flow' } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'claude-flow-tracer', version: '3.0.0' },
              spans: otlpSpans,
            },
          ],
        },
      ],
    };

    await this.sendHTTP(payload);
  }

  /**
   * Export in Jaeger format
   */
  private async exportJaeger(spans: Span[]): Promise<void> {
    const jaegerSpans = spans.map((span) => this.toJaeger(span));

    const payload = {
      batch: {
        process: {
          serviceName: 'claude-flow',
          tags: [],
        },
        spans: jaegerSpans,
      },
    };

    await this.sendHTTP(payload);
  }

  /**
   * Export in Zipkin format
   */
  private async exportZipkin(spans: Span[]): Promise<void> {
    const zipkinSpans = spans.map((span) => this.toZipkin(span));
    await this.sendHTTP(zipkinSpans);
  }

  /**
   * Convert to OTLP format
   */
  private toOTLP(span: Span): OTLPSpan {
    const kindMap = {
      internal: 1,
      server: 2,
      client: 3,
      producer: 4,
      consumer: 5,
    };

    const statusMap = {
      unset: 0,
      ok: 1,
      error: 2,
    };

    return {
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId,
      name: span.name,
      kind: kindMap[span.kind],
      startTimeUnixNano: String(span.startTime * 1_000_000),
      endTimeUnixNano: span.endTime ? String(span.endTime * 1_000_000) : undefined,
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: this.toOTLPValue(value),
      })),
      events: span.events.map((event) => ({
        timeUnixNano: String(event.timestamp * 1_000_000),
        name: event.name,
        attributes: Object.entries(event.attributes ?? {}).map(([key, value]) => ({
          key,
          value: this.toOTLPValue(value),
        })),
      })),
      status: {
        code: statusMap[span.status],
        message: span.attributes['status.message'] as string | undefined,
      },
      links: span.links.map((link) => ({
        traceId: link.traceId,
        spanId: link.spanId,
      })),
    };
  }

  /**
   * Convert to Jaeger format
   */
  private toJaeger(span: Span): JaegerSpan {
    const traceId = span.context.traceId;
    const duration = span.endTime ? span.endTime - span.startTime : 0;

    return {
      traceIdLow: traceId.slice(-16),
      traceIdHigh: traceId.slice(0, 16),
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId,
      operationName: span.name,
      startTime: span.startTime * 1000, // Microseconds
      duration: duration * 1000, // Microseconds
      tags: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        type: typeof value === 'number' ? 'float64' : 'string',
        value,
      })),
      logs: span.events.map((event) => ({
        timestamp: event.timestamp * 1000, // Microseconds
        fields: Object.entries(event.attributes ?? {}).map(([key, value]) => ({
          key,
          type: typeof value === 'number' ? 'float64' : 'string',
          value,
        })),
      })),
    };
  }

  /**
   * Convert to Zipkin format
   */
  private toZipkin(span: Span): ZipkinSpan {
    const kindMap = {
      internal: 'CLIENT',
      server: 'SERVER',
      client: 'CLIENT',
      producer: 'PRODUCER',
      consumer: 'CONSUMER',
    };

    const duration = span.endTime ? (span.endTime - span.startTime) * 1000 : undefined;

    return {
      traceId: span.context.traceId,
      id: span.context.spanId,
      parentId: span.context.parentSpanId,
      name: span.name,
      kind: kindMap[span.kind],
      timestamp: span.startTime * 1000, // Microseconds
      duration,
      localEndpoint: { serviceName: 'claude-flow' },
      tags: Object.fromEntries(
        Object.entries(span.attributes).map(([k, v]) => [k, String(v)])
      ),
      annotations: span.events.map((event) => ({
        timestamp: event.timestamp * 1000,
        value: event.name,
      })),
    };
  }

  /**
   * Convert value to OTLP format
   */
  private toOTLPValue(value: unknown): any {
    if (typeof value === 'string') {
      return { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { intValue: String(value) };
      }
      return { doubleValue: value };
    } else if (typeof value === 'boolean') {
      return { boolValue: value };
    } else if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((v) => this.toOTLPValue(v)),
        },
      };
    } else {
      return { stringValue: String(value) };
    }
  }

  /**
   * Send HTTP request
   */
  private async sendHTTP(payload: any): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status} ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Create a new trace exporter
 */
export function createTraceExporter(config: ExportConfig): TraceExporter {
  return new TraceExporter(config);
}
