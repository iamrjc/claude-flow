/**
 * Migrate Command
 * CLI command interface for v2 to v3 migration
 */

import type { Command, CommandContext, CommandResult } from '../../types.js';
import { output } from '../../output.js';
import { select, confirm } from '../../prompt.js';
import type { MigrationOptions, MigrationTarget } from './types.js';
import { migrateConfig } from './migrate-config.js';
import { migrateDatabase } from './migrate-database.js';
import { migratePlugins } from './migrate-plugins.js';
import { migrateSessions } from './migrate-sessions.js';
import { validateMigration } from './validate-migration.js';
import { rollbackMigration, listBackups } from './rollback.js';

// ============================================
// Subcommands
// ============================================

const configCommand: Command = {
  name: 'config',
  description: 'Migrate v2 configuration to v3 format',
  options: [
    {
      name: 'dry-run',
      description: 'Show what would be migrated without making changes',
      type: 'boolean',
      default: false,
    },
    {
      name: 'source',
      short: 's',
      description: 'Source directory (v2 project)',
      type: 'string',
      default: '.',
    },
    {
      name: 'target',
      short: 't',
      description: 'Target directory (v3 project)',
      type: 'string',
      default: '.',
    },
  ],
  examples: [
    { command: 'claude-flow migrate config', description: 'Migrate config with backup' },
    { command: 'claude-flow migrate config --dry-run', description: 'Preview config migration' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const options: MigrationOptions = {
      dryRun: ctx.flags['dry-run'] as boolean,
      backup: true,
      force: false,
      sourceDir: ctx.flags.source as string,
      targetDir: ctx.flags.target as string,
      targets: ['config'],
      verbose: ctx.flags.verbose as boolean,
    };

    output.writeln();
    output.printInfo('Migrating configuration...');
    output.writeln();

    const result = await migrateConfig(options);

    // Display messages
    result.messages.forEach((msg) => {
      switch (msg.level) {
        case 'success':
          output.printSuccess(msg.message);
          break;
        case 'warning':
          output.printWarning(msg.message);
          break;
        case 'error':
          output.printError(msg.message);
          break;
        default:
          output.writeln(output.dim(`  ${msg.message}`));
      }
    });

    output.writeln();
    output.printTable({
      columns: [
        { key: 'metric', header: 'Metric', width: 20 },
        { key: 'value', header: 'Value', width: 15, align: 'right' },
      ],
      data: [
        { metric: 'Items Migrated', value: result.itemsMigrated },
        { metric: 'Items Skipped', value: result.itemsSkipped },
        { metric: 'Items Failed', value: result.itemsFailed },
        { metric: 'Duration (ms)', value: result.duration },
      ],
    });

    if (result.backupPath) {
      output.writeln();
      output.writeln(output.dim(`Backup: ${result.backupPath}`));
    }

    return { success: result.success, data: result };
  },
};

const databaseCommand: Command = {
  name: 'database',
  description: 'Migrate v2 SQLite schema to v3',
  options: [
    {
      name: 'dry-run',
      description: 'Show what would be migrated without making changes',
      type: 'boolean',
      default: false,
    },
    {
      name: 'source',
      short: 's',
      description: 'Source directory (v2 project)',
      type: 'string',
      default: '.',
    },
  ],
  examples: [
    { command: 'claude-flow migrate database', description: 'Migrate database schema' },
    { command: 'claude-flow migrate database --dry-run', description: 'Preview database migration' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const options: MigrationOptions = {
      dryRun: ctx.flags['dry-run'] as boolean,
      backup: true,
      force: false,
      sourceDir: ctx.flags.source as string,
      targetDir: ctx.flags.target as string || '.',
      targets: ['database'],
      verbose: ctx.flags.verbose as boolean,
    };

    output.writeln();
    output.printInfo('Migrating database schema...');
    output.writeln();

    const result = await migrateDatabase(options);

    // Display messages
    result.messages.forEach((msg) => {
      switch (msg.level) {
        case 'success':
          output.printSuccess(msg.message);
          break;
        case 'warning':
          output.printWarning(msg.message);
          break;
        case 'error':
          output.printError(msg.message);
          break;
        default:
          output.writeln(output.dim(`  ${msg.message}`));
      }
    });

    output.writeln();
    output.printTable({
      columns: [
        { key: 'metric', header: 'Metric', width: 20 },
        { key: 'value', header: 'Value', width: 15, align: 'right' },
      ],
      data: [
        { metric: 'Migrations Applied', value: result.itemsMigrated },
        { metric: 'Migrations Skipped', value: result.itemsSkipped },
        { metric: 'Migrations Failed', value: result.itemsFailed },
        { metric: 'Duration (ms)', value: result.duration },
      ],
    });

    return { success: result.success, data: result };
  },
};

const validateCommand: Command = {
  name: 'validate',
  description: 'Validate migration integrity',
  options: [
    {
      name: 'target',
      short: 't',
      description: 'Target directory to validate',
      type: 'string',
      default: '.',
    },
  ],
  examples: [
    { command: 'claude-flow migrate validate', description: 'Validate migration' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const options: MigrationOptions = {
      dryRun: false,
      backup: false,
      force: false,
      sourceDir: '.',
      targetDir: ctx.flags.target as string,
      targets: ['all'],
      verbose: ctx.flags.verbose as boolean,
    };

    output.writeln();
    output.printInfo('Validating migration...');
    output.writeln();

    const result = await validateMigration(options);

    // Display messages
    result.messages.forEach((msg) => {
      switch (msg.level) {
        case 'success':
          output.printSuccess(msg.message);
          break;
        case 'warning':
          output.printWarning(msg.message);
          break;
        case 'error':
          output.printError(msg.message);
          break;
        default:
          output.writeln(output.dim(`  ${msg.message}`));
      }
    });

    output.writeln();
    if (result.success) {
      output.printSuccess('All validation checks passed');
    } else {
      output.printError(`Validation failed with ${result.itemsFailed} error(s)`);
    }

    return { success: result.success, data: result };
  },
};

const rollbackCommand: Command = {
  name: 'rollback',
  description: 'Rollback migration to previous version',
  options: [
    {
      name: 'backup-id',
      short: 'b',
      description: 'Backup ID to restore (or "latest")',
      type: 'string',
      default: 'latest',
    },
    {
      name: 'dry-run',
      description: 'Show what would be restored',
      type: 'boolean',
      default: false,
    },
    {
      name: 'source',
      short: 's',
      description: 'Source directory with backups',
      type: 'string',
      default: '.',
    },
    {
      name: 'target',
      short: 't',
      description: 'Target directory to restore to',
      type: 'string',
      default: '.',
    },
  ],
  examples: [
    { command: 'claude-flow migrate rollback', description: 'Rollback to latest backup' },
    { command: 'claude-flow migrate rollback -b backup-123', description: 'Rollback to specific backup' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const backupId = ctx.flags['backup-id'] as string;
    const dryRun = ctx.flags['dry-run'] as boolean;
    const sourceDir = ctx.flags.source as string;
    const targetDir = ctx.flags.target as string;

    // List available backups
    output.writeln();
    output.printInfo('Searching for backups...');
    const backups = await listBackups(sourceDir);

    if (backups.length === 0) {
      output.printError('No backups found');
      return { success: false, exitCode: 1 };
    }

    output.writeln();
    output.writeln(output.bold('Available Backups'));
    output.printTable({
      columns: [
        { key: 'id', header: 'Backup ID', width: 25 },
        { key: 'version', header: 'Version', width: 10 },
        { key: 'timestamp', header: 'Created', width: 25 },
        { key: 'files', header: 'Files', width: 10, align: 'right' },
      ],
      data: backups.map((b) => ({
        id: b.id,
        version: b.version,
        timestamp: new Date(b.timestamp).toISOString(),
        files: b.files.length,
      })),
    });

    // Confirm rollback
    if (!dryRun && ctx.interactive) {
      output.writeln();
      const confirmed = await confirm({
        message: `Rollback to backup ${backupId}? This will overwrite current files.`,
        default: false,
      });

      if (!confirmed) {
        output.printInfo('Operation cancelled');
        return { success: true };
      }
    }

    const options: MigrationOptions = {
      dryRun,
      backup: true,
      force: false,
      sourceDir,
      targetDir,
      targets: ['all'],
      verbose: ctx.flags.verbose as boolean,
    };

    output.writeln();
    output.printInfo(`Rolling back to ${backupId}...`);
    output.writeln();

    const result = await rollbackMigration(backupId, options);

    // Display messages
    result.messages.forEach((msg) => {
      switch (msg.level) {
        case 'success':
          output.printSuccess(msg.message);
          break;
        case 'warning':
          output.printWarning(msg.message);
          break;
        case 'error':
          output.printError(msg.message);
          break;
        default:
          output.writeln(output.dim(`  ${msg.message}`));
      }
    });

    output.writeln();
    if (result.success) {
      output.printSuccess('Rollback completed successfully');
    } else {
      output.printError('Rollback failed');
    }

    return { success: result.success, data: result };
  },
};

// ============================================
// Main Command
// ============================================

export const migrateCommand: Command = {
  name: 'migrate',
  description: 'V2 to V3 migration tools with backup and rollback',
  subcommands: [configCommand, databaseCommand, validateCommand, rollbackCommand],
  options: [
    {
      name: 'verbose',
      short: 'v',
      description: 'Verbose output',
      type: 'boolean',
      default: false,
    },
  ],
  examples: [
    { command: 'claude-flow migrate config', description: 'Migrate configuration' },
    { command: 'claude-flow migrate database --dry-run', description: 'Preview database migration' },
    { command: 'claude-flow migrate validate', description: 'Validate migration' },
    { command: 'claude-flow migrate rollback', description: 'Rollback to latest backup' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('V2 to V3 Migration Tools'));
    output.writeln();
    output.writeln('Usage: claude-flow migrate <subcommand> [options]');
    output.writeln();
    output.writeln('Subcommands:');
    output.printList([
      `${output.highlight('config')}     - Migrate v2 configuration to v3`,
      `${output.highlight('database')}   - Migrate SQLite schema to v3`,
      `${output.highlight('validate')}   - Validate migration integrity`,
      `${output.highlight('rollback')}   - Rollback to previous version`,
    ]);
    output.writeln();
    output.writeln('Features:');
    output.printList([
      'Automatic backup before migration',
      '--dry-run support for safe preview',
      'Detailed logging and validation',
      'Rollback capability with version tracking',
    ]);

    return { success: true };
  },
};

export default migrateCommand;
