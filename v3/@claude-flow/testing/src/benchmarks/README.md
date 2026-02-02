# Claude Flow V3 - Performance Benchmarking Suite

Comprehensive benchmarking suite with 30+ benchmarks covering all critical performance aspects of claude-flow v3.

## Overview

This benchmarking suite provides:

- **30+ Benchmarks** across 5 categories
- **Statistical Analysis** (mean, median, p95, p99, std dev)
- **V2 Baseline Comparison** to track improvements
- **System Metrics** (CPU, memory, event loop, GC)
- **Vitest Integration** for CI/CD pipelines
- **Comparison Reports** with speedup calculations

## Benchmark Categories

### 1. Agent Benchmarks (`agent-benchmarks.ts`)

Tests agent lifecycle operations:

- **Agent Spawn** - Target: <100ms
- **Agent Termination**
- **Pool Creation** (10, 100 agents)
- **Pool Scaling** (10 to 100 agents)
- **Concurrent Operations** (50+ agents)
- **Health Checks**
- **Task Assignment**

**Key Targets:**
- Agent spawn: <100ms
- Pool scaling: Linear performance

### 2. Task Benchmarks (`task-benchmarks.ts`)

Tests task execution operations:

- **Task Assignment** - Target: <10ms
- **Task Throughput** - Target: 100+ tasks/min
- **Task Lifecycle** (create → assign → start → complete)
- **Dependency Graphs**
- **Concurrent Task Creation**
- **Priority Sorting**
- **Retry Mechanisms**
- **Metadata Operations**

**Key Targets:**
- Task assignment: <10ms
- Throughput: 100+ tasks/minute

### 3. Memory Benchmarks (`memory-benchmarks.ts`)

Tests vector search and memory operations:

- **HNSW Search** at 1K/10K/100K vectors - Target: 150x-12,500x faster
- **Index Building**
- **Batch Insert** (1K, 10K vectors)
- **Index Rebuild**
- **Point Removal**
- **Filtered Search**
- **Distance Metrics** (cosine, euclidean, dot, manhattan)
- **Quantization** (scalar, binary, product)

**Key Targets:**
- 1K vectors: 150x faster than brute force
- 10K vectors: 1,000x faster
- 100K vectors: 12,500x faster

### 4. Coordination Benchmarks (`coordination-benchmarks.ts`)

Tests multi-agent coordination:

- **Session Management**
- **Message Passing Latency**
- **Broadcast Messages**
- **Consensus Protocols** (4/8/16 nodes)
- **Swarm Coordination** (10/50 agents)
- **Leader Election**
- **Event Propagation**

**Key Targets:**
- Message latency: <20ms
- Consensus 4 nodes: <50ms
- Consensus 8 nodes: <100ms
- Consensus 16 nodes: <200ms

### 5. Provider Benchmarks (`provider-benchmarks.ts`)

Tests LLM provider operations:

- **Provider Initialization**
- **Request Latency**
- **Streaming Performance**
- **Concurrent Requests**
- **Health Checks**
- **Circuit Breaker Overhead**
- **Failover Time**
- **Cost Calculation**

**Key Targets:**
- Init: <300ms
- Health check: <50ms
- Failover: <100ms

## Usage

### Run All Benchmarks

```typescript
import { runAllBenchmarks } from '@claude-flow/testing';

const results = await runAllBenchmarks({ verbose: true });

console.log(`Completed ${results.totalBenchmarks} benchmarks`);
console.log(`Total time: ${(results.totalTime / 1000).toFixed(2)}s`);
```

### Run Individual Suite

```typescript
import {
  runAgentBenchmarks,
  runTaskBenchmarks,
  runMemoryBenchmarks,
} from '@claude-flow/testing';

// Run only agent benchmarks
const agentResults = await runAgentBenchmarks();

// Or individual benchmarks
import { benchAgentSpawn } from '@claude-flow/testing';
await benchAgentSpawn();
```

### With Vitest

```typescript
import { describe, bench } from 'vitest';
import { benchAgentSpawn } from '@claude-flow/testing';

describe('Agent Performance', () => {
  bench('agent spawn', async () => {
    await benchAgentSpawn();
  });
});
```

### Run with CLI

```bash
# Run all benchmarks
npm run bench

# Run specific suite
npm run bench -- agent

# With verbose output
npm run bench -- --verbose

# Export results
npm run bench -- --output=results.json
```

## Utilities

### Benchmark Runner

The benchmark runner provides:

- **Warmup Phase** - Stabilize measurements (default: 5 iterations)
- **Statistical Analysis** - Mean, median, p95, p99, std dev
- **Baseline Comparison** - Compare against V2 or previous runs
- **Progress Tracking** - Visual progress indicators

```typescript
import { runBenchmark } from '@claude-flow/testing';

const result = await runBenchmark(
  'My Benchmark',
  async () => {
    // Your benchmark code
  },
  {
    warmup: 10,
    iterations: 100,
    timeout: 30000,
    verbose: true,
  }
);

console.log(`Mean: ${result.mean}ms`);
console.log(`p95: ${result.p95}ms`);
console.log(`Ops/sec: ${result.opsPerSecond}`);
```

### Metrics Collector

Collect system metrics during benchmark execution:

```typescript
import { withMetrics } from '@claude-flow/testing';

const { result, metrics } = await withMetrics(async (collector) => {
  collector.mark('start');

  // Your code here

  collector.mark('end');
  collector.measure('total', 'start', 'end');

  return someResult;
});

console.log(`CPU Usage: ${metrics.system.cpuUsage}%`);
console.log(`Memory: ${metrics.system.memoryUsageMB}MB`);
console.log(`Event Loop Lag: ${metrics.system.eventLoopLag}ms`);
console.log(`GC Pauses: ${metrics.gc.totalPauses}`);
```

## Baseline Comparison

### V2 Baseline

The `reports/baseline.json` file contains V2 performance metrics for comparison.

Key V2 vs V3 targets:

| Metric | V2 | V3 Target | Speedup |
|--------|-----|-----------|---------|
| Agent Spawn | 125ms | <100ms | 1.25x |
| Task Assignment | 15.8ms | <10ms | 1.58x |
| Vector Search (1K) | 1500ms | 10ms | 150x |
| Vector Search (10K) | 15000ms | 15ms | 1000x |
| Vector Search (100K) | 150000ms | 12ms | 12,500x |

### Compare Results

```typescript
import { compareWithBaseline } from '@claude-flow/testing';

const baseline = await compareWithBaseline();

if (baseline) {
  console.log('Comparing with baseline...');
  // Comparison logic
}
```

## Report Generation

### Summary Table

```typescript
import { generateSummaryTable } from '@claude-flow/testing';

const suite = await runAgentBenchmarks();
const table = generateSummaryTable(suite);

console.log(table);
```

Output:
```
| Benchmark | Mean (ms) | Median (ms) | p95 (ms) | p99 (ms) | Ops/sec |
|-----------|-----------|-------------|----------|----------|---------|
| Agent Spawn | 85.23 | 82.50 | 120.00 | 145.00 | 11.73 |
| ...
```

### Markdown Report

```typescript
import { generateMarkdownReport } from '@claude-flow/testing';

const results = await runAllBenchmarks();
const markdown = generateMarkdownReport(results);

// Save to file
fs.writeFileSync('BENCHMARK_REPORT.md', markdown);
```

### Export to JSON

```typescript
import { exportSuiteResults } from '@claude-flow/testing';

const suite = await runAgentBenchmarks();
exportSuiteResults(suite, './reports/agent-results.json');
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Performance Benchmarks

on:
  push:
    branches: [main]
  pull_request:

jobs:
  benchmark:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run benchmarks
        run: npm run bench -- --output=results.json

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: results.json

      - name: Compare with baseline
        run: node scripts/compare-benchmarks.js
```

## Performance Targets Summary

### Critical Targets

- ✅ **Agent Spawn**: <100ms (V2: 125ms)
- ✅ **Task Assignment**: <10ms (V2: 15.8ms)
- ✅ **HNSW Search (1K)**: 150x faster (V2: 1500ms → V3: 10ms)
- ✅ **HNSW Search (10K)**: 1000x faster (V2: 15000ms → V3: 15ms)
- ✅ **HNSW Search (100K)**: 12,500x faster (V2: 150000ms → V3: 12ms)
- ✅ **Task Throughput**: 100+ tasks/min (V2: 40 tasks/min)

### Optimization Priorities

1. **Memory Operations** - HNSW index provides massive speedup
2. **Task Throughput** - 2.5x improvement target
3. **Agent Pool Scaling** - Linear scaling to 100+ agents
4. **Consensus Latency** - Sub-linear growth with node count

## Best Practices

### 1. Warmup Phase

Always include warmup iterations to stabilize JIT compilation:

```typescript
await runBenchmark('My Test', fn, {
  warmup: 10, // Stabilize first
  iterations: 100,
});
```

### 2. Sufficient Iterations

Use enough iterations for statistical significance:

- Fast operations (<10ms): 1000+ iterations
- Medium operations (10-100ms): 100+ iterations
- Slow operations (>100ms): 10+ iterations

### 3. Consistent Environment

- Close background apps
- Use consistent hardware
- Run multiple times
- Compare p95/p99, not just mean

### 4. Baseline Updates

Update baseline after major optimizations:

```bash
npm run bench -- --update-baseline
```

## Troubleshooting

### High Variance

If benchmarks show high variance (large std dev):

1. Increase warmup iterations
2. Close background processes
3. Check for GC pauses (use metrics collector)
4. Use `--gc-now` flag to force GC between runs

### Timeout Errors

If benchmarks timeout:

1. Increase timeout: `{ timeout: 60000 }`
2. Reduce dataset size
3. Check for infinite loops
4. Profile with `--inspect` flag

### Memory Issues

If running out of memory:

1. Run suites separately
2. Reduce concurrent operations
3. Force GC between benchmarks
4. Use smaller test datasets

## Contributing

When adding new benchmarks:

1. Add to appropriate category file
2. Update this README
3. Add to `index.ts` exports
4. Run full suite to ensure no regressions
5. Update baseline if needed

## License

MIT - See LICENSE file for details
