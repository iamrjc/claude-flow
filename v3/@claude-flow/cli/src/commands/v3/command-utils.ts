/**
 * V3 Command Utilities
 * Shared utilities for CLI commands
 */

import { output } from '../../output.js';

/**
 * Format status with color
 */
export function formatStatus(value: unknown): string {
  const status = String(value);
  const s = status.toLowerCase();
  switch (s) {
    case 'active':
    case 'running':
    case 'completed':
    case 'healthy':
      return output.success(status);
    case 'idle':
    case 'pending':
    case 'queued':
    case 'degraded':
      return output.warning(status);
    case 'failed':
    case 'cancelled':
    case 'terminated':
    case 'unhealthy':
      return output.error(status);
    default:
      return status;
  }
}

/**
 * Format priority with color
 */
export function formatPriority(value: unknown): string {
  const priority = String(value);
  switch (priority.toLowerCase()) {
    case 'critical':
      return output.error(priority);
    case 'high':
      return output.warning(priority);
    case 'normal':
      return priority;
    case 'low':
      return output.dim(priority);
    default:
      return priority;
  }
}

/**
 * Format timestamp to localized string
 */
export function formatTimestamp(timestamp: string | number): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return String(timestamp);
  }
}

/**
 * Format duration in milliseconds
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Validate argument presence
 */
export function requireArg(value: unknown, name: string): asserts value is string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
}

/**
 * Validate flag type
 */
export function requireFlag<T>(value: unknown, name: string, type: 'string' | 'number' | 'boolean'): T {
  if (value === undefined || value === null) {
    throw new Error(`Flag --${name} is required`);
  }

  const actualType = typeof value;
  if (actualType !== type) {
    throw new Error(`Flag --${name} must be a ${type}, got ${actualType}`);
  }

  return value as T;
}

/**
 * Parse comma-separated list
 */
export function parseList(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Parse key=value pairs
 */
export function parseKeyValuePairs(value: string | undefined): Record<string, string> {
  if (!value) return {};

  return value.split(',').reduce((acc, pair) => {
    const [key, val] = pair.split('=').map(s => s.trim());
    if (key && val) {
      acc[key] = val;
    }
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Pad string to width
 */
export function padString(str: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const padding = Math.max(0, width - str.length);

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + str;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
    }
    default:
      return str + ' '.repeat(padding);
  }
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse JSON safely
 */
export function parseJSON<T = unknown>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Stringify JSON safely
 */
export function stringifyJSON(value: unknown, pretty = false): string {
  try {
    return JSON.stringify(value, null, pretty ? 2 : 0);
  } catch {
    return String(value);
  }
}

/**
 * Wait for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry async function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        await sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * Create progress bar
 */
export function createProgressBar(current: number, total: number, width = 40): string {
  const percentage = total > 0 ? current / total : 0;
  const filled = Math.floor(percentage * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = (percentage * 100).toFixed(1);

  return `[${bar}] ${percent}%`;
}
