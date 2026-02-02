/**
 * @claude-flow/mcp - Tools Module
 *
 * Exports all MCP tools for agent, task, memory, coordination, and swarm management
 */

import type { MCPTool } from '../types.js';

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
export const allMCPTools: MCPTool[] = [
  ...agentTools,
  ...taskTools,
  ...memoryTools,
  ...coordinationTools,
  ...swarmTools,
] as MCPTool[];

/**
 * Tool categories for organization
 */
export const toolCategories: Record<string, MCPTool[]> = {
  agent: agentTools as MCPTool[],
  task: taskTools as MCPTool[],
  memory: memoryTools as MCPTool[],
  coordination: coordinationTools as MCPTool[],
  swarm: swarmTools as MCPTool[],
};

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): MCPTool[] {
  return toolCategories[category] ?? [];
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
