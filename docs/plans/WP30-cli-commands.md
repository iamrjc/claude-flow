# WP30: CLI Commands Integration

## Metadata
- **Wave:** 9 (Integration)
- **Dependencies:** All functional WPs
- **Effort:** Medium
- **Package:** `@claude-flow/cli`

## Objective

Implement all new CLI commands for network discovery, provider management, memory status, and protocol tools.

## Requirements

### Functional Requirements

1. **Network Commands**
   - `network discover` - Find agents on LAN
   - `network health` - Check agent health
   - `network topology` - View network map
   - `network add-host` - Add static host
   - `network ping-all` - Test connectivity

2. **Provider Commands**
   - `providers add` - Add provider
   - `providers test` - Test provider
   - `providers status` - View status
   - `providers budget` - Check token budgets

3. **Memory Commands**
   - `memory status` - View persistence status
   - `memory export` - Export memory
   - `network sync` - Force sync
   - `network replication status` - View replication

4. **Protocol Commands**
   - `aisp convert` - Convert NL to AISP
   - `aisp validate` - Validate AISP spec
   - `protocols status` - Protocol metrics
   - `metrics compression` - Compression stats

### Technical Specifications

```typescript
// v3/@claude-flow/cli/src/commands/network.ts
export const networkCommands = {
  discover: {
    description: 'Discover agents on the network',
    options: {
      timeout: { type: 'number', default: 5000 },
      format: { type: 'string', choices: ['table', 'json'] }
    },
    action: async (options) => { ... }
  },

  health: {
    description: 'Check network agent health',
    action: async () => { ... }
  },

  topology: {
    description: 'View network topology',
    action: async () => { ... }
  },

  'add-host': {
    description: 'Add static host',
    arguments: ['<host>'],
    options: {
      port: { type: 'number', default: 11434 },
      name: { type: 'string' }
    },
    action: async (host, options) => { ... }
  }
};
```

### Command List

```bash
# Network
npx claude-flow@v3 network discover
npx claude-flow@v3 network health
npx claude-flow@v3 network topology
npx claude-flow@v3 network add-host <ip> --port <port>
npx claude-flow@v3 network ping-all
npx claude-flow@v3 network sync --all
npx claude-flow@v3 network replication status

# Providers
npx claude-flow@v3 providers add ollama
npx claude-flow@v3 providers add gemini --command gemini
npx claude-flow@v3 providers test <provider>
npx claude-flow@v3 providers status [provider]
npx claude-flow@v3 providers budget <provider>

# Memory
npx claude-flow@v3 memory status
npx claude-flow@v3 memory export --format sqlite
npx claude-flow@v3 memory search -q "query"

# Protocols
npx claude-flow@v3 aisp convert "task description"
npx claude-flow@v3 aisp validate <file.aisp>
npx claude-flow@v3 protocols status
npx claude-flow@v3 metrics compression --last-hour

# Agent (extended)
npx claude-flow@v3 agent spawn -t coder --model qwen2.5:7b --node desktop-2
npx claude-flow@v3 agent spawn -t researcher --provider gemini
```

## Implementation Tasks

- [ ] Create network command group
- [ ] Create providers command group
- [ ] Create memory command group
- [ ] Create protocols command group
- [ ] Update agent spawn for network nodes
- [ ] Add output formatting (table/json)
- [ ] Create help documentation
- [ ] Create command tests

## Acceptance Criteria

1. ✅ All commands functional
2. ✅ Help text complete
3. ✅ Error handling user-friendly
4. ✅ Output formats work

## Files to Create

```
v3/@claude-flow/cli/src/commands/
├── network.ts
├── providers.ts
├── memory.ts
├── protocols.ts
└── tests/commands.test.ts
```

## References

- Plan Section: 9.2 CLI Commands
