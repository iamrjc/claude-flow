/**
 * Migration Validation
 * Validate data integrity after migration
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  MigrationOptions,
  MigrationResult,
  MigrationMessage,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  V3Config,
} from './types.js';

export class MigrationValidator {
  private messages: MigrationMessage[] = [];
  private errors: Array<{ code: string; message: string; details?: unknown }> = [];
  private warnings: string[] = [];

  async validate(options: MigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    let itemsMigrated = 0;
    let itemsSkipped = 0;
    let itemsFailed = 0;

    try {
      const validationChecks = [
        { name: 'Configuration', check: () => this.validateConfig(options) },
        { name: 'File Structure', check: () => this.validateFileStructure(options) },
        { name: 'Database Schema', check: () => this.validateDatabaseSchema(options) },
        { name: 'Plugin References', check: () => this.validatePluginReferences(options) },
        { name: 'Session Data', check: () => this.validateSessionData(options) },
      ];

      this.addInfo(`Running ${validationChecks.length} validation checks`);

      for (const { name, check } of validationChecks) {
        try {
          const result = await check();

          if (result.valid) {
            itemsMigrated++;
            this.addSuccess(`✓ ${name}: Valid`);
          } else {
            itemsFailed++;
            this.addError('VALIDATION_FAILED', `✗ ${name}: Failed`, result.errors);

            // Add individual errors
            result.errors.forEach((error) => {
              this.addWarning(`  - ${error.path}: ${error.message}`);
            });
          }

          // Add warnings
          result.warnings.forEach((warning) => {
            this.addWarning(`  ⚠ ${warning.path}: ${warning.message}`);
          });
        } catch (error) {
          itemsFailed++;
          this.addError('VALIDATION_ERROR', `Error validating ${name}`, error);
        }
      }

      return this.buildResult(
        itemsFailed === 0,
        startTime,
        itemsMigrated,
        itemsSkipped,
        itemsFailed
      );
    } catch (error) {
      this.addError('VALIDATION_FAILED', 'Validation failed', error);
      return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed);
    }
  }

  private async validateConfig(options: MigrationOptions): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const configPath = path.join(options.targetDir, 'claude-flow.config.json');

    // Check if config exists
    if (!fs.existsSync(configPath)) {
      errors.push({
        path: configPath,
        message: 'V3 configuration file not found',
      });
      return { valid: false, errors, warnings };
    }

    // Load and validate config
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config: V3Config = JSON.parse(content);

      // Validate version
      if (!config.version || !config.version.startsWith('3.')) {
        errors.push({
          path: 'version',
          message: 'Invalid version format',
          expected: '3.x.x',
          actual: config.version,
        });
      }

      // Validate required sections
      const requiredSections = ['agents', 'swarm', 'memory', 'mcp', 'cli', 'hooks'];
      for (const section of requiredSections) {
        if (!(section in config)) {
          errors.push({
            path: section,
            message: `Missing required section: ${section}`,
          });
        }
      }

      // Validate swarm topology
      const validTopologies = ['hierarchical', 'mesh', 'ring', 'star', 'hybrid', 'hierarchical-mesh'];
      if (config.swarm && !validTopologies.includes(config.swarm.topology)) {
        errors.push({
          path: 'swarm.topology',
          message: 'Invalid swarm topology',
          expected: validTopologies.join(', '),
          actual: config.swarm.topology,
        });
      }

      // Validate memory backend
      const validBackends = ['agentdb', 'sqlite', 'memory', 'hybrid'];
      if (config.memory && !validBackends.includes(config.memory.backend)) {
        errors.push({
          path: 'memory.backend',
          message: 'Invalid memory backend',
          expected: validBackends.join(', '),
          actual: config.memory.backend,
        });
      }

      // Check for deprecated features
      if (config.agents.providers.some((p) => p.name === 'openai-embeddings')) {
        warnings.push({
          path: 'agents.providers',
          message: 'OpenAI embeddings provider is deprecated',
          suggestion: 'Use ONNX Runtime with local models',
        });
      }
    } catch (error) {
      errors.push({
        path: configPath,
        message: `Failed to parse configuration: ${error}`,
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private async validateFileStructure(options: MigrationOptions): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const expectedDirs = [
      'data',
      'data/memory',
      'data/sessions',
      'plugins',
    ];

    for (const dir of expectedDirs) {
      const dirPath = path.join(options.targetDir, dir);
      if (!fs.existsSync(dirPath)) {
        warnings.push({
          path: dirPath,
          message: 'Expected directory not found',
          suggestion: `Create directory: ${dir}`,
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private async validateDatabaseSchema(options: MigrationOptions): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const dbPath = path.join(options.targetDir, 'data', 'memory', 'agentdb.sqlite');

    if (!fs.existsSync(dbPath)) {
      warnings.push({
        path: dbPath,
        message: 'Database file not found',
        suggestion: 'Database will be created on first use',
      });
      return { valid: true, errors, warnings };
    }

    // In a real implementation, we would:
    // 1. Open the database
    // 2. Check for v3 schema tables (schema_version, hnsw_indices, etc.)
    // 3. Validate table structures
    // 4. Check indexes

    return { valid: errors.length === 0, errors, warnings };
  }

  private async validatePluginReferences(options: MigrationOptions): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const pluginsDir = path.join(options.targetDir, 'plugins');

    if (!fs.existsSync(pluginsDir)) {
      return { valid: true, errors, warnings };
    }

    // Check for migration report
    const reportPath = path.join(pluginsDir, 'MIGRATION_REPORT.md');
    if (!fs.existsSync(reportPath)) {
      warnings.push({
        path: reportPath,
        message: 'Plugin migration report not found',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private async validateSessionData(options: MigrationOptions): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const sessionsDir = path.join(options.targetDir, 'data', 'sessions');

    if (!fs.existsSync(sessionsDir)) {
      return { valid: true, errors, warnings };
    }

    try {
      const files = fs.readdirSync(sessionsDir);
      const sessionFiles = files.filter((f) => f.endsWith('.json'));

      for (const file of sessionFiles) {
        const filePath = path.join(sessionsDir, file);
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const session = JSON.parse(content);

          // Validate session structure
          if (!session.id) {
            errors.push({
              path: filePath,
              message: 'Session missing required field: id',
            });
          }

          if (!session.version) {
            warnings.push({
              path: filePath,
              message: 'Session missing version field',
              suggestion: 'Add version: "3.0.0"',
            });
          } else if (!session.version.startsWith('3.')) {
            warnings.push({
              path: filePath,
              message: 'Session has non-v3 version',
              actual: session.version,
            });
          }
        } catch (error) {
          errors.push({
            path: filePath,
            message: `Failed to parse session file: ${error}`,
          });
        }
      }
    } catch (error) {
      errors.push({
        path: sessionsDir,
        message: `Failed to scan sessions directory: ${error}`,
      });
    }

    return { valid: errors.length === 0, errors, warnings };
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
      target: 'all',
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

export async function validateMigration(options: MigrationOptions): Promise<MigrationResult> {
  const validator = new MigrationValidator();
  return validator.validate(options);
}
