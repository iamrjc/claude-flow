/**
 * Path Validator - Enhanced Path Traversal Prevention
 *
 * Features:
 * - Path traversal prevention
 * - Whitelist validation
 * - Symlink resolution and validation
 * - Secure file operations
 *
 * @module @claude-flow/security/validation/path-validator
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { realpath } from 'node:fs/promises';

/**
 * Path validator configuration
 */
export interface PathValidatorConfig {
  /**
   * Allowed base paths (whitelist)
   */
  allowedPaths: string[];

  /**
   * Whether to resolve symlinks
   * @default true
   */
  resolveSymlinks?: boolean;

  /**
   * Whether to allow hidden files/directories
   * @default false
   */
  allowHidden?: boolean;

  /**
   * Blocked patterns (regex)
   */
  blockedPatterns?: RegExp[];

  /**
   * Allowed file extensions (if specified, only these are allowed)
   */
  allowedExtensions?: string[];

  /**
   * Maximum path length
   * @default 4096
   */
  maxPathLength?: number;
}

/**
 * Path validation result
 */
export interface PathValidationResult {
  valid: boolean;
  resolvedPath?: string;
  error?: string;
  warnings?: string[];
}

/**
 * Default blocked patterns
 */
const DEFAULT_BLOCKED_PATTERNS = [
  /\.\./g, // Path traversal
  /[<>:"|?*]/g, // Invalid path characters (Windows)
  /\x00/g, // Null bytes
  /^\/etc\//i, // System directories
  /^\/proc\//i,
  /^\/sys\//i,
  /^\/dev\//i,
  /^C:\\Windows\\/i, // Windows system directories
  /^C:\\Program Files/i,
];

/**
 * PathValidator - Secure path validation and resolution
 */
export class PathValidator {
  private readonly config: Required<PathValidatorConfig>;
  private readonly allowedPathsResolved: string[] = [];

  constructor(config: PathValidatorConfig) {
    if (!config.allowedPaths || config.allowedPaths.length === 0) {
      throw new Error('At least one allowed path must be specified');
    }

    this.config = {
      allowedPaths: config.allowedPaths,
      resolveSymlinks: config.resolveSymlinks ?? true,
      allowHidden: config.allowHidden ?? false,
      blockedPatterns: config.blockedPatterns ?? DEFAULT_BLOCKED_PATTERNS,
      allowedExtensions: config.allowedExtensions ?? [],
      maxPathLength: config.maxPathLength ?? 4096,
    };
  }

  /**
   * Initialize validator (resolve allowed paths)
   */
  async initialize(): Promise<void> {
    for (const allowedPath of this.config.allowedPaths) {
      try {
        const resolved = await realpath(allowedPath);
        this.allowedPathsResolved.push(resolved);
      } catch (error) {
        // If path doesn't exist yet, use it as-is
        this.allowedPathsResolved.push(path.resolve(allowedPath));
      }
    }
  }

  /**
   * Validate a path
   */
  async validate(inputPath: string): Promise<PathValidationResult> {
    const warnings: string[] = [];

    // Check path length
    if (inputPath.length > this.config.maxPathLength) {
      return {
        valid: false,
        error: `Path length ${inputPath.length} exceeds maximum ${this.config.maxPathLength}`,
      };
    }

    // Check for null bytes
    if (inputPath.includes('\x00')) {
      return {
        valid: false,
        error: 'Path contains null bytes',
      };
    }

    // Normalize path
    let normalizedPath = path.normalize(inputPath);

    // Check for blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(normalizedPath)) {
        return {
          valid: false,
          error: `Path matches blocked pattern: ${pattern}`,
        };
      }
    }

    // Check for hidden files/directories
    if (!this.config.allowHidden) {
      const parts = normalizedPath.split(path.sep);
      const hasHidden = parts.some((part) => part.startsWith('.') && part !== '.' && part !== '..');
      if (hasHidden) {
        return {
          valid: false,
          error: 'Hidden files/directories not allowed',
        };
      }
    }

    // Resolve symlinks if enabled
    let resolvedPath = normalizedPath;
    if (this.config.resolveSymlinks) {
      try {
        resolvedPath = await realpath(normalizedPath);
        if (resolvedPath !== normalizedPath) {
          warnings.push('Path is a symlink');
        }
      } catch (error) {
        // Path might not exist yet, resolve to absolute path
        resolvedPath = path.resolve(normalizedPath);
      }
    } else {
      resolvedPath = path.resolve(normalizedPath);
    }

    // Ensure allowed paths are initialized
    if (this.allowedPathsResolved.length === 0) {
      await this.initialize();
    }

    // Check if path is within allowed paths
    const isAllowed = this.allowedPathsResolved.some((allowedPath) => {
      return resolvedPath === allowedPath || resolvedPath.startsWith(allowedPath + path.sep);
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: 'Path is outside allowed directories',
        warnings,
      };
    }

    // Check file extension if restrictions are in place
    if (this.config.allowedExtensions.length > 0) {
      const ext = path.extname(resolvedPath);
      if (!this.config.allowedExtensions.includes(ext)) {
        return {
          valid: false,
          error: `File extension ${ext} not allowed`,
          warnings,
        };
      }
    }

    return {
      valid: true,
      resolvedPath,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate multiple paths
   */
  async validateMany(paths: string[]): Promise<Map<string, PathValidationResult>> {
    const results = new Map<string, PathValidationResult>();

    await Promise.all(
      paths.map(async (p) => {
        const result = await this.validate(p);
        results.set(p, result);
      })
    );

    return results;
  }

  /**
   * Safe file read with path validation
   */
  async safeReadFile(filePath: string): Promise<Buffer> {
    const result = await this.validate(filePath);

    if (!result.valid) {
      throw new Error(`Invalid path: ${result.error}`);
    }

    try {
      return await fs.readFile(result.resolvedPath!);
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Safe file write with path validation
   */
  async safeWriteFile(filePath: string, data: Buffer | string): Promise<void> {
    const result = await this.validate(filePath);

    if (!result.valid) {
      throw new Error(`Invalid path: ${result.error}`);
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(result.resolvedPath!);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(result.resolvedPath!, data);
    } catch (error) {
      throw new Error(`Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Safe directory listing with path validation
   */
  async safeReadDir(dirPath: string): Promise<string[]> {
    const result = await this.validate(dirPath);

    if (!result.valid) {
      throw new Error(`Invalid path: ${result.error}`);
    }

    try {
      const entries = await fs.readdir(result.resolvedPath!);

      // Filter hidden files if not allowed
      if (!this.config.allowHidden) {
        return entries.filter((entry) => !entry.startsWith('.'));
      }

      return entries;
    } catch (error) {
      throw new Error(`Failed to read directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if path exists and is within allowed paths
   */
  async exists(filePath: string): Promise<boolean> {
    const result = await this.validate(filePath);

    if (!result.valid) {
      return false;
    }

    try {
      await fs.access(result.resolvedPath!);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats with path validation
   */
  async stat(filePath: string): Promise<Awaited<ReturnType<typeof fs.stat>>> {
    const result = await this.validate(filePath);

    if (!result.valid) {
      throw new Error(`Invalid path: ${result.error}`);
    }

    return await fs.stat(result.resolvedPath!);
  }

  /**
   * Safe file deletion with path validation
   */
  async safeDelete(filePath: string): Promise<void> {
    const result = await this.validate(filePath);

    if (!result.valid) {
      throw new Error(`Invalid path: ${result.error}`);
    }

    try {
      const stats = await fs.stat(result.resolvedPath!);

      if (stats.isDirectory()) {
        await fs.rmdir(result.resolvedPath!, { recursive: true });
      } else {
        await fs.unlink(result.resolvedPath!);
      }
    } catch (error) {
      throw new Error(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Join paths safely
   */
  async safeJoin(basePath: string, ...segments: string[]): Promise<string> {
    const joined = path.join(basePath, ...segments);
    const result = await this.validate(joined);

    if (!result.valid) {
      throw new Error(`Invalid joined path: ${result.error}`);
    }

    return result.resolvedPath!;
  }

  /**
   * Get relative path within allowed directory
   */
  getRelativePath(filePath: string, basePath: string): string {
    const normalized = path.normalize(filePath);
    const base = path.normalize(basePath);

    if (!normalized.startsWith(base)) {
      throw new Error('Path is not within base directory');
    }

    return path.relative(base, normalized);
  }

  /**
   * Add an allowed path at runtime
   */
  async addAllowedPath(newPath: string): Promise<void> {
    const resolved = path.resolve(newPath);
    this.config.allowedPaths.push(resolved);
    this.allowedPathsResolved.push(resolved);
  }

  /**
   * Remove an allowed path
   */
  removeAllowedPath(pathToRemove: string): boolean {
    const resolved = path.resolve(pathToRemove);
    const index = this.allowedPathsResolved.indexOf(resolved);

    if (index !== -1) {
      this.allowedPathsResolved.splice(index, 1);
      const configIndex = this.config.allowedPaths.indexOf(pathToRemove);
      if (configIndex !== -1) {
        this.config.allowedPaths.splice(configIndex, 1);
      }
      return true;
    }

    return false;
  }

  /**
   * Get all allowed paths
   */
  getAllowedPaths(): string[] {
    return [...this.allowedPathsResolved];
  }
}

/**
 * Create a path validator for a project directory
 */
export function createPathValidator(projectRoot: string, config?: Partial<PathValidatorConfig>): PathValidator {
  return new PathValidator({
    allowedPaths: [projectRoot],
    ...config,
  });
}

/**
 * Create a path validator with multiple allowed directories
 */
export function createMultiPathValidator(allowedPaths: string[], config?: Partial<PathValidatorConfig>): PathValidator {
  return new PathValidator({
    allowedPaths,
    ...config,
  });
}

/**
 * Quick path validation without creating an instance
 */
export async function validatePath(inputPath: string, allowedPaths: string[]): Promise<PathValidationResult> {
  const validator = new PathValidator({ allowedPaths });
  await validator.initialize();
  return validator.validate(inputPath);
}
