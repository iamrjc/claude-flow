/**
 * @claude-flow/mcp - Tools Module
 *
 * Exports all MCP tools for agent, task, memory, coordination, and swarm management
 */

// Tool definitions
export * from './agent-tools.js';
export * from './task-tools.js';
export * from './memory-tools.js';
export * from './coordination-tools.js';
export * from './swarm-tools.js';

// Schemas
export * from './schemas.js';

// Tool executor
export * from './tool-executor.js';

// Collect all tools
import { agentTools } from './agent-tools.js';
import { taskTools } from './task-tools.js';
import { memoryTools } from './memory-tools.js';
import { coordinationTools } from './coordination-tools.js';
import { swarmTools } from './swarm-tools.js';

/**
 * All available MCP tools
 */
export const allMCPTools = [
  ...agentTools,
  ...taskTools,
  ...memoryTools,
  ...coordinationTools,
  ...swarmTools,
];

/**
 * Tool categories for organization
 */
export const toolCategories = {
  agent: agentTools,
  task: taskTools,
  memory: memoryTools,
  coordination: coordinationTools,
  swarm: swarmTools,
};

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string) {
  return toolCategories[category as keyof typeof toolCategories] ?? [];
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return allMCPTools.map((tool) => tool.name);
}

/**
 * Tool counts by category
 */
export const toolCounts = {
  agent: agentTools.length,
  task: taskTools.length,
  memory: memoryTools.length,
  coordination: coordinationTools.length,
  swarm: swarmTools.length,
  total: allMCPTools.length,
};
