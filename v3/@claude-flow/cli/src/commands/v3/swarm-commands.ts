/**
 * V3 Swarm CLI Commands
 * Multi-agent swarm orchestration commands
 */

import type { Command, CommandContext, CommandResult } from '../../types.js';
import { output } from '../../output.js';
import { select } from '../../prompt.js';
import { callMCPTool, MCPClientError } from '../../mcp-client.js';
import { formatStatus } from './command-utils.js';
import { TableFormatter, JSONFormatter } from './output-formatter.js';

// Topology options
const TOPOLOGIES = [
  { value: 'hierarchical', label: 'Hierarchical', hint: 'Leader-based (anti-drift)' },
  { value: 'mesh', label: 'Mesh', hint: 'Peer-to-peer' },
  { value: 'hierarchical-mesh', label: 'Hierarchical Mesh', hint: 'V3 hybrid (recommended)' },
  { value: 'ring', label: 'Ring', hint: 'Circular communication' }
];

/**
 * Swarm Init Command
 * swarm init [--topology <type>] [--max-agents <n>]
 */
export const swarmInitCommand: Command = {
  name: 'init',
  description: 'Initialize a swarm',
  options: [
    {
      name: 'topology',
      short: 't',
      description: 'Swarm topology',
      type: 'string',
      choices: TOPOLOGIES.map(t => t.value),
      default: 'hierarchical'
    },
    {
      name: 'max-agents',
      short: 'm',
      description: 'Maximum number of agents',
      type: 'number',
      default: 8
    },
    {
      name: 'strategy',
      short: 's',
      description: 'Coordination strategy',
      type: 'string',
      choices: ['specialized', 'balanced', 'adaptive'],
      default: 'specialized'
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    let topology = ctx.flags.topology as string;

    if (!topology && ctx.interactive) {
      topology = await select({
        message: 'Select topology:',
        options: TOPOLOGIES,
        default: 'hierarchical'
      });
    }

    try {
      const result = await callMCPTool<{
        swarmId: string;
        topology: string;
        maxAgents: number;
        strategy: string;
        status: string;
      }>('swarm_init', {
        topology: topology || 'hierarchical',
        maxAgents: ctx.flags['max-agents'] || 8,
        strategy: ctx.flags.strategy || 'specialized',
        metadata: {
          source: 'cli',
          version: 'v3'
        }
      });

      output.printSuccess(`Swarm initialized: ${result.swarmId}`);
      output.printInfo(`Topology: ${result.topology}, Max Agents: ${result.maxAgents}`);
      output.printInfo(`Strategy: ${result.strategy}`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to initialize swarm: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Swarm Status Command
 * swarm status
 */
export const swarmStatusCommand: Command = {
  name: 'status',
  description: 'Get swarm status',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    try {
      const result = await callMCPTool<{
        swarmId: string;
        topology: string;
        status: string;
        activeAgents: number;
        maxAgents: number;
        tasksInProgress: number;
        tasksCompleted: number;
        utilization: number;
      }>('swarm_status', {});

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.printBox(
        [
          `Swarm ID:        ${result.swarmId}`,
          `Topology:        ${result.topology}`,
          `Status:          ${formatStatus(result.status)}`,
          `Active Agents:   ${result.activeAgents}/${result.maxAgents}`,
          `Tasks Running:   ${result.tasksInProgress}`,
          `Tasks Completed: ${result.tasksCompleted}`,
          `Utilization:     ${(result.utilization * 100).toFixed(1)}%`
        ].join('\n'),
        'Swarm Status'
      );

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to get swarm status: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Swarm Scale Command
 * swarm scale <target>
 */
export const swarmScaleCommand: Command = {
  name: 'scale',
  description: 'Scale swarm to target size',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const target = parseInt(ctx.args[0], 10);

    if (isNaN(target) || target < 0) {
      output.printError('Target must be a positive number');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        previousSize: number;
        newSize: number;
        scaledAt: string;
      }>('swarm_scale', {
        targetSize: target
      });

      output.printSuccess(`Swarm scaled from ${result.previousSize} to ${result.newSize} agents`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to scale swarm: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Swarm Topology Command
 * swarm topology <type>
 */
export const swarmTopologyCommand: Command = {
  name: 'topology',
  description: 'Change swarm topology',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    let topology = ctx.args[0];

    if (!topology && ctx.interactive) {
      topology = await select({
        message: 'Select new topology:',
        options: TOPOLOGIES
      });
    }

    if (!topology) {
      output.printError('Topology is required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        previousTopology: string;
        newTopology: string;
        reconfiguredAt: string;
      }>('swarm_topology', {
        topology
      });

      output.printSuccess(`Topology changed from ${result.previousTopology} to ${result.newTopology}`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to change topology: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Parent command
export const swarmCommands: Command = {
  name: 'swarm',
  description: 'Swarm orchestration commands',
  subcommands: [
    swarmInitCommand,
    swarmStatusCommand,
    swarmScaleCommand,
    swarmTopologyCommand
  ],
  action: async (): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('Swarm Commands'));
    output.writeln();
    output.printList([
      `${output.highlight('init')}     - Initialize a swarm`,
      `${output.highlight('status')}   - Get swarm status`,
      `${output.highlight('scale')}    - Scale swarm size`,
      `${output.highlight('topology')} - Change topology`
    ]);
    return { success: true };
  }
};
