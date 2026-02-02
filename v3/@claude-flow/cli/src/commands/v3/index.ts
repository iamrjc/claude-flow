/**
 * V3 CLI Commands - Main Index
 * Exports all V3 domain-driven commands
 */

import { agentCommands } from './agent-commands.js';
import { taskCommands } from './task-commands.js';
import { memoryCommands } from './memory-commands.js';
import { coordinationCommands, sessionCommands, messageCommands, consensusCommands } from './coordination-commands.js';
import { swarmCommands } from './swarm-commands.js';

export { agentCommands, taskCommands, memoryCommands, coordinationCommands, sessionCommands, messageCommands, consensusCommands, swarmCommands };

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
