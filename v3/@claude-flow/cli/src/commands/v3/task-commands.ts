/**
 * V3 Task CLI Commands
 * Domain-driven task management commands
 */

import type { Command, CommandContext, CommandResult } from '../../types.js';
import { output } from '../../output.js';
import { select, confirm, input } from '../../prompt.js';
import { callMCPTool, MCPClientError } from '../../mcp-client.js';
import { formatStatus, formatPriority, formatTimestamp, parseList } from './command-utils.js';
import { TableFormatter, JSONFormatter } from './output-formatter.js';

// Task types
const TASK_TYPES = [
  { value: 'implementation', label: 'Implementation', hint: 'Feature implementation' },
  { value: 'bug-fix', label: 'Bug Fix', hint: 'Fix a bug' },
  { value: 'refactoring', label: 'Refactoring', hint: 'Code refactoring' },
  { value: 'testing', label: 'Testing', hint: 'Write tests' },
  { value: 'documentation', label: 'Documentation', hint: 'Documentation' },
  { value: 'research', label: 'Research', hint: 'Research task' },
  { value: 'review', label: 'Review', hint: 'Code review' },
  { value: 'optimization', label: 'Optimization', hint: 'Performance optimization' }
];

// Task priorities
const TASK_PRIORITIES = [
  { value: 'critical', label: 'Critical', hint: 'Highest priority' },
  { value: 'high', label: 'High', hint: 'Important' },
  { value: 'normal', label: 'Normal', hint: 'Standard' },
  { value: 'low', label: 'Low', hint: 'Lower priority' }
];

/**
 * Task Create Command
 * create -t <title> [--type <type>] [--priority <pri>]
 */
export const taskCreateCommand: Command = {
  name: 'create',
  aliases: ['new'],
  description: 'Create a new task',
  options: [
    {
      name: 'title',
      short: 't',
      description: 'Task title',
      type: 'string',
      required: true
    },
    {
      name: 'type',
      description: 'Task type',
      type: 'string',
      choices: TASK_TYPES.map(t => t.value)
    },
    {
      name: 'priority',
      short: 'p',
      description: 'Task priority',
      type: 'string',
      choices: TASK_PRIORITIES.map(p => p.value),
      default: 'normal'
    },
    {
      name: 'description',
      short: 'd',
      description: 'Task description',
      type: 'string'
    },
    {
      name: 'tags',
      description: 'Comma-separated tags',
      type: 'string'
    },
    {
      name: 'dependencies',
      description: 'Comma-separated task IDs',
      type: 'string'
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    let title = ctx.flags.title as string;
    let taskType = ctx.flags.type as string;
    let priority = ctx.flags.priority as string;

    // Interactive mode
    if (!title && ctx.interactive) {
      title = await input({
        message: 'Task title:',
        validate: (v) => v.length > 0 || 'Title is required'
      });
    }

    if (!title) {
      output.printError('Task title is required');
      return { success: false, exitCode: 1 };
    }

    if (!taskType && ctx.interactive) {
      taskType = await select({
        message: 'Select task type:',
        options: TASK_TYPES
      });
    }

    if (!priority && ctx.interactive) {
      priority = await select({
        message: 'Select priority:',
        options: TASK_PRIORITIES,
        default: 'normal'
      });
    }

    const tags = parseList(ctx.flags.tags as string);
    const dependencies = parseList(ctx.flags.dependencies as string);

    try {
      const result = await callMCPTool<{
        taskId: string;
        title: string;
        type: string;
        priority: string;
        status: string;
        createdAt: string;
      }>('task_create', {
        title,
        type: taskType || 'implementation',
        description: ctx.flags.description || title,
        priority: priority || 'normal',
        tags,
        dependencies,
        metadata: {
          source: 'cli',
          createdBy: 'user'
        }
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.printSuccess(`Task created: ${result.taskId}`);
      output.writeln();

      TableFormatter.format({
        columns: [
          { key: 'property', header: 'Property', width: 15 },
          { key: 'value', header: 'Value', width: 40 }
        ],
        data: [
          { property: 'ID', value: result.taskId },
          { property: 'Title', value: result.title },
          { property: 'Type', value: result.type },
          { property: 'Priority', value: formatPriority(result.priority) },
          { property: 'Status', value: formatStatus(result.status) },
          { property: 'Created', value: formatTimestamp(result.createdAt) }
        ]
      });

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to create task: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Task Assign Command
 * assign <task-id> <agent-id>
 */
export const taskAssignCommand: Command = {
  name: 'assign',
  description: 'Assign a task to an agent',
  options: [
    {
      name: 'unassign',
      short: 'u',
      description: 'Remove assignment',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = ctx.args[0];
    const agentId = ctx.args[1];
    const unassign = ctx.flags.unassign as boolean;

    if (!taskId) {
      output.printError('Task ID is required');
      return { success: false, exitCode: 1 };
    }

    if (!agentId && !unassign) {
      output.printError('Agent ID is required (or use --unassign)');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        taskId: string;
        assignedTo?: string;
        previouslyAssigned?: string;
      }>('task_assign', {
        taskId,
        agentId: unassign ? undefined : agentId,
        unassign
      });

      if (unassign) {
        output.printSuccess(`Task ${taskId} unassigned`);
      } else {
        output.printSuccess(`Task ${taskId} assigned to ${agentId}`);
      }

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to assign task: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Task Status Command
 * status <task-id>
 */
export const taskStatusCommand: Command = {
  name: 'status',
  aliases: ['get', 'info'],
  description: 'Get task status and details',
  options: [
    {
      name: 'logs',
      short: 'l',
      description: 'Include execution logs',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = ctx.args[0];

    if (!taskId) {
      output.printError('Task ID is required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        id: string;
        title: string;
        type: string;
        description: string;
        priority: string;
        status: string;
        progress: number;
        assignedTo?: string;
        createdAt: string;
        startedAt?: string;
        completedAt?: string;
        dependencies: string[];
        tags: string[];
      }>('task_status', {
        taskId,
        includeLogs: ctx.flags.logs
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.printBox(
        [
          `Title:       ${result.title}`,
          `Type:        ${result.type}`,
          `Status:      ${formatStatus(result.status)}`,
          `Priority:    ${formatPriority(result.priority)}`,
          `Progress:    ${result.progress}%`,
          '',
          `Description: ${result.description}`
        ].join('\n'),
        `Task: ${result.id}`
      );

      output.writeln();
      TableFormatter.format({
        columns: [
          { key: 'property', header: 'Property', width: 15 },
          { key: 'value', header: 'Value', width: 40 }
        ],
        data: [
          { property: 'Assigned To', value: result.assignedTo || 'Unassigned' },
          { property: 'Created', value: formatTimestamp(result.createdAt) },
          { property: 'Started', value: result.startedAt ? formatTimestamp(result.startedAt) : 'N/A' },
          { property: 'Completed', value: result.completedAt ? formatTimestamp(result.completedAt) : 'N/A' },
          { property: 'Dependencies', value: result.dependencies.join(', ') || 'None' },
          { property: 'Tags', value: result.tags.join(', ') || 'None' }
        ]
      });

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to get task status: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Task Complete Command
 * complete <task-id> [--output <file>]
 */
export const taskCompleteCommand: Command = {
  name: 'complete',
  aliases: ['done', 'finish'],
  description: 'Mark a task as complete',
  options: [
    {
      name: 'output',
      short: 'o',
      description: 'Output file or result',
      type: 'string'
    },
    {
      name: 'notes',
      short: 'n',
      description: 'Completion notes',
      type: 'string'
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = ctx.args[0];

    if (!taskId) {
      output.printError('Task ID is required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        taskId: string;
        status: string;
        completedAt: string;
      }>('task_complete', {
        taskId,
        output: ctx.flags.output,
        notes: ctx.flags.notes
      });

      output.printSuccess(`Task ${taskId} marked as complete`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to complete task: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Task Cancel Command
 * cancel <task-id>
 */
export const taskCancelCommand: Command = {
  name: 'cancel',
  aliases: ['abort'],
  description: 'Cancel a running task',
  options: [
    {
      name: 'reason',
      short: 'r',
      description: 'Cancellation reason',
      type: 'string'
    },
    {
      name: 'force',
      short: 'f',
      description: 'Force cancel without confirmation',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = ctx.args[0];
    const force = ctx.flags.force as boolean;

    if (!taskId) {
      output.printError('Task ID is required');
      return { success: false, exitCode: 1 };
    }

    if (!force && ctx.interactive) {
      const confirmed = await confirm({
        message: `Are you sure you want to cancel task ${taskId}?`,
        default: false
      });

      if (!confirmed) {
        output.printInfo('Operation cancelled');
        return { success: true };
      }
    }

    try {
      const result = await callMCPTool<{
        taskId: string;
        cancelled: boolean;
        cancelledAt: string;
      }>('task_cancel', {
        taskId,
        reason: (ctx.flags.reason as string) || 'Cancelled by user'
      });

      output.printSuccess(`Task ${taskId} cancelled`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to cancel task: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Task List Command
 * list [--status <status>] [--agent <id>]
 */
export const taskListCommand: Command = {
  name: 'list',
  aliases: ['ls'],
  description: 'List tasks',
  options: [
    {
      name: 'status',
      short: 's',
      description: 'Filter by status',
      type: 'string'
    },
    {
      name: 'agent',
      short: 'a',
      description: 'Filter by assigned agent',
      type: 'string'
    },
    {
      name: 'type',
      short: 't',
      description: 'Filter by task type',
      type: 'string'
    },
    {
      name: 'limit',
      short: 'l',
      description: 'Maximum number to show',
      type: 'number',
      default: 20
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    try {
      const result = await callMCPTool<{
        tasks: Array<{
          id: string;
          title: string;
          type: string;
          status: string;
          priority: string;
          progress: number;
          assignedTo?: string;
        }>;
        total: number;
      }>('task_list', {
        status: ctx.flags.status,
        agentId: ctx.flags.agent,
        type: ctx.flags.type,
        limit: ctx.flags.limit || 20
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.writeln(output.bold('Tasks'));
      output.writeln();

      if (result.tasks.length === 0) {
        output.printInfo('No tasks found');
        return { success: true, data: result };
      }

      TableFormatter.format({
        columns: [
          { key: 'id', header: 'ID', width: 15 },
          { key: 'title', header: 'Title', width: 30 },
          { key: 'type', header: 'Type', width: 15 },
          { key: 'status', header: 'Status', width: 12, format: formatStatus },
          { key: 'priority', header: 'Priority', width: 10, format: formatPriority },
          { key: 'progress', header: 'Progress', width: 10 }
        ],
        data: result.tasks.map(t => ({
          ...t,
          title: t.title.length > 27 ? t.title.slice(0, 27) + '...' : t.title,
          progress: `${t.progress}%`
        }))
      });

      output.writeln();
      output.printInfo(`Showing ${result.tasks.length} of ${result.total} tasks`);

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to list tasks: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Parent command
export const taskCommands: Command = {
  name: 'task',
  description: 'Task management commands',
  subcommands: [
    taskCreateCommand,
    taskAssignCommand,
    taskStatusCommand,
    taskCompleteCommand,
    taskCancelCommand,
    taskListCommand
  ],
  action: async (): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('Task Commands'));
    output.writeln();
    output.printList([
      `${output.highlight('create')}   - Create a new task`,
      `${output.highlight('assign')}   - Assign task to agent`,
      `${output.highlight('status')}   - Get task status`,
      `${output.highlight('complete')} - Mark task as complete`,
      `${output.highlight('cancel')}   - Cancel a task`,
      `${output.highlight('list')}     - List tasks`
    ]);
    return { success: true };
  }
};
