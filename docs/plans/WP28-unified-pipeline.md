# WP28: Unified Compression Pipeline

## Metadata
- **Wave:** 9 (Integration)
- **Dependencies:** Waves 1-8 (all protocols)
- **Effort:** Large
- **Package:** `@claude-flow/protocols`

## Objective

Integrate AISP, ADOL, C2C, and thought compression into a unified pipeline with automatic protocol selection.

## Requirements

### Functional Requirements

1. **Protocol Selection**
   - Analyze message characteristics
   - Select optimal protocol stack
   - Consider sender/receiver capabilities

2. **Pipeline Orchestration**
   - Chain protocols in order
   - Measure cumulative savings
   - Handle protocol failures

3. **Metrics Tracking**
   - Token savings per protocol
   - Latency overhead
   - Protocol usage statistics

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/unified/pipeline.ts
export type Protocol = 'aisp' | 'adol' | 'c2c' | 'thought-compression';

export interface PipelineConfig {
  enabledProtocols: Protocol[];
  autoSelect?: boolean;
  fallbackOnError?: boolean;
}

export interface PipelineResult {
  originalSize: number;
  compressedSize: number;
  totalReduction: number;
  appliedProtocols: Array<{
    protocol: Protocol;
    inputSize: number;
    outputSize: number;
    reduction: number;
    latencyMs: number;
  }>;
  output: any;
}

export class ProtocolSelector {
  selectProtocols(
    sender: Agent,
    receiver: Agent,
    message: Message
  ): Protocol[];
}

export class UnifiedPipeline {
  constructor(config: PipelineConfig);

  // Register protocol handlers
  registerProtocol(name: Protocol, handler: ProtocolHandler): void;

  // Process message through pipeline
  async process(
    message: Message,
    sender: Agent,
    receiver: Agent
  ): Promise<PipelineResult>;

  // Process with specific protocols
  async processWithProtocols(
    message: Message,
    protocols: Protocol[]
  ): Promise<PipelineResult>;

  // Decompress received message
  async decompress(
    compressed: any,
    appliedProtocols: Protocol[]
  ): Promise<Message>;

  // Get pipeline statistics
  getStatistics(): PipelineStatistics;
}
```

### Pipeline Flow

```
Message Input
    │
    ├──→ Protocol Selector
    │    ├── Task handoff? → AISP
    │    ├── Local-to-local? → C2C
    │    ├── Long reasoning? → Thought Compression
    │    └── Always → ADOL
    │
    ├──→ AISP Encoding (if selected)
    │    └── 60% reduction
    │
    ├──→ ADOL Optimization
    │    └── 40-60% reduction
    │
    ├──→ C2C Fusion (if local-to-local)
    │    └── 100% reduction (direct transfer)
    │
    └──→ Thought Compression (if reasoning)
         └── 80-90% reduction
```

### Expected Savings by Scenario

| Scenario | Pipeline | Savings |
|----------|----------|---------|
| Task handoff | AISP → ADOL | 77% |
| Reasoning share | Thought → ADOL | 90% |
| Local-to-local | C2C | 100% |
| Complex task | AISP → Thought → ADOL | 95% |

## Implementation Tasks

- [ ] Create `ProtocolSelector` class
- [ ] Create `UnifiedPipeline` class
- [ ] Implement protocol registration
- [ ] Implement selection logic
- [ ] Implement pipeline orchestration
- [ ] Add metrics tracking
- [ ] Create unit tests
- [ ] Integration test all protocols
- [ ] Benchmark combined savings

## Acceptance Criteria

1. ✅ Auto-selection picks right protocols
2. ✅ Chained protocols compound savings
3. ✅ Decompression reverses correctly
4. ✅ Metrics accurate

## Files to Create

```
v3/@claude-flow/protocols/src/unified/
├── pipeline.ts
├── selector.ts
├── metrics.ts
└── tests/pipeline.test.ts
```

## References

- Plan Section: 7. Unified Compression Pipeline
