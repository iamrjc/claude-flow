# WP31: Configuration System

## Metadata
- **Wave:** 9 (Integration)
- **Dependencies:** All functional WPs
- **Effort:** Medium
- **Package:** `@claude-flow/core`

## Objective

Implement unified configuration system for network, persistence, protocols, and providers.

## Requirements

### Functional Requirements

1. **Configuration Schema**
   - Provider configuration
   - Network settings
   - Persistence options
   - Protocol settings

2. **Configuration Loading**
   - File-based (JSON)
   - Environment variables
   - CLI overrides
   - Defaults

3. **Validation**
   - Schema validation
   - Type checking
   - Required field checking

### Technical Specifications

```typescript
// v3/@claude-flow/core/src/config/schema.ts
export interface ClaudeFlowConfig {
  providers: {
    local: {
      ollama?: OllamaConfig;
      onnx?: ONNXConfig;
    };
    cloud: {
      anthropic?: { enabled: boolean };
      gemini?: GeminiConfig;
    };
  };

  routing: {
    preferLocal?: boolean;
    fallbackToCloud?: boolean;
    complexityThresholds?: {
      local: number;
      cloud: number;
    };
  };

  network?: {
    enabled: boolean;
    discovery: DiscoveryConfig;
    loadBalancing: LoadBalancingConfig;
    security: NetworkSecurityConfig;
    sync?: SyncConfig;
    recovery?: RecoveryConfig;
  };

  persistence?: {
    backend: 'hybrid' | 'sqlite' | 'agentdb';
    sqlite?: SQLiteConfig;
    hnsw?: HNSWConfig;
    cache?: CacheConfig;
  };

  protocols?: {
    aisp?: { enabled: boolean; minQuality?: string };
    c2c?: { enabled: boolean; fusers?: string[] };
    adol?: { enabled: boolean; verbosity?: string };
    thoughtCompression?: { enabled: boolean; method?: string };
  };
}
```

### Configuration File Example

```json
{
  "providers": {
    "local": {
      "ollama": {
        "enabled": true,
        "host": "http://localhost:11434",
        "models": ["qwen2.5:7b"]
      }
    },
    "cloud": {
      "anthropic": { "enabled": true },
      "gemini": {
        "enabled": true,
        "command": "gemini",
        "dailyTokenLimit": 2000000
      }
    }
  },
  "network": {
    "enabled": true,
    "discovery": { "method": "mdns" },
    "loadBalancing": { "strategy": "weighted" }
  },
  "protocols": {
    "aisp": { "enabled": true },
    "c2c": { "enabled": true }
  }
}
```

## Implementation Tasks

- [ ] Define configuration schema
- [ ] Create configuration loader
- [ ] Implement environment variable mapping
- [ ] Implement CLI override merging
- [ ] Add schema validation
- [ ] Create default configurations
- [ ] Create unit tests
- [ ] Document all options

## Acceptance Criteria

1. ✅ All options documented
2. ✅ Validation catches errors
3. ✅ Env vars override file
4. ✅ CLI overrides all

## Files to Create

```
v3/@claude-flow/core/src/config/
├── schema.ts
├── loader.ts
├── validator.ts
├── defaults.ts
└── tests/config.test.ts
```

## References

- Plan Section: 9.1 Configuration File
