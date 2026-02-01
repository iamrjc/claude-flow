# WP14: AISP Quality Grader

## Metadata
- **Wave:** 4 (AISP Protocol)
- **Dependencies:** WP04 (AISP Parser)
- **Effort:** Medium
- **Package:** `@claude-flow/protocols`

## Objective

Implement specification quality grading system that evaluates AISP specs for semantic density and assigns quality tiers.

## Requirements

### Functional Requirements

1. **Quality Tiers**
   - Platinum (◊⁺⁺): density ≥ 0.75
   - Gold (◊⁺): density ≥ 0.60
   - Silver (◊): density ≥ 0.40
   - Bronze (◊⁻): density ≥ 0.20
   - Reject (⊘): density < 0.20

2. **Semantic Density Calculation**
   - Symbol usage vs total tokens
   - Precision of quantifiers
   - Completeness of conditions

3. **Quality Feedback**
   - Suggestions for improvement
   - Ambiguity warnings
   - Missing element detection

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/aisp/grader.ts
export type QualityTier = 'platinum' | 'gold' | 'silver' | 'bronze' | 'reject';

export interface GradeResult {
  tier: QualityTier;
  score: number;           // 0-1
  semanticDensity: number; // Symbol ratio
  breakdown: {
    quantifierScore: number;
    conditionScore: number;
    actionScore: number;
    evidenceScore: number;
  };
  suggestions: string[];
  warnings: string[];
}

export class AISPGrader {
  constructor();

  grade(spec: AISPSpec | string): GradeResult;
  gradeAST(ast: ASTNode): GradeResult;

  // Individual metrics
  calculateSemanticDensity(ast: ASTNode): number;
  checkQuantifierPrecision(ast: ASTNode): number;
  checkConditionCompleteness(ast: ASTNode): number;
  checkEvidencePresence(ast: ASTNode): number;

  // Feedback
  generateSuggestions(ast: ASTNode, score: number): string[];
}
```

### Scoring Components

| Component | Weight | Measures |
|-----------|--------|----------|
| Semantic Density | 0.30 | Symbol/token ratio |
| Quantifier Precision | 0.25 | Scope clarity |
| Condition Completeness | 0.25 | Pre/post conditions |
| Evidence Presence | 0.20 | Proof blocks |

## Implementation Tasks

- [ ] Create `AISPGrader` class
- [ ] Implement semantic density calculation
- [ ] Implement quantifier analysis
- [ ] Implement condition completeness check
- [ ] Implement evidence detection
- [ ] Build suggestion generator
- [ ] Add tier thresholds
- [ ] Create unit tests

## Acceptance Criteria

1. ✅ Tiers assigned correctly by score
2. ✅ Semantic density calculated accurately
3. ✅ Suggestions actionable and relevant
4. ✅ Consistent grading across specs

## Files to Create

```
v3/@claude-flow/protocols/src/aisp/
├── grader.ts
└── tests/grader.test.ts
```

## References

- Plan Section: 3.3 Quality Grading System
