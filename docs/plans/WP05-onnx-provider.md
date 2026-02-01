# WP05: ONNX Provider Implementation

## Metadata
- **Wave:** 2 (Additional Providers)
- **Dependencies:** WP01 (Ollama patterns), WP02 (Provider interface)
- **Effort:** Small
- **Package:** `@claude-flow/providers`

## Objective

Implement ONNX Runtime provider for ultra-fast local inference with smaller models, targeting ~100ms latency (75x faster than cloud).

## Requirements

### Functional Requirements

1. **ONNX Runtime Integration**
   - Load ONNX model files
   - Support CPU and GPU execution providers
   - Optimize graph for inference

2. **Model Support**
   - Phi-4 Mini
   - Qwen 0.5B quantized
   - Other ONNX-exported models

3. **Performance Optimization**
   - Graph optimization level
   - Execution provider selection (CUDA, CPU)
   - Batch inference support

### Technical Specifications

```typescript
// v3/@claude-flow/providers/src/onnx-provider.ts
import * as ort from 'onnxruntime-node';

export interface ONNXConfig {
  modelPath: string;
  executionProviders?: ('cuda' | 'cpu')[];
  graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
  logLevel?: 'verbose' | 'info' | 'warning' | 'error';
}

export class ONNXProvider implements Provider {
  private session: ort.InferenceSession | null = null;

  constructor(config: ONNXConfig);

  async initialize(): Promise<void>;
  async generate(tokens: number[], options?: GenerateOptions): Promise<number[]>;
  async dispose(): Promise<void>;

  isInitialized(): boolean;
  getModelInfo(): ModelInfo;
}
```

### Performance Targets

| Metric | Target |
|--------|--------|
| Initialization | <5s |
| First token | <50ms |
| Throughput | >100 tok/s (CPU) |
| Memory | <4GB for 0.5B model |

## Implementation Tasks

- [ ] Add `onnxruntime-node` dependency
- [ ] Create `ONNXProvider` class
- [ ] Implement model loading with optimization
- [ ] Implement tokenization (use existing)
- [ ] Implement generate with KV-cache
- [ ] Add GPU detection and fallback
- [ ] Create unit tests
- [ ] Benchmark performance

## Acceptance Criteria

1. ✅ Models load and run correctly
2. ✅ GPU acceleration works when available
3. ✅ Graceful CPU fallback
4. ✅ <100ms latency for small models
5. ✅ Memory usage within bounds

## Files to Create

```
v3/@claude-flow/providers/src/
├── onnx-provider.ts
├── onnx-types.ts
└── tests/onnx-provider.test.ts
```

## References

- [ONNX Runtime Node.js](https://onnxruntime.ai/docs/get-started/with-javascript.html)
- Plan Section: 2.1.3 ONNX Runtime
