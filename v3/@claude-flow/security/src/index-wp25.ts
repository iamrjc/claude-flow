/**
 * Claude Flow V3 Security Module - WP25
 *
 * Complete security module with:
 * - Token management (JWT/API keys)
 * - RBAC (Role-Based Access Control)
 * - Input validation (Zod schemas)
 * - Path validation (traversal prevention)
 * - Encryption (AES-256-GCM)
 * - Secrets management
 * - Audit logging (tamper-evident)
 *
 * @module @claude-flow/security
 */

// ============================================================================
// Authentication & Authorization
// ============================================================================

export {
  TokenManager,
  createTokenManager,
  TokenType,
  type TokenScope,
  type JWTPayload,
  type APIKey,
  type TokenManagerConfig,
  type TokenVerification,
} from './auth/token-manager.js';

export {
  RBACManager,
  createRBACManager,
  requirePermission,
  requireRole,
  Role,
  Permission,
  ResourceType,
  Action,
  type RoleDefinition,
  type PermissionContext,
  type PermissionResult,
} from './auth/rbac.js';

// ============================================================================
// Validation
// ============================================================================

export {
  InputValidator,
  sanitizeString,
  sanitizeHTML,
  containsSQLInjection,
  sanitizePath,
  isValidEmail,
  isValidUUID,
  isValidURL,
  isValidIdentifier,
  // Schemas
  SafeStringSchema,
  IdentifierSchema,
  FilenameSchema,
  EmailSchema,
  PasswordSchema,
  UUIDSchema,
  SemverSchema,
  URLSchema,
  HTTPSURLSchema,
  PortSchema,
  IPv4Schema,
  IPSchema,
  UserRoleSchema,
  TokenScopeSchema,
  LoginRequestSchema,
  CreateUserSchema,
  CreateAPIKeySchema,
  AgentTypeSchema,
  SpawnAgentSchema,
  TaskPrioritySchema,
  TaskInputSchema,
  CommandArgumentSchema,
  PathSchema,
  SecurityConfigSchema,
  ExecutorConfigSchema,
  RateLimitConfigSchema,
  MemoryKeySchema,
  MemoryNamespaceSchema,
  MemoryStoreSchema,
  SwarmTopologySchema,
  SwarmInitSchema,
  PaginationSchema,
  FilterSchema,
  // Constants
  SIZE_LIMITS,
  PATTERNS,
  // Re-export Zod
  z,
} from './validation/input-validator.js';

export {
  PathValidator,
  createPathValidator,
  createMultiPathValidator,
  validatePath,
  type PathValidatorConfig,
  type PathValidationResult,
} from './validation/path-validator.js';

// ============================================================================
// Cryptography
// ============================================================================

export {
  Encryption,
  createEncryption,
  encrypt,
  decrypt,
  generateToken,
  generateUUID,
  type EncryptionConfig,
  type EncryptedData,
  type DerivedKey,
} from './crypto/encryption.js';

export {
  SecretsManager,
  createSecretsManager,
  loadMasterKeyFromEnv,
  type SecretMetadata,
  type StoredSecret,
  type SecretAccessEvent,
  type SecretsManagerConfig,
} from './crypto/secrets-manager.js';

// ============================================================================
// Audit Logging
// ============================================================================

export {
  AuditLogger,
  createAuditLogger,
  isHighSeverity,
  isCriticalEvent,
  AuditEventType,
  AuditSeverity,
  type AuditEvent,
  type AuditLoggerConfig,
  type LogQueryOptions,
} from './audit/audit-logger.js';

// ============================================================================
// Legacy Exports (from existing security module)
// ============================================================================

export {
  PasswordHasher,
  PasswordHashError,
  createPasswordHasher,
  type PasswordHasherConfig,
  type PasswordValidationResult,
} from './password-hasher.js';

export {
  CredentialGenerator,
  CredentialGeneratorError,
  createCredentialGenerator,
  generateCredentials,
  type CredentialConfig,
  type GeneratedCredentials,
  type ApiKeyCredential,
} from './credential-generator.js';

export {
  SafeExecutor,
  SafeExecutorError,
  createDevelopmentExecutor,
  createReadOnlyExecutor,
  type ExecutorConfig,
  type ExecutionResult,
  type StreamingExecutor,
} from './safe-executor.js';

export { PathValidator as LegacyPathValidator, PathValidatorError } from './path-validator.js';

export { TokenGenerator, TokenGeneratorError } from './token-generator.js';

// ============================================================================
// Unified Security Module Factory
// ============================================================================

import { TokenManager } from './auth/token-manager.js';
import { RBACManager } from './auth/rbac.js';
import { PathValidator } from './validation/path-validator.js';
import { Encryption } from './crypto/encryption.js';
import { SecretsManager } from './crypto/secrets-manager.js';
import { AuditLogger } from './audit/audit-logger.js';

/**
 * Complete security module configuration
 */
export interface SecurityModuleConfig {
  /**
   * JWT secret for token signing (min 32 chars)
   */
  jwtSecret: string;

  /**
   * HMAC secret for audit logging (min 32 chars)
   */
  hmacSecret: string;

  /**
   * Master key for secrets management (min 32 chars)
   */
  masterKey: string;

  /**
   * Allowed paths for file operations
   */
  allowedPaths: string[];

  /**
   * Token configuration
   */
  tokens?: {
    accessTokenTTL?: number;
    refreshTokenTTL?: number;
    enableRefreshRotation?: boolean;
  };

  /**
   * Audit configuration
   */
  audit?: {
    encryptLogs?: boolean;
    minSeverity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  };

  /**
   * Secrets configuration
   */
  secrets?: {
    defaultRotationDays?: number;
    maxVersionHistory?: number;
  };

  /**
   * Path validation configuration
   */
  paths?: {
    resolveSymlinks?: boolean;
    allowHidden?: boolean;
  };
}

/**
 * Complete security module instance
 */
export interface SecurityModule {
  tokenManager: TokenManager;
  rbacManager: RBACManager;
  pathValidator: PathValidator;
  encryption: Encryption;
  secretsManager: SecretsManager;
  auditLogger: AuditLogger;
}

/**
 * Create a complete security module with all components configured
 *
 * @example
 * ```typescript
 * const security = createSecurityModule({
 *   jwtSecret: process.env.JWT_SECRET!,
 *   hmacSecret: process.env.HMAC_SECRET!,
 *   masterKey: process.env.MASTER_KEY!,
 *   allowedPaths: ['/workspaces/project'],
 * });
 *
 * // Authenticate user
 * const accessToken = security.tokenManager.generateAccessToken(userId, ['read', 'write']);
 *
 * // Verify permission
 * const result = security.rbacManager.checkPermission(context, Permission.AGENT_SPAWN);
 *
 * // Validate path
 * const pathResult = await security.pathValidator.validate('/workspaces/project/file.ts');
 *
 * // Encrypt data
 * const encrypted = await security.encryption.encryptWithPassword('secret', password);
 *
 * // Store secret
 * const secretId = await security.secretsManager.setSecret('api-key', apiKey);
 *
 * // Log audit event
 * await security.auditLogger.logAuthSuccess(userId, ipAddress);
 * ```
 */
export function createSecurityModule(config: SecurityModuleConfig): SecurityModule {
  // Validate secrets
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT secret must be at least 32 characters');
  }
  if (!config.hmacSecret || config.hmacSecret.length < 32) {
    throw new Error('HMAC secret must be at least 32 characters');
  }
  if (!config.masterKey || config.masterKey.length < 32) {
    throw new Error('Master key must be at least 32 characters');
  }
  if (!config.allowedPaths || config.allowedPaths.length === 0) {
    throw new Error('At least one allowed path must be specified');
  }

  const tokenManager = new TokenManager({
    jwtSecret: config.jwtSecret,
    accessTokenTTL: config.tokens?.accessTokenTTL,
    refreshTokenTTL: config.tokens?.refreshTokenTTL,
    enableRefreshRotation: config.tokens?.enableRefreshRotation,
  });

  const rbacManager = new RBACManager();

  const pathValidator = new PathValidator({
    allowedPaths: config.allowedPaths,
    resolveSymlinks: config.paths?.resolveSymlinks,
    allowHidden: config.paths?.allowHidden,
  });

  const encryption = new Encryption();

  const secretsManager = new SecretsManager({
    masterKey: config.masterKey,
    defaultRotationDays: config.secrets?.defaultRotationDays,
    maxVersionHistory: config.secrets?.maxVersionHistory,
  });

  const auditLogger = new AuditLogger({
    hmacSecret: config.hmacSecret,
    encryptLogs: config.audit?.encryptLogs,
    encryptionPassword: config.audit?.encryptLogs ? config.masterKey : undefined,
    minSeverity: config.audit?.minSeverity as any,
  });

  return {
    tokenManager,
    rbacManager,
    pathValidator,
    encryption,
    secretsManager,
    auditLogger,
  };
}

/**
 * Load security configuration from environment variables
 */
export function loadSecurityConfigFromEnv(): SecurityModuleConfig {
  const jwtSecret = process.env.JWT_SECRET || process.env.CLAUDE_FLOW_JWT_SECRET;
  const hmacSecret = process.env.HMAC_SECRET || process.env.CLAUDE_FLOW_HMAC_SECRET;
  const masterKey = process.env.MASTER_KEY || process.env.SECRETS_MASTER_KEY;
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();

  if (!jwtSecret) {
    throw new Error('JWT_SECRET or CLAUDE_FLOW_JWT_SECRET environment variable required');
  }
  if (!hmacSecret) {
    throw new Error('HMAC_SECRET or CLAUDE_FLOW_HMAC_SECRET environment variable required');
  }
  if (!masterKey) {
    throw new Error('MASTER_KEY or SECRETS_MASTER_KEY environment variable required');
  }

  return {
    jwtSecret,
    hmacSecret,
    masterKey,
    allowedPaths: [projectRoot],
  };
}

// ============================================================================
// Security Best Practices Constants
// ============================================================================

export const SECURITY_CONSTANTS = {
  /**
   * Minimum secret length for production
   */
  MIN_SECRET_LENGTH: 32,

  /**
   * Recommended bcrypt rounds
   */
  BCRYPT_ROUNDS: 12,

  /**
   * Default token expiration (1 hour)
   */
  DEFAULT_ACCESS_TOKEN_TTL: 3600,

  /**
   * Default refresh token expiration (7 days)
   */
  DEFAULT_REFRESH_TOKEN_TTL: 604800,

  /**
   * Default secret rotation period (90 days)
   */
  DEFAULT_ROTATION_DAYS: 90,

  /**
   * Maximum password length (bcrypt limit)
   */
  MAX_PASSWORD_LENGTH: 72,

  /**
   * Minimum password length
   */
  MIN_PASSWORD_LENGTH: 8,
} as const;

/**
 * Security module version
 */
export const SECURITY_MODULE_VERSION = '3.0.0-alpha.6';
