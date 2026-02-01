# WP17: C2C Ollama Bridge

## Metadata
- **Wave:** 5 (C2C Protocol)
- **Dependencies:** WP01 (Ollama Provider), WP16 (C2C Fuser)
- **Effort:** Medium
- **Package:** `@claude-flow/protocols`

## Objective

Create a bridge to extract KV-cache states from Ollama models, enabling C2C communication between local models.

## Requirements

### Functional Requirements

1. **KV-Cache Extraction**
   - Extract after model processing
   - Support streaming extraction
   - Handle different model architectures

2. **Cache Serialization**
   - Efficient binary format
   - Compression support
   - Cross-model compatibility

3. **Ollama Integration**
   - Use internal cache mechanism
   - Minimal overhead
   - Version compatibility

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/c2c/ollama-bridge.ts
export class OllamaC2CBridge {
  private ollama: OllamaProvider;

  constructor(ollama: OllamaProvider);

  /**
   * Extract KV-cache after prompt processing
   */
  async extractKVCache(
    modelName: string,
    prompt: string,
    options?: ExtractionOptions
  ): Promise<KVCache>;

  /**
   * Inject fused cache into model context
   */
  async injectKVCache(
    modelName: string,
    cache: KVCache
  ): Promise<void>;

  /**
   * Check if model supports KV extraction
   */
  supportsExtraction(modelName: string): boolean;

  /**
   * Get cache metadata without full extraction
   */
  async getCacheInfo(modelName: string): Promise<CacheInfo>;
}

export interface CacheInfo {
  modelId: string;
  layerCount: number;
  dimensions: { k: number; v: number };
  maxTokens: number;
  quantization?: 'fp16' | 'fp32' | 'int8';
}
```

### Extraction Flow

```
1. Send prompt to Ollama model
2. Hook into inference completion
3. Extract KV states from each layer
4. Package into KVCache structure
5. Return for C2C fusion
```

## Implementation Tasks

- [ ] Research Ollama KV-cache access
- [ ] Implement extraction hook
- [ ] Create cache serialization format
- [ ] Implement cache injection
- [ ] Add model compatibility checks
- [ ] Create unit tests
- [ ] Test with real Ollama models

## Acceptance Criteria

1. ✅ Extraction works with Qwen models
2. ✅ Extraction works with Llama models
3. ✅ Minimal latency overhead (<10%)
4. ✅ Cache injection functional

## Files to Create

```
v3/@claude-flow/protocols/src/c2c/
├── ollama-bridge.ts
├── cache-serializer.ts
└── tests/ollama-bridge.test.ts
```

## Notes

This WP may require Ollama 0.4+ with cache export API, or custom modifications. Verify Ollama capabilities before implementation.

## References

- Plan Section: 4.6 Integration with Ollama
