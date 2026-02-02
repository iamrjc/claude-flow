/**
 * Memory Search Example
 *
 * Demonstrates semantic search with HNSW indexing and hybrid memory backend.
 *
 * Run: npx tsx examples/memory-search.ts
 */

import { HybridMemoryRepository } from '@claude-flow/memory';
import { query, QueryTemplates } from '@claude-flow/memory';

async function main() {
  console.log('🧠 Claude Flow V3 - Memory Search Example\n');

  // Initialize hybrid memory
  console.log('1️⃣ Initializing hybrid memory (SQLite + AgentDB)...\n');

  const memory = new HybridMemoryRepository({
    backend: 'agentdb',
    vectorSearch: true,
    hnswEnabled: true,
  });

  await memory.initialize();
  console.log('✅ Memory initialized\n');

  // Store sample memories
  console.log('2️⃣ Storing sample memories...\n');

  const memories = [
    {
      content: 'Use bcrypt for password hashing with salt rounds of 12',
      type: 'procedural',
      category: 'security',
      tags: ['authentication', 'password', 'best-practice'],
      importance: 0.9,
    },
    {
      content: 'JWT tokens should expire after 15 minutes for security',
      type: 'procedural',
      category: 'security',
      tags: ['authentication', 'jwt', 'security'],
      importance: 0.85,
    },
    {
      content: 'Always validate user input with Zod schemas at API boundaries',
      type: 'procedural',
      category: 'security',
      tags: ['validation', 'security', 'api'],
      importance: 0.95,
    },
    {
      content: 'Use indexed database queries for performance optimization',
      type: 'procedural',
      category: 'performance',
      tags: ['database', 'optimization', 'indexing'],
      importance: 0.80,
    },
    {
      content: 'Implement rate limiting on public API endpoints',
      type: 'procedural',
      category: 'security',
      tags: ['api', 'security', 'rate-limiting'],
      importance: 0.88,
    },
  ];

  for (const mem of memories) {
    await memory.store(mem);
  }

  console.log(`✅ Stored ${memories.length} memories\n`);

  // Semantic search
  console.log('3️⃣ Performing semantic searches...\n');

  // Search 1: Security best practices
  console.log('🔍 Search: "authentication security best practices"\n');

  const securityResults = await memory.search({
    query: 'authentication security best practices',
    searchType: 'hybrid',
    limit: 3,
    minRelevance: 0.7,
  });

  console.log(`Found ${securityResults.results.length} results:`);
  securityResults.results.forEach((result, i) => {
    console.log(`  ${i + 1}. [${result.relevance.toFixed(2)}] ${result.content}`);
  });
  console.log();

  // Search 2: Performance optimization
  console.log('🔍 Search: "database performance optimization"\n');

  const perfResults = await memory.search({
    query: 'database performance optimization',
    searchType: 'hybrid',
    limit: 2,
    minRelevance: 0.6,
  });

  console.log(`Found ${perfResults.results.length} results:`);
  perfResults.results.forEach((result, i) => {
    console.log(`  ${i + 1}. [${result.relevance.toFixed(2)}] ${result.content}`);
  });
  console.log();

  // Advanced query with builder
  console.log('4️⃣ Using query builder...\n');

  const advancedResults = await memory.query(
    query()
      .semantic('API security')
      .withTags(['security'])
      .threshold(0.75)
      .limit(5)
      .build()
  );

  console.log(`Found ${advancedResults.length} results with query builder\n`);

  // Get memory statistics
  console.log('5️⃣ Memory statistics...\n');

  const stats = await memory.getStats();
  console.log(`Total memories: ${stats.totalEntries}`);
  console.log(`Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(2)}%`);
  console.log(`Average search time: ${stats.averageSearchTime}ms\n`);

  // Cleanup
  await memory.shutdown();
  console.log('✅ Memory shutdown\n');

  console.log('✨ Memory search example completed!');
}

main().catch(console.error);
