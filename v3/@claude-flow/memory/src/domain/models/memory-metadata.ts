/**
 * Memory Metadata - Domain Layer
 *
 * Structured metadata for memory entries.
 * Provides context about memory source, ownership, and categorization.
 *
 * @module v3/memory/domain/models
 */

/**
 * Memory metadata structure
 *
 * Captures contextual information about memory entries
 * for better organization and retrieval.
 */
export interface MemoryMetadata {
  /** Source of the memory (agent, user, system, etc.) */
  source?: string;

  /** Agent ID that created this memory */
  agent?: string;

  /** Session ID when memory was created */
  session?: string;

  /** Categorization tags */
  tags?: string[];

  /** Confidence score (0-1) for automatically generated memories */
  confidence?: number;

  /** Related memory IDs */
  relatedMemories?: string[];

  /** Priority level (0-10) */
  priority?: number;

  /** Custom metadata fields */
  [key: string]: unknown;
}

/**
 * Create default metadata
 */
export function createDefaultMetadata(
  partial?: Partial<MemoryMetadata>
): MemoryMetadata {
  return {
    source: 'system',
    tags: [],
    confidence: 1.0,
    priority: 5,
    relatedMemories: [],
    ...partial,
  };
}

/**
 * Merge metadata objects
 */
export function mergeMetadata(
  base: MemoryMetadata,
  updates: Partial<MemoryMetadata>
): MemoryMetadata {
  return {
    ...base,
    ...updates,
    tags: [...(base.tags || []), ...(updates.tags || [])],
    relatedMemories: [
      ...(base.relatedMemories || []),
      ...(updates.relatedMemories || []),
    ],
  };
}

/**
 * Validate metadata structure
 */
export function validateMetadata(metadata: MemoryMetadata): boolean {
  if (metadata.confidence !== undefined) {
    if (metadata.confidence < 0 || metadata.confidence > 1) {
      return false;
    }
  }

  if (metadata.priority !== undefined) {
    if (metadata.priority < 0 || metadata.priority > 10) {
      return false;
    }
  }

  if (metadata.tags && !Array.isArray(metadata.tags)) {
    return false;
  }

  return true;
}
