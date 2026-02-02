/**
 * Plugin Usage Example
 *
 * Demonstrates creating and using custom plugins with Claude Flow V3.
 *
 * Run: npx tsx examples/plugin-usage.ts
 */

import { PluginBuilder, getDefaultRegistry } from '@claude-flow/plugins';
import { HookEvent, HookPriority } from '@claude-flow/plugins';

async function main() {
  console.log('🔌 Claude Flow V3 - Plugin Usage Example\n');

  // Create a custom plugin
  console.log('1️⃣ Creating custom plugin...\n');

  const customPlugin = new PluginBuilder('example-plugin', '1.0.0')
    .withDescription('Example plugin demonstrating v3 capabilities')
    .withAuthor({
      name: 'Claude Flow Team',
      email: 'team@claude-flow.dev',
    })
    .withDependencies([
      { name: '@claude-flow/memory', version: '^3.0.0' },
      { name: '@claude-flow/agents', version: '^3.0.0' },
    ])
    .withMCPTools([
      {
        name: 'example/greet',
        description: 'Greet a user',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name to greet' },
          },
          required: ['name'],
        },
        handler: async (input: { name: string }) => {
          return { greeting: `Hello, ${input.name}! Welcome to Claude Flow V3.` };
        },
      },
    ])
    .withHooks([
      {
        name: 'pre-task',
        priority: 'normal' as HookPriority,
        handler: async (event: HookEvent) => {
          console.log(`📋 Pre-task hook triggered for: ${event.data.task}`);
          return { modified: false };
        },
      },
      {
        name: 'post-task',
        priority: 'normal' as HookPriority,
        handler: async (event: HookEvent) => {
          console.log(`✅ Post-task hook triggered: ${event.data.success ? 'Success' : 'Failed'}`);
          return { modified: false };
        },
      },
    ])
    .withWorkers([
      {
        name: 'example-worker',
        trigger: 'custom',
        priority: 'normal',
        handler: async (context) => {
          console.log(`⚙️  Example worker processing: ${context.trigger}`);
          return {
            success: true,
            data: { processed: true },
          };
        },
      },
    ])
    .build();

  console.log(`✅ Plugin created: ${customPlugin.metadata.name}\n`);

  // Register plugin
  console.log('2️⃣ Registering plugin...\n');

  const registry = getDefaultRegistry();
  await registry.register(customPlugin);

  console.log('✅ Plugin registered\n');

  // Use MCP tool from plugin
  console.log('3️⃣ Using MCP tool from plugin...\n');

  const greetTool = customPlugin.mcpTools?.find(t => t.name === 'example/greet');
  if (greetTool) {
    const result = await greetTool.handler({ name: 'Developer' });
    console.log(`Tool result: ${result.greeting}\n`);
  }

  // Trigger hooks
  console.log('4️⃣ Triggering hooks...\n');

  const preTaskHook = customPlugin.hooks?.find(h => h.name === 'pre-task');
  if (preTaskHook) {
    await preTaskHook.handler({
      type: 'pre-task',
      data: { task: 'Example task' },
      timestamp: Date.now(),
    });
  }

  const postTaskHook = customPlugin.hooks?.find(h => h.name === 'post-task');
  if (postTaskHook) {
    await postTaskHook.handler({
      type: 'post-task',
      data: { success: true },
      timestamp: Date.now(),
    });
  }

  console.log();

  // Execute worker
  console.log('5️⃣ Executing worker...\n');

  const worker = customPlugin.workers?.find(w => w.name === 'example-worker');
  if (worker) {
    const result = await worker.handler({
      trigger: 'manual',
      data: {},
      timestamp: Date.now(),
    });
    console.log(`Worker result: ${JSON.stringify(result)}\n`);
  }

  // Get plugin statistics
  console.log('6️⃣ Plugin statistics...\n');

  const stats = await registry.getStats();
  console.log(`Total plugins: ${stats.total}`);
  console.log(`Active plugins: ${stats.active}`);
  console.log(`Total MCP tools: ${stats.totalMCPTools}`);
  console.log(`Total hooks: ${stats.totalHooks}`);
  console.log(`Total workers: ${stats.totalWorkers}\n`);

  // Unregister plugin
  console.log('7️⃣ Unregistering plugin...\n');

  await registry.unregister('example-plugin');
  console.log('✅ Plugin unregistered\n');

  console.log('✨ Plugin example completed!');
}

main().catch(console.error);
