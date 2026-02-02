/**
 * LLM Stream - LLM Response Event Streaming
 *
 * Streams LLM response events including:
 * - Token-by-token streaming
 * - Tool/function call events
 * - Usage statistics (prompt tokens, completion tokens, cost)
 * - Model information and parameters
 * - Error and retry events
 *
 * @module @claude-flow/streaming/streams
 */

import { EventEmitter } from 'events';
import { SSEServer, SSEEvent } from '../server/sse-server.js';

/**
 * LLM provider type
 */
export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'cohere' | 'ollama' | 'litellm' | 'vllm' | 'onnx';

/**
 * LLM stream event
 */
export interface LLMStreamEvent {
  /** Request ID */
  requestId: string;
  /** Provider */
  provider: LLMProvider;
  /** Model name */
  model: string;
  /** Agent ID (if applicable) */
  agentId?: string;
  /** Task ID (if applicable) */
  taskId?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Token chunk
 */
export interface TokenChunk extends LLMStreamEvent {
  /** Token text */
  token: string;
  /** Token index */
  index: number;
  /** Is final token */
  isFinal?: boolean;
  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'tool_use' | 'content_filter';
}

/**
 * Tool call event
 */
export interface ToolCall extends LLMStreamEvent {
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments (may be partial during streaming) */
  arguments: string;
  /** Is complete */
  isComplete: boolean;
}

/**
 * Tool result event
 */
export interface ToolResult extends LLMStreamEvent {
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Tool result */
  result: unknown;
  /** Execution time in ms */
  executionTime: number;
  /** Error if failed */
  error?: string;
}

/**
 * Usage statistics
 */
export interface UsageStats {
  /** Prompt tokens */
  promptTokens: number;
  /** Completion tokens */
  completionTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Cost in USD */
  cost?: number;
  /** Cost breakdown */
  costBreakdown?: {
    promptCost: number;
    completionCost: number;
  };
}

/**
 * LLM request started event
 */
export interface LLMRequestStarted extends LLMStreamEvent {
  /** System prompt */
  systemPrompt?: string;
  /** User messages */
  messages: Array<{ role: string; content: string }>;
  /** Model parameters */
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
  };
  /** Tools available */
  tools?: Array<{ name: string; description: string }>;
}

/**
 * LLM request completed event
 */
export interface LLMRequestCompleted extends LLMStreamEvent {
  /** Full response text */
  response: string;
  /** Usage statistics */
  usage: UsageStats;
  /** Total duration in ms */
  duration: number;
  /** Tool calls made */
  toolCalls?: ToolCall[];
}

/**
 * LLM request error event
 */
export interface LLMRequestError extends LLMStreamEvent {
  /** Error message */
  error: string;
  /** Error code */
  errorCode?: string;
  /** Error type */
  errorType?: 'rate_limit' | 'invalid_request' | 'authentication' | 'server_error' | 'network' | 'timeout';
  /** Will retry */
  willRetry?: boolean;
  /** Retry attempt number */
  retryAttempt?: number;
}

/**
 * LLM stream configuration
 */
export interface LLMStreamConfig {
  /** Include token-by-token streaming */
  includeTokens?: boolean;
  /** Include tool calls */
  includeToolCalls?: boolean;
  /** Include usage statistics */
  includeUsage?: boolean;
  /** Token buffer size */
  tokenBufferSize?: number;
}

/**
 * LLM Stream
 *
 * Streams LLM response events to SSE clients.
 *
 * Example:
 * ```ts
 * const llmStream = new LLMStream(sseServer);
 * llmStream.start();
 *
 * llmStream.emitRequestStarted('req-123', {
 *   provider: 'anthropic',
 *   model: 'claude-3-opus',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 *
 * llmStream.emitToken('req-123', { token: 'Hello', index: 0 });
 * llmStream.emitToken('req-123', { token: ' there!', index: 1, isFinal: true });
 *
 * llmStream.emitRequestCompleted('req-123', {
 *   response: 'Hello there!',
 *   usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
 *   duration: 1200
 * });
 * ```
 */
export class LLMStream extends EventEmitter {
  private sseServer: SSEServer;
  private config: Required<LLMStreamConfig>;
  private requestStates: Map<string, Partial<LLMRequestCompleted>> = new Map();
  private tokenBuffers: Map<string, string[]> = new Map();

  constructor(sseServer: SSEServer, config: LLMStreamConfig = {}) {
    super();
    this.sseServer = sseServer;
    this.config = {
      includeTokens: config.includeTokens ?? true,
      includeToolCalls: config.includeToolCalls ?? true,
      includeUsage: config.includeUsage ?? true,
      tokenBufferSize: config.tokenBufferSize ?? 1000,
    };
  }

  /**
   * Start LLM stream
   */
  start(): void {
    this.emit('started');
  }

  /**
   * Stop LLM stream
   */
  stop(): void {
    this.requestStates.clear();
    this.tokenBuffers.clear();
    this.emit('stopped');
  }

  /**
   * Emit LLM request started event
   */
  emitRequestStarted(
    requestId: string,
    data: Omit<LLMRequestStarted, 'requestId' | 'timestamp'>
  ): void {
    const eventData: LLMRequestStarted = {
      requestId,
      timestamp: new Date(),
      ...data,
    };

    this.requestStates.set(requestId, {
      requestId,
      provider: data.provider,
      model: data.model,
      agentId: data.agentId,
      taskId: data.taskId,
      timestamp: eventData.timestamp,
    });

    this.sendEvent('llm:request:started', eventData);
    this.emit('requestStarted', eventData);
  }

  /**
   * Emit token chunk
   */
  emitToken(
    requestId: string,
    data: Omit<TokenChunk, 'requestId' | 'provider' | 'model' | 'timestamp'>
  ): void {
    if (!this.config.includeTokens) {
      return;
    }

    const state = this.requestStates.get(requestId);
    if (!state) {
      return;
    }

    const tokenData: TokenChunk = {
      requestId,
      provider: state.provider!,
      model: state.model!,
      agentId: state.agentId,
      taskId: state.taskId,
      timestamp: new Date(),
      ...data,
    };

    // Buffer tokens
    const buffer = this.tokenBuffers.get(requestId) || [];
    buffer.push(data.token);
    if (buffer.length > this.config.tokenBufferSize) {
      buffer.shift();
    }
    this.tokenBuffers.set(requestId, buffer);

    this.sendEvent('llm:token', tokenData);
    this.emit('token', tokenData);
  }

  /**
   * Emit tool call event
   */
  emitToolCall(
    requestId: string,
    data: Omit<ToolCall, 'requestId' | 'provider' | 'model' | 'timestamp'>
  ): void {
    if (!this.config.includeToolCalls) {
      return;
    }

    const state = this.requestStates.get(requestId);
    if (!state) {
      return;
    }

    const toolCallData: ToolCall = {
      requestId,
      provider: state.provider!,
      model: state.model!,
      agentId: state.agentId,
      taskId: state.taskId,
      timestamp: new Date(),
      ...data,
    };

    this.sendEvent('llm:tool:call', toolCallData);
    this.emit('toolCall', toolCallData);
  }

  /**
   * Emit tool result event
   */
  emitToolResult(
    requestId: string,
    data: Omit<ToolResult, 'requestId' | 'provider' | 'model' | 'timestamp'>
  ): void {
    if (!this.config.includeToolCalls) {
      return;
    }

    const state = this.requestStates.get(requestId);
    if (!state) {
      return;
    }

    const toolResultData: ToolResult = {
      requestId,
      provider: state.provider!,
      model: state.model!,
      agentId: state.agentId,
      taskId: state.taskId,
      timestamp: new Date(),
      ...data,
    };

    this.sendEvent('llm:tool:result', toolResultData);
    this.emit('toolResult', toolResultData);
  }

  /**
   * Emit usage statistics
   */
  emitUsage(requestId: string, usage: UsageStats): void {
    if (!this.config.includeUsage) {
      return;
    }

    const state = this.requestStates.get(requestId);
    if (!state) {
      return;
    }

    this.sendEvent('llm:usage', {
      requestId,
      provider: state.provider,
      model: state.model,
      agentId: state.agentId,
      taskId: state.taskId,
      usage,
      timestamp: new Date(),
    });

    this.emit('usage', { requestId, usage });
  }

  /**
   * Emit request completed event
   */
  emitRequestCompleted(
    requestId: string,
    data: Omit<LLMRequestCompleted, 'requestId' | 'provider' | 'model' | 'timestamp'>
  ): void {
    const state = this.requestStates.get(requestId);
    if (!state) {
      return;
    }

    const eventData: LLMRequestCompleted = {
      requestId,
      provider: state.provider!,
      model: state.model!,
      agentId: state.agentId,
      taskId: state.taskId,
      timestamp: new Date(),
      ...data,
    };

    this.sendEvent('llm:request:completed', eventData);
    this.emit('requestCompleted', eventData);

    // Cleanup
    this.requestStates.delete(requestId);
    this.tokenBuffers.delete(requestId);
  }

  /**
   * Emit request error event
   */
  emitRequestError(
    requestId: string,
    data: Omit<LLMRequestError, 'requestId' | 'provider' | 'model' | 'timestamp'>
  ): void {
    const state = this.requestStates.get(requestId);
    if (!state) {
      return;
    }

    const eventData: LLMRequestError = {
      requestId,
      provider: state.provider!,
      model: state.model!,
      agentId: state.agentId,
      taskId: state.taskId,
      timestamp: new Date(),
      ...data,
    };

    this.sendEvent('llm:request:error', eventData);
    this.emit('requestError', eventData);

    // Cleanup only if not retrying
    if (!data.willRetry) {
      this.requestStates.delete(requestId);
      this.tokenBuffers.delete(requestId);
    }
  }

  /**
   * Send event to SSE server
   */
  private sendEvent(eventType: string, data: unknown): void {
    const event: SSEEvent = {
      event: eventType,
      data,
      id: `${eventType}-${Date.now()}`,
    };

    this.sseServer.broadcast(event);
  }

  /**
   * Get request state
   */
  getRequestState(requestId: string): Partial<LLMRequestCompleted> | undefined {
    return this.requestStates.get(requestId);
  }

  /**
   * Get token buffer
   */
  getTokenBuffer(requestId: string): string[] {
    return this.tokenBuffers.get(requestId) || [];
  }

  /**
   * Get full response from buffer
   */
  getFullResponse(requestId: string): string {
    return this.getTokenBuffer(requestId).join('');
  }

  /**
   * Clear request state
   */
  clearRequestState(requestId: string): void {
    this.requestStates.delete(requestId);
    this.tokenBuffers.delete(requestId);
  }
}
