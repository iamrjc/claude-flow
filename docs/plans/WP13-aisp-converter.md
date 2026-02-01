# WP13: AISP Task Converter

## Metadata
- **Wave:** 4 (AISP Protocol)
- **Dependencies:** WP04 (AISP Parser)
- **Effort:** Large
- **Package:** `@claude-flow/protocols`

## Objective

Implement natural language to AISP conversion, enabling automatic transformation of task descriptions into unambiguous symbolic specifications.

## Requirements

### Functional Requirements

1. **NL to AISP Conversion**
   - Parse natural language task descriptions
   - Extract quantifiers, conditions, actions
   - Generate valid AISP specification

2. **Pattern Recognition**
   - Identify iteration patterns ("all", "each", "every")
   - Identify conditional patterns ("if", "when", "unless")
   - Identify action patterns ("find", "create", "update")

3. **Context Integration**
   - Use local model for conversion
   - Validate output with parser

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/aisp/converter.ts
export interface ConversionResult {
  success: boolean;
  spec?: string;
  ast?: ASTNode;
  confidence: number;
  warnings?: string[];
}

export class AISPConverter {
  constructor(provider?: Provider);  // Local model for conversion

  async convert(naturalLanguage: string): Promise<ConversionResult>;
  async convertWithContext(
    naturalLanguage: string,
    context: ConversionContext
  ): Promise<ConversionResult>;

  // Pattern extraction
  extractQuantifiers(text: string): QuantifierPattern[];
  extractConditions(text: string): ConditionPattern[];
  extractActions(text: string): ActionPattern[];
}
```

### Conversion Examples

| Natural Language | AISP Output |
|------------------|-------------|
| "Find all TypeScript files with errors" | `∀f ∈ Glob("**/*.ts"): hasError(f) ⇒ collect(f)` |
| "Update each user's status to active" | `∀u ∈ Users: status(u) ≔ 'active'` |
| "If tests pass, deploy to staging" | `testSuite() = ⊤ ⇒ deploy('staging')` |

## Implementation Tasks

- [ ] Create pattern extraction functions
- [ ] Implement quantifier detection
- [ ] Implement condition detection
- [ ] Implement action mapping
- [ ] Build conversion template system
- [ ] Integrate with local model for complex cases
- [ ] Add validation pass with parser
- [ ] Create unit tests
- [ ] Test with diverse inputs

## Acceptance Criteria

1. ✅ Simple patterns converted correctly
2. ✅ Complex patterns handled with model
3. ✅ Output validates with parser
4. ✅ Confidence scores accurate
5. ✅ Unit test coverage >80%

## Files to Create

```
v3/@claude-flow/protocols/src/aisp/
├── converter.ts
├── patterns/
│   ├── quantifiers.ts
│   ├── conditions.ts
│   └── actions.ts
└── tests/converter.test.ts
```

## References

- Plan Section: 3.3 Implementation Plan
