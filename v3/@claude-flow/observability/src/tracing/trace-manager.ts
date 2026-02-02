/**
 * Trace Manager - Span creation, context propagation, parent-child, sampling
 *
 * Features:
 * - Distributed tracing spans
 * - Parent-child relationships
 * - Context propagation
 * - Sampling strategies
 * - Span attributes and events
 * - Low overhead with sampling
 */

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: number;
  traceState?: string;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface Span {
  context: SpanContext;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  links: SpanContext[];
}

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

export type SpanStatus = 'unset' | 'ok' | 'error';

export interface SamplingResult {
  decision: 'record_and_sample' | 'record_only' | 'drop';
}

export type Sampler = (context: SpanContext, name: string) => SamplingResult;

export interface TraceConfig {
  sampler?: Sampler;
  maxSpansPerTrace?: number;
  maxAttributeLength?: number;
}

/**
 * Always sample
 */
export const alwaysOnSampler: Sampler = () => ({
  decision: 'record_and_sample',
});

/**
 * Never sample
 */
export const alwaysOffSampler: Sampler = () => ({
  decision: 'drop',
});

/**
 * Sample with probability
 */
export function probabilitySampler(probability: number): Sampler {
  return () => ({
    decision: Math.random() < probability ? 'record_and_sample' : 'drop',
  });
}

/**
 * Sample based on trace ID
 */
export function traceIdRatioSampler(ratio: number): Sampler {
  return (context) => {
    const traceIdValue = parseInt(context.traceId.slice(-8), 16);
    const threshold = ratio * 0xffffffff;
    return {
      decision: traceIdValue < threshold ? 'record_and_sample' : 'drop',
    };
  };
}

export class TraceManager {
  private spans = new Map<string, Span>();
  private activeSpans = new Map<string, SpanContext>();
  private config: Required<TraceConfig>;
  private currentContext?: SpanContext;

  constructor(config: TraceConfig = {}) {
    this.config = {
      sampler: config.sampler ?? alwaysOnSampler,
      maxSpansPerTrace: config.maxSpansPerTrace ?? 1000,
      maxAttributeLength: config.maxAttributeLength ?? 1024,
    };
  }

  /**
   * Start a new span
   */
  startSpan(
    name: string,
    options: {
      kind?: SpanKind;
      attributes?: Record<string, unknown>;
      parent?: SpanContext;
      links?: SpanContext[];
    } = {}
  ): Span {
    const parent = options.parent ?? this.currentContext;
    const traceId = parent?.traceId ?? this.generateTraceId();
    const spanId = this.generateSpanId();

    const context: SpanContext = {
      traceId,
      spanId,
      parentSpanId: parent?.spanId,
      traceFlags: 1, // Sampled
    };

    // Apply sampling
    const samplingResult = this.config.sampler(context, name);
    if (samplingResult.decision === 'drop') {
      // Return a no-op span
      return this.createNoOpSpan(name, context);
    }

    const span: Span = {
      context,
      name,
      kind: options.kind ?? 'internal',
      startTime: Date.now(),
      status: 'unset',
      attributes: this.sanitizeAttributes(options.attributes ?? {}),
      events: [],
      links: options.links ?? [],
    };

    this.spans.set(spanId, span);
    this.activeSpans.set(spanId, context);

    return span;
  }

  /**
   * End a span
   */
  endSpan(span: Span, status?: SpanStatus): void {
    if (!span.context.spanId) return; // No-op span

    span.endTime = Date.now();
    span.status = status ?? 'ok';
    this.activeSpans.delete(span.context.spanId);
  }

  /**
   * Add an event to a span
   */
  addEvent(span: Span, name: string, attributes?: Record<string, unknown>): void {
    if (!span.context.spanId) return; // No-op span

    span.events.push({
      name,
      timestamp: Date.now(),
      attributes: this.sanitizeAttributes(attributes ?? {}),
    });
  }

  /**
   * Set span attributes
   */
  setAttributes(span: Span, attributes: Record<string, unknown>): void {
    if (!span.context.spanId) return; // No-op span

    Object.assign(span.attributes, this.sanitizeAttributes(attributes));
  }

  /**
   * Set span status
   */
  setStatus(span: Span, status: SpanStatus, message?: string): void {
    if (!span.context.spanId) return; // No-op span

    span.status = status;
    if (message) {
      span.attributes['status.message'] = message;
    }
  }

  /**
   * Record an exception in a span
   */
  recordException(span: Span, exception: Error): void {
    this.addEvent(span, 'exception', {
      'exception.type': exception.name,
      'exception.message': exception.message,
      'exception.stacktrace': exception.stack,
    });
    this.setStatus(span, 'error', exception.message);
  }

  /**
   * Get current active span context
   */
  getCurrentContext(): SpanContext | undefined {
    return this.currentContext;
  }

  /**
   * Set current active span context
   */
  setCurrentContext(context: SpanContext | undefined): void {
    this.currentContext = context;
  }

  /**
   * Run a function with a span context
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, unknown>;
    }
  ): Promise<T> {
    const span = this.startSpan(name, options);
    const previousContext = this.currentContext;
    this.currentContext = span.context;

    try {
      const result = await fn(span);
      this.endSpan(span, 'ok');
      return result;
    } catch (error) {
      if (error instanceof Error) {
        this.recordException(span, error);
      }
      this.endSpan(span, 'error');
      throw error;
    } finally {
      this.currentContext = previousContext;
    }
  }

  /**
   * Run a synchronous function with a span context
   */
  withSpanSync<T>(
    name: string,
    fn: (span: Span) => T,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, unknown>;
    }
  ): T {
    const span = this.startSpan(name, options);
    const previousContext = this.currentContext;
    this.currentContext = span.context;

    try {
      const result = fn(span);
      this.endSpan(span, 'ok');
      return result;
    } catch (error) {
      if (error instanceof Error) {
        this.recordException(span, error);
      }
      this.endSpan(span, 'error');
      throw error;
    } finally {
      this.currentContext = previousContext;
    }
  }

  /**
   * Get all spans
   */
  getSpans(): Span[] {
    return Array.from(this.spans.values());
  }

  /**
   * Get spans by trace ID
   */
  getSpansByTrace(traceId: string): Span[] {
    return this.getSpans().filter((span) => span.context.traceId === traceId);
  }

  /**
   * Get a span by ID
   */
  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Clear all spans
   */
  clear(): void {
    this.spans.clear();
    this.activeSpans.clear();
  }

  /**
   * Clear spans older than a certain time
   */
  clearOldSpans(maxAge: number): void {
    const now = Date.now();
    for (const [spanId, span] of this.spans) {
      if (span.endTime && now - span.endTime > maxAge) {
        this.spans.delete(spanId);
      }
    }
  }

  /**
   * Generate a trace ID
   */
  private generateTraceId(): string {
    return this.randomHex(32);
  }

  /**
   * Generate a span ID
   */
  private generateSpanId(): string {
    return this.randomHex(16);
  }

  /**
   * Generate random hex string
   */
  private randomHex(length: number): string {
    const bytes = new Uint8Array(length / 2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Sanitize attributes
   */
  private sanitizeAttributes(
    attributes: Record<string, unknown>
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === 'string' && value.length > this.config.maxAttributeLength) {
        sanitized[key] = value.slice(0, this.config.maxAttributeLength) + '...';
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.slice(0, 100); // Limit array size
      } else {
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }

  /**
   * Create a no-op span (not recorded)
   */
  private createNoOpSpan(name: string, context: SpanContext): Span {
    return {
      context: { ...context, spanId: '' }, // Empty span ID indicates no-op
      name,
      kind: 'internal',
      startTime: Date.now(),
      status: 'unset',
      attributes: {},
      events: [],
      links: [],
    };
  }

  /**
   * Get trace tree structure
   */
  getTraceTree(traceId: string): Span[] {
    const spans = this.getSpansByTrace(traceId);
    const spanMap = new Map(spans.map((s) => [s.context.spanId, s]));
    const roots: Span[] = [];

    // Build tree structure
    for (const span of spans) {
      if (!span.context.parentSpanId) {
        roots.push(span);
      }
    }

    return roots;
  }
}

/**
 * Global trace manager instance
 */
export const traceManager = new TraceManager();

/**
 * Create a new trace manager
 */
export function createTraceManager(config?: TraceConfig): TraceManager {
  return new TraceManager(config);
}
