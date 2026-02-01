/**
 * V3 Qwen-Agent Provider
 *
 * Supports Qwen 2.5 models (7B, 14B, 72B) via:
 * - Local deployment (Ollama, vLLM)
 * - DashScope API (Alibaba Cloud)
 *
 * Features:
 * - OpenAI-compatible API
 * - Function calling support
 * - Streaming support
 * - Cost-effective local inference
 *
 * @module @claude-flow/providers/qwen-provider
 */

import { BaseProvider, BaseProviderOptions } from './base-provider.js';
import {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  ProviderCapabilities,
  HealthCheckResult,
  ProviderUnavailableError,
  LLMProviderError,
} from './types.js';
import type {
  QwenConfig,
  QwenMessage,
  QwenResponse,
  QwenGenerateOptions,
  QwenTool,
  QwenToolCall,
  QwenListResponse,
  QwenStreamChunk,
} from './qwen-types.js';

interface QwenRequest {
  model: string;
  messages: QwenMessage[];
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
    stop?: string[];
  };
  stream?: boolean;
  tools?: QwenTool[];
}

export class QwenProvider extends BaseProvider {
  readonly name: LLMProvider = 'qwen';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      'qwen2.5:7b',
      'qwen2.5:14b',
      'qwen2.5:72b',
      'qwen2.5-coder:7b',
      'qwen2.5-coder:14b',
      'qwen2.5-coder:32b',
    ],
    maxContextLength: {
      'qwen2.5:7b': 32768,
      'qwen2.5:14b': 32768,
      'qwen2.5:72b': 32768,
      'qwen2.5-coder:7b': 32768,
      'qwen2.5-coder:14b': 32768,
      'qwen2.5-coder:32b': 32768,
    },
    maxOutputTokens: {
      'qwen2.5:7b': 8192,
      'qwen2.5:14b': 8192,
      'qwen2.5:72b': 8192,
      'qwen2.5-coder:7b': 8192,
      'qwen2.5-coder:14b': 8192,
      'qwen2.5-coder:32b': 8192,
    },
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsSystemMessages: true,
    supportsVision: false,
    supportsAudio: false,
    supportsFineTuning: false,
    supportsEmbeddings: true,
    supportsBatching: false,
    rateLimit: {
      requestsPerMinute: 10000, // Local - no rate limit
      tokensPerMinute: 10000000,
      concurrentRequests: 10,
    },
    // Local deployment is free
    pricing: {
      'qwen2.5:7b': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'qwen2.5:14b': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'qwen2.5:72b': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'qwen2.5-coder:7b': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'qwen2.5-coder:14b': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'qwen2.5-coder:32b': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
    },
  };

  private baseUrl: string = 'http://localhost:11434';
  private apiKey?: string;
  private useLocal: boolean = true;

  constructor(options: BaseProviderOptions) {
    super(options);
  }

  protected async doInitialize(): Promise<void> {
    const qwenConfig = this.config as QwenConfig;

    this.useLocal = qwenConfig.useLocal ?? true;
    this.apiKey = qwenConfig.apiKey;

    if (this.useLocal) {
      // Local deployment (Ollama/vLLM)
      const host = qwenConfig.host || 'http://localhost';
      const port = qwenConfig.port || 11434;
      this.baseUrl = `${host}:${port}`;
    } else {
      // DashScope API
      this.baseUrl = 'https://dashscope.aliyuncs.com/api/v1';
      if (!this.apiKey) {
        this.logger.warn('DashScope API key not provided. Set apiKey in config.');
      }
    }

    // Check if Qwen server is running
    const health = await this.doHealthCheck();
    if (!health.healthy) {
      this.logger.warn('Qwen server not detected. Ensure server is running.');
    }
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    const qwenRequest = this.buildRequest(request);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 120000);

    try {
      const endpoint = this.useLocal ? '/api/chat' : '/services/aigc/text-generation/generation';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (!this.useLocal && this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(qwenRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json() as QwenResponse;
      return this.transformResponse(data, request);
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    }
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const qwenRequest = this.buildRequest(request, true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (this.config.timeout || 120000) * 2);

    try {
      const endpoint = this.useLocal ? '/api/chat' : '/services/aigc/text-generation/generation';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (!this.useLocal && this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(qwenRequest),
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk: QwenStreamChunk = JSON.parse(line);

            if (chunk.message?.content) {
              yield {
                type: 'content',
                delta: { content: chunk.message.content },
              };
            }

            if (chunk.done) {
              promptTokens = chunk.prompt_eval_count || 0;
              completionTokens = chunk.eval_count || 0;

              yield {
                type: 'done',
                usage: {
                  promptTokens,
                  completionTokens,
                  totalTokens: promptTokens + completionTokens,
                },
                cost: {
                  promptCost: 0,
                  completionCost: 0,
                  totalCost: 0,
                  currency: 'USD',
                },
              };
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels(): Promise<LLMModel[]> {
    try {
      const endpoint = this.useLocal ? '/api/tags' : '/models';
      const headers: Record<string, string> = {};

      if (!this.useLocal && this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, { headers });

      if (!response.ok) {
        return this.capabilities.supportedModels;
      }

      const data = await response.json() as QwenListResponse;
      return data.models?.map((m) => m.name as LLMModel) || this.capabilities.supportedModels;
    } catch {
      return this.capabilities.supportedModels;
    }
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    const descriptions: Record<string, string> = {
      'qwen2.5:7b': 'Qwen 2.5 7B - Fast and efficient',
      'qwen2.5:14b': 'Qwen 2.5 14B - Balanced performance',
      'qwen2.5:72b': 'Qwen 2.5 72B - Highest capability',
      'qwen2.5-coder:7b': 'Qwen 2.5 Coder 7B - Code specialist',
      'qwen2.5-coder:14b': 'Qwen 2.5 Coder 14B - Advanced coding',
      'qwen2.5-coder:32b': 'Qwen 2.5 Coder 32B - Expert coding',
    };

    return {
      model,
      name: model,
      description: descriptions[model] || 'Qwen 2.5 model',
      contextLength: this.capabilities.maxContextLength[model] || 32768,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 8192,
      supportedFeatures: ['chat', 'completion', 'tools', 'local'],
      pricing: { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      const endpoint = this.useLocal ? '/api/tags' : '/models';
      const headers: Record<string, string> = {};

      if (!this.useLocal && this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, { headers });

      return {
        healthy: response.ok,
        timestamp: new Date(),
        details: {
          server: 'qwen',
          local: this.useLocal,
          endpoint: this.baseUrl,
        },
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Qwen server not reachable',
        timestamp: new Date(),
        details: {
          hint: this.useLocal
            ? 'Ensure Qwen is running locally (Ollama/vLLM)'
            : 'Check DashScope API credentials',
        },
      };
    }
  }

  private buildRequest(request: LLMRequest, stream = false): QwenRequest {
    const qwenRequest: QwenRequest = {
      model: request.model || this.config.model,
      messages: request.messages.map((msg) => ({
        role: msg.role === 'tool' ? 'assistant' : msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })) as QwenMessage[],
      stream,
    };

    const options: QwenRequest['options'] = {};

    if (request.temperature !== undefined || this.config.temperature !== undefined) {
      options.temperature = request.temperature ?? this.config.temperature;
    }
    if (request.topP !== undefined || this.config.topP !== undefined) {
      options.top_p = request.topP ?? this.config.topP;
    }
    if (request.topK !== undefined || this.config.topK !== undefined) {
      options.top_k = request.topK ?? this.config.topK;
    }
    if (request.maxTokens || this.config.maxTokens) {
      options.max_tokens = request.maxTokens || this.config.maxTokens;
    }
    if (request.stopSequences || this.config.stopSequences) {
      options.stop = request.stopSequences || this.config.stopSequences;
    }

    if (Object.keys(options).length > 0) {
      qwenRequest.options = options;
    }

    if (request.tools) {
      qwenRequest.tools = request.tools as QwenTool[];
    }

    return qwenRequest;
  }

  private transformResponse(data: QwenResponse, request: LLMRequest): LLMResponse {
    const model = request.model || this.config.model;

    const promptTokens = data.prompt_eval_count || 0;
    const completionTokens = data.eval_count || 0;

    const toolCalls = data.message.tool_calls?.map((tc) => ({
      id: tc.id || `tool_${Date.now()}`,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments),
      },
    }));

    return {
      id: data.id || `qwen-${Date.now()}`,
      model: model as LLMModel,
      provider: 'qwen',
      content: data.message.content,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      cost: {
        promptCost: 0,
        completionCost: 0,
        totalCost: 0,
        currency: 'USD',
      },
      finishReason: data.done ? 'stop' : 'length',
      latency: data.total_duration ? data.total_duration / 1e6 : undefined, // Convert ns to ms
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text();
    let errorData: { error?: string };

    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }

    const message = errorData.error || 'Unknown error';

    if (response.status === 0 || message.includes('connection')) {
      throw new ProviderUnavailableError('qwen', {
        message,
        hint: this.useLocal
          ? 'Ensure Qwen is running locally (Ollama/vLLM)'
          : 'Check DashScope API status',
      });
    }

    throw new LLMProviderError(
      message,
      `QWEN_${response.status}`,
      'qwen',
      response.status,
      true,
      errorData
    );
  }

  // ===== WP08 CONVENIENCE METHODS =====

  /**
   * Generate text from a prompt (convenience method for simple completion)
   */
  async generate(prompt: string, options?: QwenGenerateOptions): Promise<LLMResponse> {
    return this.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    });
  }

  /**
   * Chat with the model (convenience method wrapping complete)
   */
  async chat(messages: QwenMessage[], options?: Omit<LLMRequest, 'messages'>): Promise<LLMResponse> {
    return this.complete({
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      ...options,
    });
  }

  /**
   * Chat with tools/function calling support
   */
  async chatWithTools(
    messages: QwenMessage[],
    tools: QwenTool[],
    options?: Omit<LLMRequest, 'messages' | 'tools'>
  ): Promise<LLMResponse> {
    return this.complete({
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      tools: tools as any,
      ...options,
    });
  }

  /**
   * Generate embeddings for text (local models only)
   */
  async embed(text: string | string[]): Promise<number[] | number[][]> {
    if (!this.useLocal) {
      throw new LLMProviderError(
        'Embeddings not supported with DashScope API',
        'EMBEDDINGS_NOT_SUPPORTED',
        'qwen',
        undefined,
        false
      );
    }

    const texts = Array.isArray(text) ? text : [text];
    const embeddings: number[][] = [];

    for (const t of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: t,
        }),
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as { embedding: number[] };
      embeddings.push(data.embedding);
    }

    return Array.isArray(text) ? embeddings : embeddings[0];
  }

  /**
   * Pull a model from the Ollama library (local only)
   */
  async pullModel(name: string): Promise<void> {
    if (!this.useLocal) {
      throw new LLMProviderError(
        'Model pulling only supported for local deployment',
        'PULL_NOT_SUPPORTED',
        'qwen',
        undefined,
        false
      );
    }

    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: false }),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }
  }

  /**
   * Public health check method (alias for healthCheck)
   */
  async checkHealth(): Promise<HealthCheckResult> {
    return this.healthCheck();
  }
}
