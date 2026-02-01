# WP03: Network Discovery Service

## Metadata
- **Wave:** 1 (Foundation)
- **Dependencies:** None
- **Effort:** Large
- **Package:** `@claude-flow/network`

## Objective

Implement network agent discovery using mDNS/Bonjour for zero-config networking, with fallback to static configuration and registry-based discovery.

## Requirements

### Functional Requirements

1. **mDNS/Bonjour Discovery**
   - Advertise agents on `_claude-flow-agent._tcp.local`
   - Discover peers automatically on LAN
   - Publish agent capabilities in TXT records

2. **Static Configuration**
   - Manual IP/port configuration
   - Fallback when mDNS unavailable
   - Support for remote agents outside LAN

3. **Registry-Based Discovery**
   - Central registry server option
   - Agent registration/deregistration
   - Health status aggregation

4. **Agent Advertisement**
   - Hostname and port
   - Available models
   - Hardware specs (GPU, VRAM)
   - Current status (available/busy/degraded)

### Technical Specifications

```typescript
// v3/@claude-flow/network/src/discovery.ts
export interface NetworkAgent {
  id: string;
  hostname: string;
  host: string;           // IP address
  port: number;
  models: string[];
  hardware: {
    gpu?: string;
    vramGB?: number;
    cpuCores?: number;
    ramGB?: number;
  };
  status: 'available' | 'busy' | 'degraded' | 'offline';
  discoveredAt: number;
  lastSeen: number;
  discoveryMethod: 'mdns' | 'static' | 'registry';
}

export interface DiscoveryConfig {
  method: 'mdns' | 'static' | 'registry' | 'auto';
  mdns?: {
    serviceName?: string;  // default: '_claude-flow-agent._tcp'
    timeout?: number;      // discovery timeout ms
  };
  staticHosts?: Array<{
    host: string;
    port: number;
    models?: string[];
  }>;
  registry?: {
    url: string;
    apiKey?: string;
  };
}

export class AgentDiscovery extends EventEmitter {
  constructor(config: DiscoveryConfig);

  // Discovery
  async discover(): Promise<NetworkAgent[]>;
  async discoverOnce(): Promise<NetworkAgent[]>;
  startContinuousDiscovery(intervalMs: number): void;
  stopContinuousDiscovery(): void;

  // Advertisement
  advertise(agent: AgentAdvertisement): void;
  stopAdvertising(): void;

  // Agent access
  getAgent(id: string): NetworkAgent | undefined;
  getAllAgents(): NetworkAgent[];
  getAgentsByModel(model: string): NetworkAgent[];

  // Events
  on(event: 'agent-discovered', listener: (agent: NetworkAgent) => void): this;
  on(event: 'agent-lost', listener: (agentId: string) => void): this;
  on(event: 'agent-updated', listener: (agent: NetworkAgent) => void): this;
}
```

### mDNS Record Format

```
Service: _claude-flow-agent._tcp.local
PTR: <agent-id>._claude-flow-agent._tcp.local
SRV: 0 0 <port> <hostname>.local
TXT: models=qwen2.5:7b,llama3.2:3b
     gpu=RTX 3080
     vram=12
     status=available
```

## Implementation Tasks

- [ ] Create `AgentDiscovery` class skeleton
- [ ] Implement mDNS discovery using `multicast-dns` package
- [ ] Implement mDNS advertisement
- [ ] Parse TXT records for agent metadata
- [ ] Implement static host configuration
- [ ] Implement registry client (optional)
- [ ] Add continuous discovery mode
- [ ] Implement agent timeout/expiry logic
- [ ] Add event emission for discovery events
- [ ] Create unit tests with mocked mDNS
- [ ] Create integration tests on real network
- [ ] Document discovery configuration

## Testing Requirements

### Unit Tests
- Mock mDNS responses
- Test TXT record parsing
- Test static host fallback
- Test agent expiry logic
- Test event emission

### Integration Tests
- Real mDNS discovery (requires network)
- Cross-machine discovery
- Agent advertisement verification

## Acceptance Criteria

1. ✅ mDNS discovery finds agents on LAN within 2 seconds
2. ✅ Agent capabilities correctly parsed from TXT records
3. ✅ Static hosts work when mDNS unavailable
4. ✅ Continuous discovery updates agent status
5. ✅ Offline agents detected and removed
6. ✅ Events emitted for discovery changes
7. ✅ Unit test coverage >80%

## Files to Create/Modify

```
v3/@claude-flow/network/
├── src/
│   ├── discovery/
│   │   ├── index.ts
│   │   ├── agent-discovery.ts    # Main class
│   │   ├── mdns-discovery.ts     # mDNS implementation
│   │   ├── static-discovery.ts   # Static config
│   │   ├── registry-client.ts    # Registry option
│   │   └── types.ts
│   └── index.ts
├── tests/
│   ├── discovery.test.ts
│   └── discovery-integration.test.ts
└── package.json
```

## Dependencies

```json
{
  "dependencies": {
    "multicast-dns": "^7.2.5",
    "dns-packet": "^5.6.1"
  }
}
```

## References

- Plan Section: 2.1.6 Networked Local Agents
- [multicast-dns npm package](https://www.npmjs.com/package/multicast-dns)
- [mDNS/Bonjour RFC 6762](https://tools.ietf.org/html/rfc6762)
