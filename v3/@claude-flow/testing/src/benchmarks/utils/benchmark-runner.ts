/**
 * Benchmark Runner Utility
 *
 * Provides warmup, statistical analysis, and consistent benchmark execution.
 * Supports percentile calculations (p50, p95, p99) and comparative analysis.
 *
 * @module @claude-flow/testing/benchmarks/utils/benchmark-runner
 */

export interface BenchmarkOptions {
  /** Number of warmup iterations (default: 5) */
  warmup?: number;
  /** Number of test iterations (default: 100) */
  iterations?: number;
  /** Timeout per iteration in ms (default: 30000) */
  timeout?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Baseline to compare against */
  baseline?: BenchmarkResult;
}

export interface BenchmarkResult {
  /** Benchmark name */
  name: string;
  /** Mean execution time (ms) */
  mean: number;
  /** Median execution time (ms) */
  median: number;
  /** 95th percentile (ms) */
  p95: number;
  /** 99th percentile (ms) */
  p99: number;
  /** Minimum time (ms) */
  min: number;
  /** Maximum time (ms) */
  max: number;
  /** Standard deviation */
  stdDev: number;
  /** Operations per second */
  opsPerSecond: number;
  /** Total iterations */
  iterations: number;
  /** Comparison to baseline (if provided) */
  comparison?: {
    faster: boolean;
    speedup: number;
    improvement: string;
  };
  /** Raw timing data */
  timings: number[];
}

export interface BenchmarkSuite {
  name: string;
  benchmarks: BenchmarkResult[];
  totalTime: number;
  timestamp: Date;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((sorted.length * p) / 100) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate standard deviation
 */
function stdDev(values: number[], mean: number): number {
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Run a benchmark with warmup and statistics
 */
export async function runBenchmark(
  name: string,
  fn: () => Promise<void> | void,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const {
    warmup = 5,
    iterations = 100,
    timeout = 30000,
    verbose = false,
    baseline,
  } = options;

  if (verbose) {
    console.log(`\n🏃 Running benchmark: ${name}`);
    console.log(`   Warmup: ${warmup} iterations`);
    console.log(`   Test: ${iterations} iterations`);
  }

  // Warmup phase
  if (verbose) console.log('   Warming up...');
  for (let i = 0; i < warmup; i++) {
    await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Warmup timeout')), timeout)
      ),
    ]);
  }

  // Measurement phase
  if (verbose) console.log('   Measuring...');
  const timings: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Iteration timeout')), timeout)
      ),
    ]);

    const duration = performance.now() - start;
    timings.push(duration);

    if (verbose && (i + 1) % 10 === 0) {
      process.stdout.write(`\r   Progress: ${i + 1}/${iterations}`);
    }
  }

  if (verbose) console.log('\n   Calculating statistics...');

  // Calculate statistics
  const sorted = [...timings].sort((a, b) => a - b);
  const mean = timings.reduce((sum, t) => sum + t, 0) / timings.length;
  const median = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sd = stdDev(timings, mean);
  const opsPerSecond = 1000 / mean;

  const result: BenchmarkResult = {
    name,
    mean,
    median,
    p95,
    p99,
    min,
    max,
    stdDev: sd,
    opsPerSecond,
    iterations,
    timings,
  };

  // Compare to baseline if provided
  if (baseline) {
    const speedup = baseline.mean / mean;
    result.comparison = {
      faster: mean < baseline.mean,
      speedup,
      improvement: `${((speedup - 1) * 100).toFixed(1)}%`,
    };
  }

  if (verbose) {
    printBenchmarkResult(result);
  }

  return result;
}

/**
 * Run multiple benchmarks as a suite
 */
export async function runBenchmarkSuite(
  suiteName: string,
  benchmarks: Array<{
    name: string;
    fn: () => Promise<void> | void;
    options?: BenchmarkOptions;
  }>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkSuite> {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Benchmark Suite: ${suiteName}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const suiteStart = performance.now();
  const results: BenchmarkResult[] = [];

  for (const benchmark of benchmarks) {
    const result = await runBenchmark(
      benchmark.name,
      benchmark.fn,
      { ...options, ...benchmark.options }
    );
    results.push(result);
  }

  const totalTime = performance.now() - suiteStart;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Suite completed in ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  return {
    name: suiteName,
    benchmarks: results,
    totalTime,
    timestamp: new Date(),
  };
}

/**
 * Print formatted benchmark result
 */
export function printBenchmarkResult(result: BenchmarkResult): void {
  console.log(`\n   📈 ${result.name}`);
  console.log(`      Mean:     ${result.mean.toFixed(3)}ms`);
  console.log(`      Median:   ${result.median.toFixed(3)}ms`);
  console.log(`      p95:      ${result.p95.toFixed(3)}ms`);
  console.log(`      p99:      ${result.p99.toFixed(3)}ms`);
  console.log(`      Min:      ${result.min.toFixed(3)}ms`);
  console.log(`      Max:      ${result.max.toFixed(3)}ms`);
  console.log(`      StdDev:   ${result.stdDev.toFixed(3)}ms`);
  console.log(`      Ops/sec:  ${result.opsPerSecond.toFixed(2)}`);

  if (result.comparison) {
    const { faster, speedup, improvement } = result.comparison;
    const icon = faster ? '⚡' : '🐌';
    const verb = faster ? 'faster' : 'slower';
    console.log(`      ${icon} ${speedup.toFixed(2)}x ${verb} (${improvement})`);
  }
}

/**
 * Compare two benchmark results
 */
export function compareBenchmarks(
  current: BenchmarkResult,
  baseline: BenchmarkResult
): {
  faster: boolean;
  speedup: number;
  improvement: string;
  meanDiff: number;
  p95Diff: number;
} {
  const speedup = baseline.mean / current.mean;
  const faster = current.mean < baseline.mean;
  const improvement = `${((speedup - 1) * 100).toFixed(1)}%`;
  const meanDiff = current.mean - baseline.mean;
  const p95Diff = current.p95 - baseline.p95;

  return {
    faster,
    speedup,
    improvement,
    meanDiff,
    p95Diff,
  };
}

/**
 * Generate summary table for suite
 */
export function generateSummaryTable(suite: BenchmarkSuite): string {
  const header = '| Benchmark | Mean (ms) | Median (ms) | p95 (ms) | p99 (ms) | Ops/sec |';
  const separator = '|-----------|-----------|-------------|----------|----------|---------|';

  const rows = suite.benchmarks.map(result => {
    return `| ${result.name} | ${result.mean.toFixed(2)} | ${result.median.toFixed(2)} | ${result.p95.toFixed(2)} | ${result.p99.toFixed(2)} | ${result.opsPerSecond.toFixed(2)} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Export suite results to JSON
 */
export function exportSuiteResults(suite: BenchmarkSuite, filepath: string): void {
  const fs = require('fs');
  const path = require('path');

  // Ensure directory exists
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write results
  fs.writeFileSync(filepath, JSON.stringify(suite, null, 2));
  console.log(`\n💾 Results exported to: ${filepath}`);
}
