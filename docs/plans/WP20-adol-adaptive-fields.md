# WP20: ADOL Adaptive Field Inclusion

## Metadata
- **Wave:** 6 (ADOL Protocol)
- **Dependencies:** None
- **Effort:** Medium
- **Package:** `@claude-flow/protocols`

## Objective

Implement adaptive field inclusion that strips optional fields based on receiver context, reducing tokens by 15-25%.

## Requirements

### Functional Requirements

1. **Field Analysis**
   - Identify required vs optional fields
   - Track receiver capabilities
   - Determine field relevance

2. **Context-Aware Stripping**
   - Remove unused optional fields
   - Keep fields receiver needs
   - Strip metadata for internal messages

3. **Field Configuration**
   - Define field importance levels
   - Configure per-message-type rules

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/adol/adaptive-fields.ts
export interface FieldRule {
  field: string;
  importance: 'required' | 'recommended' | 'optional' | 'debug';
  includeWhen?: (context: OptimizationContext) => boolean;
}

export interface OptimizationContext {
  receiver: {
    capabilities: string[];
    isInternal: boolean;
    verbosityLevel: number;
  };
  message: {
    type: string;
    purpose: string;
  };
}

export interface OptimizedMessage {
  data: object;
  removedFields: string[];
  savings: number;
}

export class AdaptiveFieldOptimizer {
  constructor(rules?: FieldRule[]);

  /**
   * Optimize message by removing unnecessary fields
   */
  optimize(
    message: object,
    context: OptimizationContext
  ): OptimizedMessage;

  /**
   * Add custom field rules
   */
  addRule(rule: FieldRule): void;

  /**
   * Get default rules for message type
   */
  getDefaultRules(messageType: string): FieldRule[];
}
```

### Default Field Rules

| Field | Importance | Include When |
|-------|------------|--------------|
| `id` | required | always |
| `sender` | required | always |
| `payload` | required | always |
| `timestamp` | recommended | !isInternal |
| `metadata` | optional | verbosity ≥ 2 |
| `tracing` | debug | verbosity ≥ 3 |
| `stream_config` | optional | receiver.hasStreaming |

## Implementation Tasks

- [ ] Create `AdaptiveFieldOptimizer` class
- [ ] Define default field rules
- [ ] Implement context evaluation
- [ ] Implement field stripping
- [ ] Add custom rule support
- [ ] Create unit tests
- [ ] Test with various contexts

## Acceptance Criteria

1. ✅ 15-25% size reduction
2. ✅ Required fields never removed
3. ✅ Context rules evaluated correctly
4. ✅ Custom rules work

## Files to Create

```
v3/@claude-flow/protocols/src/adol/
├── adaptive-fields.ts
├── field-rules.ts
└── tests/adaptive-fields.test.ts
```

## References

- Plan Section: 5.2.2 Adaptive Field Inclusion
