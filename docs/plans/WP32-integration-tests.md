# WP32: Integration Test Suite

## Metadata
- **Wave:** 10 (Quality Assurance)
- **Dependencies:** Wave 9 (full system)
- **Effort:** Large
- **Package:** `@claude-flow/tests`

## Objective

Create comprehensive end-to-end tests that verify the complete local agent swarm system works correctly.

## Requirements

### Test Categories

1. **Provider Integration**
   - Ollama provider tests
   - Gemini provider tests
   - vLLM provider tests
   - Multi-provider routing

2. **Network Integration**
   - Discovery tests (mDNS, static)
   - Load balancing tests
   - Health check tests
   - Partition handling tests

3. **Protocol Integration**
   - AISP conversion/parsing
   - C2C fusion tests
   - ADOL optimization tests
   - Compression pipeline tests

4. **Persistence Integration**
   - Sync manager tests
   - Checkpoint/recovery tests
   - Partition reconciliation

5. **End-to-End Scenarios**
   - Hybrid swarm execution
   - Rate limit fallback
   - Network failure recovery

### Technical Specifications

```typescript
// v3/@claude-flow/tests/src/integration/hybrid-swarm.test.ts
describe('Hybrid Swarm Integration', () => {
  let swarm: HybridSwarmCoordinator;

  beforeAll(async () => {
    swarm = await createTestSwarm({
      queen: { provider: 'anthropic', model: 'claude-3-haiku' },
      workers: [
        { provider: 'ollama', model: 'qwen2.5:0.5b' },
        { provider: 'network', model: 'qwen2.5:7b' }
      ]
    });
  });

  test('routes simple task to local model', async () => {
    const result = await swarm.assignTask({
      type: 'simple-transform',
      complexity: 0.2
    });
    expect(result.provider).toBe('ollama');
  });

  test('routes complex task to cloud', async () => {
    const result = await swarm.assignTask({
      type: 'architecture-design',
      complexity: 0.9
    });
    expect(result.provider).toBe('anthropic');
  });

  test('falls back on rate limit', async () => {
    // Simulate rate limit
    await simulateRateLimit('anthropic');

    const result = await swarm.assignTask({
      type: 'architecture-design',
      complexity: 0.9
    });
    expect(result.provider).toBe('gemini');
  });
});
```

### Test Matrix

| Component | Unit | Integration | E2E |
|-----------|------|-------------|-----|
| Ollama Provider | ✅ | ✅ | ✅ |
| Network Discovery | ✅ | ✅ | ✅ |
| Load Balancer | ✅ | ✅ | - |
| AISP Parser | ✅ | ✅ | - |
| C2C Fuser | ✅ | ✅ | ✅ |
| Sync Manager | ✅ | ✅ | ✅ |
| Hybrid Coordinator | ✅ | ✅ | ✅ |

## Implementation Tasks

- [ ] Set up test infrastructure
- [ ] Create provider integration tests
- [ ] Create network integration tests
- [ ] Create protocol integration tests
- [ ] Create persistence integration tests
- [ ] Create E2E scenario tests
- [ ] Set up CI/CD test pipeline
- [ ] Create test fixtures and mocks
- [ ] Document test requirements

## Acceptance Criteria

1. ✅ All integration tests pass
2. ✅ E2E scenarios complete
3. ✅ Test coverage >80%
4. ✅ CI pipeline automated

## Files to Create

```
v3/@claude-flow/tests/
├── src/
│   ├── integration/
│   │   ├── providers/
│   │   │   ├── ollama.test.ts
│   │   │   ├── gemini.test.ts
│   │   │   └── vllm.test.ts
│   │   ├── network/
│   │   │   ├── discovery.test.ts
│   │   │   ├── load-balancer.test.ts
│   │   │   └── partition.test.ts
│   │   ├── protocols/
│   │   │   ├── aisp.test.ts
│   │   │   ├── c2c.test.ts
│   │   │   └── compression.test.ts
│   │   └── persistence/
│   │       ├── sync.test.ts
│   │       └── recovery.test.ts
│   ├── e2e/
│   │   ├── hybrid-swarm.test.ts
│   │   ├── network-failure.test.ts
│   │   └── rate-limit-fallback.test.ts
│   └── fixtures/
│       └── test-helpers.ts
├── jest.config.js
└── README.md
```

## Test Environment Requirements

- Docker for Ollama containers
- Network simulation tools
- Mock providers for rate limits
- Test database instances

## References

- All WPs for test requirements
