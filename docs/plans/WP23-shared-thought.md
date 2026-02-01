# WP23: Shared Thought Protocol

## Metadata
- **Wave:** 7 (Compression)
- **Dependencies:** WP22 (Thought Compressor)
- **Effort:** Medium
- **Package:** `@claude-flow/protocols`

## Objective

Define and implement the shared thought protocol for agents to exchange compressed reasoning instead of full conversation transcripts.

## Requirements

### Functional Requirements

1. **Thought Structure**
   - Compressed representation
   - Key conclusions
   - Confidence scores
   - Optional evidence

2. **Sharing Protocol**
   - Publish thoughts to swarm
   - Subscribe to relevant thoughts
   - Thought aggregation

3. **Integration**
   - Work with message bus
   - Compatible with AISP messages

### Technical Specifications

```typescript
// v3/@claude-flow/protocols/src/compression/shared-thought.ts
export interface SharedThought {
  id: string;
  agentId: string;
  taskId: string;
  timestamp: number;

  // Compressed representation
  thought: {
    type: 'latent' | 'step-entropy' | 'focused';
    data: Float32Array | string;
    originalTokens: number;
    compressedTokens: number;
  };

  // Key conclusions (always included)
  conclusions: string[];

  // Confidence and evidence
  confidence: number;
  evidence?: AISPProof;

  // Relationships
  relatedThoughts?: string[];
  supersedes?: string;
}

export interface ThoughtSubscription {
  taskId?: string;
  agentId?: string;
  minConfidence?: number;
  thoughtTypes?: string[];
}

export class SharedThoughtManager {
  constructor(messageBus: MessageBus, compressor: ThoughtCompressor);

  /**
   * Share a thought with the swarm
   */
  async shareThought(
    reasoning: string,
    conclusions: string[],
    options?: ShareOptions
  ): Promise<SharedThought>;

  /**
   * Subscribe to thoughts matching criteria
   */
  subscribe(
    subscription: ThoughtSubscription,
    callback: (thought: SharedThought) => void
  ): Unsubscribe;

  /**
   * Get all thoughts for a task
   */
  getThoughtsForTask(taskId: string): SharedThought[];

  /**
   * Aggregate multiple thoughts into summary
   */
  aggregateThoughts(thoughts: SharedThought[]): AggregatedInsight;

  /**
   * Expand a shared thought to full reasoning
   */
  async expandThought(thought: SharedThought): Promise<string>;
}
```

### Thought Flow

```
Agent A: Complete reasoning
    ↓
Compress (step-entropy)
    ↓
Extract conclusions
    ↓
Create SharedThought
    ↓
Publish to message bus
    ↓
Agent B: Subscribe & receive
    ↓
Use conclusions directly
  OR
Expand if detail needed
```

## Implementation Tasks

- [ ] Define `SharedThought` interface
- [ ] Create `SharedThoughtManager` class
- [ ] Implement thought sharing
- [ ] Implement subscription system
- [ ] Implement thought aggregation
- [ ] Integrate with message bus
- [ ] Create unit tests
- [ ] Test multi-agent scenarios

## Acceptance Criteria

1. ✅ Thoughts share correctly
2. ✅ Subscriptions filter accurately
3. ✅ Aggregation produces summaries
4. ✅ Expansion recovers detail

## Files to Create

```
v3/@claude-flow/protocols/src/compression/
├── shared-thought.ts
├── thought-manager.ts
├── thought-aggregator.ts
└── tests/shared-thought.test.ts
```

## References

- Plan Section: 6.3 Shared Thought Protocol
