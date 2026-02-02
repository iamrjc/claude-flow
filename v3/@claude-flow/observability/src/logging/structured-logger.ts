/**
 * Structured Logger - JSON format, levels, correlation IDs, redaction, transports
 *
 * Features:
 * - JSON structured logging
 * - Multiple log levels (debug, info, warn, error, fatal)
 * - Correlation ID tracking across requests
 * - Sensitive data redaction
 * - Multiple transports (console, file, custom)
 * - Zero-config defaults
 * - Low overhead (<1ms per log)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  context?: string;
  agentId?: string;
  taskId?: string;
  sessionId?: string;
}

export interface LoggerConfig {
  level?: LogLevel;
  enableConsole?: boolean;
  enableRedaction?: boolean;
  redactKeys?: string[];
  transports?: LogTransport[];
  correlationIdProvider?: () => string;
}

export interface LogTransport {
  name: string;
  write: (entry: LogEntry) => unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const SENSITIVE_KEYS = [
  'password',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'authorization',
  'auth',
  'cookie',
  'session',
  'privateKey',
  'private_key',
];

export class StructuredLogger {
  private config: Required<LoggerConfig>;
  private transports: LogTransport[] = [];

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level ?? 'info',
      enableConsole: config.enableConsole ?? true,
      enableRedaction: config.enableRedaction ?? true,
      redactKeys: config.redactKeys ?? SENSITIVE_KEYS,
      transports: config.transports ?? [],
      correlationIdProvider: config.correlationIdProvider ?? this.generateCorrelationId,
    };

    // Add console transport if enabled
    if (this.config.enableConsole) {
      this.transports.push({
        name: 'console',
        write: (entry) => {
          const color = this.getColorForLevel(entry.level);
          console.log(color, JSON.stringify(entry));
        },
      });
    }

    // Add custom transports
    this.transports.push(...this.config.transports);
  }

  /**
   * Log a debug message
   */
  debug(message: string, metadata?: Record<string, unknown>, context?: string): void {
    this.log('debug', message, metadata, context);
  }

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, unknown>, context?: string): void {
    this.log('info', message, metadata, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, metadata?: Record<string, unknown>, context?: string): void {
    this.log('warn', message, metadata, context);
  }

  /**
   * Log an error message
   */
  error(message: string, metadata?: Record<string, unknown>, context?: string): void {
    this.log('error', message, metadata, context);
  }

  /**
   * Log a fatal error message
   */
  fatal(message: string, metadata?: Record<string, unknown>, context?: string): void {
    this.log('fatal', message, metadata, context);
  }

  /**
   * Log with explicit correlation ID
   */
  logWithCorrelation(
    level: LogLevel,
    message: string,
    correlationId: string,
    metadata?: Record<string, unknown>,
    context?: string
  ): void {
    this.log(level, message, metadata, context, correlationId);
  }

  /**
   * Create a child logger with inherited context
   */
  child(childContext: {
    agentId?: string;
    taskId?: string;
    sessionId?: string;
    context?: string;
  }): StructuredLogger {
    const childLogger = new StructuredLogger(this.config);
    childLogger.transports = this.transports;

    // Override log method to include child context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level, message, metadata, context, correlationId) => {
      const mergedMetadata = {
        ...childContext,
        ...metadata,
      };
      originalLog(level, message, mergedMetadata, context || childContext.context, correlationId);
    };

    return childLogger;
  }

  /**
   * Add a custom transport
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  /**
   * Remove a transport by name
   */
  removeTransport(name: string): void {
    this.transports = this.transports.filter((t) => t.name !== name);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    context?: string,
    correlationId?: string
  ): void {
    // Check if log level is enabled
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: correlationId ?? this.config.correlationIdProvider(),
      metadata: this.config.enableRedaction ? this.redactSensitiveData(metadata) : metadata,
      context,
    };

    // Write to all transports
    for (const transport of this.transports) {
      try {
        const result = transport.write(entry);
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`Transport ${transport.name} failed:`, err);
          });
        }
      } catch (err) {
        console.error(`Transport ${transport.name} failed:`, err);
      }
    }
  }

  /**
   * Redact sensitive data from metadata
   */
  private redactSensitiveData(
    data?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!data) return data;

    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = this.config.redactKeys.some((k) => lowerKey.includes(k.toLowerCase()));

      if (isSensitive) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redactSensitiveData(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Generate a unique correlation ID
   */
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get ANSI color code for log level
   */
  private getColorForLevel(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m', // Green
      warn: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
      fatal: '\x1b[35m', // Magenta
    };
    return colors[level];
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }
}

/**
 * Global logger instance with zero-config defaults
 */
export const logger = new StructuredLogger();

/**
 * Create a new logger instance
 */
export function createLogger(config?: LoggerConfig): StructuredLogger {
  return new StructuredLogger(config);
}
