# WP07: Gemini-3-Pro Provider Implementation

## Metadata
- **Wave:** 2 (Additional Providers)
- **Dependencies:** WP01 (patterns), WP02 (Provider interface)
- **Effort:** Medium
- **Package:** `@claude-flow/providers`

## Objective

Implement Gemini-3-Pro provider that leverages the `gemini` CLI command for high-capacity cloud inference with 2M tokens/day and no rate windows.

## Requirements

### Functional Requirements

1. **CLI Integration**
   - Invoke `gemini` command
   - Parse CLI output
   - Handle streaming responses

2. **Token Budget Management**
   - Track daily token usage
   - Enforce 2M token limit
   - Reset at midnight
   - Budget queries

3. **Strategic Routing**
   - High-context tasks (>100K)
   - Long-running operations
   - Anthropic rate-limit fallback

### Technical Specifications

```typescript
// v3/@claude-flow/providers/src/gemini-provider.ts
export interface GeminiConfig {
  command?: string;          // default: 'gemini'
  dailyLimit?: number;       // default: 2_000_000
  resetHour?: number;        // default: 0 (midnight)
}

export class GeminiProvider implements Provider {
  private dailyTokensUsed: number = 0;
  private lastResetDate: string;

  constructor(config?: GeminiConfig);

  async generate(prompt: string, options: GenerateOptions): Promise<Response>;
  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>;

  // Budget management
  getRemainingDailyTokens(): number;
  getDailyUsage(): { used: number; limit: number; remaining: number };
  resetDailyCounter(): void;

  // Health
  async checkHealth(): Promise<HealthStatus>;
  isAvailable(): boolean;
}
```

### Budget Tracking

```typescript
interface TokenBudget {
  dailyLimit: number;       // 2,000,000
  used: number;             // Current usage
  resetAt: Date;            // Next reset time
  history: DailyUsage[];    // Last 7 days
}
```

## Implementation Tasks

- [ ] Implement CLI process spawning
- [ ] Parse CLI responses
- [ ] Implement streaming via CLI
- [ ] Add token counting
- [ ] Implement daily budget tracking
- [ ] Add midnight reset logic
- [ ] Persist usage across restarts
- [ ] Create unit tests
- [ ] Create integration tests with real CLI

## Acceptance Criteria

1. ✅ CLI invocation works correctly
2. ✅ Token counting accurate
3. ✅ Daily budget enforced
4. ✅ Budget persists across restarts
5. ✅ Graceful handling when budget exhausted

## Files to Create

```
v3/@claude-flow/providers/src/
├── gemini-provider.ts
├── gemini-budget.ts
└── tests/gemini-provider.test.ts
```

## References

- Plan Section: 2.1.5 Gemini-3-Pro Integration
- Gemini CLI documentation
