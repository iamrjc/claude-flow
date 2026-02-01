# WP19: ADOL Schema Deduplication

## Metadata
- **Wave:** 6 (ADOL Protocol)
- **Dependencies:** None
- **Effort:** Medium
- **Package:** `@claude-flow/protocols`

## Objective

Implement schema deduplication using JSON references to reduce token overhead by 20-30% in inter-agent messages.

## Requirements

### Functional Requirements

1. **Schema Detection**
   - Identify repeated object structures
   - Detect duplicate nested objects
   - Track reference candidates

2. **Reference Insertion**
   - Convert duplicates to `$ref` pointers
   - Build `$defs` section
   - Maintain semantic equivalence

3. **Deduplication**
   - Resolve references on read
   - Validate reference integrity

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/adol/deduplication.ts
export interface DeduplicationResult {
  original: object;
  deduplicated: object;
  definitions: Record<string, object>;
  savings: {
    originalSize: number;
    deduplicatedSize: number;
    reduction: number;  // percentage
  };
}

export class SchemaDeduplicator {
  constructor(options?: DeduplicationOptions);

  /**
   * Deduplicate repeated structures in JSON
   */
  deduplicate(data: object): DeduplicationResult;

  /**
   * Resolve $ref pointers back to full objects
   */
  resolve(deduplicated: object): object;

  /**
   * Check if deduplication is worthwhile
   */
  shouldDeduplicate(data: object): boolean;
}
```

### Example Transformation

```json
// BEFORE (repeated agent object)
{
  "agent": {"id": "agent-1", "type": "coder", "capabilities": [...]},
  "task": {"agent": {"id": "agent-1", "type": "coder", "capabilities": [...]}},
  "result": {"agent": {"id": "agent-1", "type": "coder", "capabilities": [...]}}
}

// AFTER (deduplicated)
{
  "$defs": {"agent-1": {"id": "agent-1", "type": "coder", "capabilities": [...]}},
  "agent": {"$ref": "#/$defs/agent-1"},
  "task": {"agent": {"$ref": "#/$defs/agent-1"}},
  "result": {"agent": {"$ref": "#/$defs/agent-1"}}
}
```

## Implementation Tasks

- [ ] Create `SchemaDeduplicator` class
- [ ] Implement deep object comparison
- [ ] Implement reference insertion
- [ ] Implement reference resolution
- [ ] Add threshold for minimum savings
- [ ] Create unit tests
- [ ] Benchmark size reduction

## Acceptance Criteria

1. ✅ 20-30% size reduction achieved
2. ✅ References resolve correctly
3. ✅ Semantic equivalence maintained
4. ✅ Handles nested structures

## Files to Create

```
v3/@claude-flow/protocols/src/adol/
├── deduplication.ts
└── tests/deduplication.test.ts
```

## References

- [IETF Draft: ADOL](https://datatracker.ietf.org/doc/html/draft-chang-agent-token-efficient-01)
- Plan Section: 5.2.1 Schema Deduplication
