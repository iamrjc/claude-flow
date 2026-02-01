/**
 * V3 vLLM Provider (OpenAI-Compatible API)
 *
 * Supports vLLM inference server with OpenAI-compatible endpoints.
 * Optimized for high-throughput serving of open models.
 *
 * @module @claude-flow/providers/vllm-provider
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
  VLLMConfig,
  VLLMModelInfo,
  VLLMGenerateOptions,
  VLLMCompletionResponse,
  VLLMListModelsResponse,
} from './vllm-types.js';

interface VLLMChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  n?: number;
  logprobs?: number;
  user?: string;
}

export class VLLMProvider extends BaseProvider {
  readonly name: LLMProvider = 'custom';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: ['custom-model'], // Dynamic based on vLLM server
    maxContextLength: {
      'custom-model': 32768, // Default, will be updated based on model
    },
    maxOutputTokens: {
      'custom-model': 8192,
    },
    supportsStreaming: true,
    supportsToolCalling: false, // vLLM basic support, can be enabled for specific models
    supportsSystemMessages: true,
    supportsVision: false, // Depends on model
    supportsAudio: false,
    supportsFineTuning: false,
    supportsEmbeddings: true, // vLLM supports embeddings endpoint
    supportsBatching: true,
    rateLimit: {
      requestsPerMinute: 10000, // Local deployment - high limits
      tokensPerMinute: 10000000,
      concurrentRequests: 100,
    },
    // All free - self-hosted
    pricing: {
      'custom-model': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
    },
  };

  private baseUrl: string = 'http://localhost:8000';
  private modelName: string = 'custom-model';

  constructor(options: BaseProviderOptions) {
    super(options);
  }

  protected async doInitialize(): Promise<void> {
    const host = this.config.apiUrl || 'http://localhost:8000';
    const vllmConfig = this.config.providerOptions as VLLMConfig | undefined;

    // Support both apiUrl and host/port configuration
    if (vllmConfig?.host) {
      const port = vllmConfig.port || 8000;
      this.baseUrl = `${vllmConfig.host}:${port}`;
    } else {
      this.baseUrl = host;
    }

    // Get model name from config
    this.modelName = this.config.model || vllmConfig?.model || 'custom-model';

    // Check if vLLM server is running
    const health = await this.doHealthCheck();
    if (!health.healthy) {
      this.logger.warn('vLLM server not detected. Ensure vLLM is running and accessible.');
    } else {
      // Try to fetch available models to update capabilities
      try {
        const models = await this.listModels();
        if (models.length > 0) {
          this.capabilities.supportedModels = models;
        }
      } catch (error) {
        this.logger.warn('Could not fetch models from vLLM server', { error });
      }
    }
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    const vllmRequest = this.buildChatRequest(request);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 120000);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify(vllmRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as VLLMCompletionResponse;
      return this.transformResponse(data, request);
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    }
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const vllmRequest = this.buildChatRequest(request, true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (this.config.timeout || 120000) * 2);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify(vllmRequest),
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
          if (!line.trim() || line.trim() === 'data: [DONE]') continue;
          if (!line.startsWith('data: ')) continue;

          try {
            const jsonStr = line.slice(6); // Remove 'data: ' prefix
            const chunk: VLLMCompletionResponse = JSON.parse(jsonStr);

            const choice = chunk.choices?.[0];
            if (choice?.message?.content || choice?.text) {
              const content = choice.message?.content || choice.text || '';
              if (content) {
                yield {
                  type: 'content',
                  delta: { content },
                };
              }
            }

            // Update token counts if available
            if (chunk.usage) {
              promptTokens = chunk.usage.prompt_tokens;
              completionTokens = chunk.usage.completion_tokens;
            }

            // Check for finish
            if (choice?.finish_reason) {
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
          } catch (parseError) {
            // Ignore parse errors for malformed chunks
            this.logger.debug('Failed to parse streaming chunk', { parseError });
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
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
      });

      if (!response.ok) {
        return this.capabilities.supportedModels;
      }

      const data = (await response.json()) as VLLMListModelsResponse;
      const models = data.data?.map((m) => m.id as LLMModel) || [];
      return models.length > 0 ? models : this.capabilities.supportedModels;
    } catch {
      return this.capabilities.supportedModels;
    }
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models/${model}`, {
        headers: {
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
      });

      if (response.ok) {
        const data = (await response.json()) as VLLMModelInfo;
        return {
          model,
          name: data.id,
          description: `vLLM model: ${data.id}`,
          contextLength: this.capabilities.maxContextLength[model] || 32768,
          maxOutputTokens: this.capabilities.maxOutputTokens[model] || 8192,
          supportedFeatures: ['chat', 'completion', 'local'],
          pricing: { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
        };
      }
    } catch (error) {
      this.logger.debug('Could not fetch model info', { model, error });
    }

    // Fallback to default info
    return {
      model,
      name: model,
      description: `vLLM hosted model: ${model}`,
      contextLength: this.capabilities.maxContextLength[model] || 32768,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 8192,
      supportedFeatures: ['chat', 'completion', 'local'],
      pricing: { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      // vLLM typically has a /health endpoint
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: {
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
      });

      return {
        healthy: response.ok,
        timestamp: new Date(),
        details: {
          server: 'vllm',
          local: this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1'),
        },
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'vLLM server not reachable',
        timestamp: new Date(),
        details: {
          hint: 'Ensure vLLM server is running and accessible',
        },
      };
    }
  }

  private buildChatRequest(request: LLMRequest, stream = false): VLLMChatRequest {
    const vllmRequest: VLLMChatRequest = {
      model: request.model || this.modelName,
      messages: request.messages.map((msg) => ({
        role: msg.role === 'tool' ? 'assistant' : msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })),
      stream,
    };

    // Add optional parameters
    if (request.temperature !== undefined || this.config.temperature !== undefined) {
      vllmRequest.temperature = request.temperature ?? this.config.temperature;
    }
    if (request.maxTokens || this.config.maxTokens) {
      vllmRequest.max_tokens = request.maxTokens || this.config.maxTokens;
    }
    if (request.topP !== undefined || this.config.topP !== undefined) {
      vllmRequest.top_p = request.topP ?? this.config.topP;
    }
    if (request.topK !== undefined || this.config.topK !== undefined) {
      vllmRequest.top_k = request.topK ?? this.config.topK;
    }
    if (request.frequencyPenalty !== undefined || this.config.frequencyPenalty !== undefined) {
      vllmRequest.frequency_penalty = request.frequencyPenalty ?? this.config.frequencyPenalty;
    }
    if (request.presencePenalty !== undefined || this.config.presencePenalty !== undefined) {
      vllmRequest.presence_penalty = request.presencePenalty ?? this.config.presencePenalty;
    }
    if (request.stopSequences || this.config.stopSequences) {
      vllmRequest.stop = request.stopSequences || this.config.stopSequences;
    }

    return vllmRequest;
  }

  private transformResponse(data: VLLMCompletionResponse, request: LLMRequest): LLMResponse {
    const model = request.model || this.modelName;
    const choice = data.choices?.[0];

    const content = choice?.message?.content || choice?.text || '';
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;

    return {
      id: data.id || `vllm-${Date.now()}`,
      model: model as LLMModel,
      provider: 'custom',
      content,
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
      finishReason: choice?.finish_reason === 'stop' ? 'stop' : 'length',
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text();
    let errorData: { error?: { message?: string }; message?: string };

    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }

    const message = errorData.error?.message || errorData.message || 'Unknown error';

    if (response.status === 0 || message.toLowerCase().includes('connection')) {
      throw new ProviderUnavailableError('vllm', {
        message,
        hint: 'Ensure vLLM server is running and accessible',
      });
    }

    throw new LLMProviderError(
      message,
      `VLLM_${response.status}`,
      'custom',
      response.status,
      true,
      errorData
    );
  }

  // ===== CONVENIENCE METHODS =====

  /**
   * Generate text from a prompt (convenience method for simple completion)
   */
  async generate(prompt: string, options?: VLLMGenerateOptions): Promise<LLMResponse> {
    return this.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      topP: options?.topP,
      topK: options?.topK,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      stopSequences: options?.stopSequences,
      stream: options?.stream,
    });
  }

  /**
   * Chat with the model (convenience method wrapping complete)
   */
  async chat(
    messages: LLMRequest['messages'],
    options?: Omit<LLMRequest, 'messages'>
  ): Promise<LLMResponse> {
    return this.complete({
      messages,
      ...options,
    });
  }

  /**
   * Public health check method (alias for healthCheck)
   */
  async checkHealth(): Promise<HealthCheckResult> {
    return this.healthCheck();
  }
}
