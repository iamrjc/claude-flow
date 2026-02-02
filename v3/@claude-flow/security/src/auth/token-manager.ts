/**
 * Token Manager - JWT/API Key Management
 *
 * Features:
 * - JWT token generation and validation
 * - API key management with scopes
 * - Refresh token rotation
 * - Token revocation
 * - Scope-based permissions
 *
 * @module @claude-flow/security/auth/token-manager
 */

import crypto from 'node:crypto';

/**
 * Token type enumeration
 */
export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
  API_KEY = 'api_key',
}

/**
 * Token scope for permissions
 */
export type TokenScope =
  | 'read'
  | 'write'
  | 'admin'
  | 'agent:spawn'
  | 'agent:manage'
  | 'memory:read'
  | 'memory:write'
  | 'swarm:manage'
  | 'config:read'
  | 'config:write';

/**
 * JWT payload structure
 */
export interface JWTPayload {
  sub: string; // Subject (user ID)
  iat: number; // Issued at
  exp: number; // Expiration
  type: TokenType;
  scopes: TokenScope[];
  jti?: string; // JWT ID for revocation
  metadata?: Record<string, unknown>;
}

/**
 * API Key structure
 */
export interface APIKey {
  id: string;
  key: string; // Hashed
  name: string;
  scopes: TokenScope[];
  userId: string;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

/**
 * Token manager configuration
 */
export interface TokenManagerConfig {
  /**
   * Secret for signing JWT tokens
   */
  jwtSecret: string;

  /**
   * Access token expiration in seconds
   * @default 3600 (1 hour)
   */
  accessTokenTTL?: number;

  /**
   * Refresh token expiration in seconds
   * @default 604800 (7 days)
   */
  refreshTokenTTL?: number;

  /**
   * API key expiration in seconds
   * @default undefined (no expiration)
   */
  apiKeyTTL?: number | undefined;

  /**
   * Enable refresh token rotation
   * @default true
   */
  enableRefreshRotation?: boolean;

  /**
   * JWT algorithm
   * @default 'HS256'
   */
  algorithm?: 'HS256' | 'HS384' | 'HS512';
}

/**
 * Token verification result
 */
export interface TokenVerification {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
}

/**
 * TokenManager handles JWT and API key lifecycle
 */
export class TokenManager {
  private readonly config: Omit<Required<TokenManagerConfig>, 'apiKeyTTL'> & { apiKeyTTL?: number };
  private readonly revokedTokens = new Set<string>();
  private readonly apiKeys = new Map<string, APIKey>();
  private readonly refreshTokens = new Map<string, string>(); // refreshToken -> userId

  constructor(config: TokenManagerConfig) {
    if (!config.jwtSecret || config.jwtSecret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters');
    }

    this.config = {
      jwtSecret: config.jwtSecret,
      accessTokenTTL: config.accessTokenTTL ?? 3600,
      refreshTokenTTL: config.refreshTokenTTL ?? 604800,
      apiKeyTTL: config.apiKeyTTL,
      enableRefreshRotation: config.enableRefreshRotation ?? true,
      algorithm: config.algorithm ?? 'HS256',
    };
  }

  /**
   * Generate an access token
   */
  generateAccessToken(userId: string, scopes: TokenScope[], metadata?: Record<string, unknown>): string {
    const payload: JWTPayload = {
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.accessTokenTTL,
      type: TokenType.ACCESS,
      scopes,
      jti: crypto.randomUUID(),
      metadata,
    };

    return this.signJWT(payload);
  }

  /**
   * Generate a refresh token
   */
  generateRefreshToken(userId: string, scopes: TokenScope[]): string {
    const payload: JWTPayload = {
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.refreshTokenTTL,
      type: TokenType.REFRESH,
      scopes,
      jti: crypto.randomUUID(),
    };

    const token = this.signJWT(payload);
    this.refreshTokens.set(token, userId);
    return token;
  }

  /**
   * Refresh an access token using a refresh token
   * Optionally rotates the refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
  }> {
    const verification = this.verifyToken(refreshToken);

    if (!verification.valid || !verification.payload) {
      throw new Error('Invalid refresh token');
    }

    if (verification.payload.type !== TokenType.REFRESH) {
      throw new Error('Token is not a refresh token');
    }

    if (!this.refreshTokens.has(refreshToken)) {
      throw new Error('Refresh token not found or revoked');
    }

    const { sub: userId, scopes } = verification.payload;
    const accessToken = this.generateAccessToken(userId, scopes);

    const result: { accessToken: string; refreshToken?: string } = {
      accessToken,
    };

    // Rotate refresh token if enabled
    if (this.config.enableRefreshRotation) {
      this.refreshTokens.delete(refreshToken);
      this.revokedTokens.add(verification.payload.jti!);
      result.refreshToken = this.generateRefreshToken(userId, scopes);
    }

    return result;
  }

  /**
   * Generate an API key
   */
  async generateAPIKey(
    userId: string,
    name: string,
    scopes: TokenScope[],
    expiresAt?: Date
  ): Promise<{ id: string; key: string }> {
    const id = crypto.randomUUID();
    const rawKey = this.generateSecureKey();
    const hashedKey = await this.hashKey(rawKey);

    const apiKey: APIKey = {
      id,
      key: hashedKey,
      name,
      scopes,
      userId,
      createdAt: new Date(),
      expiresAt,
    };

    this.apiKeys.set(id, apiKey);

    // Return raw key only once
    return { id, key: rawKey };
  }

  /**
   * Verify an API key
   */
  async verifyAPIKey(key: string): Promise<TokenVerification> {
    const hashedKey = await this.hashKey(key);

    for (const apiKey of this.apiKeys.values()) {
      if (apiKey.key === hashedKey) {
        // Check if revoked
        if (apiKey.revokedAt) {
          return { valid: false, error: 'API key has been revoked' };
        }

        // Check if expired
        if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
          return { valid: false, error: 'API key has expired' };
        }

        // Update last used
        apiKey.lastUsedAt = new Date();

        // Convert to JWT payload format for consistency
        const payload: JWTPayload = {
          sub: apiKey.userId,
          iat: Math.floor(apiKey.createdAt.getTime() / 1000),
          exp: apiKey.expiresAt ? Math.floor(apiKey.expiresAt.getTime() / 1000) : Infinity,
          type: TokenType.API_KEY,
          scopes: apiKey.scopes,
          jti: apiKey.id,
        };

        return { valid: true, payload };
      }
    }

    return { valid: false, error: 'Invalid API key' };
  }

  /**
   * Verify a JWT token
   */
  verifyToken(token: string): TokenVerification {
    try {
      const payload = this.verifyJWT(token);

      // Check if revoked
      if (payload.jti && this.revokedTokens.has(payload.jti)) {
        return { valid: false, error: 'Token has been revoked' };
      }

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token has expired' };
      }

      return { valid: true, payload };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Invalid token' };
    }
  }

  /**
   * Revoke a token by JTI
   */
  revokeToken(jti: string): void {
    this.revokedTokens.add(jti);

    // Also remove from refresh tokens if present
    for (const [token, _userId] of this.refreshTokens.entries()) {
      const verification = this.verifyToken(token);
      if (verification.payload?.jti === jti) {
        this.refreshTokens.delete(token);
        break;
      }
    }
  }

  /**
   * Revoke an API key
   */
  revokeAPIKey(id: string): boolean {
    const apiKey = this.apiKeys.get(id);
    if (!apiKey) {
      return false;
    }

    apiKey.revokedAt = new Date();
    return true;
  }

  /**
   * Check if token has required scope
   */
  hasScope(payload: JWTPayload, requiredScope: TokenScope): boolean {
    // Admin has all scopes
    if (payload.scopes.includes('admin')) {
      return true;
    }

    return payload.scopes.includes(requiredScope);
  }

  /**
   * Check if token has all required scopes
   */
  hasAllScopes(payload: JWTPayload, requiredScopes: TokenScope[]): boolean {
    return requiredScopes.every((scope) => this.hasScope(payload, scope));
  }

  /**
   * List API keys for a user
   */
  listAPIKeys(userId: string): APIKey[] {
    return Array.from(this.apiKeys.values()).filter((key) => key.userId === userId);
  }

  /**
   * Get API key by ID
   */
  getAPIKey(id: string): APIKey | undefined {
    return this.apiKeys.get(id);
  }

  /**
   * Clean up expired tokens and keys
   */
  cleanup(): void {
    const now = new Date();

    // Clean up expired API keys
    for (const [id, apiKey] of this.apiKeys.entries()) {
      if (apiKey.expiresAt && apiKey.expiresAt < now) {
        this.apiKeys.delete(id);
      }
    }

    // Clean up expired refresh tokens
    for (const [token, _userId] of this.refreshTokens.entries()) {
      const verification = this.verifyToken(token);
      if (!verification.valid) {
        this.refreshTokens.delete(token);
      }
    }
  }

  /**
   * Sign a JWT payload
   */
  private signJWT(payload: JWTPayload): string {
    const header = {
      alg: this.config.algorithm,
      typ: 'JWT',
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

    const signature = crypto
      .createHmac(this.config.algorithm.toLowerCase().replace('hs', 'sha'), this.config.jwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verify and decode a JWT
   */
  private verifyJWT(token: string): JWTPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const expectedSignature = crypto
      .createHmac(this.config.algorithm.toLowerCase().replace('hs', 'sha'), this.config.jwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (signature !== expectedSignature) {
      throw new Error('Invalid token signature');
    }

    // Decode payload
    const payload = JSON.parse(this.base64UrlDecode(encodedPayload));
    return payload as JWTPayload;
  }

  /**
   * Generate a secure random key
   */
  private generateSecureKey(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Hash a key for storage
   */
  private async hashKey(key: string): Promise<string> {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(str: string): string {
    return Buffer.from(str).toString('base64url');
  }

  /**
   * Base64 URL decode
   */
  private base64UrlDecode(str: string): string {
    return Buffer.from(str, 'base64url').toString('utf8');
  }
}

/**
 * Create a token manager with default configuration
 */
export function createTokenManager(jwtSecret: string, config?: Partial<TokenManagerConfig>): TokenManager {
  return new TokenManager({
    jwtSecret,
    ...config,
  });
}
