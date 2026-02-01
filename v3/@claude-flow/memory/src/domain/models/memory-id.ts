/**
 * Memory ID Value Object - Domain Layer
 *
 * Type-safe identifier for memory entries.
 * Implements value object pattern from DDD.
 *
 * @module v3/memory/domain/models
 */

import { randomUUID } from 'crypto';

/**
 * Memory ID value object
 *
 * Ensures type safety and validation for memory identifiers.
 * Immutable by design.
 */
export class MemoryId {
  private readonly value: string;

  private constructor(value: string) {
    this.validate(value);
    this.value = value;
  }

  /**
   * Create a new MemoryId from a string
   */
  static from(value: string): MemoryId {
    return new MemoryId(value);
  }

  /**
   * Generate a new unique MemoryId
   */
  static generate(): MemoryId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return new MemoryId(`mem_${timestamp}_${random}`);
  }

  /**
   * Create from UUID
   */
  static fromUUID(): MemoryId {
    return new MemoryId(randomUUID());
  }

  /**
   * Validate the ID format
   */
  private validate(value: string): void {
    if (!value || typeof value !== 'string') {
      throw new Error('MemoryId must be a non-empty string');
    }

    if (value.length < 3 || value.length > 255) {
      throw new Error('MemoryId must be between 3 and 255 characters');
    }
  }

  /**
   * Get the string value
   */
  toString(): string {
    return this.value;
  }

  /**
   * Check equality with another MemoryId
   */
  equals(other: MemoryId): boolean {
    return this.value === other.value;
  }

  /**
   * Get value for serialization
   */
  toJSON(): string {
    return this.value;
  }
}
