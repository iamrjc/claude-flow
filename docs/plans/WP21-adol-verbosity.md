# WP21: ADOL Verbosity Control

## Metadata
- **Wave:** 6 (ADOL Protocol)
- **Dependencies:** None
- **Effort:** Small
- **Package:** `@claude-flow/protocols`

## Objective

Implement verbosity control for agent responses, reducing token usage by 10-20% through response detail level management.

## Requirements

### Functional Requirements

1. **Verbosity Levels**
   - MINIMAL (1): Just result
   - NORMAL (2): Result + summary
   - DETAILED (3): Result + reasoning
   - FULL (4): Everything + traces

2. **Response Shaping**
   - Filter response sections by level
   - Preserve essential content
   - Truncate verbose explanations

3. **Level Selection**
   - Auto-select based on context
   - Internal = MINIMAL
   - User-facing = DETAILED

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/adol/verbosity.ts
export enum VerbosityLevel {
  MINIMAL = 1,
  NORMAL = 2,
  DETAILED = 3,
  FULL = 4
}

export interface VerbosityConfig {
  defaultLevel: VerbosityLevel;
  internalLevel: VerbosityLevel;
  userFacingLevel: VerbosityLevel;
}

export interface ShapedResponse {
  content: object;
  verbosityApplied: VerbosityLevel;
  sectionsRemoved: string[];
  originalSize: number;
  shapedSize: number;
}

export class VerbosityController {
  constructor(config?: VerbosityConfig);

  /**
   * Shape response to target verbosity
   */
  shape(
    response: object,
    targetLevel: VerbosityLevel
  ): ShapedResponse;

  /**
   * Auto-select level based on context
   */
  selectLevel(context: MessageContext): VerbosityLevel;

  /**
   * Check if section should be included
   */
  shouldInclude(section: string, level: VerbosityLevel): boolean;
}
```

### Section Inclusion by Level

| Section | MINIMAL | NORMAL | DETAILED | FULL |
|---------|---------|--------|----------|------|
| result | ✅ | ✅ | ✅ | ✅ |
| summary | ❌ | ✅ | ✅ | ✅ |
| reasoning | ❌ | ❌ | ✅ | ✅ |
| alternatives | ❌ | ❌ | ✅ | ✅ |
| traces | ❌ | ❌ | ❌ | ✅ |
| debug | ❌ | ❌ | ❌ | ✅ |

## Implementation Tasks

- [ ] Define `VerbosityLevel` enum
- [ ] Create `VerbosityController` class
- [ ] Implement section mapping
- [ ] Implement response shaping
- [ ] Add auto-level selection
- [ ] Create unit tests

## Acceptance Criteria

1. ✅ 10-20% reduction at MINIMAL
2. ✅ Results always preserved
3. ✅ Auto-selection works
4. ✅ Levels stack correctly

## Files to Create

```
v3/@claude-flow/protocols/src/adol/
├── verbosity.ts
└── tests/verbosity.test.ts
```

## References

- Plan Section: 5.2.3 Verbosity Control
