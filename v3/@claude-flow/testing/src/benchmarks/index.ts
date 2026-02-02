/**
 * Claude Flow V3 Performance Benchmarking Suite
 *
 * Comprehensive benchmarking suite with 30+ benchmarks covering:
 * - Agent operations (spawn, terminate, pool scaling, concurrent ops)
 * - Task operations (assignment, throughput, graph execution)
 * - Memory operations (HNSW search, 10K/100K/1M entries)
 * - Coordination (session, message, consensus with 4/8/16 nodes)
 * - Provider operations (init, request, streaming, failover)
 *
 * Features:
 * - Warmup phase for stable measurements
 * - Statistical analysis (mean, median, p95, p99)
 * - Comparison reports against V2 baseline
 * - CPU, memory, event loop, and GC metrics collection
 * - Vitest bench integration
 *
 * @module @claude-flow/testing/benchmarks
 */

// Export benchmark runners
export {
  runAgentBenchmarks,
  benchAgentSpawn,
  benchAgentTerminate,
  benchAgentPoolCreation,
  benchAgentPoolScaling,
  benchConcurrentAgentSpawn,
  benchAgentHealthCheck,
  benchAgentTaskAssignment,
} from './agent-benchmarks.js';

export {
  runTaskBenchmarks,
  benchTaskCreation,
  benchTaskAssignment,
  benchTaskLifecycle,
  benchTaskThroughput,
  benchTaskDependencyGraph,
  benchConcurrentTaskCreation,
  benchTaskPrioritySorting,
  benchTaskRetry,
  benchTaskMetadata,
} from './task-benchmarks.js';

export {
  runMemoryBenchmarks,
  benchHNSWIndexCreation,
  benchHNSWSearchSmall,
  benchHNSWSearchMedium,
  benchHNSWSearchLarge,
  benchHNSWBatchInsert,
  benchHNSWRebuild,
  benchHNSWRemove,
  benchHNSWSearchWithFilters,
  benchDistanceMetrics,
  benchHNSWQuantization,
} from './memory-benchmarks.js';

export {
  runCoordinationBenchmarks,
  benchSessionCreation,
  benchSessionUpdate,
  benchConcurrentSessions,
  benchMessagePassing,
  benchBroadcastMessage,
  benchConsensus4Nodes,
  benchConsensus8Nodes,
  benchConsensus16Nodes,
  benchSwarmCoordination,
  benchLeaderElection,
  benchEventPropagation,
} from './coordination-benchmarks.js';

export {
  runProviderBenchmarks,
  benchProviderInit,
  benchProviderRequest,
  benchProviderStreaming,
  benchConcurrentRequests,
  benchProviderHealthCheck,
  benchCircuitBreaker,
  benchProviderFailover,
  benchMultiProviderInit,
  benchCostCalculation,
  benchProviderEvents,
} from './provider-benchmarks.js';

// Export utilities
export {
  runBenchmark,
  runBenchmarkSuite,
  printBenchmarkResult,
  compareBenchmarks,
  generateSummaryTable,
  exportSuiteResults,
  type BenchmarkOptions,
  type BenchmarkResult,
  type BenchmarkSuite,
} from './utils/benchmark-runner.js';

export {
  MetricsCollector,
  createMetricsCollector,
  withMetrics,
  type SystemMetrics,
  type GCMetrics,
  type MetricsSnapshot,
} from './utils/metrics-collector.js';

/**
 * Run all benchmark suites
 */
export async function runAllBenchmarks(options?: { verbose?: boolean }) {
  const { runAgentBenchmarks } = await import('./agent-benchmarks.js');
  const { runTaskBenchmarks } = await import('./task-benchmarks.js');
  const { runMemoryBenchmarks } = await import('./memory-benchmarks.js');
  const { runCoordinationBenchmarks } = await import('./coordination-benchmarks.js');
  const { runProviderBenchmarks } = await import('./provider-benchmarks.js');

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   Claude Flow V3 - Performance Benchmarking Suite         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const allResults = [];
  const startTime = Date.now();

  // Run each suite
  console.log('📦 Running benchmark suites...\n');

  const agentResults = await runAgentBenchmarks();
  allResults.push(agentResults);

  const taskResults = await runTaskBenchmarks();
  allResults.push(taskResults);

  const memoryResults = await runMemoryBenchmarks();
  allResults.push(memoryResults);

  const coordResults = await runCoordinationBenchmarks();
  allResults.push(coordResults);

  const providerResults = await runProviderBenchmarks();
  allResults.push(providerResults);

  const totalTime = Date.now() - startTime;

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    BENCHMARK SUMMARY                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let totalBenchmarks = 0;
  allResults.forEach(suite => {
    console.log(`\n📊 ${suite.name}`);
    console.log(`   Benchmarks: ${suite.benchmarks.length}`);
    console.log(`   Duration: ${(suite.totalTime / 1000).toFixed(2)}s`);
    totalBenchmarks += suite.benchmarks.length;

    // Show top 3 fastest
    const sorted = [...suite.benchmarks].sort((a, b) => a.mean - b.mean);
    console.log(`   Fastest:`);
    sorted.slice(0, 3).forEach(b => {
      console.log(`      - ${b.name}: ${b.mean.toFixed(2)}ms`);
    });
  });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Completed ${totalBenchmarks} benchmarks in ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  return {
    suites: allResults,
    totalBenchmarks,
    totalTime,
    timestamp: new Date(),
  };
}

/**
 * Load and compare against baseline
 */
export async function compareWithBaseline() {
  const fs = await import('fs');
  const path = await import('path');

  const baselinePath = path.join(__dirname, 'reports', 'baseline.json');

  if (!fs.existsSync(baselinePath)) {
    console.warn('⚠️  Baseline not found. Run benchmarks first to establish baseline.');
    return null;
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

  console.log('\n📊 Comparing with V2 baseline...\n');
  console.log(`Baseline version: ${baseline.version}`);
  console.log(`Baseline date: ${baseline.timestamp}\n`);

  return baseline;
}

/**
 * Generate markdown report
 */
export function generateMarkdownReport(results: any): string {
  const lines: string[] = [];

  lines.push('# Claude Flow V3 - Performance Benchmark Report\n');
  lines.push(`**Generated:** ${new Date().toISOString()}\n`);
  lines.push(`**Total Benchmarks:** ${results.totalBenchmarks}`);
  lines.push(`**Total Duration:** ${(results.totalTime / 1000).toFixed(2)}s\n`);

  lines.push('## Summary\n');
  lines.push('| Suite | Benchmarks | Duration (s) |');
  lines.push('|-------|------------|--------------|');

  results.suites.forEach((suite: any) => {
    lines.push(
      `| ${suite.name} | ${suite.benchmarks.length} | ${(suite.totalTime / 1000).toFixed(2)} |`
    );
  });

  lines.push('\n## Detailed Results\n');

  results.suites.forEach((suite: any) => {
    lines.push(`### ${suite.name}\n`);
    lines.push('| Benchmark | Mean (ms) | Median (ms) | p95 (ms) | p99 (ms) | Ops/sec |');
    lines.push('|-----------|-----------|-------------|----------|----------|---------|');

    suite.benchmarks.forEach((bench: any) => {
      lines.push(
        `| ${bench.name} | ${bench.mean.toFixed(2)} | ${bench.median.toFixed(2)} | ${bench.p95.toFixed(2)} | ${bench.p99.toFixed(2)} | ${bench.opsPerSecond.toFixed(2)} |`
      );
    });

    lines.push('');
  });

  return lines.join('\n');
}

// Default export
export default {
  runAllBenchmarks,
  compareWithBaseline,
  generateMarkdownReport,
};
