# WP15: AISP Message Format

## Metadata
- **Wave:** 4 (AISP Protocol)
- **Dependencies:** WP04 (Parser), WP14 (Grader)
- **Effort:** Medium
- **Package:** `@claude-flow/protocols`

## Objective

Define and implement the AISP inter-agent message format for unambiguous task handoffs and coordination.

## Requirements

### Functional Requirements

1. **Message Structure**
   - Header (sender, receiver, timestamp)
   - AISP payload (preconditions, task, postconditions)
   - Quality tier
   - Optional evidence block

2. **Message Operations**
   - Create messages
   - Serialize/deserialize
   - Validate message structure

3. **Integration**
   - Work with message bus
   - Support compression

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/aisp/message.ts
export interface AISPMessage {
  // Header
  id: string;
  sender: string;
  receiver: string | 'broadcast';
  timestamp: number;

  // AISP Payload
  spec: {
    preconditions: string[];    // e.g., ["∀f∈InputFiles: isValid(f)"]
    task: string;               // e.g., "transform ≜ λf.compress(f)"
    postconditions: string[];   // e.g., ["∀r∈Results: size(r) < size(input)"]
    evidence?: ProofBlock;
  };

  // Metadata
  tier: QualityTier;
  conversationId?: string;
  replyTo?: string;

  // Optional compression
  compressed?: CompressedPayload;
}

export interface ProofBlock {
  prover: string;
  method: 'static-analysis' | 'test-execution' | 'formal-verification';
  confidence: number;
  details?: string;
}

export class AISPMessageBuilder {
  constructor();

  setSender(sender: string): this;
  setReceiver(receiver: string): this;
  setPreconditions(conditions: string[]): this;
  setTask(task: string): this;
  setPostconditions(conditions: string[]): this;
  setEvidence(evidence: ProofBlock): this;

  build(): AISPMessage;
  validate(): ValidationResult;
}

export class AISPMessageSerializer {
  static serialize(message: AISPMessage): string;
  static deserialize(json: string): AISPMessage;
  static compress(message: AISPMessage): CompressedPayload;
  static decompress(payload: CompressedPayload): AISPMessage;
}
```

### Message Example

```json
{
  "id": "msg-001",
  "sender": "coder-agent",
  "receiver": "tester-agent",
  "timestamp": 1706745600000,
  "spec": {
    "preconditions": ["∀f ∈ CodeFiles: compiled(f) = ⊤"],
    "task": "validate ≜ λf.runTests(f) ∧ coverage(f) ≥ 0.8",
    "postconditions": ["∀t ∈ Tests: passed(t) = ⊤"],
    "evidence": {
      "prover": "jest",
      "method": "test-execution",
      "confidence": 0.95
    }
  },
  "tier": "gold"
}
```

## Implementation Tasks

- [ ] Define `AISPMessage` interface
- [ ] Create `AISPMessageBuilder` fluent API
- [ ] Implement serialization/deserialization
- [ ] Implement compression integration
- [ ] Add message validation
- [ ] Create unit tests

## Acceptance Criteria

1. ✅ Messages serialize/deserialize correctly
2. ✅ Builder validates required fields
3. ✅ Compression reduces size
4. ✅ Integration with message bus

## Files to Create

```
v3/@claude-flow/protocols/src/aisp/
├── message.ts
├── message-builder.ts
├── message-serializer.ts
└── tests/message.test.ts
```

## References

- Plan Section: 3.4 Inter-Agent Message Format
