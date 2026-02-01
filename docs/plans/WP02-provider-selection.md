# WP02: Provider Selection Algorithm

## Metadata
- **Wave:** 1 (Foundation)
- **Dependencies:** None (defines interfaces for other providers)
- **Effort:** Medium
- **Package:** `@claude-flow/integration`

## Objective

Implement intelligent provider selection that routes requests to the optimal provider (local, cloud, or network) based on task complexity, preferences, and availability.

## Requirements

### Functional Requirements

1. **3-Tier Routing System**
   ```
   Tier 1: Agent Booster (WASM) - <1ms, $0
        ↓
   Tier 2A: Local Models (Qwen/Llama) - ~600ms, FREE
   Tier 2B: Haiku - ~500ms, $0.0002
        ↓
   Tier 3A: Gemini-3-Pro - 1-3s, FREE (2M/day)
   Tier 3B: Sonnet/Opus - 2-5s, $0.003-0.015
   ```

2. **Task Complexity Analysis**
   - Analyze task description for complexity signals
   - Consider context size requirements
   - Factor in tool/function calling needs

3. **Preference Handling**
   - `preferLocal` - Prioritize local models
   - `offline` - Only use local, no cloud
   - `privacyMode` - Keep data on-device
   - `costOptimize` - Minimize cloud spend

4. **Provider Health Integration**
   - Check provider availability before selection
   - Fallback chain when primary unavailable
   - Rate limit awareness

### Technical Specifications

```typescript
// v3/@claude-flow/integration/src/provider-selector.ts
export interface RoutingPreferences {
  preferLocal?: boolean;
  offline?: boolean;
  privacyMode?: boolean;
  costOptimize?: boolean;
  maxLatency?: number;        // ms
  minCapability?: number;     // 0-1 complexity threshold
}

export interface TaskContext {
  prompt: string;
  contextSize: number;
  requiresTools?: boolean;
  longRunning?: boolean;
  model?: string;             // Explicit model request
}

export interface ProviderSelection {
  provider: string;
  model: string;
  tier: 1 | 2 | 3;
  reason?: string;
}

export async function selectProvider(
  task: TaskContext,
  preferences: RoutingPreferences
): Promise<ProviderSelection>;

export async function analyzeComplexity(task: TaskContext): Promise<number>;

export function detectAgentBoosterIntent(prompt: string): AgentBoosterIntent | null;
```

### Complexity Scoring

| Factor | Weight | Description |
|--------|--------|-------------|
| Prompt length | 0.2 | Longer = more complex |
| Code keywords | 0.2 | Architecture, refactor, security |
| Multi-step signals | 0.3 | "then", "after", "finally" |
| Tool requirements | 0.2 | Function calling needed |
| Context size | 0.1 | Large context = complex |

## Implementation Tasks

- [ ] Define `RoutingPreferences` interface
- [ ] Define `TaskContext` interface
- [ ] Implement `analyzeComplexity()` scoring
- [ ] Implement `detectAgentBoosterIntent()` for Tier 1
- [ ] Implement `selectProvider()` main router
- [ ] Add provider health check integration
- [ ] Implement fallback chain logic
- [ ] Create cloud provider sub-router
- [ ] Add rate limit tracking
- [ ] Create unit tests
- [ ] Create integration tests

## Testing Requirements

### Unit Tests
- Test complexity scoring with various prompts
- Test Agent Booster detection
- Test preference combinations
- Test fallback chain selection

### Integration Tests
- Test with mock providers
- Test rate limit handling
- Test offline mode
- Test cloud fallback scenarios

## Acceptance Criteria

1. ✅ Agent Booster intents detected for simple transforms
2. ✅ Local providers selected when `preferLocal` set
3. ✅ Complexity scoring produces consistent results
4. ✅ Fallback chain works when providers unavailable
5. ✅ Rate limit tracking prevents over-usage
6. ✅ Unit test coverage >80%

## Files to Create/Modify

```
v3/@claude-flow/integration/src/
├── provider-selector.ts       # Main selector
├── complexity-analyzer.ts     # Complexity scoring
├── agent-booster-detector.ts  # Tier 1 detection
├── cloud-router.ts            # Cloud provider selection
└── types/routing.ts           # Type definitions
```

## References

- Plan Section: 2.2 Provider Selection Algorithm
- ADR-026: 3-Tier Routing System
