/**
 * Migration Types
 * Type definitions for v2 to v3 migration
 */

// ============================================
// V2 Configuration Types
// ============================================

export interface V2Config {
  version?: string;
  projectName?: string;

  // Agent configuration (v2 format)
  agents?: {
    defaultModel?: string;
    maxAgents?: number;
    timeout?: number;
  };

  // Swarm configuration (v2 format)
  swarm?: {
    mode?: 'sequential' | 'parallel' | 'hierarchical';
    maxConcurrency?: number;
    strategy?: string;
  };

  // Memory configuration (v2 format)
  memory?: {
    type?: 'local' | 'redis' | 'sqlite';
    path?: string;
    maxSize?: number;
  };

  // Provider configuration (v2 format)
  provider?: string;
  apiKey?: string;

  // Plugin configuration
  plugins?: string[];

  // Hooks configuration (v2 format)
  hooks?: Record<string, string | { handler: string; enabled: boolean }>;

  // Workflows
  workflows?: Record<string, unknown>;

  // Embeddings (v2 format)
  embeddings?: {
    provider?: 'openai' | 'tensorflow';
    model?: string;
    dimensions?: number;
  };
}

// ============================================
// V3 Configuration Types (from CLI types)
// ============================================

export interface V3Config {
  version: string;
  projectRoot: string;

  agents: {
    defaultType: string;
    autoSpawn: boolean;
    maxConcurrent: number;
    timeout: number;
    providers: Array<{
      name: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      priority: number;
      enabled: boolean;
    }>;
  };

  swarm: {
    topology: 'hierarchical' | 'mesh' | 'ring' | 'star' | 'hybrid' | 'hierarchical-mesh';
    maxAgents: number;
    autoScale: boolean;
    coordinationStrategy: 'consensus' | 'leader' | 'distributed';
    healthCheckInterval: number;
  };

  memory: {
    backend: 'agentdb' | 'sqlite' | 'memory' | 'hybrid';
    persistPath: string;
    cacheSize: number;
    enableHNSW: boolean;
    vectorDimension: number;
  };

  mcp: {
    serverHost: string;
    serverPort: number;
    autoStart: boolean;
    transportType: 'stdio' | 'http' | 'websocket';
    tools: string[];
  };

  cli: {
    colorOutput: boolean;
    interactive: boolean;
    verbosity: 'quiet' | 'normal' | 'verbose' | 'debug';
    outputFormat: 'text' | 'json' | 'table';
    progressStyle: 'bar' | 'spinner' | 'dots' | 'none';
  };

  hooks: {
    enabled: boolean;
    autoExecute: boolean;
    hooks: Array<{
      name: string;
      event: string;
      handler: string;
      priority: number;
      enabled: boolean;
    }>;
  };
}

// ============================================
// Migration Types
// ============================================

export interface MigrationOptions {
  /** Perform dry run without making changes */
  dryRun: boolean;

  /** Create backup before migration */
  backup: boolean;

  /** Force migration (overwrite existing) */
  force: boolean;

  /** Source directory (v2 project root) */
  sourceDir: string;

  /** Target directory (v3 project root) */
  targetDir: string;

  /** Migration target components */
  targets: MigrationTarget[];

  /** Verbosity level */
  verbose: boolean;
}

export type MigrationTarget =
  | 'config'
  | 'database'
  | 'plugins'
  | 'sessions'
  | 'all';

export interface MigrationResult {
  /** Migration success status */
  success: boolean;

  /** Target component migrated */
  target: MigrationTarget;

  /** Number of items migrated */
  itemsMigrated: number;

  /** Number of items skipped */
  itemsSkipped: number;

  /** Number of items failed */
  itemsFailed: number;

  /** Detailed messages */
  messages: MigrationMessage[];

  /** Migration duration in milliseconds */
  duration: number;

  /** Backup location (if created) */
  backupPath?: string;

  /** Errors encountered */
  errors: MigrationError[];

  /** Warnings */
  warnings: string[];
}

export interface MigrationMessage {
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: unknown;
  timestamp: number;
}

export interface MigrationError {
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

// ============================================
// Backup Types
// ============================================

export interface BackupMetadata {
  id: string;
  timestamp: number;
  version: string;
  sourceDir: string;
  files: BackupFile[];
  checksums: Record<string, string>;
}

export interface BackupFile {
  path: string;
  size: number;
  checksum: string;
}

// ============================================
// Plugin Mapping Types
// ============================================

export interface PluginMapping {
  v2Name: string;
  v3Name: string;
  autoConvert: boolean;
  configTransform?: (v2Config: unknown) => unknown;
  notes?: string;
}

// ============================================
// Session Migration Types
// ============================================

export interface V2Session {
  id: string;
  timestamp: number;
  agents: unknown[];
  memory: unknown;
  state: unknown;
}

export interface V3Session {
  id: string;
  timestamp: number;
  agents: unknown[];
  memory: unknown;
  state: unknown;
  version: string;
}

// ============================================
// Database Schema Types
// ============================================

export interface DatabaseMigration {
  version: number;
  name: string;
  up: string; // SQL for upgrade
  down: string; // SQL for rollback
}

export interface DatabaseMigrationResult {
  version: number;
  applied: boolean;
  error?: string;
}
