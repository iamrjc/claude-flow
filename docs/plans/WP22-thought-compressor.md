# WP22: Thought Compressor

## Metadata
- **Wave:** 7 (Compression)
- **Dependencies:** WP14 (AISP for quality), WP16 (C2C for latent)
- **Effort:** Large
- **Package:** `@claude-flow/protocols`

## Objective

Implement reasoning chain compression that reduces verbose chain-of-thought to essential information, achieving 60-90% token reduction.

## Requirements

### Functional Requirements

1. **Compression Methods**
   - Step Entropy Pruning (80% reduction)
   - Focused CoT (60-70% reduction)
   - Latent Encoding (90%+ reduction)

2. **Quality Preservation**
   - Maintain accuracy (-1 to +2%)
   - Preserve key conclusions
   - Keep essential reasoning steps

3. **Decompression**
   - Reconstruct from compressed
   - Expand latent representations

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/compression/thought-compressor.ts
export type CompressionMethod = 'step-entropy' | 'focused-cot' | 'latent';

export interface CompressedThought {
  compressed: string | Float32Array;
  method: CompressionMethod;
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
  metadata?: {
    stepsKept?: number;
    stepsRemoved?: number;
    entropyThreshold?: number;
  };
}

export class ThoughtCompressor {
  constructor(config?: CompressionConfig);

  /**
   * Compress agent's reasoning chain
   */
  async compress(
    fullReasoning: string,
    method?: CompressionMethod
  ): Promise<CompressedThought>;

  /**
   * Step entropy pruning - keep high-entropy steps
   */
  stepEntropyPrune(reasoning: string, keepRatio?: number): CompressedThought;

  /**
   * Focused CoT - extract essential information
   */
  focusedCoT(reasoning: string): CompressedThought;

  /**
   * Encode to latent space (requires model)
   */
  async encodeToLatent(reasoning: string): Promise<CompressedThought>;

  /**
   * Decompress back to readable form
   */
  async decompress(compressed: CompressedThought): Promise<string>;

  // Utilities
  splitIntoSteps(reasoning: string): string[];
  calculateEntropy(step: string): number;
}
```

### Compression Methods Comparison

| Method | Reduction | Accuracy | Latency | Use For |
|--------|-----------|----------|---------|---------|
| Step Entropy | 80% | 0 to +2% | +20ms | Reasoning chains |
| Focused CoT | 60-70% | -1 to 0% | +10ms | Quick tasks |
| Latent | 90%+ | -3 to -1% | +50ms | Internal comms |

### Step Entropy Algorithm

```
1. Split reasoning into steps
2. Calculate entropy for each step
   - High entropy = informative, novel
   - Low entropy = repetitive, transitional
3. Rank steps by entropy
4. Keep top N% highest entropy steps
5. Reconstruct compressed chain
```

## Implementation Tasks

- [ ] Create `ThoughtCompressor` class
- [ ] Implement step splitting
- [ ] Implement entropy calculation
- [ ] Implement step entropy pruning
- [ ] Implement focused CoT extraction
- [ ] Implement latent encoding (with model)
- [ ] Implement decompression
- [ ] Create unit tests
- [ ] Benchmark compression quality

## Acceptance Criteria

1. ✅ 80% reduction with step entropy
2. ✅ Accuracy maintained (±2%)
3. ✅ Conclusions preserved
4. ✅ Decompression recovers meaning

## Files to Create

```
v3/@claude-flow/protocols/src/compression/
├── thought-compressor.ts
├── entropy-calculator.ts
├── focused-extractor.ts
├── latent-encoder.ts
└── tests/thought-compressor.test.ts
```

## References

- [Step Entropy Paper](https://arxiv.org/pdf/2508.03346)
- Plan Section: 6.1-6.2 Compressed Reasoning
