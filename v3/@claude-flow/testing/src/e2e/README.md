# End-to-End Integration Tests

Comprehensive end-to-end tests validating all domains working together as a complete system.

## Overview

This directory contains 90 E2E integration tests across 5 test suites, validating:

- Agent-Task integration and lifecycle
- Memory-Coordination consistency
- Full swarm workflows
- Plugin integration and learning
- CLI-MCP-Domain round-trip flows

## Quick Start

### Run All E2E Tests
```bash
npm test -- src/e2e
```

### Run Specific Suite
```bash
npm test -- src/e2e/scenarios/agent-task-flow.test.ts
npm test -- src/e2e/scenarios/memory-coordination.test.ts
npm test -- src/e2e/scenarios/swarm-workflow.test.ts
npm test -- src/e2e/scenarios/plugin-integration.test.ts
npm test -- src/e2e/scenarios/mcp-cli-flow.test.ts
```

## Directory Structure

```
e2e/
├── scenarios/           # Test scenario files
│   ├── agent-task-flow.test.ts       (16 tests)
│   ├── memory-coordination.test.ts   (16 tests)
│   ├── swarm-workflow.test.ts        (19 tests)
│   ├── plugin-integration.test.ts    (20 tests)
│   └── mcp-cli-flow.test.ts         (19 tests)
├── fixtures/           # Shared test data
│   └── test-fixtures.ts
├── utils/              # Test utilities
│   ├── e2e-helpers.ts
│   └── mock-agent.ts
└── index.ts            # Module exports
```

## Test Suites

### 1. Agent-Task Flow (16 tests)
Tests agent lifecycle, task execution, and pool scaling.

**Test Groups:**
- Basic Agent-Task Flow (4 tests)
- Multiple Agents Working on Task Graph (3 tests)
- Agent Failure and Task Reassignment (3 tests)
- Pool Scaling Under Load (3 tests)
- Performance and Metrics (3 tests)

### 2. Memory-Coordination (16 tests)
Tests shared memory, semantic search, and consensus consistency.

**Test Groups:**
- Agents Sharing Memory in Coordination Session (4 tests)
- Semantic Search Across Agent Memories (4 tests)
- Memory Consistency During Consensus (4 tests)
- Namespace Isolation Between Sessions (4 tests)

### 3. Swarm Workflow (19 tests)
Tests complete swarm lifecycle and topology management.

**Test Groups:**
- Initialize Swarm with Topology (4 tests)
- Queen Distributes Tasks to Workers (4 tests)
- Workers Report Results (3 tests)
- Collective Decision Making (3 tests)
- Swarm Scaling and Topology Change (5 tests)

### 4. Plugin Integration (20 tests)
Tests plugin loading, HiveMind coordination, and Neural learning.

**Test Groups:**
- HiveMind Plugin with Real Agents (6 tests)
- Neural Plugin Learning from Task Outcomes (5 tests)
- Plugin Lifecycle Management (7 tests)
- Plugin Interoperability (2 tests)

### 5. MCP/CLI Integration (19 tests)
Tests CLI command execution and error propagation.

**Test Groups:**
- Execute MCP Tools via CLI Commands (6 tests)
- Round-trip: CLI -> MCP -> Domain -> Response (4 tests)
- Error Propagation Through Stack (7 tests)
- Integration Performance (2 tests)

## Utilities

### E2E Helpers (`utils/e2e-helpers.ts`)

**Wait Functions:**
- `waitForCondition()` - Wait for async conditions
- `waitForValueChange()` - Wait for value changes
- `assertEventuallyEquals()` - Eventual consistency
- `assertEventuallyHasCount()` - Collection size assertions
- `waitForEvent()` - Event waiting
- `collectUntil()` - Async collection

**System Management:**
- `bootstrapSystem()` - System setup
- `ResourceManager` - Cleanup management
- `retry()` - Retry with backoff
- `parallelLimit()` - Concurrent execution control

**Utilities:**
- `generateTestId()` - Unique ID generation
- `measureExecutionTime()` - Performance measurement
- `createDeferred()` - Deferred promises

### Test Fixtures (`fixtures/test-fixtures.ts`)

**Sample Data:**
- Agent templates (8 types: coder, reviewer, tester, etc.)
- Task definitions (4 types: simple, complex, testing, review)
- Memory entries (3 types: pattern, decision, learning)
- Swarm configurations (3 topologies: hierarchical, mesh, adaptive)
- Plugin configurations (3 plugins: hiveMind, neural, security)

**Helper Functions:**
- `createAgentTemplate()` - Generate agent templates
- `createTaskDefinition()` - Generate task definitions
- `createMemoryEntry()` - Generate memory entries
- `createSwarmConfig()` - Generate swarm configs
- `createTestDataGenerator()` - Bulk data generation

**Data Generator:**
```typescript
const generator = createTestDataGenerator();
const agents = generator.generateAgents(5, 'coder');
const tasks = generator.generateTasks(10, 'simple');
const memories = generator.generateMemories(20, 'pattern');
```

### Mock Agent (`utils/mock-agent.ts`)

Simplified agent implementation for E2E testing:

**Classes:**
- `Agent` - Agent domain model
- `AgentId` - Agent identifier value object
- `TaskId` - Task identifier value object
- `AgentMetrics` - Performance metrics
- `AgentHealth` - Health reporting

**Enums:**
- `AgentStatus` - Agent state machine

**Usage:**
```typescript
import { Agent, AgentStatus, TaskId } from '../utils/e2e-helpers.js';

const agent = Agent.create(createAgentTemplate('coder'));
agent.spawn();
expect(agent.getStatus()).toBe(AgentStatus.Idle);

const taskId = TaskId.generate();
agent.assignTask(taskId);
expect(agent.getStatus()).toBe(AgentStatus.Busy);

agent.completeTask(true);
expect(agent.getStatus()).toBe(AgentStatus.Idle);
expect(agent.getMetrics().tasksCompleted).toBe(1);
```

## Writing E2E Tests

### Basic Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Agent,
  AgentStatus,
  TaskId,
  ResourceManager,
  waitForCondition,
} from '../utils/e2e-helpers.js';
import { createAgentTemplate } from '../fixtures/test-fixtures.js';

describe('E2E: My Feature', () => {
  let resourceManager: ResourceManager;

  beforeEach(() => {
    resourceManager = new ResourceManager();
  });

  afterEach(async () => {
    await resourceManager.cleanup();
  });

  it('should test end-to-end flow', async () => {
    // Arrange
    const agent = Agent.create(createAgentTemplate('coder'));
    agent.spawn();

    resourceManager.register(async () => {
      agent.terminate();
    });

    // Act
    const taskId = TaskId.generate();
    agent.assignTask(taskId);
    agent.completeTask(true);

    // Assert
    expect(agent.getStatus()).toBe(AgentStatus.Idle);
    expect(agent.getMetrics().tasksCompleted).toBe(1);
  });
});
```

### Testing Async Flows

```typescript
it('should handle async operations', async () => {
  const agent = Agent.create(createAgentTemplate('coder'));
  agent.spawn();

  // Start async operation
  const taskId = TaskId.generate();
  agent.assignTask(taskId);

  // Wait for condition
  await waitForCondition(
    () => agent.getStatus() === AgentStatus.Busy,
    { timeout: 1000 }
  );

  // Complete and verify
  agent.completeTask(true);
  expect(agent.getStatus()).toBe(AgentStatus.Idle);
});
```

### Testing Concurrent Operations

```typescript
it('should handle concurrent agents', async () => {
  const agents = Array.from({ length: 5 }, () => {
    const agent = Agent.create(createAgentTemplate('coder'));
    agent.spawn();
    return agent;
  });

  // Execute tasks in parallel
  await Promise.all(
    agents.map(async (agent) => {
      const taskId = TaskId.generate();
      agent.assignTask(taskId);
      await new Promise(r => setTimeout(r, 10));
      agent.completeTask(true);
    })
  );

  // Verify all completed
  const totalCompleted = agents.reduce(
    (sum, a) => sum + a.getMetrics().tasksCompleted,
    0
  );
  expect(totalCompleted).toBe(5);
});
```

### Resource Cleanup

```typescript
it('should cleanup resources', async () => {
  const resources: Agent[] = [];

  // Create resources
  for (let i = 0; i < 10; i++) {
    const agent = Agent.create(createAgentTemplate('coder'));
    agent.spawn();
    resources.push(agent);

    resourceManager.register(async () => {
      agent.terminate();
    });
  }

  // Resources cleaned up automatically in afterEach
});
```

## Best Practices

### 1. Use Real Implementations
- Import from domain packages where possible
- Use mock implementations only for isolation
- Test actual state transitions

### 2. Test Error Scenarios
- Invalid state transitions
- Resource exhaustion
- Network failures
- Timeout handling

### 3. Cleanup Resources
- Always use `ResourceManager`
- Register cleanup functions
- Clean up in `afterEach`

### 4. Wait for Async Operations
- Use `waitForCondition()` for async waits
- Set appropriate timeouts
- Verify eventual consistency

### 5. Descriptive Test Names
- Use clear, action-oriented names
- Describe the scenario being tested
- Include expected outcome

## Performance Considerations

### Test Timeouts
- Default timeout: 5000ms
- Increase for long-running tests
- Use `{ timeout: 10000 }` option

### Parallel Execution
- Use `parallelLimit()` for controlled concurrency
- Avoid race conditions
- Use proper synchronization

### Resource Usage
- Clean up after each test
- Limit concurrent operations
- Monitor memory usage

## Debugging

### Run Single Test
```bash
npm test -- src/e2e/scenarios/agent-task-flow.test.ts -t "should spawn agent"
```

### Verbose Output
```bash
npm test -- src/e2e --reporter=verbose
```

### Debug Mode
```bash
node --inspect-brk ./node_modules/.bin/vitest src/e2e
```

## Contributing

When adding new E2E tests:

1. Choose appropriate test suite or create new one
2. Use existing utilities and fixtures
3. Follow naming conventions
4. Add cleanup in `afterEach`
5. Document complex scenarios
6. Update test count in summary

## Statistics

- **Total Tests:** 90
- **Test Files:** 5
- **Lines of Code:** 3,538
- **Coverage:** All major integration points
- **Pass Rate:** 75%+ (first run)

## See Also

- [E2E Tests Summary](../../E2E_TESTS_SUMMARY.md)
- [Testing Module README](../../README.md)
- [Agent Domain](../../../agents/README.md)
- [Memory Domain](../../../memory/README.md)
- [Swarm Domain](../../../swarm/README.md)
