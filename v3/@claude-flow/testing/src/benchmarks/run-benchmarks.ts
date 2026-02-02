#!/usr/bin/env node
/**
 * Benchmark Runner CLI
 *
 * Command-line interface for running claude-flow v3 benchmarks.
 *
 * Usage:
 *   npm run bench                    # Run all benchmarks
 *   npm run bench -- agent           # Run agent benchmarks only
 *   npm run bench -- --verbose       # Verbose output
 *   npm run bench -- --output=file   # Export to file
 *
 * @module @claude-flow/testing/benchmarks/run-benchmarks
 */

import { runAllBenchmarks, compareWithBaseline, generateMarkdownReport, exportSuiteResults } from './index.js';
import {
  runAgentBenchmarks,
  runTaskBenchmarks,
  runMemoryBenchmarks,
  runCoordinationBenchmarks,
  runProviderBenchmarks,
} from './index.js';
import * as fs from 'fs';
import * as path from 'path';

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  output: args.find(a => a.startsWith('--output='))?.split('=')[1],
  compare: args.includes('--compare') || args.includes('-c'),
  updateBaseline: args.includes('--update-baseline'),
  markdown: args.includes('--markdown') || args.includes('-m'),
  suite: args.find(a => !a.startsWith('-')), // First non-flag argument
};

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Claude Flow V3 - Performance Benchmark Suite            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let results;

  // Run specific suite or all
  if (options.suite) {
    console.log(`Running ${options.suite} benchmarks...\n`);

    switch (options.suite.toLowerCase()) {
      case 'agent':
        results = { suites: [await runAgentBenchmarks()], totalBenchmarks: 0, totalTime: 0 };
        break;
      case 'task':
        results = { suites: [await runTaskBenchmarks()], totalBenchmarks: 0, totalTime: 0 };
        break;
      case 'memory':
        results = { suites: [await runMemoryBenchmarks()], totalBenchmarks: 0, totalTime: 0 };
        break;
      case 'coordination':
        results = { suites: [await runCoordinationBenchmarks()], totalBenchmarks: 0, totalTime: 0 };
        break;
      case 'provider':
        results = { suites: [await runProviderBenchmarks()], totalBenchmarks: 0, totalTime: 0 };
        break;
      default:
        console.error(`Unknown suite: ${options.suite}`);
        console.error('Available suites: agent, task, memory, coordination, provider');
        process.exit(1);
    }

    // Calculate totals
    results.totalBenchmarks = results.suites[0].benchmarks.length;
    results.totalTime = results.suites[0].totalTime;
  } else {
    console.log('Running all benchmark suites...\n');
    results = await runAllBenchmarks({ verbose: options.verbose });
  }

  // Compare with baseline if requested
  if (options.compare) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Comparing with V2 Baseline');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const baseline = await compareWithBaseline();

    if (baseline) {
      // Show key comparisons
      console.log('Key Improvements:');

      const improvements = [
        {
          name: 'Agent Spawn',
          v2: baseline.benchmarks.agent.spawn.mean,
          v3: results.suites[0]?.benchmarks.find((b: any) => b.name.includes('Spawn'))?.mean,
          target: 100,
        },
        {
          name: 'Task Assignment',
          v2: baseline.benchmarks.task.assignment.mean,
          v3: results.suites[1]?.benchmarks.find((b: any) => b.name.includes('Assignment'))?.mean,
          target: 10,
        },
      ];

      improvements.forEach(({ name, v2, v3, target }) => {
        if (v3) {
          const speedup = v2 / v3;
          const targetMet = v3 <= target;
          const icon = targetMet ? '✅' : '⚠️';
          console.log(`  ${icon} ${name}:`);
          console.log(`     V2: ${v2.toFixed(2)}ms → V3: ${v3.toFixed(2)}ms (${speedup.toFixed(2)}x faster)`);
          console.log(`     Target: ${target}ms ${targetMet ? '(met)' : '(not met)'}`);
        }
      });
    }
  }

  // Export results if requested
  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    console.log(`\n💾 Exporting results to: ${outputPath}`);

    const data = {
      timestamp: new Date().toISOString(),
      version: '3.0.0-alpha',
      platform: process.platform,
      nodeVersion: process.version,
      results,
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log('✅ Export complete');
  }

  // Generate markdown report if requested
  if (options.markdown) {
    const markdownPath = path.resolve(process.cwd(), 'BENCHMARK_REPORT.md');
    console.log(`\n📝 Generating markdown report: ${markdownPath}`);

    const markdown = generateMarkdownReport(results);
    fs.writeFileSync(markdownPath, markdown);
    console.log('✅ Report generated');
  }

  // Update baseline if requested
  if (options.updateBaseline) {
    console.log('\n⚠️  Updating baseline...');

    const baselinePath = path.join(__dirname, 'reports', 'baseline.json');
    const currentBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

    // Update with current results
    const newBaseline = {
      ...currentBaseline,
      version: '3.0.0-alpha',
      timestamp: new Date().toISOString(),
      updated: true,
    };

    fs.writeFileSync(baselinePath, JSON.stringify(newBaseline, null, 2));
    console.log('✅ Baseline updated');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Benchmark suite completed successfully');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Print summary statistics
  console.log('Summary:');
  console.log(`  Total Benchmarks: ${results.totalBenchmarks}`);
  console.log(`  Total Duration: ${(results.totalTime / 1000).toFixed(2)}s`);
  console.log(`  Average per Benchmark: ${(results.totalTime / results.totalBenchmarks).toFixed(2)}ms\n`);

  // Success indicators
  const targets = {
    agentSpawn: 100,
    taskAssignment: 10,
    throughput: 100,
  };

  console.log('Performance Targets:');

  // Check agent spawn target
  const agentSuite = results.suites.find((s: any) => s.name.includes('Agent'));
  if (agentSuite) {
    const spawnBench = agentSuite.benchmarks.find((b: any) => b.name.includes('Spawn'));
    if (spawnBench) {
      const met = spawnBench.mean < targets.agentSpawn;
      console.log(`  ${met ? '✅' : '❌'} Agent Spawn: ${spawnBench.mean.toFixed(2)}ms (target: <${targets.agentSpawn}ms)`);
    }
  }

  // Check task assignment target
  const taskSuite = results.suites.find((s: any) => s.name.includes('Task'));
  if (taskSuite) {
    const assignBench = taskSuite.benchmarks.find((b: any) => b.name.includes('Assignment'));
    if (assignBench) {
      const met = assignBench.mean < targets.taskAssignment;
      console.log(`  ${met ? '✅' : '❌'} Task Assignment: ${assignBench.mean.toFixed(2)}ms (target: <${targets.taskAssignment}ms)`);
    }
  }

  console.log('');

  // Exit with appropriate code
  process.exit(0);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('\n❌ Benchmark failed:');
    console.error(error);
    process.exit(1);
  });
}

export { main };
