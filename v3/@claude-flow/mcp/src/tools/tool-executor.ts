/**
 * @claude-flow/mcp - Tool Executor
 *
 * Executes MCP tools with validation, error handling, and metrics
 */

import type { ToolContext, ToolCallResult, MCPError, ILogger } from '../types.js';
import { ErrorCodes } from '../types.js';
import { validateSchema } from '../schema-validator.js';
import type { ToolRegistry } from '../tool-registry.js';

export interface ToolExecutionMetrics {
  toolName: string;
  executionTime: number;
  success: boolean;
  errorCode?: number;
  timestamp: Date;
}

export interface ToolExecutorConfig {
  defaultTimeout?: number;
  enableMetrics?: boolean;
  validateInput?: boolean;
}

export class ToolExecutor {
  private metrics: ToolExecutionMetrics[] = [];
  private readonly config: Required<ToolExecutorConfig>;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly logger: ILogger,
    config?: ToolExecutorConfig
  ) {
    this.config = {
      defaultTimeout: config?.defaultTimeout ?? 30000,
      enableMetrics: config?.enableMetrics ?? true,
      validateInput: config?.validateInput ?? true,
    };
  }

  /**
   * Execute a tool by name with input validation and error handling
   */
  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context?: ToolContext
  ): Promise<ToolCallResult> {
    const startTime = performance.now();

    try {
      // Get tool from registry
      const tool = this.registry.getTool(toolName);
      if (!tool) {
        return this.createErrorResult(
          `Tool not found: ${toolName}`,
          ErrorCodes.METHOD_NOT_FOUND
        );
      }

      // Validate input if enabled
      if (this.config.validateInput && tool.inputSchema) {
        const validation = validateSchema(input, tool.inputSchema);
        if (!validation.valid) {
          return this.createErrorResult(
            `Invalid input: ${validation.errors.join(', ')}`,
            ErrorCodes.INVALID_PARAMS
          );
        }
      }

      // Execute with timeout
      const timeout = tool.timeout ?? this.config.defaultTimeout;
      const result = await this.executeWithTimeout(
        () => this.registry.execute(toolName, input, context),
        timeout
      );

      // Record metrics
      if (this.config.enableMetrics) {
        this.recordMetric({
          toolName,
          executionTime: performance.now() - startTime,
          success: !result.isError,
          timestamp: new Date(),
        });
      }

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;

      // Record error metric
      if (this.config.enableMetrics) {
        this.recordMetric({
          toolName,
          executionTime,
          success: false,
          errorCode: ErrorCodes.INTERNAL_ERROR,
          timestamp: new Date(),
        });
      }

      return this.createErrorResult(
        error instanceof Error ? error.message : String(error),
        ErrorCodes.INTERNAL_ERROR
      );
    }
  }

  /**
   * Execute tool with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool execution timeout after ${timeout}ms`)),
          timeout
        )
      ),
    ]);
  }

  /**
   * Create standardized error result
   */
  private createErrorResult(message: string, code: number): ToolCallResult {
    this.logger.error('Tool execution error', { message, code });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: {
                code,
                message,
              },
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  /**
   * Record execution metric
   */
  private recordMetric(metric: ToolExecutionMetrics): void {
    this.metrics.push(metric);

    // Keep only last 1000 metrics to prevent memory leak
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Get execution metrics
   */
  getMetrics(): ToolExecutionMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get metrics for a specific tool
   */
  getToolMetrics(toolName: string): ToolExecutionMetrics[] {
    return this.metrics.filter((m) => m.toolName === toolName);
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics() {
    const toolMetrics = new Map<
      string,
      {
        calls: number;
        successes: number;
        failures: number;
        totalTime: number;
        avgTime: number;
        minTime: number;
        maxTime: number;
      }
    >();

    for (const metric of this.metrics) {
      const existing = toolMetrics.get(metric.toolName) ?? {
        calls: 0,
        successes: 0,
        failures: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
      };

      existing.calls++;
      if (metric.success) {
        existing.successes++;
      } else {
        existing.failures++;
      }
      existing.totalTime += metric.executionTime;
      existing.avgTime = existing.totalTime / existing.calls;
      existing.minTime = Math.min(existing.minTime, metric.executionTime);
      existing.maxTime = Math.max(existing.maxTime, metric.executionTime);

      toolMetrics.set(metric.toolName, existing);
    }

    return Object.fromEntries(toolMetrics);
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get success rate for a tool
   */
  getSuccessRate(toolName: string): number {
    const toolMetrics = this.getToolMetrics(toolName);
    if (toolMetrics.length === 0) return 1.0;

    const successes = toolMetrics.filter((m) => m.success).length;
    return successes / toolMetrics.length;
  }

  /**
   * Get average execution time for a tool
   */
  getAverageExecutionTime(toolName: string): number {
    const toolMetrics = this.getToolMetrics(toolName);
    if (toolMetrics.length === 0) return 0;

    const totalTime = toolMetrics.reduce((sum, m) => sum + m.executionTime, 0);
    return totalTime / toolMetrics.length;
  }
}

/**
 * Create a tool executor instance
 */
export function createToolExecutor(
  registry: ToolRegistry,
  logger: ILogger,
  config?: ToolExecutorConfig
): ToolExecutor {
  return new ToolExecutor(registry, logger, config);
}
