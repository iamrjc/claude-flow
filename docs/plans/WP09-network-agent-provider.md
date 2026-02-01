# WP09: Network Agent Provider

## Metadata
- **Wave:** 3 (Network Infrastructure)
- **Dependencies:** WP03 (Network Discovery)
- **Effort:** Large
- **Package:** `@claude-flow/network`

## Objective

Implement the main network abstraction layer that enables claude-flow to use models running on remote machines as if they were local providers.

## Requirements

### Functional Requirements

1. **Provider Interface**
   - Implement standard `Provider` interface
   - Route requests to remote Ollama instances
   - Handle network failures gracefully

2. **Agent Selection**
   - Select best agent for given model
   - Consider agent load and latency
   - Integrate with load balancer (WP10)

3. **Request Forwarding**
   - Forward generate/chat/embed requests
   - Handle streaming across network
   - Maintain request context

4. **Connection Management**
   - Connection pooling per agent
   - Keepalive and timeout handling
   - Automatic reconnection

### Technical Specifications

```typescript
// v3/@claude-flow/network/src/network-provider.ts
export interface NetworkProviderConfig {
  discovery: DiscoveryConfig;
  loadBalancing?: LoadBalancingConfig;
  healthCheck?: HealthCheckConfig;
  security?: SecurityConfig;
  connectionPool?: {
    maxConnectionsPerAgent?: number;  // default: 5
    idleTimeoutMs?: number;           // default: 30000
  };
}

export class NetworkAgentProvider implements Provider {
  private discovery: AgentDiscovery;
  private loadBalancer: LoadBalancer;
  private healthChecker: HealthChecker;
  private connectionPools: Map<string, ConnectionPool>;

  constructor(config: NetworkProviderConfig);

  async initialize(): Promise<void>;

  // Provider interface
  async generate(prompt: string, options: GenerateOptions): Promise<Response>;
  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>;
  async embed(text: string | string[]): Promise<number[] | number[][]>;

  // Network-specific
  async selectAgent(model: string, preferences?: AgentPreferences): Promise<NetworkAgent | null>;
  async forwardRequest(agent: NetworkAgent, request: Request): Promise<Response>;

  // Status
  getAvailableAgents(): NetworkAgent[];
  getAgentsByModel(model: string): NetworkAgent[];
  getNetworkStatus(): NetworkStatus;

  dispose(): Promise<void>;
}
```

### Request Flow

```
1. User calls generate(prompt, {model: 'qwen2.5:7b'})
2. NetworkAgentProvider.selectAgent('qwen2.5:7b')
   ├── Discovery: Get agents with this model
   ├── HealthChecker: Filter healthy agents
   └── LoadBalancer: Select best agent
3. Get/create connection from pool
4. Forward request to remote Ollama
5. Stream response back to caller
6. Return connection to pool
```

## Implementation Tasks

- [ ] Create `NetworkAgentProvider` class
- [ ] Integrate with `AgentDiscovery` from WP03
- [ ] Implement agent selection logic
- [ ] Create connection pool per agent
- [ ] Implement request forwarding
- [ ] Handle streaming over HTTP
- [ ] Add error handling and retries
- [ ] Integrate load balancer placeholder
- [ ] Integrate health checker placeholder
- [ ] Create unit tests
- [ ] Create integration tests

## Acceptance Criteria

1. ✅ Requests routed to correct remote agents
2. ✅ Streaming works across network
3. ✅ Connection pooling efficient
4. ✅ Network failures handled gracefully
5. ✅ Fallback to other agents on failure
6. ✅ Unit test coverage >80%

## Files to Create

```
v3/@claude-flow/network/src/
├── network-provider.ts
├── connection-pool.ts
├── request-forwarder.ts
└── tests/network-provider.test.ts
```

## References

- Plan Section: 2.1.6 Networked Local Agents
