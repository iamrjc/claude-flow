/**
 * Audit Logger - Tamper-Evident Audit Logging
 *
 * Features:
 * - Authentication event logging
 * - Permission change tracking
 * - Tamper-evident logs (HMAC chaining)
 * - Log rotation and archival
 * - Query and filtering
 *
 * @module @claude-flow/security/audit/audit-logger
 */

import crypto from 'node:crypto';
import { Encryption } from '../crypto/encryption.js';

/**
 * Audit event types
 */
export enum AuditEventType {
  // Authentication
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGOUT = 'auth.logout',
  TOKEN_GENERATED = 'auth.token.generated',
  TOKEN_REVOKED = 'auth.token.revoked',
  TOKEN_REFRESHED = 'auth.token.refreshed',

  // Authorization
  PERMISSION_GRANTED = 'authz.permission.granted',
  PERMISSION_REVOKED = 'authz.permission.revoked',
  ROLE_ASSIGNED = 'authz.role.assigned',
  ROLE_CHANGED = 'authz.role.changed',
  ACCESS_DENIED = 'authz.access.denied',
  ACCESS_GRANTED = 'authz.access.granted',

  // Resource operations
  RESOURCE_CREATED = 'resource.created',
  RESOURCE_UPDATED = 'resource.updated',
  RESOURCE_DELETED = 'resource.deleted',
  RESOURCE_ACCESSED = 'resource.accessed',

  // Security
  SECURITY_VIOLATION = 'security.violation',
  SECURITY_SCAN = 'security.scan',
  SECRETS_ACCESSED = 'security.secrets.accessed',
  ENCRYPTION_KEY_ROTATED = 'security.key.rotated',

  // Configuration
  CONFIG_CHANGED = 'config.changed',
  CONFIG_EXPORTED = 'config.exported',
  CONFIG_IMPORTED = 'config.imported',

  // System
  SYSTEM_START = 'system.start',
  SYSTEM_STOP = 'system.stop',
  SYSTEM_ERROR = 'system.error',
}

/**
 * Severity levels
 */
export enum AuditSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Audit event structure
 */
export interface AuditEvent {
  /**
   * Unique event ID
   */
  id: string;

  /**
   * Event type
   */
  type: AuditEventType;

  /**
   * Severity level
   */
  severity: AuditSeverity;

  /**
   * Timestamp
   */
  timestamp: Date;

  /**
   * User ID (if applicable)
   */
  userId?: string;

  /**
   * Resource type and ID
   */
  resource?: {
    type: string;
    id: string;
  };

  /**
   * Action performed
   */
  action?: string;

  /**
   * Result of the action
   */
  result: 'success' | 'failure';

  /**
   * IP address or source
   */
  source?: string;

  /**
   * Additional details
   */
  details?: Record<string, unknown>;

  /**
   * Error message (if applicable)
   */
  error?: string;

  /**
   * HMAC for tamper detection (chained from previous event)
   */
  hmac?: string;

  /**
   * Previous event ID for chaining
   */
  previousEventId?: string;
}

/**
 * Audit logger configuration
 */
export interface AuditLoggerConfig {
  /**
   * HMAC secret for tamper detection
   */
  hmacSecret: string;

  /**
   * Enable log encryption
   * @default false
   */
  encryptLogs?: boolean;

  /**
   * Encryption password (required if encryptLogs is true)
   */
  encryptionPassword?: string;

  /**
   * Maximum events to keep in memory
   * @default 10000
   */
  maxEvents?: number;

  /**
   * Enable log rotation
   * @default true
   */
  enableRotation?: boolean;

  /**
   * Rotation threshold (number of events)
   * @default 5000
   */
  rotationThreshold?: number;

  /**
   * Minimum severity to log
   * @default INFO
   */
  minSeverity?: AuditSeverity;
}

/**
 * Log query options
 */
export interface LogQueryOptions {
  eventType?: AuditEventType | AuditEventType[];
  severity?: AuditSeverity | AuditSeverity[];
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  result?: 'success' | 'failure';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * AuditLogger - Tamper-evident audit logging
 */
export class AuditLogger {
  private readonly config: Required<Omit<AuditLoggerConfig, 'encryptionPassword'>> & {
    encryptionPassword?: string;
  };
  private readonly encryption?: Encryption;
  private readonly events: AuditEvent[] = [];
  private readonly archivedEvents: AuditEvent[][] = [];
  private lastEventId?: string;

  constructor(config: AuditLoggerConfig) {
    if (!config.hmacSecret || config.hmacSecret.length < 32) {
      throw new Error('HMAC secret must be at least 32 characters');
    }

    if (config.encryptLogs && !config.encryptionPassword) {
      throw new Error('Encryption password required when encryptLogs is enabled');
    }

    this.config = {
      hmacSecret: config.hmacSecret,
      encryptLogs: config.encryptLogs ?? false,
      encryptionPassword: config.encryptionPassword,
      maxEvents: config.maxEvents ?? 10000,
      enableRotation: config.enableRotation ?? true,
      rotationThreshold: config.rotationThreshold ?? 5000,
      minSeverity: config.minSeverity ?? AuditSeverity.INFO,
    };

    if (this.config.encryptLogs) {
      this.encryption = new Encryption();
    }
  }

  /**
   * Log an audit event
   */
  async log(event: Omit<AuditEvent, 'id' | 'hmac' | 'previousEventId'>): Promise<string> {
    // Check severity filter
    if (!this.shouldLog(event.severity)) {
      return '';
    }

    const id = crypto.randomUUID();

    const fullEvent: AuditEvent = {
      id,
      ...event,
      previousEventId: this.lastEventId,
    };

    // Calculate HMAC for tamper detection
    fullEvent.hmac = this.calculateEventHMAC(fullEvent);

    this.events.push(fullEvent);
    this.lastEventId = id;

    // Check rotation
    if (this.config.enableRotation && this.events.length >= this.config.rotationThreshold) {
      await this.rotate();
    }

    // Check max events
    if (this.events.length > this.config.maxEvents) {
      this.events.shift(); // Remove oldest
    }

    return id;
  }

  /**
   * Log authentication success
   */
  async logAuthSuccess(userId: string, source?: string, details?: Record<string, unknown>): Promise<string> {
    return this.log({
      type: AuditEventType.LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      timestamp: new Date(),
      userId,
      source,
      result: 'success',
      details,
    });
  }

  /**
   * Log authentication failure
   */
  async logAuthFailure(userId: string, source?: string, error?: string): Promise<string> {
    return this.log({
      type: AuditEventType.LOGIN_FAILURE,
      severity: AuditSeverity.WARNING,
      timestamp: new Date(),
      userId,
      source,
      result: 'failure',
      error,
    });
  }

  /**
   * Log permission change
   */
  async logPermissionChange(
    userId: string,
    action: 'granted' | 'revoked',
    permission: string,
    grantedBy?: string
  ): Promise<string> {
    return this.log({
      type: action === 'granted' ? AuditEventType.PERMISSION_GRANTED : AuditEventType.PERMISSION_REVOKED,
      severity: AuditSeverity.INFO,
      timestamp: new Date(),
      userId,
      result: 'success',
      details: {
        permission,
        grantedBy,
      },
    });
  }

  /**
   * Log role change
   */
  async logRoleChange(userId: string, oldRole: string, newRole: string, changedBy?: string): Promise<string> {
    return this.log({
      type: AuditEventType.ROLE_CHANGED,
      severity: AuditSeverity.INFO,
      timestamp: new Date(),
      userId,
      result: 'success',
      details: {
        oldRole,
        newRole,
        changedBy,
      },
    });
  }

  /**
   * Log access denial
   */
  async logAccessDenied(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: string,
    reason?: string
  ): Promise<string> {
    return this.log({
      type: AuditEventType.ACCESS_DENIED,
      severity: AuditSeverity.WARNING,
      timestamp: new Date(),
      userId,
      resource: { type: resourceType, id: resourceId },
      action,
      result: 'failure',
      error: reason,
    });
  }

  /**
   * Log security violation
   */
  async logSecurityViolation(
    userId: string | undefined,
    violation: string,
    source?: string,
    details?: Record<string, unknown>
  ): Promise<string> {
    return this.log({
      type: AuditEventType.SECURITY_VIOLATION,
      severity: AuditSeverity.CRITICAL,
      timestamp: new Date(),
      userId,
      source,
      result: 'failure',
      error: violation,
      details,
    });
  }

  /**
   * Query audit logs
   */
  query(options: LogQueryOptions = {}): AuditEvent[] {
    let results = [...this.events];

    // Apply filters
    if (options.eventType) {
      const types = Array.isArray(options.eventType) ? options.eventType : [options.eventType];
      results = results.filter((e) => types.includes(e.type));
    }

    if (options.severity) {
      const severities = Array.isArray(options.severity) ? options.severity : [options.severity];
      results = results.filter((e) => severities.includes(e.severity));
    }

    if (options.userId) {
      results = results.filter((e) => e.userId === options.userId);
    }

    if (options.resourceType) {
      results = results.filter((e) => e.resource?.type === options.resourceType);
    }

    if (options.resourceId) {
      results = results.filter((e) => e.resource?.id === options.resourceId);
    }

    if (options.result) {
      results = results.filter((e) => e.result === options.result);
    }

    if (options.startDate) {
      results = results.filter((e) => e.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      results = results.filter((e) => e.timestamp <= options.endDate!);
    }

    // Apply pagination
    if (options.offset) {
      results = results.slice(options.offset);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Verify log integrity
   */
  verifyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let previousId: string | undefined;

    for (const event of this.events) {
      // Check HMAC
      const expectedHMAC = this.calculateEventHMAC(event);
      if (event.hmac !== expectedHMAC) {
        errors.push(`Event ${event.id} has invalid HMAC - log may be tampered`);
      }

      // Check chain
      if (previousId && event.previousEventId !== previousId) {
        errors.push(`Event ${event.id} has broken chain - expected previous ${previousId}, got ${event.previousEventId}`);
      }

      previousId = event.id;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export logs (optionally encrypted)
   */
  async export(encrypt: boolean = false): Promise<string> {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      events: this.events,
      archived: this.archivedEvents,
    };

    const json = JSON.stringify(exportData, null, 2);

    if (encrypt && this.encryption && this.config.encryptionPassword) {
      return this.encryption.encryptAndSerialize(json, this.config.encryptionPassword);
    }

    return json;
  }

  /**
   * Import logs
   */
  async import(data: string, encrypted: boolean = false): Promise<void> {
    let json = data;

    if (encrypted && this.encryption && this.config.encryptionPassword) {
      const decrypted = await this.encryption.deserializeAndDecrypt(data, this.config.encryptionPassword);
      json = decrypted.toString('utf8');
    }

    const importData = JSON.parse(json);

    // Verify integrity before importing
    const tempLogger = new AuditLogger({
      hmacSecret: this.config.hmacSecret,
    });
    tempLogger.events.push(...importData.events);

    const verification = tempLogger.verifyIntegrity();
    if (!verification.valid) {
      throw new Error(`Cannot import logs with integrity errors: ${verification.errors.join(', ')}`);
    }

    // Import events
    this.events.push(...importData.events);
    if (importData.archived) {
      this.archivedEvents.push(...importData.archived);
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      totalEvents: this.events.length,
      archivedBatches: this.archivedEvents.length,
      last24Hours: this.events.filter((e) => e.timestamp >= last24h).length,
      failures: this.events.filter((e) => e.result === 'failure').length,
      criticalEvents: this.events.filter((e) => e.severity === AuditSeverity.CRITICAL).length,
      uniqueUsers: new Set(this.events.filter((e) => e.userId).map((e) => e.userId!)).size,
    };
  }

  /**
   * Clear logs (use with caution - logs audit event)
   */
  async clearLogs(userId: string, reason: string): Promise<void> {
    // Log the clear operation first
    await this.log({
      type: AuditEventType.CONFIG_CHANGED,
      severity: AuditSeverity.CRITICAL,
      timestamp: new Date(),
      userId,
      result: 'success',
      details: {
        action: 'clear_logs',
        reason,
        eventsCleared: this.events.length,
      },
    });

    this.events.length = 0;
    this.lastEventId = undefined;
  }

  /**
   * Calculate HMAC for an event
   */
  private calculateEventHMAC(event: AuditEvent): string {
    // Create a deterministic string representation
    const data = [
      event.id,
      event.type,
      event.timestamp.toISOString(),
      event.userId ?? '',
      event.result,
      event.previousEventId ?? '',
      JSON.stringify(event.details ?? {}),
    ].join('|');

    return crypto.createHmac('sha256', this.config.hmacSecret).update(data).digest('hex');
  }

  /**
   * Check if event should be logged based on severity
   */
  private shouldLog(severity: AuditSeverity): boolean {
    const levels = [AuditSeverity.DEBUG, AuditSeverity.INFO, AuditSeverity.WARNING, AuditSeverity.ERROR, AuditSeverity.CRITICAL];
    const minIndex = levels.indexOf(this.config.minSeverity);
    const eventIndex = levels.indexOf(severity);
    return eventIndex >= minIndex;
  }

  /**
   * Rotate logs to archive
   */
  private async rotate(): Promise<void> {
    if (this.events.length === 0) {
      return;
    }

    // Move current events to archive
    this.archivedEvents.push([...this.events]);

    // Keep only last 100 events for chaining
    const keepEvents = this.events.slice(-100);
    this.events.length = 0;
    this.events.push(...keepEvents);

    // Limit archived batches (keep last 10)
    if (this.archivedEvents.length > 10) {
      this.archivedEvents.shift();
    }
  }
}

/**
 * Create an audit logger
 */
export function createAuditLogger(hmacSecret: string, config?: Partial<AuditLoggerConfig>): AuditLogger {
  return new AuditLogger({
    hmacSecret,
    ...config,
  });
}

/**
 * Severity helper functions
 */
export function isHighSeverity(severity: AuditSeverity): boolean {
  return severity === AuditSeverity.ERROR || severity === AuditSeverity.CRITICAL;
}

export function isCriticalEvent(event: AuditEvent): boolean {
  return (
    event.severity === AuditSeverity.CRITICAL ||
    event.type === AuditEventType.SECURITY_VIOLATION ||
    event.type === AuditEventType.ENCRYPTION_KEY_ROTATED
  );
}
