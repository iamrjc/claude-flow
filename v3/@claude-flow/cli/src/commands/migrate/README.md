# WP23: Migration Tooling (v2 to v3)

Comprehensive migration tooling for transitioning from Claude Flow v2 to v3 with backup, rollback, and validation capabilities.

## Overview

The migration system provides:
- **Automatic backup** before migration
- **Dry-run support** for safe preview
- **Detailed logging** and progress tracking
- **Rollback capability** with version tracking
- **Data integrity validation**

## Architecture

```
migrate/
├── types.ts                  # Type definitions for v2/v3 configs and migration
├── migrate-config.ts         # Configuration migration
├── migrate-database.ts       # SQLite schema migration
├── migrate-plugins.ts        # Plugin mapping to v3 equivalents
├── migrate-sessions.ts       # Session data conversion
├── validate-migration.ts     # Data integrity checks
├── rollback.ts              # Rollback capability
├── command.ts               # CLI command interface
├── index.ts                 # Module exports
└── __tests__/
    └── migration.test.ts    # Comprehensive test suite (35+ tests)
```

## Usage

### Basic Migration

```bash
# Preview configuration migration
npx @claude-flow/cli@latest migrate config --dry-run

# Migrate configuration with backup
npx @claude-flow/cli@latest migrate config

# Migrate database schema
npx @claude-flow/cli@latest migrate database

# Validate migration integrity
npx @claude-flow/cli@latest migrate validate
```

### Advanced Options

```bash
# Specify source and target directories
npx @claude-flow/cli@latest migrate config \
  --source /path/to/v2/project \
  --target /path/to/v3/project

# Skip backup (not recommended)
npx @claude-flow/cli@latest migrate config --no-backup

# Force overwrite existing files
npx @claude-flow/cli@latest migrate config --force

# Verbose output
npx @claude-flow/cli@latest migrate config --verbose
```

### Rollback

```bash
# List available backups
npx @claude-flow/cli@latest migrate rollback --list

# Rollback to latest backup
npx @claude-flow/cli@latest migrate rollback

# Rollback to specific backup
npx @claude-flow/cli@latest migrate rollback --backup-id backup-1234567890

# Dry-run rollback
npx @claude-flow/cli@latest migrate rollback --dry-run
```

## Migration Components

### 1. Configuration Migration (`migrate-config.ts`)

Transforms v2 configuration to v3 format:

**v2 → v3 Mappings:**
- `swarm.mode` → `swarm.topology` (sequential→hierarchical, parallel→mesh, hierarchical→hierarchical-mesh)
- `memory.type` → `memory.backend` (local→sqlite, redis→agentdb, sqlite→hybrid)
- `provider` → `providers[]` (single provider → provider array)
- `hooks` → `hooks.hooks[]` (object → array of hook definitions)
- `embeddings.provider` → ONNX Runtime (OpenAI/TF.js → local ONNX models)

**Features:**
- Automatic backup creation
- Schema validation
- Deprecated feature warnings
- Default value injection

### 2. Database Migration (`migrate-database.ts`)

Applies SQLite schema migrations:

**Migrations:**
1. **v1: V3 Schema**
   - Schema version tracking
   - HNSW index support tables
   - Neural learning patterns table
   - Session metadata columns

2. **v2: Hyperbolic Embeddings**
   - Embeddings configuration table
   - Embedding cache with geometry support
   - Performance indexes

3. **v3: Swarm Coordination**
   - Swarm state table
   - Agent metrics tracking
   - Performance monitoring

**Features:**
- Automatic database discovery
- Backup before migration
- Rollback SQL scripts
- Migration history tracking

### 3. Plugin Migration (`migrate-plugins.ts`)

Maps v2 plugins to v3 equivalents:

| V2 Plugin | V3 Equivalent | Auto-Convert | Notes |
|-----------|---------------|--------------|-------|
| memory-plugin | @claude-flow/memory | ✅ | Now built-in with HNSW indexing |
| hooks-plugin | @claude-flow/hooks | ✅ | 17 hooks + 12 workers |
| embeddings-plugin | @claude-flow/embeddings | ❌ | Requires ONNX Runtime setup |
| swarm-plugin | @claude-flow/swarm | ✅ | Enhanced with 15-agent coordination |
| mcp-plugin | @claude-flow/mcp | ✅ | Core feature with stdio/http/websocket |
| neural-plugin | @claude-flow/neural | ❌ | Requires RuVector integration |
| security-plugin | @claude-flow/security | ✅ | Enhanced CVE remediation |
| performance-plugin | @claude-flow/performance | ✅ | Flash Attention optimizations |
| deployment-plugin | @claude-flow/deployment | ✅ | Rollback and environments |
| testing-plugin | @claude-flow/testing | ✅ | Built-in test utilities |

**Features:**
- Automatic plugin mapping
- Migration report generation
- Manual migration warnings
- Deprecated plugin detection

### 4. Session Migration (`migrate-sessions.ts`)

Converts v2 session data to v3 format:

**Transformations:**
- Add v3 version field
- Normalize agent array structure
- Update memory format
- Add migration metadata

**Features:**
- Batch session processing
- Invalid session handling
- Data structure validation

### 5. Migration Validation (`validate-migration.ts`)

Validates migration integrity:

**Validation Checks:**
1. **Configuration Schema**: V3 config structure and field validation
2. **File Structure**: Required directories and files
3. **Database Schema**: v3 tables and indexes
4. **Plugin References**: Plugin mappings and references
5. **Session Data**: Session structure and version fields

**Features:**
- Detailed error reporting
- Warning system
- Suggestion generation
- Fix recommendations

### 6. Rollback System (`rollback.ts`)

Provides rollback capability:

**Features:**
- Backup metadata tracking
- Integrity verification (checksums)
- File restoration
- Pre-rollback backup
- Backup listing and selection

**Backup Structure:**
```
.backups/
└── backup-1234567890/
    ├── metadata.json
    ├── claude-flow.config.json
    └── [other backed up files]
```

## Type System

### Core Types

```typescript
// Migration Options
interface MigrationOptions {
  dryRun: boolean;
  backup: boolean;
  force: boolean;
  sourceDir: string;
  targetDir: string;
  targets: MigrationTarget[];
  verbose: boolean;
}

// Migration Result
interface MigrationResult {
  success: boolean;
  target: MigrationTarget;
  itemsMigrated: number;
  itemsSkipped: number;
  itemsFailed: number;
  messages: MigrationMessage[];
  duration: number;
  backupPath?: string;
  errors: MigrationError[];
  warnings: string[];
}

// Configuration Types
interface V2Config {
  version?: string;
  agents?: { defaultModel?: string; maxAgents?: number; };
  swarm?: { mode?: 'sequential' | 'parallel' | 'hierarchical'; };
  memory?: { type?: 'local' | 'redis' | 'sqlite'; };
  provider?: string;
  hooks?: Record<string, string | { handler: string; enabled: boolean }>;
  embeddings?: { provider?: 'openai' | 'tensorflow'; };
}

interface V3Config {
  version: string;
  projectRoot: string;
  agents: AgentConfig;
  swarm: SwarmConfig;
  memory: MemoryConfig;
  mcp: MCPConfig;
  cli: CLIPreferences;
  hooks: HooksConfig;
}
```

## Testing

Comprehensive test suite with 35+ tests achieving >80% coverage:

```bash
# Run migration tests
npm test migrate.test.ts

# Run with coverage
npm test -- --coverage migrate.test.ts
```

**Test Categories:**
- Config Migration (12 tests)
- Database Migration (8 tests)
- Plugin Migration (6 tests)
- Session Migration (4 tests)
- Validation (5 tests)
- Rollback (5 tests)
- Integration (5+ tests)
- Error Handling (3 tests)
- Edge Cases (3+ tests)

## Error Handling

All migration components implement robust error handling:

```typescript
try {
  const result = await migrateConfig(options);

  if (!result.success) {
    // Handle migration failure
    result.errors.forEach(error => {
      console.error(`${error.code}: ${error.message}`);
    });
  }

  // Check warnings
  result.warnings.forEach(warning => {
    console.warn(warning);
  });
} catch (error) {
  // Handle unexpected errors
  console.error('Migration failed:', error);
}
```

## Performance

- **Config Migration**: < 100ms (excluding I/O)
- **Database Migration**: < 1s per database (excluding large datasets)
- **Plugin Migration**: < 50ms (mostly I/O bound)
- **Session Migration**: < 10ms per session
- **Validation**: < 500ms (full validation suite)

## Best Practices

1. **Always use dry-run first**
   ```bash
   npx @claude-flow/cli@latest migrate config --dry-run
   ```

2. **Review migration output**
   - Check warnings
   - Verify mappings
   - Validate transformations

3. **Keep backups**
   - Don't skip backup step
   - Test rollback procedure
   - Store backups securely

4. **Validate after migration**
   ```bash
   npx @claude-flow/cli@latest migrate validate
   ```

5. **Test in staging first**
   - Migrate staging environment
   - Verify functionality
   - Then migrate production

## Breaking Changes

The migration system handles these v2→v3 breaking changes:

**Configuration:**
- Config file renamed: `claude-flow.json` → `claude-flow.config.json`
- Swarm config: `swarm.mode` → `swarm.topology`
- Provider format: single string → provider array

**Memory:**
- Backend option: `memory.type` → `memory.backend`
- HNSW enabled by default
- Storage path: `.claude-flow/memory` → `data/memory`

**Embeddings:**
- Provider: OpenAI/TF.js → ONNX Runtime (local)
- Geometry: Euclidean only → Hyperbolic (Poincaré ball)
- Cache: Memory-only → sql.js persistent cache

## Support

For issues or questions:
- GitHub Issues: https://github.com/ruvnet/claude-flow/issues
- Documentation: https://github.com/ruvnet/claude-flow/tree/main/v3
