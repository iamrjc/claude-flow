/**
 * Plugin Migration
 * Map v2 plugins to v3 equivalents
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  MigrationOptions,
  MigrationResult,
  MigrationMessage,
  PluginMapping,
} from './types.js';

export class PluginMigrator {
  private messages: MigrationMessage[] = [];
  private errors: Array<{ code: string; message: string; details?: unknown }> = [];
  private warnings: string[] = [];

  async migrate(options: MigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    let itemsMigrated = 0;
    let itemsSkipped = 0;
    let itemsFailed = 0;

    try {
      // Get plugin mappings
      const mappings = this.getPluginMappings();

      // Find v2 plugins directory
      const v2PluginsDir = path.join(options.sourceDir, 'plugins');
      const v3PluginsDir = path.join(options.targetDir, 'plugins');

      if (!fs.existsSync(v2PluginsDir)) {
        this.addInfo('No v2 plugins directory found');
        return this.buildResult(true, startTime, itemsMigrated, itemsSkipped, itemsFailed);
      }

      // Read v2 plugins
      const v2Plugins = await this.findV2Plugins(v2PluginsDir);

      if (v2Plugins.length === 0) {
        this.addInfo('No v2 plugins found');
        return this.buildResult(true, startTime, itemsMigrated, itemsSkipped, itemsFailed);
      }

      this.addInfo(`Found ${v2Plugins.length} v2 plugin(s)`);

      // Create migration report
      const migrationReport: Array<{
        v2Name: string;
        v3Name: string;
        status: 'migrated' | 'manual' | 'deprecated';
        notes?: string;
      }> = [];

      // Process each plugin
      for (const v2Plugin of v2Plugins) {
        const mapping = mappings.find((m) => m.v2Name === v2Plugin);

        if (mapping) {
          if (mapping.autoConvert) {
            if (options.dryRun) {
              this.addInfo(`Would migrate: ${v2Plugin} -> ${mapping.v3Name}`);
              itemsSkipped++;
            } else {
              await this.migratePlugin(v2Plugin, mapping, v2PluginsDir, v3PluginsDir);
              itemsMigrated++;
              this.addSuccess(`Migrated: ${v2Plugin} -> ${mapping.v3Name}`);
            }

            migrationReport.push({
              v2Name: v2Plugin,
              v3Name: mapping.v3Name,
              status: 'migrated',
              notes: mapping.notes,
            });
          } else {
            this.addWarning(`Plugin ${v2Plugin} requires manual migration to ${mapping.v3Name}`);
            migrationReport.push({
              v2Name: v2Plugin,
              v3Name: mapping.v3Name,
              status: 'manual',
              notes: mapping.notes || 'Requires manual configuration',
            });
            itemsSkipped++;
          }
        } else {
          this.addWarning(`No v3 equivalent found for plugin: ${v2Plugin}`);
          migrationReport.push({
            v2Name: v2Plugin,
            v3Name: 'N/A',
            status: 'deprecated',
            notes: 'No v3 equivalent - check v3 built-in features',
          });
          itemsSkipped++;
        }
      }

      // Write migration report
      if (!options.dryRun) {
        await this.writeMigrationReport(v3PluginsDir, migrationReport);
      }

      return this.buildResult(
        itemsFailed === 0,
        startTime,
        itemsMigrated,
        itemsSkipped,
        itemsFailed
      );
    } catch (error) {
      this.addError('MIGRATION_FAILED', 'Plugin migration failed', error);
      return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed);
    }
  }

  private getPluginMappings(): PluginMapping[] {
    return [
      {
        v2Name: 'memory-plugin',
        v3Name: '@claude-flow/memory',
        autoConvert: true,
        notes: 'Now built-in with HNSW indexing',
      },
      {
        v2Name: 'hooks-plugin',
        v3Name: '@claude-flow/hooks',
        autoConvert: true,
        notes: 'Now built-in with 17 hooks + 12 workers',
      },
      {
        v2Name: 'embeddings-plugin',
        v3Name: '@claude-flow/embeddings',
        autoConvert: false,
        notes: 'Requires migration from OpenAI/TF.js to ONNX Runtime',
      },
      {
        v2Name: 'swarm-plugin',
        v3Name: '@claude-flow/swarm',
        autoConvert: true,
        notes: 'Enhanced with 15-agent coordination',
      },
      {
        v2Name: 'mcp-plugin',
        v3Name: '@claude-flow/mcp',
        autoConvert: true,
        notes: 'Now core feature with stdio/http/websocket support',
      },
      {
        v2Name: 'neural-plugin',
        v3Name: '@claude-flow/neural',
        autoConvert: false,
        notes: 'Requires RuVector integration setup',
      },
      {
        v2Name: 'security-plugin',
        v3Name: '@claude-flow/security',
        autoConvert: true,
        notes: 'Enhanced CVE remediation and validation',
      },
      {
        v2Name: 'performance-plugin',
        v3Name: '@claude-flow/performance',
        autoConvert: true,
        notes: 'Includes Flash Attention optimizations',
      },
      {
        v2Name: 'deployment-plugin',
        v3Name: '@claude-flow/deployment',
        autoConvert: true,
        notes: 'Enhanced with rollback and environments',
      },
      {
        v2Name: 'testing-plugin',
        v3Name: '@claude-flow/testing',
        autoConvert: true,
        notes: 'Now built-in test utilities',
      },
    ];
  }

  private async findV2Plugins(pluginsDir: string): Promise<string[]> {
    const plugins: string[] = [];

    try {
      const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check if directory contains package.json
          const packagePath = path.join(pluginsDir, entry.name, 'package.json');
          if (fs.existsSync(packagePath)) {
            plugins.push(entry.name);
          }
        }
      }
    } catch (error) {
      this.addError('PLUGIN_SCAN_FAILED', 'Failed to scan plugins directory', error);
    }

    return plugins;
  }

  private async migratePlugin(
    v2Name: string,
    mapping: PluginMapping,
    v2Dir: string,
    v3Dir: string
  ): Promise<void> {
    // For auto-convert plugins, we'll create a reference file
    // pointing to the new built-in module
    const referenceContent = {
      name: v2Name,
      v3Equivalent: mapping.v3Name,
      notes: mapping.notes,
      migrated: true,
      migratedAt: new Date().toISOString(),
    };

    const referencePath = path.join(v3Dir, `${v2Name}.migration.json`);
    await fs.promises.mkdir(v3Dir, { recursive: true });
    await fs.promises.writeFile(referencePath, JSON.stringify(referenceContent, null, 2));
  }

  private async writeMigrationReport(
    v3Dir: string,
    report: Array<{
      v2Name: string;
      v3Name: string;
      status: string;
      notes?: string;
    }>
  ): Promise<void> {
    const reportPath = path.join(v3Dir, 'MIGRATION_REPORT.md');
    await fs.promises.mkdir(v3Dir, { recursive: true });

    let markdown = '# Plugin Migration Report\n\n';
    markdown += `Generated: ${new Date().toISOString()}\n\n`;

    markdown += '## Summary\n\n';
    const migrated = report.filter((r) => r.status === 'migrated').length;
    const manual = report.filter((r) => r.status === 'manual').length;
    const deprecated = report.filter((r) => r.status === 'deprecated').length;

    markdown += `- **Migrated**: ${migrated}\n`;
    markdown += `- **Manual Required**: ${manual}\n`;
    markdown += `- **Deprecated**: ${deprecated}\n\n`;

    markdown += '## Details\n\n';
    markdown += '| V2 Plugin | V3 Equivalent | Status | Notes |\n';
    markdown += '|-----------|---------------|--------|-------|\n';

    for (const item of report) {
      const status = item.status === 'migrated' ? '✅ Migrated' :
                     item.status === 'manual' ? '⚠️ Manual' :
                     '❌ Deprecated';
      markdown += `| ${item.v2Name} | ${item.v3Name} | ${status} | ${item.notes || ''} |\n`;
    }

    markdown += '\n## Next Steps\n\n';

    if (manual > 0) {
      markdown += '### Manual Migration Required\n\n';
      report
        .filter((r) => r.status === 'manual')
        .forEach((item) => {
          markdown += `- **${item.v2Name}** → **${item.v3Name}**: ${item.notes}\n`;
        });
      markdown += '\n';
    }

    if (deprecated > 0) {
      markdown += '### Deprecated Plugins\n\n';
      report
        .filter((r) => r.status === 'deprecated')
        .forEach((item) => {
          markdown += `- **${item.v2Name}**: ${item.notes}\n`;
        });
      markdown += '\n';
    }

    await fs.promises.writeFile(reportPath, markdown);
    this.addSuccess(`Migration report written: ${reportPath}`);
  }

  private addInfo(message: string, details?: unknown): void {
    this.messages.push({
      level: 'info',
      message,
      details,
      timestamp: Date.now(),
    });
  }

  private addSuccess(message: string, details?: unknown): void {
    this.messages.push({
      level: 'success',
      message,
      details,
      timestamp: Date.now(),
    });
  }

  private addWarning(message: string): void {
    this.warnings.push(message);
    this.messages.push({
      level: 'warning',
      message,
      timestamp: Date.now(),
    });
  }

  private addError(code: string, message: string, details?: unknown): void {
    this.errors.push({ code, message, details });
    this.messages.push({
      level: 'error',
      message,
      details,
      timestamp: Date.now(),
    });
  }

  private buildResult(
    success: boolean,
    startTime: number,
    itemsMigrated: number,
    itemsSkipped: number,
    itemsFailed: number
  ): MigrationResult {
    return {
      success,
      target: 'plugins',
      itemsMigrated,
      itemsSkipped,
      itemsFailed,
      messages: this.messages,
      duration: Date.now() - startTime,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}

export async function migratePlugins(options: MigrationOptions): Promise<MigrationResult> {
  const migrator = new PluginMigrator();
  return migrator.migrate(options);
}
