/**
 * V3 Memory CLI Commands
 * Domain-driven memory management commands
 */

import type { Command, CommandContext, CommandResult } from '../../types.js';
import { output } from '../../output.js';
import { input } from '../../prompt.js';
import { callMCPTool, MCPClientError } from '../../mcp-client.js';
import { formatTimestamp, formatBytes } from './command-utils.js';
import { TableFormatter, JSONFormatter } from './output-formatter.js';

/**
 * Memory Store Command
 * store -n <namespace> -k <key> -v <value>
 */
export const memoryStoreCommand: Command = {
  name: 'store',
  description: 'Store a value in memory',
  options: [
    {
      name: 'namespace',
      short: 'n',
      description: 'Memory namespace',
      type: 'string',
      required: true
    },
    {
      name: 'key',
      short: 'k',
      description: 'Memory key',
      type: 'string',
      required: true
    },
    {
      name: 'value',
      short: 'v',
      description: 'Value to store',
      type: 'string',
      required: true
    },
    {
      name: 'ttl',
      description: 'Time to live in seconds',
      type: 'number'
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const namespace = ctx.flags.namespace as string;
    const key = ctx.flags.key as string;
    const value = ctx.flags.value as string;

    if (!namespace || !key || !value) {
      output.printError('Namespace, key, and value are required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        namespace: string;
        key: string;
        stored: boolean;
        storedAt: string;
      }>('memory_store', {
        namespace,
        key,
        value,
        ttl: ctx.flags.ttl
      });

      output.printSuccess(`Stored ${key} in namespace ${namespace}`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to store: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Memory Get Command
 * get -n <namespace> -k <key>
 */
export const memoryGetCommand: Command = {
  name: 'get',
  aliases: ['retrieve'],
  description: 'Get a value from memory',
  options: [
    {
      name: 'namespace',
      short: 'n',
      description: 'Memory namespace',
      type: 'string',
      required: true
    },
    {
      name: 'key',
      short: 'k',
      description: 'Memory key',
      type: 'string',
      required: true
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const namespace = ctx.flags.namespace as string;
    const key = ctx.flags.key as string;

    if (!namespace || !key) {
      output.printError('Namespace and key are required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        namespace: string;
        key: string;
        value: string;
        createdAt: string;
      }>('memory_get', {
        namespace,
        key
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.printBox(
        [
          `Namespace: ${result.namespace}`,
          `Key:       ${result.key}`,
          `Value:     ${result.value}`,
          `Created:   ${formatTimestamp(result.createdAt)}`
        ].join('\n'),
        'Memory Entry'
      );

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to get: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Memory Search Command
 * search -q <query> [--limit <n>]
 */
export const memorySearchCommand: Command = {
  name: 'search',
  description: 'Search memory using vector similarity',
  options: [
    {
      name: 'query',
      short: 'q',
      description: 'Search query',
      type: 'string',
      required: true
    },
    {
      name: 'namespace',
      short: 'n',
      description: 'Limit search to namespace',
      type: 'string'
    },
    {
      name: 'limit',
      short: 'l',
      description: 'Maximum results',
      type: 'number',
      default: 10
    },
    {
      name: 'threshold',
      short: 't',
      description: 'Similarity threshold (0-1)',
      type: 'number',
      default: 0.7
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const query = ctx.flags.query as string;

    if (!query) {
      output.printError('Query is required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        query: string;
        results: Array<{
          namespace: string;
          key: string;
          value: string;
          score: number;
        }>;
        total: number;
      }>('memory_search', {
        query,
        namespace: ctx.flags.namespace,
        limit: ctx.flags.limit || 10,
        threshold: ctx.flags.threshold || 0.7
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.writeln(output.bold(`Search Results: "${query}"`));
      output.writeln();

      if (result.results.length === 0) {
        output.printInfo('No results found');
        return { success: true, data: result };
      }

      TableFormatter.format({
        columns: [
          { key: 'namespace', header: 'Namespace', width: 15 },
          { key: 'key', header: 'Key', width: 20 },
          { key: 'value', header: 'Value', width: 30 },
          { key: 'score', header: 'Score', width: 10, align: 'right' }
        ],
        data: result.results.map(r => ({
          ...r,
          value: r.value.length > 27 ? r.value.slice(0, 27) + '...' : r.value,
          score: r.score.toFixed(3)
        }))
      });

      output.writeln();
      output.printInfo(`Found ${result.results.length} of ${result.total} matches`);

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to search: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Memory Delete Command
 * delete -n <namespace> -k <key>
 */
export const memoryDeleteCommand: Command = {
  name: 'delete',
  aliases: ['remove', 'rm'],
  description: 'Delete a memory entry',
  options: [
    {
      name: 'namespace',
      short: 'n',
      description: 'Memory namespace',
      type: 'string',
      required: true
    },
    {
      name: 'key',
      short: 'k',
      description: 'Memory key',
      type: 'string',
      required: true
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const namespace = ctx.flags.namespace as string;
    const key = ctx.flags.key as string;

    if (!namespace || !key) {
      output.printError('Namespace and key are required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        namespace: string;
        key: string;
        deleted: boolean;
      }>('memory_delete', {
        namespace,
        key
      });

      output.printSuccess(`Deleted ${key} from namespace ${namespace}`);

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to delete: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

/**
 * Memory Stats Command
 * stats -n <namespace>
 */
export const memoryStatsCommand: Command = {
  name: 'stats',
  description: 'Show memory namespace statistics',
  options: [
    {
      name: 'namespace',
      short: 'n',
      description: 'Memory namespace',
      type: 'string'
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    try {
      const result = await callMCPTool<{
        namespace?: string;
        totalEntries: number;
        totalSize: number;
        indexSize: number;
        cacheHitRate: number;
        searchesPerformed: number;
      }>('memory_stats', {
        namespace: ctx.flags.namespace
      });

      if (ctx.flags.format === 'json') {
        JSONFormatter.format(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.printBox(
        [
          `Namespace:      ${result.namespace || 'All'}`,
          `Total Entries:  ${result.totalEntries.toLocaleString()}`,
          `Total Size:     ${formatBytes(result.totalSize)}`,
          `Index Size:     ${formatBytes(result.indexSize)}`,
          `Cache Hit Rate: ${(result.cacheHitRate * 100).toFixed(1)}%`,
          `Searches:       ${result.searchesPerformed.toLocaleString()}`
        ].join('\n'),
        'Memory Statistics'
      );

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to get stats: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Parent command
export const memoryCommands: Command = {
  name: 'memory',
  description: 'Memory management commands',
  subcommands: [
    memoryStoreCommand,
    memoryGetCommand,
    memorySearchCommand,
    memoryDeleteCommand,
    memoryStatsCommand
  ],
  action: async (): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('Memory Commands'));
    output.writeln();
    output.printList([
      `${output.highlight('store')}  - Store a value`,
      `${output.highlight('get')}    - Retrieve a value`,
      `${output.highlight('search')} - Vector search`,
      `${output.highlight('delete')} - Delete an entry`,
      `${output.highlight('stats')}  - Show statistics`
    ]);
    return { success: true };
  }
};
