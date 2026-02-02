/**
 * Session Migration
 * Convert v2 session data to v3 format
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  MigrationOptions,
  MigrationResult,
  MigrationMessage,
  V2Session,
  V3Session,
} from './types.js';

export class SessionMigrator {
  private messages: MigrationMessage[] = [];
  private errors: Array<{ code: string; message: string; details?: unknown }> = [];
  private warnings: string[] = [];

  async migrate(options: MigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    let itemsMigrated = 0;
    let itemsSkipped = 0;
    let itemsFailed = 0;

    try {
      // Find v2 session files
      const v2SessionsDir = path.join(options.sourceDir, '.claude-flow', 'sessions');
      const v3SessionsDir = path.join(options.targetDir, 'data', 'sessions');

      if (!fs.existsSync(v2SessionsDir)) {
        this.addInfo('No v2 sessions directory found');
        return this.buildResult(true, startTime, itemsMigrated, itemsSkipped, itemsFailed);
      }

      // Find session files
      const sessionFiles = await this.findSessionFiles(v2SessionsDir);

      if (sessionFiles.length === 0) {
        this.addInfo('No v2 session files found');
        return this.buildResult(true, startTime, itemsMigrated, itemsSkipped, itemsFailed);
      }

      this.addInfo(`Found ${sessionFiles.length} session file(s)`);

      // Create v3 sessions directory
      if (!options.dryRun) {
        await fs.promises.mkdir(v3SessionsDir, { recursive: true });
      }

      // Process each session
      for (const sessionFile of sessionFiles) {
        try {
          const sessionData = await this.loadV2Session(sessionFile);

          if (!sessionData) {
            itemsSkipped++;
            this.addWarning(`Skipped invalid session: ${path.basename(sessionFile)}`);
            continue;
          }

          // Transform session
          const v3Session = this.transformSession(sessionData);

          if (options.dryRun) {
            this.addInfo(`Would migrate session: ${v3Session.id}`);
            itemsSkipped++;
          } else {
            await this.writeV3Session(v3SessionsDir, v3Session);
            itemsMigrated++;
            this.addSuccess(`Migrated session: ${v3Session.id}`);
          }
        } catch (error) {
          itemsFailed++;
          this.addError(
            'SESSION_MIGRATION_FAILED',
            `Failed to migrate ${path.basename(sessionFile)}`,
            error
          );
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
      this.addError('MIGRATION_FAILED', 'Session migration failed', error);
      return this.buildResult(false, startTime, itemsMigrated, itemsSkipped, itemsFailed);
    }
  }

  private async findSessionFiles(sessionsDir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(sessionsDir);

      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          files.push(path.join(sessionsDir, entry));
        }
      }
    } catch (error) {
      this.addError('SESSION_SCAN_FAILED', 'Failed to scan sessions directory', error);
    }

    return files;
  }

  private async loadV2Session(sessionPath: string): Promise<V2Session | null> {
    try {
      const content = await fs.promises.readFile(sessionPath, 'utf-8');
      const session = JSON.parse(content);

      // Validate basic structure
      if (!session.id || !session.timestamp) {
        return null;
      }

      return session as V2Session;
    } catch (error) {
      this.addError('SESSION_LOAD_FAILED', `Failed to load session: ${error}`);
      return null;
    }
  }

  private transformSession(v2Session: V2Session): V3Session {
    // Transform agents array
    const agents = Array.isArray(v2Session.agents) ? v2Session.agents : [];

    // Transform memory structure
    const memory = v2Session.memory || {};

    // Transform state
    const state = {
      ...v2Session.state,
      v3Migrated: true,
      migratedAt: Date.now(),
    };

    const v3Session: V3Session = {
      id: v2Session.id,
      timestamp: v2Session.timestamp,
      agents,
      memory,
      state,
      version: '3.0.0',
    };

    return v3Session;
  }

  private async writeV3Session(sessionsDir: string, session: V3Session): Promise<void> {
    const sessionPath = path.join(sessionsDir, `${session.id}.json`);
    await fs.promises.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
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
      target: 'sessions',
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

export async function migrateSessions(options: MigrationOptions): Promise<MigrationResult> {
  const migrator = new SessionMigrator();
  return migrator.migrate(options);
}
