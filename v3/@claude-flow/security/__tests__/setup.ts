/**
 * Security Package Test Setup
 * Minimal setup for security module tests
 */

import { vi } from 'vitest';

// Mock console methods for cleaner test output
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
