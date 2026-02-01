# WP16: C2C Fuser Core

## Metadata
- **Wave:** 5 (C2C Protocol)
- **Dependencies:** WP01 (Ollama for KV access)
- **Effort:** Large
- **Package:** `@claude-flow/protocols`

## Objective

Implement the Cache-to-Cache (C2C) fuser that enables direct semantic communication between LLMs by fusing KV-caches without text generation.

## Requirements

### Functional Requirements

1. **KV-Cache Projection**
   - Map source cache to target semantic space
   - Handle dimension mismatches
   - Support quantized caches

2. **Dynamic Weighting**
   - Input-aware modulation
   - Query-based attention

3. **Learnable Gating**
   - Per-layer fusion control
   - Trainable parameters

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/c2c/fuser.ts
export interface KVCache {
  modelId: string;
  layers: Float32Array[];  // Per-layer KV states
  tokenCount: number;
  dimensions: { k: number; v: number };
}

export interface FuserConfig {
  projectionDim?: number;
  numLayers?: number;
  gatingEnabled?: boolean;
}

export interface FusedContext {
  cache: KVCache;
  fusionScore: number;
  sourceModels: string[];
}

export class C2CFuser {
  private fusers: Map<string, ProjectorConfig>;

  constructor(config?: FuserConfig);

  // Load pre-trained fusers
  async loadFuser(modelPair: string): Promise<void>;

  // Core fusion
  async fuse(
    sharerCache: KVCache,
    receiverModel: string,
    options?: FuseOptions
  ): Promise<FusedContext>;

  // Projection
  project(cache: KVCache, targetDims: number): KVCache;

  // Weighting
  applyWeighting(cache: KVCache, query: string): KVCache;

  // Gating
  applyGating(sharerCache: KVCache, receiverCache: KVCache): KVCache;

  // Supported pairs
  getSupportedPairs(): string[];
  isFuserAvailable(source: string, target: string): boolean;
}
```

### Supported Model Pairs

| Sharer | Receiver | Improvement |
|--------|----------|-------------|
| Qwen2.5-0.5B | Qwen2.5-1.5B | +8.7% |
| Qwen2.5-1.5B | Qwen2.5-7B | +9.2% |
| Qwen3-0.6B | Qwen3-1.7B | +10.1% |
| Llama-3.2-1B | Qwen2.5-7B | +8.5% |

## Implementation Tasks

- [ ] Define KVCache data structures
- [ ] Implement projection layer
- [ ] Implement dynamic weighting
- [ ] Implement gating mechanism
- [ ] Load pre-trained fuser weights
- [ ] Create fusion pipeline
- [ ] Create unit tests
- [ ] Benchmark fusion quality

## Acceptance Criteria

1. ✅ Fusion produces valid KV-caches
2. ✅ Supports documented model pairs
3. ✅ 8-10% accuracy improvement verified
4. ✅ 2x latency improvement

## Files to Create

```
v3/@claude-flow/protocols/src/c2c/
├── fuser.ts
├── projector.ts
├── gating.ts
├── weights/           # Pre-trained weights
└── tests/fuser.test.ts
```

## References

- [C2C Repository](https://github.com/thu-nics/C2C)
- Plan Section: 4.1-4.4 C2C Integration
