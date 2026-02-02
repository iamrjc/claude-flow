/**
 * Input Validator - Zod Schemas and Sanitization
 *
 * Features:
 * - Comprehensive Zod schemas for all input types
 * - XSS prevention through sanitization
 * - SQL/NoSQL injection prevention
 * - Size limits and rate limiting schemas
 * - Type-safe validation
 *
 * @module @claude-flow/security/validation/input-validator
 */

import { z } from 'zod';

/**
 * Size limits for various inputs
 */
export const SIZE_LIMITS = {
  USERNAME_MAX: 50,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 72, // bcrypt limit
  EMAIL_MAX: 255,
  NAME_MAX: 100,
  DESCRIPTION_MAX: 1000,
  MESSAGE_MAX: 10000,
  FILENAME_MAX: 255,
  PATH_MAX: 4096,
  URL_MAX: 2048,
  ARRAY_MAX: 1000,
  OBJECT_DEPTH_MAX: 10,
} as const;

/**
 * Regex patterns for validation
 */
export const PATTERNS = {
  // Alphanumeric with hyphens and underscores
  IDENTIFIER: /^[a-zA-Z0-9_-]+$/,

  // Safe filename (no path traversal)
  SAFE_FILENAME: /^[a-zA-Z0-9_.-]+$/,

  // Email (basic validation, more thorough done by Zod)
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // Semver
  SEMVER: /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/,

  // UUID v4
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  // IPv4
  IPV4: /^(\d{1,3}\.){3}\d{1,3}$/,

  // No path traversal
  NO_PATH_TRAVERSAL: /^(?!.*\.\.).*$/,
} as const;

/**
 * XSS-dangerous characters
 */
const XSS_CHARS = /<|>|&|"|'|`/g;

/**
 * SQL injection patterns
 */
const SQL_INJECTION = /('|--|;|\/\*|\*\/|xp_|sp_|exec|execute|union|select|insert|update|delete|drop|create|alter)/gi;

/**
 * Sanitize string for XSS prevention
 */
export function sanitizeString(input: string): string {
  return input.replace(XSS_CHARS, (char) => {
    const map: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#x27;',
      '`': '&#x60;',
    };
    return map[char] || char;
  });
}

/**
 * Sanitize HTML (strip all tags)
 */
export function sanitizeHTML(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Check for SQL injection patterns
 */
export function containsSQLInjection(input: string): boolean {
  return SQL_INJECTION.test(input);
}

/**
 * Sanitize path (remove traversal attempts)
 */
export function sanitizePath(input: string): string {
  // Remove ../ and ..\
  return input.replace(/\.\.[/\\]/g, '');
}

/**
 * Base schemas
 */

export const SafeStringSchema = z
  .string()
  .transform((val) => sanitizeString(val))
  .refine((val) => !containsSQLInjection(val), {
    message: 'String contains potentially dangerous characters',
  });

export const IdentifierSchema = z
  .string()
  .min(1)
  .max(SIZE_LIMITS.USERNAME_MAX)
  .regex(PATTERNS.IDENTIFIER, 'Must contain only letters, numbers, hyphens, and underscores');

export const FilenameSchema = z
  .string()
  .min(1)
  .max(SIZE_LIMITS.FILENAME_MAX)
  .regex(PATTERNS.SAFE_FILENAME, 'Invalid filename characters')
  .refine((val) => !val.includes('..'), 'Filename cannot contain path traversal');

export const EmailSchema = z.string().email().max(SIZE_LIMITS.EMAIL_MAX);

export const PasswordSchema = z
  .string()
  .min(SIZE_LIMITS.PASSWORD_MIN, `Password must be at least ${SIZE_LIMITS.PASSWORD_MIN} characters`)
  .max(SIZE_LIMITS.PASSWORD_MAX, `Password cannot exceed ${SIZE_LIMITS.PASSWORD_MAX} characters`);

export const UUIDSchema = z.string().uuid();

export const SemverSchema = z.string().regex(PATTERNS.SEMVER, 'Invalid semver format');

export const URLSchema = z.string().url().max(SIZE_LIMITS.URL_MAX);

export const HTTPSURLSchema = z.string().url().refine((url) => url.startsWith('https://'), {
  message: 'URL must use HTTPS',
});

export const PortSchema = z.number().int().min(1).max(65535);

export const IPv4Schema = z.string().regex(PATTERNS.IPV4, 'Invalid IPv4 address').refine((ip) => {
  const parts = ip.split('.');
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}, 'Invalid IPv4 address');

export const IPSchema = z.string().ip();

/**
 * Auth-related schemas
 */

export const UserRoleSchema = z.enum(['admin', 'operator', 'viewer']);

export const TokenScopeSchema = z.enum([
  'read',
  'write',
  'admin',
  'agent:spawn',
  'agent:manage',
  'memory:read',
  'memory:write',
  'swarm:manage',
  'config:read',
  'config:write',
]);

export const LoginRequestSchema = z.object({
  username: IdentifierSchema,
  password: PasswordSchema,
});

export const CreateUserSchema = z.object({
  username: IdentifierSchema,
  email: EmailSchema,
  password: PasswordSchema,
  role: UserRoleSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateAPIKeySchema = z.object({
  name: z.string().min(1).max(SIZE_LIMITS.NAME_MAX),
  scopes: z.array(TokenScopeSchema).min(1).max(20),
  expiresAt: z.string().datetime().optional(),
});

/**
 * Agent & Task schemas
 */

export const AgentTypeSchema = z.enum([
  'coder',
  'reviewer',
  'tester',
  'planner',
  'researcher',
  'security-architect',
  'security-auditor',
  'memory-specialist',
  'performance-engineer',
]);

export const SpawnAgentSchema = z.object({
  type: AgentTypeSchema,
  name: IdentifierSchema.optional(),
  config: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

export const TaskInputSchema = z.object({
  title: z.string().min(1).max(SIZE_LIMITS.NAME_MAX),
  description: z.string().max(SIZE_LIMITS.DESCRIPTION_MAX).optional(),
  priority: TaskPrioritySchema.optional(),
  assignee: IdentifierSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Command & Path schemas
 */

export const CommandArgumentSchema = z
  .string()
  .max(SIZE_LIMITS.MESSAGE_MAX)
  .refine((val) => !val.includes('&&') && !val.includes('||') && !val.includes(';'), {
    message: 'Command chaining not allowed',
  })
  .refine((val) => !val.includes('|'), {
    message: 'Piping not allowed',
  })
  .refine((val) => !val.includes('$'), {
    message: 'Variable expansion not allowed',
  });

export const PathSchema = z
  .string()
  .max(SIZE_LIMITS.PATH_MAX)
  .refine((val) => !val.includes('..'), {
    message: 'Path traversal not allowed',
  })
  .transform((val) => sanitizePath(val));

/**
 * Config schemas
 */

export const SecurityConfigSchema = z.object({
  jwtSecret: z.string().min(32, 'JWT secret must be at least 32 characters'),
  bcryptRounds: z.number().int().min(10).max(15).optional(),
  enableRefreshRotation: z.boolean().optional(),
  accessTokenTTL: z.number().int().positive().optional(),
  refreshTokenTTL: z.number().int().positive().optional(),
});

export const ExecutorConfigSchema = z.object({
  allowedCommands: z.array(IdentifierSchema).min(0).max(100),
  timeout: z.number().int().positive().optional(),
  maxOutputSize: z.number().int().positive().optional(),
});

export const RateLimitConfigSchema = z.object({
  windowMs: z.number().int().positive(),
  maxRequests: z.number().int().positive(),
  blockDuration: z.number().int().positive().optional(),
});

/**
 * Memory & Swarm schemas
 */

export const MemoryKeySchema = z
  .string()
  .min(1)
  .max(SIZE_LIMITS.NAME_MAX)
  .regex(/^[a-zA-Z0-9_:.-]+$/, 'Invalid memory key format');

export const MemoryNamespaceSchema = IdentifierSchema;

export const MemoryStoreSchema = z.object({
  namespace: MemoryNamespaceSchema,
  key: MemoryKeySchema,
  value: z.unknown(),
  ttl: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const SwarmTopologySchema = z.enum(['hierarchical', 'mesh', 'adaptive', 'hierarchical-mesh']);

export const SwarmInitSchema = z.object({
  topology: SwarmTopologySchema,
  maxAgents: z.number().int().min(1).max(100),
  strategy: z.enum(['specialized', 'balanced', 'dynamic']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * API Request schemas
 */

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: IdentifierSchema.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const FilterSchema = z.object({
  field: IdentifierSchema,
  operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown())]),
});

/**
 * Input Validator class for batch validation
 */
export class InputValidator {
  /**
   * Validate login request
   */
  static validateLogin(input: unknown) {
    return LoginRequestSchema.parse(input);
  }

  /**
   * Validate user creation
   */
  static validateCreateUser(input: unknown) {
    return CreateUserSchema.parse(input);
  }

  /**
   * Validate API key creation
   */
  static validateCreateAPIKey(input: unknown) {
    return CreateAPIKeySchema.parse(input);
  }

  /**
   * Validate agent spawn request
   */
  static validateSpawnAgent(input: unknown) {
    return SpawnAgentSchema.parse(input);
  }

  /**
   * Validate task creation
   */
  static validateTaskInput(input: unknown) {
    return TaskInputSchema.parse(input);
  }

  /**
   * Validate memory store operation
   */
  static validateMemoryStore(input: unknown) {
    return MemoryStoreSchema.parse(input);
  }

  /**
   * Validate swarm initialization
   */
  static validateSwarmInit(input: unknown) {
    return SwarmInitSchema.parse(input);
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(input: unknown) {
    return PaginationSchema.parse(input);
  }

  /**
   * Sanitize all string fields in an object recursively
   */
  static sanitizeObject(obj: unknown, depth = 0): unknown {
    if (depth > SIZE_LIMITS.OBJECT_DEPTH_MAX) {
      throw new Error('Object depth exceeds maximum');
    }

    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      if (obj.length > SIZE_LIMITS.ARRAY_MAX) {
        throw new Error('Array size exceeds maximum');
      }
      return obj.map((item) => this.sanitizeObject(item, depth + 1));
    }

    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[sanitizeString(key)] = this.sanitizeObject(value, depth + 1);
      }
      return result;
    }

    return obj;
  }

  /**
   * Check if input exceeds size limits
   */
  static checkSizeLimit(input: string, limit: number, fieldName: string): void {
    if (input.length > limit) {
      throw new Error(`${fieldName} exceeds maximum length of ${limit}`);
    }
  }

  /**
   * Validate array size
   */
  static validateArraySize<T>(array: T[], max: number = SIZE_LIMITS.ARRAY_MAX): void {
    if (array.length > max) {
      throw new Error(`Array size ${array.length} exceeds maximum of ${max}`);
    }
  }
}

/**
 * Type guards
 */

export function isValidEmail(email: string): boolean {
  return EmailSchema.safeParse(email).success;
}

export function isValidUUID(uuid: string): boolean {
  return UUIDSchema.safeParse(uuid).success;
}

export function isValidURL(url: string): boolean {
  return URLSchema.safeParse(url).success;
}

export function isValidIdentifier(id: string): boolean {
  return IdentifierSchema.safeParse(id).success;
}

/**
 * Re-export Zod for consumers
 */
export { z } from 'zod';
