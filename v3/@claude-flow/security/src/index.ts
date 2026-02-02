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
 * Legacy CVE fixes:
 * - CVE-2: Weak Password Hashing (password-hasher.ts)
 * - CVE-3: Hardcoded Default Credentials (credential-generator.ts)
 * - HIGH-1: Command Injection (safe-executor.ts)
 * - HIGH-2: Path Traversal (path-validator.ts)
 *
 * @module @claude-flow/security
 */

// ============================================================================
// WP25: Authentication & Authorization
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
// WP25: Validation
// ============================================================================

export {
  InputValidator,
  sanitizeString,
  sanitizeHTML,
  containsSQLInjection,
  sanitizePath as sanitizePathWP25,
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
// WP25: Cryptography
// ============================================================================

export {
  Encryption,
  createEncryption,
  encrypt,
  decrypt,
  generateToken as generateTokenWP25,
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
// WP25: Audit Logging
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
// Legacy Exports
// ============================================================================

// Password Hashing (CVE-2 Fix)
export {
  PasswordHasher,
  PasswordHashError,
  createPasswordHasher,
  type PasswordHasherConfig,
  type PasswordValidationResult,
} from './password-hasher.js';

// Credential Generation (CVE-3 Fix)
export {
  CredentialGenerator,
  CredentialGeneratorError,
  createCredentialGenerator,
  generateCredentials,
  type CredentialConfig,
  type GeneratedCredentials,
  type ApiKeyCredential,
} from './credential-generator.js';

// Safe Command Execution (HIGH-1 Fix)
export {
  SafeExecutor,
  SafeExecutorError,
  createDevelopmentExecutor,
  createReadOnlyExecutor,
  type ExecutorConfig,
  type ExecutionResult,
  type StreamingExecutor,
} from './safe-executor.js';

// Path Validation (HIGH-2 Fix) - Legacy
export {
  PathValidator as LegacyPathValidator,
  PathValidatorError,
  createProjectPathValidator,
  createFullProjectPathValidator,
  type PathValidatorConfig as LegacyPathValidatorConfig,
  type PathValidationResult as LegacyPathValidationResult,
} from './path-validator.js';

// Input Validation - Legacy (renamed to avoid conflicts with WP25)
export {
  InputValidator as LegacyInputValidator,
  sanitizeString as legacySanitizeString,
  sanitizeHtml,
  sanitizePath as legacySanitizePath,
  // Base schemas (legacy)
  SafeStringSchema as LegacySafeStringSchema,
  IdentifierSchema as LegacyIdentifierSchema,
  FilenameSchema as LegacyFilenameSchema,
  EmailSchema as LegacyEmailSchema,
  PasswordSchema as LegacyPasswordSchema,
  UUIDSchema as LegacyUUIDSchema,
  HttpsUrlSchema,
  UrlSchema as LegacyUrlSchema,
  SemverSchema as LegacySemverSchema,
  PortSchema as LegacyPortSchema,
  IPv4Schema as LegacyIPv4Schema,
  IPSchema as LegacyIPSchema,
  // Auth schemas (legacy)
  UserRoleSchema as LegacyUserRoleSchema,
  PermissionSchema,
  LoginRequestSchema as LegacyLoginRequestSchema,
  CreateUserSchema as LegacyCreateUserSchema,
  CreateApiKeySchema,
  // Agent & Task schemas (legacy)
  AgentTypeSchema as LegacyAgentTypeSchema,
  SpawnAgentSchema as LegacySpawnAgentSchema,
  TaskInputSchema as LegacyTaskInputSchema,
  // Command & Path schemas (legacy)
  CommandArgumentSchema as LegacyCommandArgumentSchema,
  PathSchema as LegacyPathSchema,
  // Config schemas (legacy)
  SecurityConfigSchema as LegacySecurityConfigSchema,
  ExecutorConfigSchema as LegacyExecutorConfigSchema,
  // Utilities (legacy)
  PATTERNS as LEGACY_PATTERNS,
  LIMITS,
  z as zodLegacy,
} from './input-validator.js';

// Token Generation
export {
  TokenGenerator,
  TokenGeneratorError,
  createTokenGenerator,
  getDefaultGenerator,
  quickGenerate,
  type TokenConfig,
  type Token,
  type SignedToken,
  type VerificationCode,
} from './token-generator.js';

// ============================================================================
// Unified Security Module Factory (WP25)
// ============================================================================

import { TokenManager } from './auth/token-manager.js';
import { RBACManager } from './auth/rbac.js';
import { PathValidator as PathValidatorWP25 } from './validation/path-validator.js';
import { Encryption } from './crypto/encryption.js';
import { SecretsManager } from './crypto/secrets-manager.js';
import { AuditLogger } from './audit/audit-logger.js';
import { PasswordHasher } from './password-hasher.js';
import { CredentialGenerator } from './credential-generator.js';
import { SafeExecutor } from './safe-executor.js';
import { PathValidator as LegacyPathValidatorImpl } from './path-validator.js';
import { TokenGenerator } from './token-generator.js';

/**
 * Complete security module configuration (WP25)
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

  /**
   * Legacy configuration (for backward compatibility)
   */
  legacy?: {
    bcryptRounds?: number;
    allowedCommands?: string[];
  };
}

/**
 * Complete security module instance (WP25)
 */
export interface SecurityModule {
  // WP25 components
  tokenManager: TokenManager;
  rbacManager: RBACManager;
  pathValidatorWP25: PathValidatorWP25;
  encryption: Encryption;
  secretsManager: SecretsManager;
  auditLogger: AuditLogger;

  // Legacy components
  passwordHasher: PasswordHasher;
  credentialGenerator: CredentialGenerator;
  safeExecutor: SafeExecutor;
  pathValidator: LegacyPathValidatorImpl;
  tokenGenerator: TokenGenerator;
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
 * // WP25: Authenticate user
 * const accessToken = security.tokenManager.generateAccessToken(userId, ['read', 'write']);
 *
 * // WP25: Verify permission
 * const result = security.rbacManager.checkPermission(context, Permission.AGENT_SPAWN);
 *
 * // WP25: Validate path
 * const pathResult = await security.pathValidatorWP25.validate('/workspaces/project/file.ts');
 *
 * // WP25: Encrypt data
 * const encrypted = await security.encryption.encryptWithPassword('secret', password);
 *
 * // WP25: Store secret
 * const secretId = await security.secretsManager.setSecret('api-key', apiKey);
 *
 * // WP25: Log audit event
 * await security.auditLogger.logAuthSuccess(userId, ipAddress);
 *
 * // Legacy: Hash password
 * const hash = await security.passwordHasher.hash('password');
 *
 * // Legacy: Execute command safely
 * const output = await security.safeExecutor.execute('git', ['status']);
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

  // WP25 components
  const tokenManager = new TokenManager({
    jwtSecret: config.jwtSecret,
    accessTokenTTL: config.tokens?.accessTokenTTL,
    refreshTokenTTL: config.tokens?.refreshTokenTTL,
    enableRefreshRotation: config.tokens?.enableRefreshRotation,
  });

  const rbacManager = new RBACManager();

  const pathValidatorWP25 = new PathValidatorWP25({
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

  // Legacy components
  const passwordHasher = new PasswordHasher({
    rounds: config.legacy?.bcryptRounds ?? 12,
  });

  const credentialGenerator = new CredentialGenerator();

  const safeExecutor = new SafeExecutor({
    allowedCommands: config.legacy?.allowedCommands ?? ['git', 'npm', 'npx', 'node'],
  });

  const pathValidator = new LegacyPathValidatorImpl({
    allowedPrefixes: config.allowedPaths,
    allowHidden: config.paths?.allowHidden ?? true,
  });

  const tokenGenerator = new TokenGenerator({
    hmacSecret: config.hmacSecret,
  });

  return {
    // WP25
    tokenManager,
    rbacManager,
    pathValidatorWP25,
    encryption,
    secretsManager,
    auditLogger,
    // Legacy
    passwordHasher,
    credentialGenerator,
    safeExecutor,
    pathValidator,
    tokenGenerator,
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
 * Legacy constants (for backward compatibility)
 */
export const MIN_BCRYPT_ROUNDS = 12;
export const MAX_BCRYPT_ROUNDS = 14;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;
export const DEFAULT_TOKEN_EXPIRATION = 3600;
export const DEFAULT_SESSION_EXPIRATION = 86400;

// ============================================================================
// Security Audit Helper
// ============================================================================

/**
 * Checks security configuration for common issues.
 *
 * @param config - Configuration to audit
 * @returns Array of security warnings
 */
export function auditSecurityConfig(config: Partial<SecurityModuleConfig>): string[] {
  const warnings: string[] = [];

  if (config.legacy?.bcryptRounds && config.legacy.bcryptRounds < MIN_BCRYPT_ROUNDS) {
    warnings.push(`bcryptRounds (${config.legacy.bcryptRounds}) below recommended minimum (${MIN_BCRYPT_ROUNDS})`);
  }

  if (config.hmacSecret && config.hmacSecret.length < 32) {
    warnings.push('hmacSecret should be at least 32 characters');
  }

  if (config.jwtSecret && config.jwtSecret.length < 32) {
    warnings.push('jwtSecret should be at least 32 characters');
  }

  if (config.masterKey && config.masterKey.length < 32) {
    warnings.push('masterKey should be at least 32 characters');
  }

  if (!config.allowedPaths || config.allowedPaths.length === 0) {
    warnings.push('No allowed paths configured - path validation may fail');
  }

  if (config.legacy?.allowedCommands && config.legacy.allowedCommands.length === 0) {
    warnings.push('No commands allowed - executor will reject all commands');
  }

  return warnings;
}

/**
 * Security module version
 */
export const SECURITY_MODULE_VERSION = '3.0.0-alpha.6';
