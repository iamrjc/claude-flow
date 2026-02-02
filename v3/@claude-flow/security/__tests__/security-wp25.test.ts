/**
 * Security Module Tests - WP25
 *
 * Comprehensive test suite covering:
 * - Token management
 * - RBAC
 * - Input validation
 * - Path validation
 * - Encryption
 * - Secrets management
 * - Audit logging
 *
 * Target: >80% coverage, 40+ tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenManager, TokenType } from '../src/auth/token-manager.js';
import { RBACManager, Role, Permission, ResourceType, Action } from '../src/auth/rbac.js';
import {
  InputValidator,
  sanitizeString,
  sanitizeHTML,
  containsSQLInjection,
  LoginRequestSchema,
  SpawnAgentSchema,
} from '../src/validation/input-validator.js';
import { PathValidator } from '../src/validation/path-validator.js';
import { Encryption } from '../src/crypto/encryption.js';
import { SecretsManager } from '../src/crypto/secrets-manager.js';
import { AuditLogger, AuditEventType, AuditSeverity } from '../src/audit/audit-logger.js';
import { createSecurityModule } from '../src/index-wp25.js';

// ============================================================================
// Token Manager Tests
// ============================================================================

describe('TokenManager', () => {
  let tokenManager: TokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager({
      jwtSecret: 'test-secret-key-at-least-32-characters-long',
      accessTokenTTL: 3600,
      refreshTokenTTL: 604800,
    });
  });

  it('should generate access token', () => {
    const token = tokenManager.generateAccessToken('user-123', ['read', 'write']);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT format
  });

  it('should verify valid access token', () => {
    const token = tokenManager.generateAccessToken('user-123', ['read']);
    const verification = tokenManager.verifyToken(token);

    expect(verification.valid).toBe(true);
    expect(verification.payload?.sub).toBe('user-123');
    expect(verification.payload?.type).toBe(TokenType.ACCESS);
  });

  it('should reject invalid token', () => {
    const verification = tokenManager.verifyToken('invalid.token.here');
    expect(verification.valid).toBe(false);
    expect(verification.error).toBeTruthy();
  });

  it('should generate refresh token', () => {
    const token = tokenManager.generateRefreshToken('user-123', ['read']);
    expect(token).toBeTruthy();

    const verification = tokenManager.verifyToken(token);
    expect(verification.payload?.type).toBe(TokenType.REFRESH);
  });

  it('should refresh access token', async () => {
    const refreshToken = tokenManager.generateRefreshToken('user-123', ['read', 'write']);
    const result = await tokenManager.refreshAccessToken(refreshToken);

    expect(result.accessToken).toBeTruthy();
    const verification = tokenManager.verifyToken(result.accessToken);
    expect(verification.valid).toBe(true);
  });

  it('should rotate refresh token when enabled', async () => {
    const refreshToken = tokenManager.generateRefreshToken('user-123', ['read']);
    const result = await tokenManager.refreshAccessToken(refreshToken);

    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe(refreshToken);
  });

  it('should revoke token by JTI', () => {
    const token = tokenManager.generateAccessToken('user-123', ['read']);
    const verification1 = tokenManager.verifyToken(token);

    tokenManager.revokeToken(verification1.payload!.jti!);

    const verification2 = tokenManager.verifyToken(token);
    expect(verification2.valid).toBe(false);
    expect(verification2.error).toContain('revoked');
  });

  it('should generate API key', async () => {
    const { id, key } = await tokenManager.generateAPIKey('user-123', 'Test Key', ['read']);

    expect(id).toBeTruthy();
    expect(key).toBeTruthy();
    expect(key.length).toBeGreaterThan(20);
  });

  it('should verify API key', async () => {
    const { key } = await tokenManager.generateAPIKey('user-123', 'Test Key', ['read', 'write']);
    const verification = await tokenManager.verifyAPIKey(key);

    expect(verification.valid).toBe(true);
    expect(verification.payload?.sub).toBe('user-123');
    expect(verification.payload?.scopes).toContain('read');
  });

  it('should check token scope', () => {
    const token = tokenManager.generateAccessToken('user-123', ['read', 'write']);
    const verification = tokenManager.verifyToken(token);

    expect(tokenManager.hasScope(verification.payload!, 'read')).toBe(true);
    expect(tokenManager.hasScope(verification.payload!, 'admin')).toBe(false);
  });

  it('should give admin all scopes', () => {
    const token = tokenManager.generateAccessToken('admin', ['admin']);
    const verification = tokenManager.verifyToken(token);

    expect(tokenManager.hasScope(verification.payload!, 'read')).toBe(true);
    expect(tokenManager.hasScope(verification.payload!, 'write')).toBe(true);
  });
});

// ============================================================================
// RBAC Tests
// ============================================================================

describe('RBACManager', () => {
  let rbac: RBACManager;

  beforeEach(() => {
    rbac = new RBACManager();
  });

  it('should assign role to user', () => {
    rbac.assignRole('user-123', Role.OPERATOR);
    expect(rbac.getUserRole('user-123')).toBe(Role.OPERATOR);
  });

  it('should check admin permissions', () => {
    rbac.assignRole('admin', Role.ADMIN);
    expect(rbac.hasPermission('admin', Permission.AGENT_SPAWN)).toBe(true);
    expect(rbac.hasPermission('admin', Permission.SYSTEM_ADMIN)).toBe(true);
  });

  it('should check operator permissions', () => {
    rbac.assignRole('operator', Role.OPERATOR);
    expect(rbac.hasPermission('operator', Permission.AGENT_SPAWN)).toBe(true);
    expect(rbac.hasPermission('operator', Permission.SYSTEM_ADMIN)).toBe(false);
  });

  it('should check viewer permissions', () => {
    rbac.assignRole('viewer', Role.VIEWER);
    expect(rbac.hasPermission('viewer', Permission.AGENT_VIEW)).toBe(true);
    expect(rbac.hasPermission('viewer', Permission.AGENT_SPAWN)).toBe(false);
  });

  it('should check resource action permission', () => {
    rbac.assignRole('user', Role.OPERATOR);
    const result = rbac.checkResourceAction('user', ResourceType.AGENT, Action.CREATE);

    expect(result.allowed).toBe(true);
  });

  it('should deny insufficient permissions', () => {
    rbac.assignRole('viewer', Role.VIEWER);
    const result = rbac.checkResourceAction('viewer', ResourceType.AGENT, Action.CREATE);

    expect(result.allowed).toBe(false);
  });

  it('should grant custom permission', () => {
    rbac.assignRole('user', Role.VIEWER);
    rbac.grantPermission('user', Permission.AGENT_SPAWN);

    expect(rbac.hasPermission('user', Permission.AGENT_SPAWN)).toBe(true);
  });

  it('should revoke custom permission', () => {
    rbac.assignRole('user', Role.VIEWER);
    rbac.grantPermission('user', Permission.AGENT_SPAWN);
    rbac.revokePermission('user', Permission.AGENT_SPAWN);

    expect(rbac.hasPermission('user', Permission.AGENT_SPAWN)).toBe(false);
  });

  it('should get user scopes for tokens', () => {
    rbac.assignRole('admin', Role.ADMIN);
    const scopes = rbac.getUserScopes('admin');

    expect(scopes).toContain('admin');
    expect(scopes.length).toBeGreaterThan(0);
  });

  it('should validate role transitions', () => {
    rbac.assignRole('admin', Role.ADMIN);
    rbac.assignRole('target', Role.OPERATOR);

    const result = rbac.canChangeRole('admin', 'target', Role.VIEWER);
    expect(result.allowed).toBe(true);
  });

  it('should prevent self-demotion', () => {
    rbac.assignRole('admin', Role.ADMIN);
    const result = rbac.canChangeRole('admin', 'admin', Role.VIEWER);

    expect(result.allowed).toBe(false);
  });
});

// ============================================================================
// Input Validation Tests
// ============================================================================

describe('InputValidator', () => {
  it('should sanitize XSS characters', () => {
    const input = '<script>alert("xss")</script>';
    const sanitized = sanitizeString(input);

    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('&lt;script&gt;');
  });

  it('should sanitize HTML tags', () => {
    const input = '<div>Hello <b>World</b></div>';
    const sanitized = sanitizeHTML(input);

    expect(sanitized).toBe('Hello World');
  });

  it('should detect SQL injection', () => {
    expect(containsSQLInjection("'; DROP TABLE users;--")).toBe(true);
    expect(containsSQLInjection('normal text')).toBe(false);
  });

  it('should validate login request', () => {
    const valid = { username: 'testuser', password: 'password123' };
    const result = LoginRequestSchema.safeParse(valid);

    expect(result.success).toBe(true);
  });

  it('should reject invalid login request', () => {
    const invalid = { username: 'te', password: 'short' };
    const result = LoginRequestSchema.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it('should validate agent spawn request', () => {
    const valid = { type: 'coder', name: 'my-coder' };
    const result = SpawnAgentSchema.safeParse(valid);

    expect(result.success).toBe(true);
  });

  it('should sanitize object recursively', () => {
    const input = {
      name: '<script>xss</script>',
      nested: {
        value: '<b>bold</b>',
      },
    };

    const sanitized = InputValidator.sanitizeObject(input) as any;
    expect(sanitized.name).toContain('&lt;script&gt;');
    expect(sanitized.nested.value).toContain('&lt;b&gt;');
  });
});

// ============================================================================
// Path Validation Tests
// ============================================================================

describe('PathValidator', () => {
  let validator: PathValidator;

  beforeEach(async () => {
    validator = new PathValidator({
      allowedPaths: ['/tmp'],
    });
    await validator.initialize();
  });

  it('should validate path within allowed directory', async () => {
    const result = await validator.validate('/tmp/test.txt');
    expect(result.valid).toBe(true);
  });

  it('should reject path traversal', async () => {
    const result = await validator.validate('/tmp/../etc/passwd');
    expect(result.valid).toBe(false);
  });

  it('should reject path outside allowed directories', async () => {
    const result = await validator.validate('/etc/passwd');
    expect(result.valid).toBe(false);
  });

  it('should reject hidden files when disabled', async () => {
    const hiddenValidator = new PathValidator({
      allowedPaths: ['/tmp'],
      allowHidden: false,
    });

    const result = await hiddenValidator.validate('/tmp/.hidden');
    expect(result.valid).toBe(false);
  });

  it('should allow hidden files when enabled', async () => {
    const hiddenValidator = new PathValidator({
      allowedPaths: ['/tmp'],
      allowHidden: true,
    });

    const result = await hiddenValidator.validate('/tmp/.hidden');
    expect(result.valid).toBe(true);
  });

  it('should join paths safely', async () => {
    const joined = await validator.safeJoin('/tmp', 'subdir', 'file.txt');
    expect(joined).toContain('/tmp');
    expect(joined).toContain('file.txt');
  });
});

// ============================================================================
// Encryption Tests
// ============================================================================

describe('Encryption', () => {
  let encryption: Encryption;

  beforeEach(() => {
    encryption = new Encryption();
  });

  it('should encrypt and decrypt with password', async () => {
    const plaintext = 'secret data';
    const password = 'secure-password';

    const encrypted = await encryption.encryptWithPassword(plaintext, password);
    const decrypted = await encryption.decryptWithPassword(encrypted, password);

    expect(decrypted.toString('utf8')).toBe(plaintext);
  });

  it('should fail decryption with wrong password', async () => {
    const plaintext = 'secret data';
    const encrypted = await encryption.encryptWithPassword(plaintext, 'password1');

    await expect(encryption.decryptWithPassword(encrypted, 'password2')).rejects.toThrow();
  });

  it('should encrypt with key', () => {
    const plaintext = 'secret data';
    const key = encryption.generateKey();

    const encrypted = encryption.encryptWithKey(plaintext, key);
    const decrypted = encryption.decryptWithKey(encrypted, key);

    expect(decrypted.toString('utf8')).toBe(plaintext);
  });

  it('should hash password with bcrypt', async () => {
    const password = 'mypassword';
    const hash = await encryption.hashPassword(password);

    expect(hash).toBeTruthy();
    expect(hash).not.toBe(password);
  });

  it('should verify bcrypt password', async () => {
    const password = 'mypassword';
    const hash = await encryption.hashPassword(password);

    const valid = await encryption.verifyPassword(password, hash);
    expect(valid).toBe(true);

    const invalid = await encryption.verifyPassword('wrongpassword', hash);
    expect(invalid).toBe(false);
  });

  it('should generate HMAC', () => {
    const data = 'important data';
    const secret = 'secret-key';

    const hmac = encryption.generateHMAC(data, secret);
    expect(hmac).toBeTruthy();
    expect(hmac.length).toBe(64); // SHA256 hex
  });

  it('should verify HMAC', () => {
    const data = 'important data';
    const secret = 'secret-key';
    const hmac = encryption.generateHMAC(data, secret);

    const valid = encryption.verifyHMAC(data, secret, hmac);
    expect(valid).toBe(true);
  });

  it('should generate secure random string', () => {
    const random1 = encryption.generateSecureRandomString();
    const random2 = encryption.generateSecureRandomString();

    expect(random1).toBeTruthy();
    expect(random2).toBeTruthy();
    expect(random1).not.toBe(random2);
  });
});

// ============================================================================
// Secrets Manager Tests
// ============================================================================

describe('SecretsManager', () => {
  let secretsManager: SecretsManager;

  beforeEach(() => {
    secretsManager = new SecretsManager({
      masterKey: 'test-master-key-at-least-32-characters',
    });
  });

  it('should store and retrieve secret', async () => {
    const secretId = await secretsManager.setSecret('api-key', 'my-secret-value');
    const retrieved = await secretsManager.getSecret(secretId);

    expect(retrieved).toBe('my-secret-value');
  });

  it('should retrieve secret by name', async () => {
    await secretsManager.setSecret('db-password', 'db-pass-123');
    const retrieved = await secretsManager.getSecretByName('db-password');

    expect(retrieved).toBe('db-pass-123');
  });

  it('should rotate secret', async () => {
    const secretId = await secretsManager.setSecret('key', 'old-value');
    await secretsManager.rotateSecret(secretId, 'new-value');

    const current = await secretsManager.getSecret(secretId);
    expect(current).toBe('new-value');

    const previous = await secretsManager.getPreviousVersion(secretId, 0);
    expect(previous).toBe('old-value');
  });

  it('should delete secret', async () => {
    const secretId = await secretsManager.setSecret('temp', 'temporary');
    const deleted = await secretsManager.deleteSecret(secretId);

    expect(deleted).toBe(true);

    const retrieved = await secretsManager.getSecret(secretId);
    expect(retrieved).toBeNull();
  });

  it('should list secrets', async () => {
    await secretsManager.setSecret('secret1', 'value1');
    await secretsManager.setSecret('secret2', 'value2');

    const list = secretsManager.listSecrets();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('should track secrets needing rotation', async () => {
    await secretsManager.setSecret('old-secret', 'value', { rotationDays: 0 });
    const needRotation = secretsManager.getSecretsNeedingRotation();

    // Secret with rotationDays=0 should not need rotation
    expect(needRotation.length).toBe(0);
  });

  it('should export and import secrets', async () => {
    const id1 = await secretsManager.setSecret('secret1', 'value1');
    const exported = await secretsManager.exportSecrets();

    const newManager = new SecretsManager({
      masterKey: 'test-master-key-at-least-32-characters',
    });

    await newManager.importSecrets(exported);
    const retrieved = await newManager.getSecret(id1);

    expect(retrieved).toBe('value1');
  });
});

// ============================================================================
// Audit Logger Tests
// ============================================================================

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger({
      hmacSecret: 'test-hmac-secret-at-least-32-characters',
    });
  });

  it('should log audit event', async () => {
    const eventId = await auditLogger.log({
      type: AuditEventType.LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      timestamp: new Date(),
      userId: 'user-123',
      result: 'success',
    });

    expect(eventId).toBeTruthy();
  });

  it('should log authentication success', async () => {
    const eventId = await auditLogger.logAuthSuccess('user-123', '192.168.1.1');
    expect(eventId).toBeTruthy();

    const events = auditLogger.query({ userId: 'user-123' });
    expect(events.length).toBeGreaterThan(0);
  });

  it('should log authentication failure', async () => {
    await auditLogger.logAuthFailure('user-123', '192.168.1.1', 'Invalid password');

    const events = auditLogger.query({ result: 'failure' });
    expect(events.length).toBeGreaterThan(0);
  });

  it('should log permission change', async () => {
    await auditLogger.logPermissionChange('user-123', 'granted', 'agent:spawn', 'admin');

    const events = auditLogger.query({ type: AuditEventType.PERMISSION_GRANTED });
    expect(events.length).toBeGreaterThan(0);
  });

  it('should log security violation', async () => {
    await auditLogger.logSecurityViolation('user-123', 'SQL injection attempt', '192.168.1.1');

    const events = auditLogger.query({ severity: AuditSeverity.CRITICAL });
    expect(events.length).toBeGreaterThan(0);
  });

  it('should verify log integrity', async () => {
    await auditLogger.log({
      type: AuditEventType.LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      timestamp: new Date(),
      userId: 'user-1',
      result: 'success',
    });

    await auditLogger.log({
      type: AuditEventType.LOGOUT,
      severity: AuditSeverity.INFO,
      timestamp: new Date(),
      userId: 'user-1',
      result: 'success',
    });

    const verification = auditLogger.verifyIntegrity();
    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);
  });

  it('should query events by type', async () => {
    await auditLogger.logAuthSuccess('user-1');
    await auditLogger.logAuthSuccess('user-2');
    await auditLogger.logAuthFailure('user-3');

    const events = auditLogger.query({ eventType: AuditEventType.LOGIN_SUCCESS });
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('should query events by date range', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    await auditLogger.logAuthSuccess('user-1');

    const events = auditLogger.query({ startDate: yesterday, endDate: now });
    expect(events.length).toBeGreaterThan(0);
  });

  it('should export and import logs', async () => {
    await auditLogger.logAuthSuccess('user-1');
    await auditLogger.logAuthSuccess('user-2');

    const exported = await auditLogger.export();
    const newLogger = new AuditLogger({
      hmacSecret: 'test-hmac-secret-at-least-32-characters',
    });

    await newLogger.import(exported);
    const events = newLogger.query({});

    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('should get statistics', async () => {
    await auditLogger.logAuthSuccess('user-1');
    await auditLogger.logAuthFailure('user-2');

    const stats = auditLogger.getStatistics();
    expect(stats.totalEvents).toBeGreaterThanOrEqual(2);
    expect(stats.failures).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Security Module Integration', () => {
  it('should create complete security module', () => {
    const security = createSecurityModule({
      jwtSecret: 'test-jwt-secret-at-least-32-characters-long',
      hmacSecret: 'test-hmac-secret-at-least-32-characters',
      masterKey: 'test-master-key-at-least-32-characters',
      allowedPaths: ['/tmp'],
    });

    expect(security.tokenManager).toBeDefined();
    expect(security.rbacManager).toBeDefined();
    expect(security.pathValidator).toBeDefined();
    expect(security.encryption).toBeDefined();
    expect(security.secretsManager).toBeDefined();
    expect(security.auditLogger).toBeDefined();
  });

  it('should work end-to-end: auth, permission, audit', async () => {
    const security = createSecurityModule({
      jwtSecret: 'test-jwt-secret-at-least-32-characters-long',
      hmacSecret: 'test-hmac-secret-at-least-32-characters',
      masterKey: 'test-master-key-at-least-32-characters',
      allowedPaths: ['/tmp'],
    });

    // Assign role
    security.rbacManager.assignRole('user-123', Role.OPERATOR);

    // Get scopes
    const scopes = security.rbacManager.getUserScopes('user-123');

    // Generate token
    const token = security.tokenManager.generateAccessToken('user-123', scopes);

    // Verify token
    const verification = security.tokenManager.verifyToken(token);
    expect(verification.valid).toBe(true);

    // Check permission
    const hasPermission = security.rbacManager.hasPermission('user-123', Permission.AGENT_SPAWN);
    expect(hasPermission).toBe(true);

    // Log audit event
    await security.auditLogger.logAuthSuccess('user-123', '192.168.1.1');

    const events = security.auditLogger.query({ userId: 'user-123' });
    expect(events.length).toBeGreaterThan(0);
  });
});
