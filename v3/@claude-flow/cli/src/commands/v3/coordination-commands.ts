/**
 * V3 Coordination CLI Commands
 * Session and consensus coordination commands
 */

import type { Command, CommandContext, CommandResult } from '../../types.js';
import { output } from '../../output.js';
import { select, confirm } from '../../prompt.js';
import { callMCPTool, MCPClientError } from '../../mcp-client.js';
import { formatStatus, formatTimestamp } from './command-utils.js';
import { TableFormatter, JSONFormatter } from './output-formatter.js';

// Topology types
const TOPOLOGIES = [
  { value: 'hierarchical', label: 'Hierarchical', hint: 'Leader-based coordination' },
  { value: 'mesh', label: 'Mesh', hint: 'Peer-to-peer communication' },
  { value: 'ring', label: 'Ring', hint: 'Circular communication' },
  { value: 'star', label: 'Star', hint: 'Central hub coordination' }
];

/**
 * Session Create Command
 * session create [--topology <type>]
 */
export const sessionCreateCommand: Command = {
  name: 'create',
  description: 'Create a new coordination session',
  options: [
    {
      name: 'topology',
      short: 't',
      description: 'Communication topology',
      type: 'string',
      choices: TOPOLOGIES.map(t => t.value),
      default: 'hierarchical'
    },
    {
      name: 'name',
      short: 'n',
      description: 'Session name',
      type: 'string'
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
        sessionId: string;
        topology: string;
        status: string;
        createdAt: string;
      }>('session_create', {
        topology: topology || 'hierarchical',
        name: ctx.flags.name,
        metadata: {
          source: 'cli'
        }
      });

      output.printSuccess(`Session created: ${result.sessionId}`);
      output.printInfo(`Topology: ${result.topology}`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to create session: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Session Join Command
 * session join <session-id> <agent-id>
 */
export const sessionJoinCommand: Command = {
  name: 'join',
  description: 'Join an agent to a session',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const sessionId = ctx.args[0];
    const agentId = ctx.args[1];

    if (!sessionId || !agentId) {
      output.printError('Session ID and Agent ID are required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        sessionId: string;
        agentId: string;
        joined: boolean;
        joinedAt: string;
      }>('session_join', {
        sessionId,
        agentId
      });

      output.printSuccess(`Agent ${agentId} joined session ${sessionId}`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to join session: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Session Status Command
 * session status <session-id>
 */
export const sessionStatusCommand: Command = {
  name: 'status',
  description: 'Get session status',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const sessionId = ctx.args[0];

    if (!sessionId) {
      output.printError('Session ID is required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        sessionId: string;
        topology: string;
        status: string;
        participants: Array<{ agentId: string; role: string; joinedAt: string }>;
        createdAt: string;
      }>('session_status', {
        sessionId
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.printBox(
        [
          `Session ID: ${result.sessionId}`,
          `Topology:   ${result.topology}`,
          `Status:     ${formatStatus(result.status)}`,
          `Created:    ${formatTimestamp(result.createdAt)}`,
          `Participants: ${result.participants.length}`
        ].join('\n'),
        'Session Status'
      );

      if (result.participants.length > 0) {
        output.writeln();
        TableFormatter.format({
          columns: [
            { key: 'agentId', header: 'Agent ID', width: 20 },
            { key: 'role', header: 'Role', width: 15 },
            { key: 'joinedAt', header: 'Joined At', width: 20 }
          ],
          data: result.participants.map(p => ({
            ...p,
            joinedAt: formatTimestamp(p.joinedAt)
          }))
        });
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to get session status: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Session End Command
 * session end <session-id>
 */
export const sessionEndCommand: Command = {
  name: 'end',
  aliases: ['close'],
  description: 'End a coordination session',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const sessionId = ctx.args[0];

    if (!sessionId) {
      output.printError('Session ID is required');
      return { success: false, exitCode: 1 };
    }

    if (ctx.interactive) {
      const confirmed = await confirm({
        message: `End session ${sessionId}?`,
        default: false
      });

      if (!confirmed) {
        output.printInfo('Operation cancelled');
        return { success: true };
      }
    }

    try {
      const result = await callMCPTool<{
        sessionId: string;
        ended: boolean;
        endedAt: string;
      }>('session_end', {
        sessionId
      });

      output.printSuccess(`Session ${sessionId} ended`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to end session: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Message Send Command
 * message send <from> <to> <content>
 */
export const messageSendCommand: Command = {
  name: 'send',
  description: 'Send a message between agents',
  options: [
    {
      name: 'priority',
      short: 'p',
      description: 'Message priority',
      type: 'string',
      default: 'normal'
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const from = ctx.args[0];
    const to = ctx.args[1];
    const content = ctx.args.slice(2).join(' ');

    if (!from || !to || !content) {
      output.printError('From, To, and Content are required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        messageId: string;
        from: string;
        to: string;
        sent: boolean;
        sentAt: string;
      }>('message_send', {
        from,
        to,
        content,
        priority: ctx.flags.priority || 'normal'
      });

      output.printSuccess(`Message sent: ${result.messageId}`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to send message: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Consensus Request Command
 * consensus request <session-id> <proposal>
 */
export const consensusRequestCommand: Command = {
  name: 'request',
  description: 'Request consensus on a proposal',
  options: [
    {
      name: 'timeout',
      short: 't',
      description: 'Consensus timeout in seconds',
      type: 'number',
      default: 30
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const sessionId = ctx.args[0];
    const proposal = ctx.args.slice(1).join(' ');

    if (!sessionId || !proposal) {
      output.printError('Session ID and Proposal are required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        consensusId: string;
        sessionId: string;
        proposal: string;
        status: string;
        votes: { for: number; against: number; abstain: number };
        reached: boolean;
      }>('consensus_request', {
        sessionId,
        proposal,
        timeout: ctx.flags.timeout || 30
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.printBox(
        [
          `Consensus ID: ${result.consensusId}`,
          `Proposal:     ${result.proposal}`,
          `Status:       ${formatStatus(result.status)}`,
          `Reached:      ${result.reached ? 'Yes' : 'No'}`,
          '',
          `Votes For:     ${result.votes.for}`,
          `Votes Against: ${result.votes.against}`,
          `Abstentions:   ${result.votes.abstain}`
        ].join('\n'),
        'Consensus Result'
      );

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to request consensus: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Parent commands
export const sessionCommands: Command = {
  name: 'session',
  description: 'Session coordination commands',
  subcommands: [
    sessionCreateCommand,
    sessionJoinCommand,
    sessionStatusCommand,
    sessionEndCommand
  ]
};

export const messageCommands: Command = {
  name: 'message',
  description: 'Message passing commands',
  subcommands: [messageSendCommand]
};

export const consensusCommands: Command = {
  name: 'consensus',
  description: 'Consensus coordination commands',
  subcommands: [consensusRequestCommand]
};

export const coordinationCommands: Command = {
  name: 'coordination',
  description: 'Coordination commands',
  subcommands: [sessionCommands, messageCommands, consensusCommands],
  action: async (): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('Coordination Commands'));
    output.writeln();
    output.printList([
      `${output.highlight('session')}   - Session management`,
      `${output.highlight('message')}   - Message passing`,
      `${output.highlight('consensus')} - Consensus coordination`
    ]);
    return { success: true };
  }
};
