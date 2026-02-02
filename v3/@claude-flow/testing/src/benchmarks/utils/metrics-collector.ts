/**
 * Metrics Collector
 *
 * Collects CPU, memory, event loop, and GC metrics during benchmark execution.
 * Provides real-time system resource monitoring.
 *
 * @module @claude-flow/testing/benchmarks/utils/metrics-collector
 */

import { performance, PerformanceObserver } from 'perf_hooks';

export interface SystemMetrics {
  /** CPU usage percentage (0-100) */
  cpuUsage: number;
  /** Memory usage in MB */
  memoryUsageMB: number;
  /** Heap used in MB */
  heapUsedMB: number;
  /** Heap total in MB */
  heapTotalMB: number;
  /** External memory in MB */
  externalMB: number;
  /** Array buffers in MB */
  arrayBuffersMB: number;
  /** Event loop lag in ms */
  eventLoopLag: number;
  /** Event loop utilization (0-1) */
  eventLoopUtilization: number;
  /** Timestamp */
  timestamp: Date;
}

export interface GCMetrics {
  /** Total GC pauses */
  totalPauses: number;
  /** Total GC time in ms */
  totalTimeMs: number;
  /** Average GC pause in ms */
  avgPauseMs: number;
  /** Max GC pause in ms */
  maxPauseMs: number;
  /** GC by type */
  byType: Record<string, { count: number; totalTime: number }>;
}

export interface MetricsSnapshot {
  system: SystemMetrics;
  gc: GCMetrics;
  marks: Map<string, number>;
  measures: Map<string, number>;
}

/**
 * Metrics Collector class
 */
export class MetricsCollector {
  private startCpuUsage: NodeJS.CpuUsage;
  private startTime: number;
  private lastCheckTime: number;
  private eventLoopLagInterval?: NodeJS.Timeout;
  private lastEventLoopCheck: number = Date.now();
  private eventLoopLag: number = 0;

  // GC tracking
  private gcMetrics: {
    pauses: number[];
    types: Map<string, { count: number; totalTime: number }>;
  } = {
    pauses: [],
    types: new Map(),
  };

  private gcObserver?: PerformanceObserver;

  // Performance marks and measures
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number> = new Map();

  constructor() {
    this.startCpuUsage = process.cpuUsage();
    this.startTime = Date.now();
    this.lastCheckTime = Date.now();
    this.setupGCObserver();
    this.startEventLoopMonitoring();
  }

  /**
   * Setup GC observer to track garbage collection
   */
  private setupGCObserver(): void {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            const duration = entry.duration;
            this.gcMetrics.pauses.push(duration);

            // Track by GC kind
            const kind = (entry as any).kind || 'unknown';
            const kindName = this.getGCKindName(kind);

            if (!this.gcMetrics.types.has(kindName)) {
              this.gcMetrics.types.set(kindName, { count: 0, totalTime: 0 });
            }

            const stats = this.gcMetrics.types.get(kindName)!;
            stats.count++;
            stats.totalTime += duration;
          }
        }
      });

      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch (error) {
      // GC observation may not be available in all environments
      console.warn('GC observation not available:', error);
    }
  }

  /**
   * Convert GC kind number to readable name
   */
  private getGCKindName(kind: number): string {
    const kinds: Record<number, string> = {
      1: 'Scavenge',
      2: 'MarkSweepCompact',
      4: 'IncrementalMarking',
      8: 'ProcessWeakCallbacks',
      15: 'All',
    };
    return kinds[kind] || `Unknown(${kind})`;
  }

  /**
   * Start monitoring event loop lag
   */
  private startEventLoopMonitoring(): void {
    this.eventLoopLagInterval = setInterval(() => {
      const now = Date.now();
      const expectedDelay = 100; // Check every 100ms
      const actualDelay = now - this.lastEventLoopCheck;
      this.eventLoopLag = Math.max(0, actualDelay - expectedDelay);
      this.lastEventLoopCheck = now;
    }, 100);
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const now = Date.now();
    const cpuUsage = process.cpuUsage(this.startCpuUsage);
    const elapsedTime = (now - this.lastCheckTime) * 1000; // Convert to microseconds

    // Calculate CPU percentage
    const totalCpuTime = cpuUsage.user + cpuUsage.system;
    const cpuPercent = (totalCpuTime / elapsedTime) * 100;

    const memUsage = process.memoryUsage();

    // Event loop utilization
    const elu = (performance as any).eventLoopUtilization?.() || { utilization: 0 };

    return {
      cpuUsage: Math.min(100, cpuPercent),
      memoryUsageMB: memUsage.rss / 1024 / 1024,
      heapUsedMB: memUsage.heapUsed / 1024 / 1024,
      heapTotalMB: memUsage.heapTotal / 1024 / 1024,
      externalMB: memUsage.external / 1024 / 1024,
      arrayBuffersMB: (memUsage as any).arrayBuffers / 1024 / 1024 || 0,
      eventLoopLag: this.eventLoopLag,
      eventLoopUtilization: elu.utilization,
      timestamp: new Date(),
    };
  }

  /**
   * Get GC metrics
   */
  getGCMetrics(): GCMetrics {
    const totalPauses = this.gcMetrics.pauses.length;
    const totalTime = this.gcMetrics.pauses.reduce((sum, p) => sum + p, 0);
    const avgPause = totalPauses > 0 ? totalTime / totalPauses : 0;
    const maxPause = totalPauses > 0 ? Math.max(...this.gcMetrics.pauses) : 0;

    const byType: Record<string, { count: number; totalTime: number }> = {};
    this.gcMetrics.types.forEach((stats, type) => {
      byType[type] = { ...stats };
    });

    return {
      totalPauses,
      totalTimeMs: totalTime,
      avgPauseMs: avgPause,
      maxPauseMs: maxPause,
      byType,
    };
  }

  /**
   * Mark a performance point
   */
  mark(name: string): void {
    const timestamp = performance.now();
    this.marks.set(name, timestamp);
    performance.mark(name);
  }

  /**
   * Measure between two marks
   */
  measure(name: string, startMark: string, endMark: string): number {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);

    if (start === undefined || end === undefined) {
      throw new Error(`Marks not found: ${startMark} or ${endMark}`);
    }

    const duration = end - start;
    this.measures.set(name, duration);

    try {
      performance.measure(name, startMark, endMark);
    } catch (error) {
      // Marks may have been cleared
    }

    return duration;
  }

  /**
   * Get snapshot of all metrics
   */
  getSnapshot(): MetricsSnapshot {
    return {
      system: this.getSystemMetrics(),
      gc: this.getGCMetrics(),
      marks: new Map(this.marks),
      measures: new Map(this.measures),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.startCpuUsage = process.cpuUsage();
    this.startTime = Date.now();
    this.lastCheckTime = Date.now();
    this.gcMetrics = {
      pauses: [],
      types: new Map(),
    };
    this.marks.clear();
    this.measures.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }

  /**
   * Print formatted metrics
   */
  printMetrics(): void {
    const system = this.getSystemMetrics();
    const gc = this.getGCMetrics();

    console.log('\n📊 System Metrics:');
    console.log(`   CPU Usage:     ${system.cpuUsage.toFixed(2)}%`);
    console.log(`   Memory (RSS):  ${system.memoryUsageMB.toFixed(2)} MB`);
    console.log(`   Heap Used:     ${system.heapUsedMB.toFixed(2)} MB`);
    console.log(`   Heap Total:    ${system.heapTotalMB.toFixed(2)} MB`);
    console.log(`   Event Loop Lag: ${system.eventLoopLag.toFixed(2)} ms`);
    console.log(`   EL Utilization: ${(system.eventLoopUtilization * 100).toFixed(2)}%`);

    console.log('\n🗑️  GC Metrics:');
    console.log(`   Total Pauses:  ${gc.totalPauses}`);
    console.log(`   Total Time:    ${gc.totalTimeMs.toFixed(2)} ms`);
    console.log(`   Avg Pause:     ${gc.avgPauseMs.toFixed(2)} ms`);
    console.log(`   Max Pause:     ${gc.maxPauseMs.toFixed(2)} ms`);

    if (Object.keys(gc.byType).length > 0) {
      console.log('   By Type:');
      Object.entries(gc.byType).forEach(([type, stats]) => {
        console.log(`      ${type}: ${stats.count} (${stats.totalTime.toFixed(2)}ms)`);
      });
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.eventLoopLagInterval) {
      clearInterval(this.eventLoopLagInterval);
    }
    if (this.gcObserver) {
      this.gcObserver.disconnect();
    }
  }
}

/**
 * Create a metrics collector for a benchmark
 */
export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}

/**
 * Run a function with metrics collection
 */
export async function withMetrics<T>(
  fn: (collector: MetricsCollector) => Promise<T>
): Promise<{ result: T; metrics: MetricsSnapshot }> {
  const collector = new MetricsCollector();

  try {
    collector.mark('start');
    const result = await fn(collector);
    collector.mark('end');
    collector.measure('total', 'start', 'end');

    const metrics = collector.getSnapshot();
    return { result, metrics };
  } finally {
    collector.destroy();
  }
}
