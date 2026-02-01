/**
 * V3 CLI Commands - Main Index
 * Exports all V3 domain-driven commands
 */

export { agentCommands } from './agent-commands.js';
export { taskCommands } from './task-commands.js';
export { memoryCommands } from './memory-commands.js';
export { coordinationCommands, sessionCommands, messageCommands, consensusCommands } from './coordination-commands.js';
export { swarmCommands } from './swarm-commands.js';

// Utilities
export * from './command-utils.js';
export * from './output-formatter.js';

/**
 * Get all V3 commands as array
 */
export function getAllV3Commands() {
  return [
    agentCommands,
    taskCommands,
    memoryCommands,
    coordinationCommands,
    swarmCommands
  ];
}
