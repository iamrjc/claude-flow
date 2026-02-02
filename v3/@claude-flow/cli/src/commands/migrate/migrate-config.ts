/**
 * Configuration Migration
 * Migrate v2 config to v3 format with backup
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  V2Config,
  V3Config,
  MigrationOptions,
  MigrationResult,
  MigrationMessage,
} from './types.js';

export class ConfigMigrator {
  private messages: MigrationMessage[] = [];
  private errors: Array<{ code: string; message: string; details?: unknown }> = [];
  private warnings: string[] = [];

  async migrate(options: MigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    let itemsMigrated = 0;
    let itemsSkipped = 0;
    let itemsFailed = 0;

    try {
      // Find v2 config file
      const v2ConfigPath = this.findV2Config(options.sourceDir);
      if (!v2ConfigPath) {
        this.addError('CONFIG_NOT_FOUND', 'V2 configuration file not found');
        return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed);
      }

      this.addInfo(`Found v2 config: ${v2ConfigPath}`);

      // Load v2 config
      const v2Config = await this.loadV2Config(v2ConfigPath);
      if (!v2Config) {
        this.addError('CONFIG_LOAD_FAILED', 'Failed to load v2 configuration');
        return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed);
      }

      // Create backup if requested
      let backupPath: string | undefined;
      if (options.backup && !options.dryRun) {
        backupPath = await this.createBackup(v2ConfigPath);
        this.addSuccess(`Backup created: ${backupPath}`);
      }

      // Transform config
      const v3Config = this.transformConfig(v2Config, options);
      itemsMigrated++;

      // Validate v3 config
      const validation = this.validateV3Config(v3Config);
      if (!validation.valid) {
        this.addError('CONFIG_VALIDATION_FAILED', 'V3 configuration validation failed', validation.errors);
        itemsFailed++;
        return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed, backupPath);
      }

      // Write v3 config (if not dry run)
      if (!options.dryRun) {
        const v3ConfigPath = path.join(options.targetDir, 'claude-flow.config.json');
        await this.writeV3Config(v3ConfigPath, v3Config);
        this.addSuccess(`V3 config written: ${v3ConfigPath}`);
      } else {
        this.addInfo('Dry run: V3 config not written');
      }

      return this.buildResult(true, startTime, itemsMigrated, itemsSkipped, itemsFailed, backupPath);
    } catch (error) {
      this.addError('MIGRATION_FAILED', 'Configuration migration failed', error);
      return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed);
    }
  }

  private findV2Config(sourceDir: string): string | null {
    const possiblePaths = [
      path.join(sourceDir, 'claude-flow.json'),
      path.join(sourceDir, '.claude-flow.json'),
      path.join(sourceDir, 'config', 'claude-flow.json'),
      path.join(sourceDir, '.claude-flow', 'config.json'),
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    return null;
  }

  private async loadV2Config(configPath: string): Promise<V2Config | null> {
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      return JSON.parse(content) as V2Config;
    } catch (error) {
      this.addError('CONFIG_PARSE_ERROR', `Failed to parse v2 config: ${error}`);
      return null;
    }
  }

  private transformConfig(v2: V2Config, options: MigrationOptions): V3Config {
    // Map v2 swarm mode to v3 topology
    const topologyMap: Record<string, V3Config['swarm']['topology']> = {
      sequential: 'hierarchical',
      parallel: 'mesh',
      hierarchical: 'hierarchical-mesh',
    };

    // Map v2 memory type to v3 backend
    const memoryBackendMap: Record<string, V3Config['memory']['backend']> = {
      local: 'sqlite',
      redis: 'agentdb',
      sqlite: 'hybrid',
    };

    // Transform providers
    const providers: V3Config['agents']['providers'] = [];
    if (v2.provider) {
      providers.push({
        name: v2.provider,
        apiKey: v2.apiKey,
        priority: 1,
        enabled: true,
      });
    }

    // Default to anthropic if no provider specified
    if (providers.length === 0) {
      providers.push({
        name: 'anthropic',
        priority: 1,
        enabled: true,
      });
    }

    // Transform hooks
    const hooks: V3Config['hooks']['hooks'] = [];
    if (v2.hooks) {
      Object.entries(v2.hooks).forEach(([name, config], index) => {
        const handler = typeof config === 'string' ? config : config.handler;
        const enabled = typeof config === 'string' ? true : config.enabled;

        hooks.push({
          name,
          event: name,
          handler,
          priority: index,
          enabled,
        });
      });
    }

    const v3Config: V3Config = {
      version: '3.0.0',
      projectRoot: options.targetDir,

      agents: {
        defaultType: v2.agents?.defaultModel || 'coder',
        autoSpawn: true,
        maxConcurrent: v2.agents?.maxAgents || v2.swarm?.maxConcurrency || 15,
        timeout: v2.agents?.timeout || 300,
        providers,
      },

      swarm: {
        topology: topologyMap[v2.swarm?.mode || 'hierarchical'] || 'hierarchical-mesh',
        maxAgents: v2.swarm?.maxConcurrency || 15,
        autoScale: true,
        coordinationStrategy: v2.swarm?.strategy === 'leader' ? 'leader' : 'consensus',
        healthCheckInterval: 5000,
      },

      memory: {
        backend: memoryBackendMap[v2.memory?.type || 'sqlite'] || 'hybrid',
        persistPath: v2.memory?.path || './data/memory',
        cacheSize: v2.memory?.maxSize || 256,
        enableHNSW: true,
        vectorDimension: v2.embeddings?.dimensions || 1536,
      },

      mcp: {
        serverHost: 'localhost',
        serverPort: 3000,
        autoStart: true,
        transportType: 'stdio',
        tools: ['all'],
      },

      cli: {
        colorOutput: true,
        interactive: true,
        verbosity: 'normal',
        outputFormat: 'text',
        progressStyle: 'bar',
      },

      hooks: {
        enabled: true,
        autoExecute: true,
        hooks,
      },
    };

    // Add warnings for deprecated features
    if (v2.embeddings?.provider === 'openai') {
      this.addWarning('V2 used OpenAI embeddings. V3 uses ONNX Runtime with local models.');
    }

    if (v2.embeddings?.provider === 'tensorflow') {
      this.addWarning('V2 used TensorFlow.js embeddings. V3 uses ONNX Runtime with local models.');
    }

    return v3Config;
  }

  private validateV3Config(config: V3Config): { valid: boolean; errors: unknown[] } {
    const errors: unknown[] = [];

    // Validate required fields
    if (!config.version) errors.push({ field: 'version', message: 'Version is required' });
    if (!config.projectRoot) errors.push({ field: 'projectRoot', message: 'Project root is required' });

    // Validate swarm topology
    const validTopologies = ['hierarchical', 'mesh', 'ring', 'star', 'hybrid', 'hierarchical-mesh'];
    if (!validTopologies.includes(config.swarm.topology)) {
      errors.push({ field: 'swarm.topology', message: `Invalid topology: ${config.swarm.topology}` });
    }

    // Validate memory backend
    const validBackends = ['agentdb', 'sqlite', 'memory', 'hybrid'];
    if (!validBackends.includes(config.memory.backend)) {
      errors.push({ field: 'memory.backend', message: `Invalid backend: ${config.memory.backend}` });
    }

    return { valid: errors.length === 0, errors };
  }

  private async createBackup(configPath: string): Promise<string> {
    const timestamp = Date.now();
    const backupDir = path.join(path.dirname(configPath), '.backups');
    const backupPath = path.join(backupDir, `config-${timestamp}.json`);

    await fs.promises.mkdir(backupDir, { recursive: true });
    await fs.promises.copyFile(configPath, backupPath);

    return backupPath;
  }

  private async writeV3Config(configPath: string, config: V3Config): Promise<void> {
    const dir = path.dirname(configPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
    itemsFailed: number,
    backupPath?: string
  ): MigrationResult {
    return {
      success,
      target: 'config',
      itemsMigrated,
      itemsSkipped,
      itemsFailed,
      messages: this.messages,
      duration: Date.now() - startTime,
      backupPath,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}

export async function migrateConfig(options: MigrationOptions): Promise<MigrationResult> {
  const migrator = new ConfigMigrator();
  return migrator.migrate(options);
}
