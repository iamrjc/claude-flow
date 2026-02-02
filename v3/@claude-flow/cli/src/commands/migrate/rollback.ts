/**
 * Migration Rollback
 * Rollback to previous version from backup
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  MigrationOptions,
  MigrationResult,
  MigrationMessage,
  BackupMetadata,
} from './types.js';

export class MigrationRollback {
  private messages: MigrationMessage[] = [];
  private errors: Array<{ code: string; message: string; details?: unknown }> = [];
  private warnings: string[] = [];

  async rollback(backupId: string, options: MigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    let itemsMigrated = 0;
    let itemsSkipped = 0;
    let itemsFailed = 0;

    try {
      // Find backup
      const backup = await this.findBackup(backupId, options.sourceDir);

      if (!backup) {
        this.addError('BACKUP_NOT_FOUND', `Backup not found: ${backupId}`);
        return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed);
      }

      this.addInfo(`Found backup: ${backupId}`);
      this.addInfo(`  Created: ${new Date(backup.timestamp).toISOString()}`);
      this.addInfo(`  Version: ${backup.version}`);
      this.addInfo(`  Files: ${backup.files.length}`);

      // Verify backup integrity
      const integrityCheck = await this.verifyBackupIntegrity(backup);
      if (!integrityCheck.valid) {
        this.addError('BACKUP_CORRUPTED', 'Backup integrity check failed', integrityCheck.errors);
        return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed);
      }

      this.addSuccess('Backup integrity verified');

      // Create backup of current state before rollback
      if (!options.dryRun) {
        const currentStateBackup = await this.backupCurrentState(options.targetDir);
        this.addSuccess(`Current state backed up: ${currentStateBackup}`);
      }

      // Restore files
      if (options.dryRun) {
        this.addInfo(`Would restore ${backup.files.length} file(s)`);
        backup.files.forEach((file) => {
          this.addInfo(`  - ${file.path}`);
        });
        itemsSkipped = backup.files.length;
      } else {
        for (const file of backup.files) {
          try {
            await this.restoreFile(file.path, backup.sourceDir, options.targetDir);
            itemsMigrated++;
            this.addSuccess(`Restored: ${file.path}`);
          } catch (error) {
            itemsFailed++;
            this.addError('FILE_RESTORE_FAILED', `Failed to restore ${file.path}`, error);
          }
        }
      }

      if (itemsFailed === 0) {
        this.addSuccess('Rollback completed successfully');
      } else {
        this.addWarning(`Rollback completed with ${itemsFailed} error(s)`);
      }

      return this.buildResult(
        itemsFailed === 0,
        startTime,
        itemsMigrated,
        itemsSkipped,
        itemsFailed
      );
    } catch (error) {
      this.addError('ROLLBACK_FAILED', 'Rollback failed', error);
      return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed);
    }
  }

  async listBackups(sourceDir: string): Promise<BackupMetadata[]> {
    const backups: BackupMetadata[] = [];
    const backupDirs = [
      path.join(sourceDir, '.backups'),
      path.join(sourceDir, '.claude-flow', '.backups'),
    ];

    for (const backupDir of backupDirs) {
      if (fs.existsSync(backupDir)) {
        const entries = fs.readdirSync(backupDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('backup-')) {
            const metadataPath = path.join(backupDir, entry.name, 'metadata.json');

            if (fs.existsSync(metadataPath)) {
              try {
                const content = fs.readFileSync(metadataPath, 'utf-8');
                const metadata: BackupMetadata = JSON.parse(content);
                backups.push(metadata);
              } catch (error) {
                // Skip invalid backups
              }
            }
          }
        }
      }
    }

    // Sort by timestamp (newest first)
    backups.sort((a, b) => b.timestamp - a.timestamp);

    return backups;
  }

  private async findBackup(
    backupId: string,
    sourceDir: string
  ): Promise<BackupMetadata | null> {
    const backups = await this.listBackups(sourceDir);

    // Find by ID or use latest if 'latest'
    if (backupId === 'latest' && backups.length > 0) {
      return backups[0];
    }

    return backups.find((b) => b.id === backupId) || null;
  }

  private async verifyBackupIntegrity(
    backup: BackupMetadata
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if all files exist
    for (const file of backup.files) {
      const filePath = path.join(backup.sourceDir, file.path);

      if (!fs.existsSync(filePath)) {
        errors.push(`Missing backup file: ${file.path}`);
        continue;
      }

      // Verify checksum
      try {
        const content = await fs.promises.readFile(filePath);
        const actualChecksum = this.calculateChecksum(content);

        if (actualChecksum !== file.checksum) {
          errors.push(`Checksum mismatch: ${file.path}`);
        }
      } catch (error) {
        errors.push(`Failed to verify ${file.path}: ${error}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private async backupCurrentState(targetDir: string): Promise<string> {
    const timestamp = Date.now();
    const backupId = `pre-rollback-${timestamp}`;
    const backupDir = path.join(targetDir, '.backups', backupId);

    await fs.promises.mkdir(backupDir, { recursive: true });

    // Backup config file
    const configPath = path.join(targetDir, 'claude-flow.config.json');
    if (fs.existsSync(configPath)) {
      await fs.promises.copyFile(configPath, path.join(backupDir, 'claude-flow.config.json'));
    }

    // Create metadata
    const metadata: BackupMetadata = {
      id: backupId,
      timestamp,
      version: '3.0.0',
      sourceDir: backupDir,
      files: [
        {
          path: 'claude-flow.config.json',
          size: fs.statSync(configPath).size,
          checksum: this.calculateChecksum(fs.readFileSync(configPath)),
        },
      ],
      checksums: {},
    };

    await fs.promises.writeFile(
      path.join(backupDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    return backupId;
  }

  private async restoreFile(
    relativePath: string,
    backupDir: string,
    targetDir: string
  ): Promise<void> {
    const sourcePath = path.join(backupDir, relativePath);
    const targetPath = path.join(targetDir, relativePath);

    // Create target directory if needed
    const targetDirPath = path.dirname(targetPath);
    await fs.promises.mkdir(targetDirPath, { recursive: true });

    // Copy file
    await fs.promises.copyFile(sourcePath, targetPath);
  }

  private calculateChecksum(buffer: Buffer): string {
    // Simple checksum implementation (in production, use crypto.createHash)
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i];
    }
    return sum.toString(16);
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

export async function rollbackMigration(
  backupId: string,
  options: MigrationOptions
): Promise<MigrationResult> {
  const rollback = new MigrationRollback();
  return rollback.rollback(backupId, options);
}

export async function listBackups(sourceDir: string): Promise<BackupMetadata[]> {
  const rollback = new MigrationRollback();
  return rollback.listBackups(sourceDir);
}
