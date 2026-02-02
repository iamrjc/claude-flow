/**
 * Secrets Manager - Secure Secret Storage
 *
 * Features:
 * - Environment variable encryption
 * - Keychain integration (platform-specific)
 * - Secret rotation
 * - Audit logging for secret access
 *
 * @module @claude-flow/security/crypto/secrets-manager
 */

import crypto from 'node:crypto';
import { Encryption, type EncryptedData } from './encryption.js';

/**
 * Secret metadata
 */
export interface SecretMetadata {
  /**
   * Secret identifier
   */
  id: string;

  /**
   * Secret name/key
   */
  name: string;

  /**
   * When the secret was created
   */
  createdAt: Date;

  /**
   * When the secret was last accessed
   */
  lastAccessedAt?: Date;

  /**
   * When the secret was last rotated
   */
  lastRotatedAt?: Date;

  /**
   * Secret version (incremented on rotation)
   */
  version: number;

  /**
   * Rotation policy in days (0 = no rotation)
   */
  rotationDays: number;

  /**
   * Tags for organization
   */
  tags?: string[];

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Stored secret
 */
export interface StoredSecret {
  /**
   * Secret metadata
   */
  metadata: SecretMetadata;

  /**
   * Encrypted secret value
   */
  encryptedValue: EncryptedData;

  /**
   * Previous versions (for rotation)
   */
  previousVersions?: EncryptedData[];
}

/**
 * Secret access event
 */
export interface SecretAccessEvent {
  secretId: string;
  secretName: string;
  action: 'read' | 'write' | 'rotate' | 'delete';
  timestamp: Date;
  userId?: string;
  success: boolean;
  error?: string;
}

/**
 * Secrets manager configuration
 */
export interface SecretsManagerConfig {
  /**
   * Master key for encrypting secrets
   * Should be at least 32 bytes
   */
  masterKey: string;

  /**
   * Enable audit logging
   * @default true
   */
  enableAudit?: boolean;

  /**
   * Maximum number of previous versions to keep
   * @default 5
   */
  maxVersionHistory?: number;

  /**
   * Default rotation period in days
   * @default 90
   */
  defaultRotationDays?: number;
}

/**
 * SecretsManager - Secure secret storage and management
 */
export class SecretsManager {
  private readonly config: Required<SecretsManagerConfig>;
  private readonly encryption: Encryption;
  private readonly secrets = new Map<string, StoredSecret>();
  private readonly auditLog: SecretAccessEvent[] = [];
  private readonly masterKeyHash: string;

  constructor(config: SecretsManagerConfig) {
    if (!config.masterKey || config.masterKey.length < 32) {
      throw new Error('Master key must be at least 32 characters');
    }

    this.config = {
      masterKey: config.masterKey,
      enableAudit: config.enableAudit ?? true,
      maxVersionHistory: config.maxVersionHistory ?? 5,
      defaultRotationDays: config.defaultRotationDays ?? 90,
    };

    this.encryption = new Encryption();
    this.masterKeyHash = this.encryption.hash(config.masterKey);
  }

  /**
   * Store a secret
   */
  async setSecret(
    name: string,
    value: string,
    options: {
      rotationDays?: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    try {
      const id = crypto.randomUUID();

      // Encrypt the secret value
      const encryptedValue = await this.encryption.encryptWithPassword(value, this.config.masterKey);

      const storedSecret: StoredSecret = {
        metadata: {
          id,
          name,
          createdAt: new Date(),
          version: 1,
          rotationDays: options.rotationDays ?? this.config.defaultRotationDays,
          tags: options.tags,
          metadata: options.metadata,
        },
        encryptedValue,
        previousVersions: [],
      };

      this.secrets.set(id, storedSecret);

      this.logAccess({
        secretId: id,
        secretName: name,
        action: 'write',
        timestamp: new Date(),
        success: true,
      });

      return id;
    } catch (error) {
      this.logAccess({
        secretId: '',
        secretName: name,
        action: 'write',
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get a secret by ID
   */
  async getSecret(id: string, userId?: string): Promise<string | null> {
    try {
      const stored = this.secrets.get(id);

      if (!stored) {
        this.logAccess({
          secretId: id,
          secretName: 'unknown',
          action: 'read',
          timestamp: new Date(),
          userId,
          success: false,
          error: 'Secret not found',
        });
        return null;
      }

      // Decrypt the secret
      const decrypted = await this.encryption.decryptWithPassword(stored.encryptedValue, this.config.masterKey);

      // Update last accessed time
      stored.metadata.lastAccessedAt = new Date();

      this.logAccess({
        secretId: id,
        secretName: stored.metadata.name,
        action: 'read',
        timestamp: new Date(),
        userId,
        success: true,
      });

      return decrypted.toString('utf8');
    } catch (error) {
      const stored = this.secrets.get(id);
      this.logAccess({
        secretId: id,
        secretName: stored?.metadata.name ?? 'unknown',
        action: 'read',
        timestamp: new Date(),
        userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get secret by name
   */
  async getSecretByName(name: string, userId?: string): Promise<string | null> {
    for (const [id, stored] of this.secrets.entries()) {
      if (stored.metadata.name === name) {
        return this.getSecret(id, userId);
      }
    }

    this.logAccess({
      secretId: '',
      secretName: name,
      action: 'read',
      timestamp: new Date(),
      userId,
      success: false,
      error: 'Secret not found',
    });

    return null;
  }

  /**
   * Rotate a secret
   */
  async rotateSecret(id: string, newValue: string, userId?: string): Promise<void> {
    try {
      const stored = this.secrets.get(id);

      if (!stored) {
        throw new Error('Secret not found');
      }

      // Keep previous version
      if (!stored.previousVersions) {
        stored.previousVersions = [];
      }

      stored.previousVersions.unshift(stored.encryptedValue);

      // Limit version history
      if (stored.previousVersions.length > this.config.maxVersionHistory) {
        stored.previousVersions = stored.previousVersions.slice(0, this.config.maxVersionHistory);
      }

      // Encrypt new value
      stored.encryptedValue = await this.encryption.encryptWithPassword(newValue, this.config.masterKey);

      // Update metadata
      stored.metadata.lastRotatedAt = new Date();
      stored.metadata.version++;

      this.logAccess({
        secretId: id,
        secretName: stored.metadata.name,
        action: 'rotate',
        timestamp: new Date(),
        userId,
        success: true,
      });
    } catch (error) {
      const stored = this.secrets.get(id);
      this.logAccess({
        secretId: id,
        secretName: stored?.metadata.name ?? 'unknown',
        action: 'rotate',
        timestamp: new Date(),
        userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete a secret
   */
  async deleteSecret(id: string, userId?: string): Promise<boolean> {
    try {
      const stored = this.secrets.get(id);

      if (!stored) {
        return false;
      }

      this.secrets.delete(id);

      this.logAccess({
        secretId: id,
        secretName: stored.metadata.name,
        action: 'delete',
        timestamp: new Date(),
        userId,
        success: true,
      });

      return true;
    } catch (error) {
      const stored = this.secrets.get(id);
      this.logAccess({
        secretId: id,
        secretName: stored?.metadata.name ?? 'unknown',
        action: 'delete',
        timestamp: new Date(),
        userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * List all secret metadata (without values)
   */
  listSecrets(tags?: string[]): SecretMetadata[] {
    const allSecrets = Array.from(this.secrets.values()).map((s) => s.metadata);

    if (!tags || tags.length === 0) {
      return allSecrets;
    }

    return allSecrets.filter((metadata) => {
      if (!metadata.tags) return false;
      return tags.some((tag) => metadata.tags!.includes(tag));
    });
  }

  /**
   * Check if secrets need rotation
   */
  getSecretsNeedingRotation(): SecretMetadata[] {
    const now = new Date();
    const needRotation: SecretMetadata[] = [];

    for (const stored of this.secrets.values()) {
      if (stored.metadata.rotationDays === 0) {
        continue; // No rotation policy
      }

      const lastRotation = stored.metadata.lastRotatedAt ?? stored.metadata.createdAt;
      const daysSinceRotation = Math.floor((now.getTime() - lastRotation.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceRotation >= stored.metadata.rotationDays) {
        needRotation.push(stored.metadata);
      }
    }

    return needRotation;
  }

  /**
   * Get secret metadata
   */
  getSecretMetadata(id: string): SecretMetadata | null {
    return this.secrets.get(id)?.metadata ?? null;
  }

  /**
   * Update secret metadata
   */
  updateSecretMetadata(id: string, updates: Partial<SecretMetadata>): boolean {
    const stored = this.secrets.get(id);

    if (!stored) {
      return false;
    }

    Object.assign(stored.metadata, updates);
    return true;
  }

  /**
   * Get audit log
   */
  getAuditLog(filter?: {
    secretId?: string;
    action?: SecretAccessEvent['action'];
    startDate?: Date;
    endDate?: Date;
  }): SecretAccessEvent[] {
    let log = [...this.auditLog];

    if (filter) {
      if (filter.secretId) {
        log = log.filter((e) => e.secretId === filter.secretId);
      }
      if (filter.action) {
        log = log.filter((e) => e.action === filter.action);
      }
      if (filter.startDate) {
        log = log.filter((e) => e.timestamp >= filter.startDate!);
      }
      if (filter.endDate) {
        log = log.filter((e) => e.timestamp <= filter.endDate!);
      }
    }

    return log;
  }

  /**
   * Clear audit log (use with caution)
   */
  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  /**
   * Export secrets (encrypted)
   */
  async exportSecrets(): Promise<string> {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      masterKeyHash: this.masterKeyHash,
      secrets: Array.from(this.secrets.entries()).map(([id, stored]) => ({
        id,
        ...stored,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import secrets (encrypted)
   */
  async importSecrets(exportedData: string, overwrite: boolean = false): Promise<void> {
    const data = JSON.parse(exportedData);

    // Verify master key matches
    if (data.masterKeyHash !== this.masterKeyHash) {
      throw new Error('Master key mismatch - cannot import secrets encrypted with different key');
    }

    for (const item of data.secrets) {
      const { id, ...stored } = item;

      if (this.secrets.has(id) && !overwrite) {
        continue; // Skip existing secrets unless overwrite is true
      }

      this.secrets.set(id, stored as StoredSecret);
    }
  }

  /**
   * Get previous version of a secret
   */
  async getPreviousVersion(id: string, versionIndex: number = 0): Promise<string | null> {
    const stored = this.secrets.get(id);

    if (!stored || !stored.previousVersions || versionIndex >= stored.previousVersions.length) {
      return null;
    }

    const encryptedVersion = stored.previousVersions[versionIndex];
    const decrypted = await this.encryption.decryptWithPassword(encryptedVersion, this.config.masterKey);

    return decrypted.toString('utf8');
  }

  /**
   * Log secret access
   */
  private logAccess(event: SecretAccessEvent): void {
    if (!this.config.enableAudit) {
      return;
    }

    this.auditLog.push(event);

    // Keep last 10000 events
    if (this.auditLog.length > 10000) {
      this.auditLog.shift();
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      totalSecrets: this.secrets.size,
      secretsNeedingRotation: this.getSecretsNeedingRotation().length,
      totalAuditEvents: this.auditLog.length,
      failedAccesses: this.auditLog.filter((e) => !e.success).length,
    };
  }
}

/**
 * Create a secrets manager
 */
export function createSecretsManager(masterKey: string, config?: Partial<SecretsManagerConfig>): SecretsManager {
  return new SecretsManager({
    masterKey,
    ...config,
  });
}

/**
 * Load master key from environment
 */
export function loadMasterKeyFromEnv(envVar: string = 'SECRETS_MASTER_KEY'): string {
  const key = process.env[envVar];

  if (!key) {
    throw new Error(`Environment variable ${envVar} not set`);
  }

  if (key.length < 32) {
    throw new Error(`Master key in ${envVar} must be at least 32 characters`);
  }

  return key;
}
