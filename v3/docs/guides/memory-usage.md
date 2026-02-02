# Memory Usage Guide

## Overview

Claude Flow V3 features a unified memory system with semantic search capabilities powered by AgentDB and HNSW indexing, delivering 150x-12,500x faster vector search compared to brute-force approaches.

## Table of Contents

- [Memory Architecture](#memory-architecture)
- [Storing Memories](#storing-memories)
- [Searching Memories](#searching-memories)
- [Query Builder](#query-builder)
- [Memory Backends](#memory-backends)
- [HNSW Indexing](#hnsw-indexing)
- [Cross-Agent Memory Sharing](#cross-agent-memory-sharing)
- [Best Practices](#best-practices)

## Memory Architecture

```
┌────────────────────────────────────────┐
│     Unified Memory Service (ADR-006)   │
├────────────────────────────────────────┤
│   HybridMemoryRepository Interface     │
├────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌───────┐│
│  │ AgentDB  │  │  SQLite  │  │ Cache ││
│  │ Backend  │  │ Backend  │  │Manager││
│  │ (HNSW)   │  │(Struct'd)│  │ (LRU) ││
│  └──────────┘  └──────────┘  └───────┘│
└────────────────────────────────────────┘
```

### Key Components

1. **AgentDB Backend**: Vector storage with HNSW indexing
2. **SQLite Backend**: Structured data storage
3. **Hybrid Backend**: Combines both for optimal performance
4. **Cache Manager**: L1 (in-memory) + L2 (disk) caching

## Storing Memories

### CLI Usage

```bash
# Store a simple memory
npx @claude-flow/cli@latest memory store \
  --key "auth-pattern" \
  --value "Use JWT with refresh tokens for authentication" \
  --namespace patterns

# Store with tags
npx @claude-flow/cli@latest memory store \
  --key "password-hashing" \
  --value "Use bcrypt with 12 salt rounds" \
  --namespace security \
  --tags "authentication,security,best-practice"

# Store with TTL (time-to-live)
npx @claude-flow/cli@latest memory store \
  --key "temp-data" \
  --value "Temporary information" \
  --ttl 3600  # Expires after 1 hour
```

### Programmatic API

```typescript
import { HybridMemoryRepository } from '@claude-flow/memory';

// Initialize memory
const memory = new HybridMemoryRepository({
  backend: 'agentdb',
  vectorSearch: true,
  hnswEnabled: true,
});

await memory.initialize();

// Store a memory
await memory.store({
  content: 'Use bcrypt for password hashing with salt rounds of 12',
  type: 'procedural',
  category: 'security',
  tags: ['authentication', 'password', 'best-practice'],
  importance: 0.9,
  metadata: {
    source: 'security-audit',
    relatedPatterns: ['auth-001', 'crypt-002'],
  },
});

// Store with namespace
await memory.store({
  content: 'Always validate user input at API boundaries',
  namespace: 'security',
  type: 'procedural',
  tags: ['validation', 'api'],
});

// Bulk insert
const memories = [
  { content: 'Memory 1', type: 'episodic' },
  { content: 'Memory 2', type: 'procedural' },
  { content: 'Memory 3', type: 'semantic' },
];

await memory.bulkInsert(memories);
```

### Memory Types

| Type | Description | Use Case |
|------|-------------|----------|
| `episodic` | Specific experiences/events | Task history, interactions |
| `procedural` | How-to knowledge | Patterns, workflows, procedures |
| `semantic` | Facts and concepts | Documentation, definitions |
| `working` | Temporary context | Current task context |

## Searching Memories

### Semantic Search

```bash
# Basic search
npx @claude-flow/cli@latest memory search \
  --query "authentication security"

# With limit
npx @claude-flow/cli@latest memory search \
  --query "performance optimization" \
  --limit 5

# With threshold (minimum relevance)
npx @claude-flow/cli@latest memory search \
  --query "database patterns" \
  --threshold 0.8
```

### Programmatic Search

```typescript
// Basic semantic search
const results = await memory.search({
  query: 'authentication best practices',
  searchType: 'hybrid',
  limit: 10,
  minRelevance: 0.7,
});

results.results.forEach(result => {
  console.log(`[${result.relevance.toFixed(2)}] ${result.content}`);
  console.log(`  Tags: ${result.tags.join(', ')}`);
  console.log(`  Category: ${result.category}`);
});

// Search by tags
const taggedResults = await memory.query({
  type: 'tag',
  tags: ['security', 'authentication'],
  limit: 5,
});

// Search by namespace
const namespaceResults = await memory.query({
  type: 'namespace',
  namespace: 'patterns',
  limit: 20,
});

// Filtered search
const filteredResults = await memory.search({
  query: 'API security',
  searchType: 'hybrid',
  filters: {
    category: 'security',
    type: 'procedural',
    tags: ['api'],
    minImportance: 0.8,
  },
  limit: 5,
});
```

### Search Types

| Type | Description | Backend | Speed |
|------|-------------|---------|-------|
| `semantic` | Vector similarity | AgentDB | Fast (HNSW) |
| `structured` | SQL queries | SQLite | Very fast |
| `hybrid` | Both combined | Both | Optimal |

## Query Builder

### Fluent API

```typescript
import { query, QueryTemplates } from '@claude-flow/memory';

// Simple query
const results = await memory.query(
  query()
    .semantic('user authentication')
    .limit(10)
    .build()
);

// Advanced query
const advanced = await memory.query(
  query()
    .semantic('security vulnerabilities')
    .inNamespace('security')
    .withTags(['critical', 'auth'])
    .threshold(0.85)
    .limit(5)
    .sortBy('importance', 'desc')
    .build()
);

// Composite query
const composite = await memory.query(
  query()
    .semantic('performance optimization')
    .withCategory('performance')
    .minImportance(0.7)
    .createdAfter(Date.now() - 86400000) // Last 24 hours
    .limit(10)
    .build()
);
```

### Query Templates

```typescript
// Use predefined templates
const securityQuery = QueryTemplates.security({
  topic: 'authentication',
  minRelevance: 0.8,
});

const performanceQuery = QueryTemplates.performance({
  area: 'database',
  limit: 5,
});

const recentQuery = QueryTemplates.recent({
  hours: 24,
  category: 'patterns',
});
```

## Memory Backends

### AgentDB Backend (Recommended for Semantic)

```typescript
import { AgentDBBackend } from '@claude-flow/memory';

const agentdb = new AgentDBBackend({
  dimensions: 1536, // Embedding dimensions
  hnswM: 16, // HNSW parameter
  hnswEfConstruction: 200,
  cacheEnabled: true,
  cacheSize: 10000,
});

await agentdb.initialize();

// Vector search
const results = await agentdb.search(embedding, {
  k: 10,
  threshold: 0.7,
});
```

### SQLite Backend (Recommended for Structured)

```typescript
import { SQLiteBackend } from '@claude-flow/memory';

const sqlite = new SQLiteBackend({
  path: './data/memory.db',
  inMemory: false,
  cacheEnabled: true,
});

await sqlite.initialize();

// Structured query
const results = await sqlite.query({
  type: 'structured',
  where: {
    category: 'security',
    'importance >': 0.8,
  },
  limit: 10,
});
```

### Hybrid Backend (Recommended Default - ADR-009)

```typescript
import { HybridBackend } from '@claude-flow/memory';

const hybrid = new HybridBackend({
  sqlitePath: './data/memory.db',
  agentdbConfig: {
    dimensions: 1536,
    hnswEnabled: true,
  },
  cacheEnabled: true,
});

await hybrid.initialize();

// Automatically routes queries
const semanticResults = await hybrid.search(embedding, { k: 10 });
const structuredResults = await hybrid.query({ type: 'structured', where: { category: 'security' } });
```

## HNSW Indexing

### What is HNSW?

Hierarchical Navigable Small World (HNSW) is a graph-based algorithm for approximate nearest neighbor search, delivering 150x-12,500x faster searches than brute-force.

### Configuration

```typescript
import { HNSWIndex } from '@claude-flow/memory';

const index = new HNSWIndex({
  dimensions: 1536,
  M: 16, // Number of connections per layer (higher = more accurate, slower build)
  efConstruction: 200, // Build-time parameter (higher = better quality)
  efSearch: 100, // Search-time parameter (higher = more accurate, slower search)
  quantization: {
    enabled: true,
    method: 'int8', // 3.92x memory reduction
  },
});

await index.initialize();

// Add vectors
await index.add('id-1', embedding1);
await index.add('id-2', embedding2);

// Search
const results = await index.search(queryEmbedding, { k: 10 });
```

### Performance Tuning

| Parameter | Impact | Recommendation |
|-----------|--------|----------------|
| `M` | Connections per layer | 16 (default), 32 (high accuracy) |
| `efConstruction` | Build quality | 200 (default), 400 (high quality) |
| `efSearch` | Search accuracy | 100 (default), 200 (high accuracy) |
| `quantization` | Memory usage | `int8` for 3.92x reduction |

### Rebuild Index

```bash
# Rebuild HNSW index
npx @claude-flow/cli@latest memory rebuild-index

# With progress
npx @claude-flow/cli@latest memory rebuild-index --progress

# Force rebuild
npx @claude-flow/cli@latest memory rebuild-index --force
```

## Cross-Agent Memory Sharing

### Share Memories

```typescript
// Share memory with specific agent
const memory = await memoryRepo.get('memory-id');
await memoryRepo.shareWith('memory-id', 'agent-123');

// Share with multiple agents
const agentIds = ['agent-1', 'agent-2', 'agent-3'];
for (const agentId of agentIds) {
  await memoryRepo.shareWith('memory-id', agentId);
}

// Get memories shared with agent
const sharedMemories = await memoryRepo.getSharedWith('agent-123');
console.log(`Agent has access to ${sharedMemories.length} shared memories`);
```

### Memory Namespaces

```typescript
// Namespace-based isolation
const agentMemory = new HybridMemoryRepository({
  defaultNamespace: 'agent-123',
});

// Store in agent's namespace
await agentMemory.store({
  content: 'Agent-specific memory',
  namespace: 'agent-123',
});

// Cross-namespace access
const globalMemories = await agentMemory.query({
  type: 'namespace',
  namespace: 'global',
});

const agentMemories = await agentMemory.query({
  type: 'namespace',
  namespace: 'agent-123',
});
```

### Memory Access Control

```typescript
// Set access levels
await memory.store({
  content: 'Sensitive information',
  accessLevel: 'private', // 'public', 'shared', 'private'
  sharedWith: ['agent-123', 'agent-456'],
});

// Check access
const hasAccess = await memory.checkAccess('memory-id', 'agent-123');
if (hasAccess) {
  const mem = await memory.get('memory-id');
}
```

## Best Practices

### 1. Use Appropriate Memory Types

```typescript
// Episodic: Specific events
await memory.store({
  content: 'Completed task: Implement authentication on 2026-02-02',
  type: 'episodic',
  category: 'task-history',
  timestamp: Date.now(),
});

// Procedural: How-to knowledge
await memory.store({
  content: 'To implement JWT auth: 1) Generate token, 2) Validate token, 3) Refresh token',
  type: 'procedural',
  category: 'patterns',
});

// Semantic: Facts and concepts
await memory.store({
  content: 'JWT stands for JSON Web Token, a compact URL-safe means of representing claims',
  type: 'semantic',
  category: 'definitions',
});
```

### 2. Optimize Search Performance

```typescript
// Use caching for frequently accessed memories
const cache = new CacheManager({
  maxSize: 10000,
  ttl: 3600000, // 1 hour
});

// Batch operations
const memoriesToStore = [/* ... */];
await memory.bulkInsert(memoriesToStore);

// Use appropriate search type
const structuredResults = await memory.query({ type: 'structured' }); // For exact matches
const semanticResults = await memory.search({ searchType: 'semantic' }); // For similarity
```

### 3. Memory Lifecycle Management

```typescript
// Set TTL for temporary memories
await memory.store({
  content: 'Temporary context',
  ttl: 3600000, // 1 hour
});

// Clean up old memories
await memory.query({
  type: 'structured',
  where: { 'createdAt <': Date.now() - 30 * 86400000 }, // Older than 30 days
}).then(oldMemories => {
  return Promise.all(oldMemories.map(m => memory.delete(m.id)));
});

// Archive important memories
const important = await memory.query({
  type: 'structured',
  where: { 'importance >=': 0.9 },
});
// Export to long-term storage
```

### 4. Effective Tagging

```typescript
// Use consistent tag hierarchies
await memory.store({
  content: 'Security pattern',
  tags: [
    'security',           // Top-level category
    'security:auth',      // Sub-category
    'security:auth:jwt',  // Specific pattern
  ],
});

// Search by tag hierarchy
const authMemories = await memory.query({
  type: 'tag',
  tags: ['security:auth'],
  includeSubtags: true,
});
```

### 5. Monitor Memory Health

```typescript
// Regular health checks
const health = await memory.healthCheck();
console.log(`Memory health: ${health.status}`);
console.log(`Total entries: ${health.totalEntries}`);
console.log(`Cache hit rate: ${health.cacheHitRate}`);
console.log(`Average search time: ${health.averageSearchTime}ms`);

// Get statistics
const stats = await memory.getStats();
console.log(`Namespaces: ${stats.namespaces.length}`);
console.log(`Memory usage: ${stats.memoryUsage} bytes`);
console.log(`HNSW index size: ${stats.hnswIndexSize}`);
```

## Troubleshooting

### Slow Searches

```bash
# Check HNSW index
npx @claude-flow/cli@latest memory health

# Rebuild index
npx @claude-flow/cli@latest memory rebuild-index

# Adjust search parameters
npx @claude-flow/cli@latest memory search --query "test" --ef-search 50  # Lower = faster
```

### High Memory Usage

```typescript
// Enable quantization
const memory = new HybridMemoryRepository({
  quantization: {
    enabled: true,
    method: 'int8', // 3.92x memory reduction
  },
});

// Reduce cache size
const memory = new HybridMemoryRepository({
  cacheSize: 5000, // Smaller cache
  cacheTtl: 1800000, // 30 minutes
});

// Clean up old entries
await memory.clearNamespace('temp');
```

### Missing Results

```typescript
// Lower threshold
const results = await memory.search({
  query: 'authentication',
  threshold: 0.5, // Lower = more results (less precise)
});

// Increase search limit
const results = await memory.search({
  query: 'authentication',
  limit: 50, // More results
});

// Check namespace
const allResults = await memory.listNamespaces();
console.log(`Available namespaces: ${allResults.join(', ')}`);
```

## Next Steps

- [Swarm Coordination Guide](./swarm-coordination.md) - Multi-agent coordination
- [Plugin Development Guide](./plugin-development.md) - Extend memory capabilities
- [CLI Commands Reference](../api/cli-commands.md) - All CLI commands
- [Example: Memory Search](../../examples/memory-search.ts) - Working code example
