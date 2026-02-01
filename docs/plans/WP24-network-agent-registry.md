# WP24: Network Agent Registry

## Metadata
- **Wave:** 8 (Persistence)
- **Dependencies:** WP09-12 (Network Infrastructure)
- **Effort:** Medium
- **Package:** `@claude-flow/network`

## Objective

Extend the existing `@claude-flow/swarm` AgentRegistry with network-specific fields for tracking remote agents across the LAN.

## Requirements

### Functional Requirements

1. **Extended Agent Fields**
   - Host/port information
   - Hardware specifications
   - Network latency tracking
   - Discovery method

2. **Network Operations**
   - Register remote agents
   - Update health status
   - Track network metadata

3. **Query Capabilities**
   - Filter by network status
   - Filter by hardware specs
   - Filter by available models

### Technical Specifications

```typescript
// v3/@claude-flow/network/src/network-agent-registry.ts
import { AgentRegistry } from '@claude-flow/swarm';

export interface NetworkAgentInfo extends AgentInfo {
  metadata: {
    host: string;
    port: number;
    isRemote: true;
    discoveryMethod: 'mdns' | 'static' | 'registry';
    hardware: {
      gpu?: string;
      vramGB?: number;
      cpuCores?: number;
      ramGB?: number;
    };
    models: string[];
    lastHealthCheck: number;
    latencyMs: number;
  };
}

export class NetworkAgentRegistry extends AgentRegistry {
  /**
   * Register a network-discovered agent
   */
  async registerNetworkAgent(agent: NetworkAgentInfo): Promise<void>;

  /**
   * Update agent health from health checker
   */
  async updateHealth(agentId: string, health: HealthStatus): Promise<void>;

  /**
   * Get only network (remote) agents
   */
  async getNetworkAgents(): Promise<NetworkAgentInfo[]>;

  /**
   * Get agents by model availability
   */
  async getAgentsByModel(model: string): Promise<NetworkAgentInfo[]>;

  /**
   * Get agents meeting hardware requirements
   */
  async getAgentsByHardware(requirements: HardwareRequirements): Promise<NetworkAgentInfo[]>;

  /**
   * Remove stale agents not seen recently
   */
  async pruneStaleAgents(maxAgeMs: number): Promise<string[]>;
}
```

### Integration with Existing AgentRegistry

```
@claude-flow/swarm AgentRegistry
├── register()
├── update()
├── list()
└── get()
         │
         │ extends
         ▼
NetworkAgentRegistry
├── registerNetworkAgent()
├── updateHealth()
├── getNetworkAgents()
├── getAgentsByModel()
└── pruneStaleAgents()
```

## Implementation Tasks

- [ ] Extend `AgentRegistry` class
- [ ] Add network-specific fields to schema
- [ ] Implement `registerNetworkAgent()`
- [ ] Implement `updateHealth()`
- [ ] Implement network query methods
- [ ] Add stale agent pruning
- [ ] Create unit tests
- [ ] Test with discovery integration

## Acceptance Criteria

1. ✅ Extends existing AgentRegistry
2. ✅ Network fields persisted correctly
3. ✅ Query methods filter accurately
4. ✅ Health updates reflected

## Files to Create

```
v3/@claude-flow/network/src/
├── network-agent-registry.ts
└── tests/network-agent-registry.test.ts
```

## References

- Plan Section: 2.1.7 Persistence Integration
- Existing: `@claude-flow/swarm/src/coordination/agent-registry.ts`
