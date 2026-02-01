/**
 * Test setup for @claude-flow/memory
 *
 * Global configuration for vitest tests.
 */

// Extend vitest matchers if needed
import { expect } from 'vitest';

// Configure test environment
process.env.NODE_ENV = 'test';

// Set default timeout for long-running tests
const DEFAULT_TIMEOUT = 10000;
