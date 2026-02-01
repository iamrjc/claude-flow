/**
 * E2E Integration Tests Index
 *
 * Central export for all end-to-end integration tests and utilities.
 *
 * @module @claude-flow/testing/e2e
 */

// Test Utilities
export * from './utils/e2e-helpers.js';

// Test Fixtures
export * from './fixtures/test-fixtures.js';

// Test Scenarios
// Note: Test files are not exported directly as they are meant to be run by vitest
// Individual test suites can be imported if needed for test composition

/**
 * E2E Test Suites Available:
 *
 * 1. agent-task-flow.test.ts
 *    - Agent-Task integration tests
 *    - Agent lifecycle management
 *    - Task assignment and execution
 *    - Pool scaling under load
 *    - Agent failure and recovery
 *
 * 2. memory-coordination.test.ts
 *    - Memory-Coordination integration tests
 *    - Shared memory across agents
 *    - Semantic search capabilities
 *    - Memory consistency during consensus
 *    - Namespace isolation
 *
 * 3. swarm-workflow.test.ts
 *    - Full swarm workflow tests
 *    - Swarm initialization with various topologies
 *    - Queen-worker task distribution
 *    - Collective decision making
 *    - Dynamic swarm scaling
 *
 * 4. plugin-integration.test.ts
 *    - Plugin system integration tests
 *    - HiveMind plugin with real agents
 *    - Neural plugin learning from outcomes
 *    - Plugin lifecycle management
 *    - Plugin interoperability
 *
 * 5. mcp-cli-flow.test.ts
 *    - MCP/CLI integration tests
 *    - CLI command execution
 *    - Round-trip data flow
 *    - Error propagation through layers
 *    - Integration performance
 *
 * Run all E2E tests:
 *   npm test -- src/e2e
 *
 * Run specific suite:
 *   npm test -- src/e2e/scenarios/agent-task-flow.test.ts
 */

/**
 * E2E Test Coverage Summary:
 *
 * Total Test Files: 5
 * Estimated Total Tests: 50+
 *
 * Coverage Areas:
 * - Agent lifecycle and task execution
 * - Memory operations and coordination
 * - Swarm orchestration and scaling
 * - Plugin integration and lifecycle
 * - MCP/CLI integration and error handling
 *
 * Test Types:
 * - Integration tests (domain-to-domain)
 * - End-to-end tests (CLI-to-domain)
 * - Performance tests (throughput, latency)
 * - Error handling and recovery tests
 * - Concurrent operation tests
 */

// Re-export commonly used types for convenience
export type {
  WaitForOptions,
  SystemBootstrapOptions,
  SystemContext,
  RetryOptions,
  Deferred,
} from './utils/e2e-helpers.js';
