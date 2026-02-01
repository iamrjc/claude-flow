# WP18: C2C Multi-Sharer Fusion

## Metadata
- **Wave:** 5 (C2C Protocol)
- **Dependencies:** WP16 (C2C Fuser)
- **Effort:** Medium
- **Package:** `@claude-flow/protocols`

## Objective

Implement multi-sharer fusion that combines KV-caches from multiple specialist agents into a single coordinator context.

## Requirements

### Functional Requirements

1. **Multi-Source Fusion**
   - Combine 2+ source caches
   - Weighted contribution per source
   - Attention-based selection

2. **Ensemble Patterns**
   - Math + Code + Reasoning
   - Multiple specialists → Generalist

3. **Quality Control**
   - Coherence checking
   - Conflict resolution

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/c2c/multi-sharer.ts
export interface SharerContribution {
  cache: KVCache;
  weight: number;
  domain?: string;  // 'math', 'code', 'reasoning'
}

export interface MultiSharerConfig {
  fusionMethod: 'weighted-average' | 'attention' | 'concat-project';
  maxSharers?: number;
  coherenceThreshold?: number;
}

export class MultiSharerFuser {
  constructor(baseFuser: C2CFuser, config?: MultiSharerConfig);

  /**
   * Fuse multiple source caches into single context
   */
  async multiSharerFuse(
    sharers: SharerContribution[],
    receiverModel: string
  ): Promise<FusedContext>;

  /**
   * Automatically weight sharers by relevance to query
   */
  async autoWeightByQuery(
    sharers: KVCache[],
    query: string
  ): Promise<SharerContribution[]>;

  /**
   * Check coherence between sharer caches
   */
  checkCoherence(sharers: KVCache[]): CoherenceResult;
}
```

### Fusion Patterns

```
Pattern: Multi-Specialist Ensemble

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Math Agent  │  │ Code Agent  │  │Reason Agent │
│  (Qwen-Math)│  │(Qwen-Coder) │  │(DeepSeek-R1)│
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                        ▼
                ┌──────────────┐
                │Multi-Sharer  │
                │   Fuser      │
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │ Coordinator  │
                │ (Qwen 14B)   │
                │  Combined    │
                │  Expertise   │
                └──────────────┘
```

## Implementation Tasks

- [ ] Create `MultiSharerFuser` class
- [ ] Implement weighted-average fusion
- [ ] Implement attention-based fusion
- [ ] Add coherence checking
- [ ] Implement auto-weighting by query
- [ ] Create unit tests
- [ ] Test with 3+ sharers

## Acceptance Criteria

1. ✅ 2+ caches fuse correctly
2. ✅ Attention weighting improves relevance
3. ✅ Coherence check catches conflicts
4. ✅ Combined context functional

## Files to Create

```
v3/@claude-flow/protocols/src/c2c/
├── multi-sharer.ts
├── coherence-checker.ts
└── tests/multi-sharer.test.ts
```

## References

- Plan Section: 4.5 Pattern 2: Multi-Sharer Ensemble
