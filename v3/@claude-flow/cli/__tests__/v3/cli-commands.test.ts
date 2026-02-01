/**
 * V3 CLI Commands - Comprehensive Test Suite
 * Tests for all V3 command implementations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CommandContext } from '../../src/types.js';
import { agentCommands } from '../../src/commands/v3/agent-commands.js';
import { taskCommands } from '../../src/commands/v3/task-commands.js';
import { memoryCommands } from '../../src/commands/v3/memory-commands.js';
import { coordinationCommands } from '../../src/commands/v3/coordination-commands.js';
import { swarmCommands } from '../../src/commands/v3/swarm-commands.js';
import {
  formatStatus,
  formatPriority,
  formatTimestamp,
  formatDuration,
  formatBytes,
  parseList,
  parseKeyValuePairs,
  truncate,
  padString,
  createProgressBar
} from '../../src/commands/v3/command-utils.js';
import { TableFormatter, JSONFormatter, ProgressBar, Spinner } from '../../src/commands/v3/output-formatter.js';

// Mock MCP client
vi.mock('../../src/mcp-client.js', () => ({
  callMCPTool: vi.fn(),
  MCPClientError: class MCPClientError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'MCPClientError';
    }
  }
}));

// Mock output
vi.mock('../../src/output.js', () => ({
  output: {
    writeln: vi.fn(),
    printInfo: vi.fn(),
    printSuccess: vi.fn(),
    printError: vi.fn(),
    printWarning: vi.fn(),
    printBox: vi.fn(),
    printTable: vi.fn(),
    printList: vi.fn(),
    printJson: vi.fn(),
    highlight: (str: string) => str,
    bold: (str: string) => str,
    dim: (str: string) => str,
    success: (str: string) => str,
    warning: (str: string) => str,
    error: (str: string) => str,
    info: (str: string) => str,
    cyan: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    blue: (str: string) => str
  }
}));

// Mock prompts
vi.mock('../../src/prompt.js', () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  multiSelect: vi.fn()
}));

describe('V3 CLI Commands', () => {
  let ctx: CommandContext;

  beforeEach(() => {
    ctx = {
      args: [],
      flags: { _: [] },
      cwd: '/test',
      interactive: false
    };
    vi.clearAllMocks();
  });

  // ============================================
  // Agent Commands Tests
  // ============================================

  describe('Agent Commands', () => {
    it('should have agent parent command', () => {
      expect(agentCommands.name).toBe('agent');
      expect(agentCommands.description).toBeTruthy();
      expect(agentCommands.subcommands).toBeDefined();
    });

    it('should have spawn subcommand', () => {
      const spawn = agentCommands.subcommands?.find(cmd => cmd.name === 'spawn');
      expect(spawn).toBeDefined();
      expect(spawn?.options).toBeDefined();
      expect(spawn?.action).toBeDefined();
    });

    it('should have terminate subcommand', () => {
      const terminate = agentCommands.subcommands?.find(cmd => cmd.name === 'terminate');
      expect(terminate).toBeDefined();
      expect(terminate?.aliases).toContain('kill');
    });

    it('should have list subcommand', () => {
      const list = agentCommands.subcommands?.find(cmd => cmd.name === 'list');
      expect(list).toBeDefined();
      expect(list?.aliases).toContain('ls');
    });

    it('should have health subcommand', () => {
      const health = agentCommands.subcommands?.find(cmd => cmd.name === 'health');
      expect(health).toBeDefined();
    });

    it('should have pool subcommand group', () => {
      const pool = agentCommands.subcommands?.find(cmd => cmd.name === 'pool');
      expect(pool).toBeDefined();
      expect(pool?.subcommands).toBeDefined();
    });
  });

  // ============================================
  // Task Commands Tests
  // ============================================

  describe('Task Commands', () => {
    it('should have task parent command', () => {
      expect(taskCommands.name).toBe('task');
      expect(taskCommands.description).toBeTruthy();
      expect(taskCommands.subcommands).toBeDefined();
    });

    it('should have create subcommand', () => {
      const create = taskCommands.subcommands?.find(cmd => cmd.name === 'create');
      expect(create).toBeDefined();
      expect(create?.options).toBeDefined();
    });

    it('should have assign subcommand', () => {
      const assign = taskCommands.subcommands?.find(cmd => cmd.name === 'assign');
      expect(assign).toBeDefined();
    });

    it('should have status subcommand', () => {
      const status = taskCommands.subcommands?.find(cmd => cmd.name === 'status');
      expect(status).toBeDefined();
      expect(status?.aliases).toContain('get');
    });

    it('should have complete subcommand', () => {
      const complete = taskCommands.subcommands?.find(cmd => cmd.name === 'complete');
      expect(complete).toBeDefined();
      expect(complete?.aliases).toContain('done');
    });

    it('should have cancel subcommand', () => {
      const cancel = taskCommands.subcommands?.find(cmd => cmd.name === 'cancel');
      expect(cancel).toBeDefined();
    });

    it('should have list subcommand', () => {
      const list = taskCommands.subcommands?.find(cmd => cmd.name === 'list');
      expect(list).toBeDefined();
    });
  });

  // ============================================
  // Memory Commands Tests
  // ============================================

  describe('Memory Commands', () => {
    it('should have memory parent command', () => {
      expect(memoryCommands.name).toBe('memory');
      expect(memoryCommands.description).toBeTruthy();
    });

    it('should have store subcommand', () => {
      const store = memoryCommands.subcommands?.find(cmd => cmd.name === 'store');
      expect(store).toBeDefined();
      expect(store?.options?.some(opt => opt.name === 'namespace')).toBe(true);
      expect(store?.options?.some(opt => opt.name === 'key')).toBe(true);
      expect(store?.options?.some(opt => opt.name === 'value')).toBe(true);
    });

    it('should have get subcommand', () => {
      const get = memoryCommands.subcommands?.find(cmd => cmd.name === 'get');
      expect(get).toBeDefined();
      expect(get?.aliases).toContain('retrieve');
    });

    it('should have search subcommand', () => {
      const search = memoryCommands.subcommands?.find(cmd => cmd.name === 'search');
      expect(search).toBeDefined();
      expect(search?.options?.some(opt => opt.name === 'query')).toBe(true);
    });

    it('should have delete subcommand', () => {
      const del = memoryCommands.subcommands?.find(cmd => cmd.name === 'delete');
      expect(del).toBeDefined();
      expect(del?.aliases).toContain('remove');
    });

    it('should have stats subcommand', () => {
      const stats = memoryCommands.subcommands?.find(cmd => cmd.name === 'stats');
      expect(stats).toBeDefined();
    });
  });

  // ============================================
  // Coordination Commands Tests
  // ============================================

  describe('Coordination Commands', () => {
    it('should have coordination parent command', () => {
      expect(coordinationCommands.name).toBe('coordination');
      expect(coordinationCommands.description).toBeTruthy();
    });

    it('should have session subcommand group', () => {
      const session = coordinationCommands.subcommands?.find(cmd => cmd.name === 'session');
      expect(session).toBeDefined();
      expect(session?.subcommands).toBeDefined();
    });

    it('should have message subcommand group', () => {
      const message = coordinationCommands.subcommands?.find(cmd => cmd.name === 'message');
      expect(message).toBeDefined();
    });

    it('should have consensus subcommand group', () => {
      const consensus = coordinationCommands.subcommands?.find(cmd => cmd.name === 'consensus');
      expect(consensus).toBeDefined();
    });
  });

  // ============================================
  // Swarm Commands Tests
  // ============================================

  describe('Swarm Commands', () => {
    it('should have swarm parent command', () => {
      expect(swarmCommands.name).toBe('swarm');
      expect(swarmCommands.description).toBeTruthy();
    });

    it('should have init subcommand', () => {
      const init = swarmCommands.subcommands?.find(cmd => cmd.name === 'init');
      expect(init).toBeDefined();
      expect(init?.options?.some(opt => opt.name === 'topology')).toBe(true);
    });

    it('should have status subcommand', () => {
      const status = swarmCommands.subcommands?.find(cmd => cmd.name === 'status');
      expect(status).toBeDefined();
    });

    it('should have scale subcommand', () => {
      const scale = swarmCommands.subcommands?.find(cmd => cmd.name === 'scale');
      expect(scale).toBeDefined();
    });

    it('should have topology subcommand', () => {
      const topology = swarmCommands.subcommands?.find(cmd => cmd.name === 'topology');
      expect(topology).toBeDefined();
    });
  });

  // ============================================
  // Command Utils Tests
  // ============================================

  describe('Command Utils', () => {
    describe('formatStatus', () => {
      it('should format success statuses', () => {
        expect(formatStatus('active')).toBeTruthy();
        expect(formatStatus('completed')).toBeTruthy();
      });

      it('should format warning statuses', () => {
        expect(formatStatus('pending')).toBeTruthy();
        expect(formatStatus('idle')).toBeTruthy();
      });

      it('should format error statuses', () => {
        expect(formatStatus('failed')).toBeTruthy();
        expect(formatStatus('terminated')).toBeTruthy();
      });
    });

    describe('formatPriority', () => {
      it('should format critical priority', () => {
        expect(formatPriority('critical')).toBeTruthy();
      });

      it('should format high priority', () => {
        expect(formatPriority('high')).toBeTruthy();
      });

      it('should format normal priority', () => {
        expect(formatPriority('normal')).toBe('normal');
      });

      it('should format low priority', () => {
        expect(formatPriority('low')).toBeTruthy();
      });
    });

    describe('formatTimestamp', () => {
      it('should format ISO timestamp', () => {
        const result = formatTimestamp('2024-01-01T00:00:00.000Z');
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
      });

      it('should format numeric timestamp', () => {
        const result = formatTimestamp(Date.now());
        expect(result).toBeTruthy();
      });
    });

    describe('formatDuration', () => {
      it('should format seconds', () => {
        expect(formatDuration(5000)).toBe('5s');
      });

      it('should format minutes', () => {
        expect(formatDuration(90000)).toBe('1m 30s');
      });

      it('should format hours', () => {
        expect(formatDuration(3600000)).toBe('1h 0m');
      });

      it('should format days', () => {
        expect(formatDuration(86400000 + 3600000)).toBe('1d 1h');
      });
    });

    describe('formatBytes', () => {
      it('should format bytes', () => {
        expect(formatBytes(500)).toBe('500.00 B');
      });

      it('should format KB', () => {
        expect(formatBytes(2048)).toBe('2.00 KB');
      });

      it('should format MB', () => {
        expect(formatBytes(1048576)).toBe('1.00 MB');
      });

      it('should format GB', () => {
        expect(formatBytes(1073741824)).toBe('1.00 GB');
      });
    });

    describe('parseList', () => {
      it('should parse comma-separated list', () => {
        expect(parseList('a,b,c')).toEqual(['a', 'b', 'c']);
      });

      it('should trim whitespace', () => {
        expect(parseList(' a , b , c ')).toEqual(['a', 'b', 'c']);
      });

      it('should return default for undefined', () => {
        expect(parseList(undefined, ['default'])).toEqual(['default']);
      });
    });

    describe('parseKeyValuePairs', () => {
      it('should parse key=value pairs', () => {
        expect(parseKeyValuePairs('key1=val1,key2=val2')).toEqual({
          key1: 'val1',
          key2: 'val2'
        });
      });

      it('should return empty object for undefined', () => {
        expect(parseKeyValuePairs(undefined)).toEqual({});
      });
    });

    describe('truncate', () => {
      it('should truncate long strings', () => {
        expect(truncate('hello world', 8)).toBe('hello...');
      });

      it('should not truncate short strings', () => {
        expect(truncate('hello', 10)).toBe('hello');
      });
    });

    describe('padString', () => {
      it('should pad left', () => {
        expect(padString('hi', 5, 'left')).toBe('hi   ');
      });

      it('should pad right', () => {
        expect(padString('hi', 5, 'right')).toBe('   hi');
      });

      it('should pad center', () => {
        const result = padString('hi', 6, 'center');
        expect(result.length).toBe(6);
      });
    });

    describe('createProgressBar', () => {
      it('should create progress bar', () => {
        const bar = createProgressBar(50, 100);
        expect(bar).toContain('50.0%');
      });

      it('should handle 0 total', () => {
        const bar = createProgressBar(0, 0);
        expect(bar).toBeTruthy();
      });
    });
  });

  // ============================================
  // Output Formatter Tests
  // ============================================

  describe('Output Formatters', () => {
    describe('TableFormatter', () => {
      it('should format tables', () => {
        expect(() => {
          TableFormatter.format({
            columns: [
              { key: 'name', header: 'Name', width: 10 },
              { key: 'value', header: 'Value', width: 10 }
            ],
            data: [
              { name: 'test', value: '123' }
            ]
          });
        }).not.toThrow();
      });

      it('should handle empty data', () => {
        expect(() => {
          TableFormatter.format({
            columns: [{ key: 'name', header: 'Name' }],
            data: []
          });
        }).not.toThrow();
      });
    });

    describe('JSONFormatter', () => {
      it('should format JSON', () => {
        expect(() => {
          JSONFormatter.format({ test: 'data' });
        }).not.toThrow();
      });

      it('should format with colors', () => {
        expect(() => {
          JSONFormatter.formatWithColor({ test: 'data', num: 123, bool: true });
        }).not.toThrow();
      });
    });

    describe('ProgressBar', () => {
      it('should create progress bar', () => {
        const bar = new ProgressBar(100);
        expect(bar).toBeDefined();
      });

      it('should update progress', () => {
        const bar = new ProgressBar(100);
        expect(() => bar.update(50)).not.toThrow();
      });

      it('should increment progress', () => {
        const bar = new ProgressBar(100);
        expect(() => bar.increment()).not.toThrow();
      });

      it('should complete', () => {
        const bar = new ProgressBar(100);
        expect(() => bar.complete()).not.toThrow();
      });
    });

    describe('Spinner', () => {
      it('should create spinner', () => {
        const spinner = new Spinner('Loading...');
        expect(spinner).toBeDefined();
      });

      it('should start and stop', () => {
        const spinner = new Spinner('Loading...');
        expect(() => {
          spinner.start();
          spinner.stop();
        }).not.toThrow();
      });

      it('should succeed', () => {
        const spinner = new Spinner('Loading...');
        expect(() => spinner.succeed('Done')).not.toThrow();
      });

      it('should fail', () => {
        const spinner = new Spinner('Loading...');
        expect(() => spinner.fail('Error')).not.toThrow();
      });
    });
  });
});

// ============================================
// Integration Tests
// ============================================

describe('V3 CLI Integration', () => {
  it('should have all required commands', () => {
    expect(agentCommands).toBeDefined();
    expect(taskCommands).toBeDefined();
    expect(memoryCommands).toBeDefined();
    expect(coordinationCommands).toBeDefined();
    expect(swarmCommands).toBeDefined();
  });

  it('should have proper command structure', () => {
    const commands = [
      agentCommands,
      taskCommands,
      memoryCommands,
      coordinationCommands,
      swarmCommands
    ];

    for (const cmd of commands) {
      expect(cmd.name).toBeTruthy();
      expect(cmd.description).toBeTruthy();
      expect(cmd.subcommands || cmd.action).toBeDefined();
    }
  });

  it('should have help text for all commands', () => {
    const commands = [agentCommands, taskCommands, memoryCommands];

    for (const cmd of commands) {
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });
});
