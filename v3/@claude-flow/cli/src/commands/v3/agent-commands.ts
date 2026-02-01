/**
 * V3 Agent CLI Commands
 * Domain-driven agent management commands
 */

import type { Command, CommandContext, CommandResult } from '../../types.js';
import { output } from '../../output.js';
import { select, confirm, input } from '../../prompt.js';
import { callMCPTool, MCPClientError } from '../../mcp-client.js';
import { formatStatus, formatTimestamp } from './command-utils.js';
import { TableFormatter, JSONFormatter } from './output-formatter.js';

// Available agent types with capabilities
const AGENT_TYPES = [
  { value: 'coder', label: 'Coder', hint: 'Code development with neural patterns' },
  { value: 'researcher', label: 'Researcher', hint: 'Research with web access' },
  { value: 'tester', label: 'Tester', hint: 'Comprehensive testing' },
  { value: 'reviewer', label: 'Reviewer', hint: 'Code review and security' },
  { value: 'architect', label: 'Architect', hint: 'System design' },
  { value: 'security-architect', label: 'Security Architect', hint: 'Security design' },
  { value: 'security-auditor', label: 'Security Auditor', hint: 'CVE remediation' },
  { value: 'memory-specialist', label: 'Memory Specialist', hint: 'AgentDB optimization' },
  { value: 'performance-engineer', label: 'Performance Engineer', hint: 'Performance optimization' }
];

/**
 * Agent Spawn Command
 * spawn -t <type> [--name <name>] [--capabilities <caps>]
 */
export const agentSpawnCommand: Command = {
  name: 'spawn',
  description: 'Spawn a new agent instance',
  options: [
    {
      name: 'type',
      short: 't',
      description: 'Agent type to spawn',
      type: 'string',
      required: true,
      choices: AGENT_TYPES.map(a => a.value)
    },
    {
      name: 'name',
      short: 'n',
      description: 'Agent name/identifier',
      type: 'string'
    },
    {
      name: 'capabilities',
      short: 'c',
      description: 'Comma-separated capabilities',
      type: 'string'
    },
    {
      name: 'provider',
      short: 'p',
      description: 'Provider (anthropic, openai, etc)',
      type: 'string',
      default: 'anthropic'
    },
    {
      name: 'model',
      short: 'm',
      description: 'Model to use',
      type: 'string'
    },
    {
      name: 'task',
      description: 'Initial task for the agent',
      type: 'string'
    }
  ],
  examples: [
    { command: 'agent spawn -t coder --name bot-1', description: 'Spawn a coder agent' },
    { command: 'agent spawn -t security-auditor -c "cve-scan,penetration-test"', description: 'Spawn security auditor with capabilities' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    let agentType = ctx.flags.type as string;
    let agentName = ctx.flags.name as string;

    // Interactive mode if type not specified
    if (!agentType && ctx.interactive) {
      agentType = await select({
        message: 'Select agent type:',
        options: AGENT_TYPES
      });
    }

    if (!agentType) {
      output.printError('Agent type is required. Use --type or -t flag.');
      return { success: false, exitCode: 1 };
    }

    // Generate name if not provided
    if (!agentName) {
      agentName = `${agentType}-${Date.now().toString(36)}`;
    }

    // Parse capabilities
    const capabilities = ctx.flags.capabilities
      ? (ctx.flags.capabilities as string).split(',').map(c => c.trim())
      : getDefaultCapabilities(agentType);

    output.printInfo(`Spawning ${agentType} agent: ${output.highlight(agentName)}`);

    try {
      const result = await callMCPTool<{
        agentId: string;
        agentType: string;
        status: string;
        createdAt: string;
      }>('agent_spawn', {
        agentType,
        id: agentName,
        config: {
          provider: ctx.flags.provider || 'anthropic',
          model: ctx.flags.model,
          task: ctx.flags.task,
          capabilities
        },
        priority: 'normal',
        metadata: {
          name: agentName,
          capabilities
        }
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      TableFormatter.format({
        columns: [
          { key: 'property', header: 'Property', width: 15 },
          { key: 'value', header: 'Value', width: 40 }
        ],
        data: [
          { property: 'ID', value: result.agentId },
          { property: 'Type', value: result.agentType },
          { property: 'Status', value: formatStatus(result.status) },
          { property: 'Capabilities', value: capabilities.join(', ') },
          { property: 'Created', value: formatTimestamp(result.createdAt) }
        ]
      });

      output.writeln();
      output.printSuccess(`Agent ${agentName} spawned successfully`);

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to spawn agent: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Agent Terminate Command
 * terminate <id>
 */
export const agentTerminateCommand: Command = {
  name: 'terminate',
  aliases: ['kill', 'stop'],
  description: 'Terminate a running agent',
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Force termination without graceful shutdown',
      type: 'boolean',
      default: false
    },
    {
      name: 'reason',
      short: 'r',
      description: 'Termination reason',
      type: 'string'
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const agentId = ctx.args[0];

    if (!agentId) {
      output.printError('Agent ID is required');
      return { success: false, exitCode: 1 };
    }

    const force = ctx.flags.force as boolean;

    if (!force && ctx.interactive) {
      const confirmed = await confirm({
        message: `Are you sure you want to terminate agent ${agentId}?`,
        default: false
      });

      if (!confirmed) {
        output.printInfo('Operation cancelled');
        return { success: true };
      }
    }

    try {
      const result = await callMCPTool<{
        agentId: string;
        terminated: boolean;
        terminatedAt: string;
      }>('agent_terminate', {
        agentId,
        graceful: !force,
        reason: (ctx.flags.reason as string) || 'Terminated by user'
      });

      output.printSuccess(`Agent ${agentId} terminated successfully`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to terminate agent: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Agent List Command
 * list [--type <type>] [--status <status>]
 */
export const agentListCommand: Command = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all agents',
  options: [
    {
      name: 'type',
      short: 't',
      description: 'Filter by agent type',
      type: 'string'
    },
    {
      name: 'status',
      short: 's',
      description: 'Filter by status (active, idle, terminated)',
      type: 'string'
    },
    {
      name: 'all',
      short: 'a',
      description: 'Include terminated agents',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    try {
      const result = await callMCPTool<{
        agents: Array<{
          id: string;
          agentType: string;
          status: string;
          createdAt: string;
          lastActivityAt?: string;
        }>;
        total: number;
      }>('agent_list', {
        status: ctx.flags.all ? 'all' : ctx.flags.status || undefined,
        agentType: ctx.flags.type || undefined,
        limit: 100
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.writeln(output.bold('Active Agents'));
      output.writeln();

      if (result.agents.length === 0) {
        output.printInfo('No agents found');
        return { success: true, data: result };
      }

      TableFormatter.format({
        columns: [
          { key: 'id', header: 'ID', width: 20 },
          { key: 'type', header: 'Type', width: 18 },
          { key: 'status', header: 'Status', width: 12, format: formatStatus },
          { key: 'created', header: 'Created', width: 20 },
          { key: 'lastActivity', header: 'Last Activity', width: 20 }
        ],
        data: result.agents.map(agent => ({
          id: agent.id,
          type: agent.agentType,
          status: agent.status,
          created: formatTimestamp(agent.createdAt),
          lastActivity: agent.lastActivityAt ? formatTimestamp(agent.lastActivityAt) : 'N/A'
        }))
      });

      output.writeln();
      output.printInfo(`Total: ${result.total} agents`);

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to list agents: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Agent Health Command
 * health <id>
 */
export const agentHealthCommand: Command = {
  name: 'health',
  description: 'Check agent health status',
  options: [
    {
      name: 'detailed',
      short: 'd',
      description: 'Show detailed health metrics',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const agentId = ctx.args[0];

    if (!agentId) {
      output.printError('Agent ID is required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        agentId: string;
        health: 'healthy' | 'degraded' | 'unhealthy';
        uptime: number;
        memory: { used: number; limit: number };
        cpu: number;
        tasks: { active: number; completed: number; failed: number };
        latency: { avg: number; p99: number };
      }>('agent_health', {
        agentId,
        detailed: ctx.flags.detailed
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.printBox(
        [
          `Agent:  ${result.agentId}`,
          `Health: ${formatHealthStatus(result.health)}`,
          `Uptime: ${(result.uptime / 1000 / 60).toFixed(1)} minutes`,
          `CPU:    ${result.cpu.toFixed(1)}%`,
          `Memory: ${((result.memory.used / result.memory.limit) * 100).toFixed(1)}%`
        ].join('\n'),
        'Agent Health'
      );

      if (ctx.flags.detailed) {
        output.writeln();
        TableFormatter.format({
          columns: [
            { key: 'metric', header: 'Metric', width: 20 },
            { key: 'value', header: 'Value', width: 30, align: 'right' }
          ],
          data: [
            { metric: 'Active Tasks', value: result.tasks.active },
            { metric: 'Completed Tasks', value: result.tasks.completed },
            { metric: 'Failed Tasks', value: result.tasks.failed },
            { metric: 'Avg Latency', value: `${result.latency.avg.toFixed(2)}ms` },
            { metric: 'P99 Latency', value: `${result.latency.p99.toFixed(2)}ms` }
          ]
        });
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to check health: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Agent Pool Create Command
 * pool create -t <type> --min <n> --max <n>
 */
export const agentPoolCreateCommand: Command = {
  name: 'create',
  description: 'Create an agent pool',
  options: [
    {
      name: 'type',
      short: 't',
      description: 'Agent type for pool',
      type: 'string',
      required: true
    },
    {
      name: 'min',
      description: 'Minimum pool size',
      type: 'number',
      required: true
    },
    {
      name: 'max',
      description: 'Maximum pool size',
      type: 'number',
      required: true
    },
    {
      name: 'auto-scale',
      short: 'a',
      description: 'Enable auto-scaling',
      type: 'boolean',
      default: true
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const agentType = ctx.flags.type as string;
    const min = ctx.flags.min as number;
    const max = ctx.flags.max as number;

    if (!agentType) {
      output.printError('Agent type is required');
      return { success: false, exitCode: 1 };
    }

    if (min > max) {
      output.printError('Minimum size cannot exceed maximum size');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        poolId: string;
        agentType: string;
        minSize: number;
        maxSize: number;
        currentSize: number;
        autoScale: boolean;
      }>('agent_pool_create', {
        agentType,
        minSize: min,
        maxSize: max,
        autoScale: ctx.flags['auto-scale'] ?? true
      });

      output.printSuccess(`Agent pool created: ${result.poolId}`);
      output.printInfo(`Type: ${result.agentType}, Size: ${result.minSize}-${result.maxSize}`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to create pool: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Agent Pool Scale Command
 * pool scale <pool-id> --target <n>
 */
export const agentPoolScaleCommand: Command = {
  name: 'scale',
  description: 'Scale an agent pool',
  options: [
    {
      name: 'target',
      short: 't',
      description: 'Target pool size',
      type: 'number',
      required: true
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const poolId = ctx.args[0];
    const target = ctx.flags.target as number;

    if (!poolId) {
      output.printError('Pool ID is required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        poolId: string;
        previousSize: number;
        newSize: number;
        scaledAt: string;
      }>('agent_pool_scale', {
        poolId,
        targetSize: target
      });

      output.printSuccess(`Pool ${poolId} scaled from ${result.previousSize} to ${result.newSize}`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to scale pool: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Helper functions
function getDefaultCapabilities(type: string): string[] {
  const capabilities: Record<string, string[]> = {
    coder: ['code-generation', 'refactoring', 'debugging'],
    researcher: ['web-search', 'data-analysis', 'summarization'],
    tester: ['unit-testing', 'integration-testing', 'coverage-analysis'],
    reviewer: ['code-review', 'security-audit', 'quality-check'],
    architect: ['system-design', 'pattern-analysis', 'documentation'],
    'security-architect': ['threat-modeling', 'security-patterns', 'compliance'],
    'security-auditor': ['cve-scan', 'penetration-test', 'vulnerability-assessment'],
    'memory-specialist': ['vector-search', 'agentdb', 'optimization'],
    'performance-engineer': ['benchmarking', 'profiling', 'optimization']
  };

  return capabilities[type] || ['general'];
}

function formatHealthStatus(health: string): string {
  switch (health) {
    case 'healthy':
      return output.success(health);
    case 'degraded':
      return output.warning(health);
    case 'unhealthy':
      return output.error(health);
    default:
      return health;
  }
}

// Parent command
export const agentCommands: Command = {
  name: 'agent',
  description: 'Agent management commands',
  subcommands: [
    agentSpawnCommand,
    agentTerminateCommand,
    agentListCommand,
    agentHealthCommand,
    {
      name: 'pool',
      description: 'Agent pool management',
      subcommands: [agentPoolCreateCommand, agentPoolScaleCommand]
    }
  ],
  action: async (): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('Agent Commands'));
    output.writeln();
    output.printList([
      `${output.highlight('spawn')}     - Spawn a new agent`,
      `${output.highlight('terminate')} - Terminate an agent`,
      `${output.highlight('list')}      - List all agents`,
      `${output.highlight('health')}    - Check agent health`,
      `${output.highlight('pool')}      - Manage agent pools`
    ]);
    return { success: true };
  }
};
