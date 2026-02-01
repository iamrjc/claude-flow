# WP01: Ollama Provider Implementation

## Metadata
- **Wave:** 1 (Foundation)
- **Dependencies:** None
- **Effort:** Medium
- **Package:** `@claude-flow/providers`

## Objective

Implement a production-ready Ollama provider that enables claude-flow to use local LLMs via Ollama's API.

## Requirements

### Functional Requirements

1. **Provider Interface Implementation**
   - Implement `Provider` interface from `@claude-flow/integration`
   - Support `generate()`, `embed()`, `chat()` methods
   - Handle streaming responses

2. **Model Management**
   - List available models via `ollama list`
   - Pull models programmatically
   - Check model availability before use

3. **Configuration**
   - Configurable host (default: `http://localhost:11434`)
   - Connection timeout settings
   - Request retry logic

4. **Health Monitoring**
   - Health check endpoint (`/api/tags`)
   - Connection status tracking
   - Automatic reconnection

### Technical Specifications

```typescript
// v3/@claude-flow/providers/src/ollama-provider.ts
export interface OllamaConfig {
  host?: string;           // default: 'http://localhost:11434'
  timeout?: number;        // default: 30000ms
  retries?: number;        // default: 3
  keepAlive?: string;      // default: '5m'
}

export class OllamaProvider implements Provider {
  constructor(config?: OllamaConfig);

  async generate(prompt: string, options: GenerateOptions): Promise<Response>;
  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>;
  async embed(text: string | string[]): Promise<number[] | number[][]>;

  async listModels(): Promise<ModelInfo[]>;
  async pullModel(name: string): Promise<void>;
  async checkHealth(): Promise<HealthStatus>;
}
```

### Recommended Models Configuration

| Model | Size | Context | Use Case |
|-------|------|---------|----------|
| `qwen2.5:0.5b` | 0.5B | 32K | Agent Booster alternative |
| `qwen2.5:3b` | 3B | 32K | Fast local tasks |
| `qwen2.5:7b` | 7B | 128K | General agents |
| `qwen2.5:14b` | 14B | 128K | Complex reasoning |
| `llama3.2:3b` | 3B | 128K | Tool calling |

## Implementation Tasks

- [ ] Create `OllamaProvider` class skeleton
- [ ] Implement `generate()` with streaming support
- [ ] Implement `chat()` for conversation format
- [ ] Implement `embed()` for vector embeddings
- [ ] Add model listing and pulling
- [ ] Implement health check with retry logic
- [ ] Add connection pooling for performance
- [ ] Create unit tests (>80% coverage)
- [ ] Create integration tests with real Ollama
- [ ] Document API with examples

## Testing Requirements

### Unit Tests
- Mock Ollama API responses
- Test error handling (timeout, connection refused)
- Test retry logic
- Test streaming response handling

### Integration Tests
- Requires running Ollama instance
- Test with real model generation
- Test embedding generation
- Test model pull functionality

## Acceptance Criteria

1. ✅ Provider implements full `Provider` interface
2. ✅ Streaming generation works correctly
3. ✅ Health check returns accurate status
4. ✅ Connection errors handled gracefully
5. ✅ Unit test coverage >80%
6. ✅ Integration tests pass with Ollama
7. ✅ API documentation complete

## Files to Create/Modify

```
v3/@claude-flow/providers/
├── src/
│   ├── ollama-provider.ts      # Main implementation
│   ├── ollama-types.ts         # Type definitions
│   └── index.ts                # Export
├── tests/
│   ├── ollama-provider.test.ts # Unit tests
│   └── ollama-integration.test.ts
└── README.md                   # Package docs
```

## References

- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Ollama JavaScript Library](https://github.com/ollama/ollama-js)
- Plan Section: 2.1.1 Ollama Integration
