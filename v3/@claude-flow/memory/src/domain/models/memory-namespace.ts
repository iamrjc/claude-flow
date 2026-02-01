/**
 * Memory Namespace - Domain Layer
 *
 * Namespace management for memory isolation and organization.
 * Implements namespace policies for retention and size limits.
 *
 * @module v3/memory/domain/models
 */

/**
 * Namespace policy configuration
 */
export interface NamespacePolicy {
  /** Maximum number of entries in namespace */
  maxSize?: number;

  /** Retention period in milliseconds */
  retentionPeriod?: number;

  /** Auto-archive old entries */
  autoArchive?: boolean;

  /** Auto-delete after retention period */
  autoDelete?: boolean;

  /** Priority level for memory consolidation */
  consolidationPriority?: number;

  /** Enable vector indexing */
  vectorIndexing?: boolean;
}

/**
 * Namespace statistics
 */
export interface NamespaceStats {
  /** Namespace name */
  namespace: string;

  /** Total entries */
  entryCount: number;

  /** Active entries */
  activeCount: number;

  /** Archived entries */
  archivedCount: number;

  /** Total size in bytes */
  totalSize: number;

  /** Oldest entry timestamp */
  oldestEntry?: Date;

  /** Newest entry timestamp */
  newestEntry?: Date;

  /** Most accessed entry */
  mostAccessed?: string;

  /** Average access count */
  averageAccessCount: number;
}

/**
 * Memory Namespace
 *
 * Manages a namespace with policies and statistics.
 * Provides isolation between different memory domains.
 */
export class MemoryNamespace {
  private readonly name: string;
  private policy: NamespacePolicy;

  constructor(name: string, policy?: NamespacePolicy) {
    this.validateName(name);
    this.name = name;
    this.policy = this.getDefaultPolicy(policy);
  }

  /**
   * Create a new namespace
   */
  static create(name: string, policy?: NamespacePolicy): MemoryNamespace {
    return new MemoryNamespace(name, policy);
  }

  /**
   * Get namespace name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get namespace policy
   */
  getPolicy(): NamespacePolicy {
    return { ...this.policy };
  }

  /**
   * Update namespace policy
   */
  updatePolicy(updates: Partial<NamespacePolicy>): void {
    this.policy = {
      ...this.policy,
      ...updates,
    };
  }

  /**
   * Check if namespace has size limit
   */
  hasSizeLimit(): boolean {
    return this.policy.maxSize !== undefined && this.policy.maxSize > 0;
  }

  /**
   * Check if namespace has retention policy
   */
  hasRetentionPolicy(): boolean {
    return (
      this.policy.retentionPeriod !== undefined &&
      this.policy.retentionPeriod > 0
    );
  }

  /**
   * Check if entry should be archived based on age
   */
  shouldArchive(entryAge: number): boolean {
    if (!this.policy.autoArchive || !this.hasRetentionPolicy()) {
      return false;
    }
    return entryAge > this.policy.retentionPeriod!;
  }

  /**
   * Check if entry should be deleted based on age
   */
  shouldDelete(entryAge: number): boolean {
    if (!this.policy.autoDelete || !this.hasRetentionPolicy()) {
      return false;
    }
    return entryAge > this.policy.retentionPeriod!;
  }

  /**
   * Check if namespace is over size limit
   */
  isOverLimit(currentSize: number): boolean {
    if (!this.hasSizeLimit()) {
      return false;
    }
    return currentSize > this.policy.maxSize!;
  }

  /**
   * Check if vector indexing is enabled
   */
  isVectorIndexingEnabled(): boolean {
    return this.policy.vectorIndexing ?? true;
  }

  /**
   * Get consolidation priority
   */
  getConsolidationPriority(): number {
    return this.policy.consolidationPriority ?? 5;
  }

  /**
   * Validate namespace name
   */
  private validateName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Namespace name must be a non-empty string');
    }

    if (name.length > 255) {
      throw new Error('Namespace name must be 255 characters or less');
    }

    // Allow alphanumeric, hyphens, underscores, and dots
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      throw new Error(
        'Namespace name must contain only alphanumeric characters, dots, hyphens, and underscores'
      );
    }
  }

  /**
   * Get default policy
   */
  private getDefaultPolicy(policy?: NamespacePolicy): NamespacePolicy {
    return {
      maxSize: policy?.maxSize,
      retentionPeriod: policy?.retentionPeriod,
      autoArchive: policy?.autoArchive ?? false,
      autoDelete: policy?.autoDelete ?? false,
      consolidationPriority: policy?.consolidationPriority ?? 5,
      vectorIndexing: policy?.vectorIndexing ?? true,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      policy: this.policy,
    };
  }
}

/**
 * Predefined namespace policies
 */
export const NamespacePolicies = {
  /** Default policy - no limits */
  DEFAULT: {
    vectorIndexing: true,
  },

  /** Ephemeral - short-lived data */
  EPHEMERAL: {
    retentionPeriod: 3600000, // 1 hour
    autoDelete: true,
    vectorIndexing: false,
  },

  /** Working memory - session-scoped */
  WORKING: {
    maxSize: 1000,
    retentionPeriod: 86400000, // 24 hours
    autoArchive: true,
    vectorIndexing: true,
  },

  /** Long-term - permanent storage */
  LONG_TERM: {
    autoArchive: false,
    autoDelete: false,
    vectorIndexing: true,
    consolidationPriority: 10,
  },

  /** Cache - high churn */
  CACHE: {
    maxSize: 10000,
    retentionPeriod: 3600000, // 1 hour
    autoDelete: true,
    vectorIndexing: false,
  },
} as const;
