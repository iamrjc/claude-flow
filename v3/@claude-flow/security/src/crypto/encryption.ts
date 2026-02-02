/**
 * Encryption Module - AES-256-GCM Encryption
 *
 * Features:
 * - AES-256-GCM encryption/decryption
 * - PBKDF2 key derivation
 * - Secure random generation
 * - bcrypt password hashing
 *
 * @module @claude-flow/security/crypto/encryption
 */

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  /**
   * Algorithm to use
   * @default 'aes-256-gcm'
   */
  algorithm?: string;

  /**
   * Key derivation iterations (PBKDF2)
   * @default 100000
   */
  keyDerivationIterations?: number;

  /**
   * Key length in bytes
   * @default 32 (256 bits)
   */
  keyLength?: number;

  /**
   * Salt length in bytes
   * @default 16
   */
  saltLength?: number;

  /**
   * IV length in bytes
   * @default 12 (96 bits for GCM)
   */
  ivLength?: number;

  /**
   * Auth tag length in bytes
   * @default 16 (128 bits)
   */
  authTagLength?: number;
}

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  /**
   * Encrypted data (base64)
   */
  ciphertext: string;

  /**
   * Initialization vector (base64)
   */
  iv: string;

  /**
   * Authentication tag (base64)
   */
  authTag: string;

  /**
   * Salt used for key derivation (base64)
   */
  salt?: string;

  /**
   * Algorithm used
   */
  algorithm: string;
}

/**
 * Key derivation result
 */
export interface DerivedKey {
  key: Buffer;
  salt: Buffer;
}

/**
 * Encryption class
 */
export class Encryption {
  private readonly config: Required<EncryptionConfig>;

  constructor(config: EncryptionConfig = {}) {
    this.config = {
      algorithm: config.algorithm ?? 'aes-256-gcm',
      keyDerivationIterations: config.keyDerivationIterations ?? 100000,
      keyLength: config.keyLength ?? 32,
      saltLength: config.saltLength ?? 16,
      ivLength: config.ivLength ?? 12,
      authTagLength: config.authTagLength ?? 16,
    };
  }

  /**
   * Encrypt data using a password
   */
  async encryptWithPassword(data: string | Buffer, password: string): Promise<EncryptedData> {
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    // Derive key from password
    const { key, salt } = await this.deriveKey(password);

    // Generate IV
    const iv = this.generateSecureRandom(this.config.ivLength);

    // Create cipher
    const cipher = crypto.createCipheriv(this.config.algorithm, key, iv);

    // Encrypt
    const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);

    // Get auth tag (GCM mode)
    const authTag = (cipher as any).getAuthTag() as Buffer;

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
      algorithm: this.config.algorithm,
    };
  }

  /**
   * Decrypt data using a password
   */
  async decryptWithPassword(encryptedData: EncryptedData, password: string): Promise<Buffer> {
    if (!encryptedData.salt) {
      throw new Error('Salt is required for password-based decryption');
    }

    // Derive key from password using stored salt
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const key = await this.deriveKeyWithSalt(password, salt);

    return this.decryptWithKey(encryptedData, key);
  }

  /**
   * Encrypt data using a raw key
   */
  encryptWithKey(data: string | Buffer, key: Buffer): EncryptedData {
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    if (key.length !== this.config.keyLength) {
      throw new Error(`Key must be ${this.config.keyLength} bytes`);
    }

    // Generate IV
    const iv = this.generateSecureRandom(this.config.ivLength);

    // Create cipher
    const cipher = crypto.createCipheriv(this.config.algorithm, key, iv);

    // Encrypt
    const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);

    // Get auth tag
    const authTag = (cipher as any).getAuthTag() as Buffer;

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      algorithm: this.config.algorithm,
    };
  }

  /**
   * Decrypt data using a raw key
   */
  decryptWithKey(encryptedData: EncryptedData, key: Buffer): Buffer {
    if (key.length !== this.config.keyLength) {
      throw new Error(`Key must be ${this.config.keyLength} bytes`);
    }

    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');

    // Create decipher
    const decipher = crypto.createDecipheriv(this.config.algorithm, key, iv);

    // Set auth tag
    (decipher as any).setAuthTag(authTag);

    // Decrypt
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Derive key from password using PBKDF2
   */
  async deriveKey(password: string, salt?: Buffer): Promise<DerivedKey> {
    const actualSalt = salt ?? this.generateSecureRandom(this.config.saltLength);

    const key = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(
        password,
        actualSalt,
        this.config.keyDerivationIterations,
        this.config.keyLength,
        'sha256',
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });

    return { key, salt: actualSalt };
  }

  /**
   * Derive key with specific salt
   */
  private async deriveKeyWithSalt(password: string, salt: Buffer): Promise<Buffer> {
    const { key } = await this.deriveKey(password, salt);
    return key;
  }

  /**
   * Generate a secure encryption key
   */
  generateKey(): Buffer {
    return this.generateSecureRandom(this.config.keyLength);
  }

  /**
   * Generate secure random bytes
   */
  generateSecureRandom(length: number): Buffer {
    return crypto.randomBytes(length);
  }

  /**
   * Generate a secure random string (base64url)
   */
  generateSecureRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string, rounds: number = 12): Promise<string> {
    return bcrypt.hash(password, rounds);
  }

  /**
   * Verify password against bcrypt hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate HMAC
   */
  generateHMAC(data: string | Buffer, secret: string | Buffer, algorithm: string = 'sha256'): string {
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(typeof data === 'string' ? data : data);
    return hmac.digest('hex');
  }

  /**
   * Verify HMAC
   */
  verifyHMAC(data: string | Buffer, secret: string | Buffer, expectedHMAC: string, algorithm: string = 'sha256'): boolean {
    const actualHMAC = this.generateHMAC(data, secret, algorithm);
    return crypto.timingSafeEqual(Buffer.from(actualHMAC), Buffer.from(expectedHMAC));
  }

  /**
   * Hash data using SHA-256
   */
  hash(data: string | Buffer, algorithm: string = 'sha256'): string {
    const hash = crypto.createHash(algorithm);
    hash.update(typeof data === 'string' ? data : data);
    return hash.digest('hex');
  }

  /**
   * Constant-time string comparison
   */
  timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Serialize encrypted data to string
   */
  serializeEncryptedData(data: EncryptedData): string {
    return JSON.stringify(data);
  }

  /**
   * Deserialize encrypted data from string
   */
  deserializeEncryptedData(serialized: string): EncryptedData {
    return JSON.parse(serialized) as EncryptedData;
  }

  /**
   * Encrypt and serialize in one step
   */
  async encryptAndSerialize(data: string | Buffer, password: string): Promise<string> {
    const encrypted = await this.encryptWithPassword(data, password);
    return this.serializeEncryptedData(encrypted);
  }

  /**
   * Deserialize and decrypt in one step
   */
  async deserializeAndDecrypt(serialized: string, password: string): Promise<Buffer> {
    const encrypted = this.deserializeEncryptedData(serialized);
    return this.decryptWithPassword(encrypted, password);
  }
}

/**
 * Create an encryption instance with default configuration
 */
export function createEncryption(config?: EncryptionConfig): Encryption {
  return new Encryption(config);
}

/**
 * Quick encrypt helper
 */
export async function encrypt(data: string | Buffer, password: string): Promise<string> {
  const encryption = new Encryption();
  return encryption.encryptAndSerialize(data, password);
}

/**
 * Quick decrypt helper
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  const encryption = new Encryption();
  const decrypted = await encryption.deserializeAndDecrypt(encryptedData, password);
  return decrypted.toString('utf8');
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Generate a secure random UUID
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}
