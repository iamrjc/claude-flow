/**
 * V3 OpenRouter Provider
 *
 * Provides unified access to 100+ AI models through OpenRouter's API.
 * Supports model routing, cost tracking, and fallback strategies.
 *
 * @module @claude-flow/providers/openrouter-provider
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
  AuthenticationError,
  RateLimitError,
  LLMProviderError,
  ModelNotFoundError,
  CostEstimate,
} from './types.js';
import {
  OpenRouterConfig,
  OpenRouterModel,
  OpenRouterRequest,
  OpenRouterResponse,
  OpenRouterStreamChunk,
  OpenRouterError,
  OpenRouterModelListResponse,
  CostInfo,
} from './openrouter-types.js';

export class OpenRouterProvider extends BaseProvider {
  readonly name: LLMProvider = 'openrouter';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      // Anthropic models
      'anthropic/claude-3-opus',
      'anthropic/claude-3-sonnet',
      'anthropic/claude-3-haiku',
      'anthropic/claude-3.5-sonnet',
      // OpenAI models
      'openai/gpt-4-turbo',
      'openai/gpt-4',
      'openai/gpt-3.5-turbo',
      'openai/gpt-4o',
      'openai/o1-preview',
      'openai/o1-mini',
      // Google models
      'google/gemini-pro',
      'google/gemini-pro-vision',
      'google/gemini-1.5-pro',
      'google/gemini-2.0-flash-exp',
      // Meta models
      'meta-llama/llama-3.1-70b-instruct',
      'meta-llama/llama-3.1-405b-instruct',
      // Mistral models
      'mistralai/mistral-large',
      'mistralai/mistral-medium',
      // Others
      'cohere/command-r-plus',
      'perplexity/llama-3.1-sonar-large-128k-online',
    ],
    maxContextLength: {
      'anthropic/claude-3-opus': 200000,
      'anthropic/claude-3.5-sonnet': 200000,
      'openai/gpt-4-turbo': 128000,
      'openai/gpt-4o': 128000,
      'google/gemini-1.5-pro': 2000000,
      'meta-llama/llama-3.1-405b-instruct': 128000,
    },
    maxOutputTokens: {
      'anthropic/claude-3-opus': 4096,
      'openai/gpt-4-turbo': 4096,
      'google/gemini-1.5-pro': 8192,
    },
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsSystemMessages: true,
    supportsVision: true,
    supportsAudio: false,
    supportsFineTuning: false,
    supportsEmbeddings: false,
    supportsBatching: false,
    rateLimit: {
      requestsPerMinute: 200,
      tokensPerMinute: 1000000,
      concurrentRequests: 50,
    },
    pricing: {
      'anthropic/claude-3-opus': {
        promptCostPer1k: 0.015,
        completionCostPer1k: 0.075,
        currency: 'USD',
      },
      'anthropic/claude-3.5-sonnet': {
        promptCostPer1k: 0.003,
        completionCostPer1k: 0.015,
        currency: 'USD',
      },
      'openai/gpt-4-turbo': {
        promptCostPer1k: 0.01,
        completionCostPer1k: 0.03,
        currency: 'USD',
      },
      'openai/gpt-4o': {
        promptCostPer1k: 0.005,
        completionCostPer1k: 0.015,
        currency: 'USD',
      },
      'google/gemini-1.5-pro': {
        promptCostPer1k: 0.00125,
        completionCostPer1k: 0.005,
        currency: 'USD',
      },
    },
  };

  private baseUrl: string;
  private apiKey: string;
  private openRouterConfig: OpenRouterConfig;
  private modelCache: Map<string, OpenRouterModel> = new Map();
  private costTracker: Map<string, CostInfo> = new Map();
  private rateLimitRemaining: number = 0;
  private rateLimitReset?: Date;

  constructor(options: BaseProviderOptions & { openRouterConfig?: OpenRouterConfig }) {
    super(options);

    this.openRouterConfig = options.openRouterConfig || (this.config as OpenRouterConfig);
    this.apiKey = this.openRouterConfig.apiKey || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = this.openRouterConfig.baseUrl || 'https://openrouter.ai/api/v1';
  }

  protected async doInitialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AuthenticationError('API key is required', 'openrouter');
    }

    this.logger.info('OpenRouter provider initialized', {
      model: this.config.model,
      baseUrl: this.baseUrl,
      siteUrl: this.openRouterConfig.siteUrl,
    });
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    const openRouterRequest = this.buildRequest(request);
    const url = `${this.baseUrl}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.openRouterConfig.timeout || 60000
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(openRouterRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Update rate limit info from headers
      this.updateRateLimitInfo(response);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as OpenRouterResponse;
      const result = this.transformResponse(data, request);

      // Track cost
      this.trackCost(result.model, result.cost);

      return result;
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    }
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const openRouterRequest = this.buildRequest(request);
    openRouterRequest.stream = true;
    const url = `${this.baseUrl}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      (this.openRouterConfig.timeout || 60000) * 2
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(openRouterRequest),
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalTokens = 0;
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (!data || data === '[DONE]') continue;

            try {
              const chunk: OpenRouterStreamChunk = JSON.parse(data);
              const choice = chunk.choices?.[0];

              if (choice?.delta?.content) {
                yield {
                  type: 'content',
                  delta: { content: choice.delta.content },
                };
              }

              if (choice?.delta?.tool_calls) {
                for (const toolCall of choice.delta.tool_calls) {
                  yield {
                    type: 'tool_call',
                    delta: {
                      toolCall: {
                        id: toolCall.id,
                        type: 'function',
                        function: {
                          name: toolCall.function?.name || '',
                          arguments: toolCall.function?.arguments || '',
                        },
                      },
                    },
                  };
                }
              }

              if (chunk.usage) {
                promptTokens = chunk.usage.prompt_tokens;
                completionTokens = chunk.usage.completion_tokens;
                totalTokens = chunk.usage.total_tokens;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Calculate cost
      const model = request.model || this.config.model;
      const pricing = this.capabilities.pricing[model] || {
        promptCostPer1k: 0,
        completionCostPer1k: 0,
        currency: 'USD',
      };

      const promptCost = (promptTokens / 1000) * pricing.promptCostPer1k;
      const completionCost = (completionTokens / 1000) * pricing.completionCostPer1k;

      yield {
        type: 'done',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        cost: {
          promptCost,
          completionCost,
          totalCost: promptCost + completionCost,
          currency: 'USD',
        },
      };
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels(): Promise<LLMModel[]> {
    try {
      const url = `${this.baseUrl}/models`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        return this.capabilities.supportedModels;
      }

      const data = (await response.json()) as OpenRouterModelListResponse;
      const models = data.data.map((m) => m.id as LLMModel);

      // Cache model info
      for (const model of data.data) {
        this.modelCache.set(model.id, model);
      }

      return models.length > 0 ? models : this.capabilities.supportedModels;
    } catch {
      return this.capabilities.supportedModels;
    }
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    // Check cache first
    if (this.modelCache.has(model)) {
      const cached = this.modelCache.get(model)!;
      return {
        model,
        name: cached.name,
        description: cached.description,
        contextLength: cached.contextLength,
        maxOutputTokens: cached.topProvider.maxCompletionTokens,
        supportedFeatures: ['chat', 'completion'],
        pricing: {
          promptCostPer1k: cached.pricing.prompt * 1000,
          completionCostPer1k: cached.pricing.completion * 1000,
          currency: 'USD',
        },
      };
    }

    // Fallback to static info
    return {
      model,
      name: model,
      description: `OpenRouter model: ${model}`,
      contextLength: this.capabilities.maxContextLength[model] || 128000,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 4096,
      supportedFeatures: ['chat', 'completion'],
      pricing: this.capabilities.pricing[model],
    };
  }

  validateModel(model: LLMModel): boolean {
    // OpenRouter supports many models, be more permissive
    return (
      this.capabilities.supportedModels.includes(model) ||
      model.includes('/') // Model format: provider/model-name
    );
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      const url = `${this.baseUrl}/models`;
      const startTime = Date.now();
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      const latency = Date.now() - startTime;

      // Update rate limit info from health check
      this.updateRateLimitInfo(response);

      return {
        healthy: response.ok,
        latency,
        timestamp: new Date(),
        details: {
          rateLimitRemaining: this.rateLimitRemaining,
          rateLimitReset: this.rateLimitReset,
        },
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  async estimateCost(request: LLMRequest): Promise<CostEstimate> {
    const model = request.model || this.config.model;

    // Try to get pricing from cache
    let pricing = this.capabilities.pricing[model];

    if (!pricing && this.modelCache.has(model)) {
      const cached = this.modelCache.get(model)!;
      pricing = {
        promptCostPer1k: cached.pricing.prompt * 1000,
        completionCostPer1k: cached.pricing.completion * 1000,
        currency: 'USD',
      };
    }

    if (!pricing) {
      // Default fallback pricing
      pricing = {
        promptCostPer1k: 0.001,
        completionCostPer1k: 0.002,
        currency: 'USD',
      };
    }

    const promptTokens = this.estimateTokens(JSON.stringify(request.messages));
    const completionTokens = request.maxTokens || this.config.maxTokens || 1000;

    const promptCost = (promptTokens / 1000) * pricing.promptCostPer1k;
    const completionCost = (completionTokens / 1000) * pricing.completionCostPer1k;

    return {
      estimatedPromptTokens: promptTokens,
      estimatedCompletionTokens: completionTokens,
      estimatedTotalTokens: promptTokens + completionTokens,
      estimatedCost: {
        prompt: promptCost,
        completion: completionCost,
        total: promptCost + completionCost,
        currency: pricing.currency,
      },
      confidence: 0.8,
    };
  }

  /**
   * Get usage information for a specific model
   */
  getModelCost(model: string): CostInfo | undefined {
    return this.costTracker.get(model);
  }

  /**
   * Get all tracked costs
   */
  getAllCosts(): CostInfo[] {
    return Array.from(this.costTracker.values());
  }

  // ===== PRIVATE METHODS =====

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (this.openRouterConfig.siteUrl) {
      headers['HTTP-Referer'] = this.openRouterConfig.siteUrl;
    }

    if (this.openRouterConfig.siteName) {
      headers['X-Title'] = this.openRouterConfig.siteName;
    }

    return headers;
  }

  private buildRequest(request: LLMRequest): OpenRouterRequest {
    const messages = request.messages.map((msg) => ({
      role: msg.role,
      content:
        typeof msg.content === 'string'
          ? msg.content
          : msg.content.map((part) => {
              if (part.type === 'text') {
                return { type: 'text', text: part.text };
              } else if (part.type === 'image') {
                return {
                  type: 'image_url',
                  image_url: part.imageUrl || `data:image/jpeg;base64,${part.imageBase64}`,
                };
              }
              return { type: 'text', text: JSON.stringify(part) };
            }),
    }));

    const openRouterRequest: OpenRouterRequest = {
      model: request.model || this.config.model,
      messages,
    };

    if (request.temperature !== undefined || this.config.temperature !== undefined) {
      openRouterRequest.temperature = request.temperature ?? this.config.temperature;
    }

    if (request.maxTokens || this.config.maxTokens) {
      openRouterRequest.max_tokens = request.maxTokens || this.config.maxTokens;
    }

    if (request.topP !== undefined || this.config.topP !== undefined) {
      openRouterRequest.top_p = request.topP ?? this.config.topP;
    }

    if (request.frequencyPenalty !== undefined || this.config.frequencyPenalty !== undefined) {
      openRouterRequest.frequency_penalty =
        request.frequencyPenalty ?? this.config.frequencyPenalty;
    }

    if (request.presencePenalty !== undefined || this.config.presencePenalty !== undefined) {
      openRouterRequest.presence_penalty = request.presencePenalty ?? this.config.presencePenalty;
    }

    if (request.stopSequences || this.config.stopSequences) {
      openRouterRequest.stop = request.stopSequences || this.config.stopSequences;
    }

    if (request.tools) {
      openRouterRequest.tools = request.tools.map((tool) => ({
        type: tool.type,
        function: tool.function,
      }));
    }

    if (request.toolChoice) {
      if (typeof request.toolChoice === 'string') {
        openRouterRequest.tool_choice = request.toolChoice;
      } else {
        openRouterRequest.tool_choice = request.toolChoice;
      }
    }

    // Add fallback configuration if specified
    if (this.openRouterConfig.fallbackModels && this.openRouterConfig.fallbackModels.length > 0) {
      openRouterRequest.provider = {
        order: [request.model || this.config.model, ...this.openRouterConfig.fallbackModels],
        allow_fallbacks: true,
      };
    }

    return openRouterRequest;
  }

  private transformResponse(data: OpenRouterResponse, request: LLMRequest): LLMResponse {
    const choice = data.choices[0];
    const model = request.model || this.config.model;
    const pricing = this.capabilities.pricing[model] || {
      promptCostPer1k: 0,
      completionCostPer1k: 0,
      currency: 'USD',
    };

    const promptTokens = data.usage.prompt_tokens;
    const completionTokens = data.usage.completion_tokens;
    const totalTokens = data.usage.total_tokens;

    const promptCost = (promptTokens / 1000) * pricing.promptCostPer1k;
    const completionCost = (completionTokens / 1000) * pricing.completionCostPer1k;

    // Transform tool calls to match LLMToolCall type
    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    return {
      id: data.id,
      model: data.model as LLMModel,
      provider: 'openrouter',
      content: choice.message.content || '',
      toolCalls,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      cost: {
        promptCost,
        completionCost,
        totalCost: promptCost + completionCost,
        currency: 'USD',
      },
      finishReason: choice.finish_reason as 'stop' | 'length' | 'tool_calls' | 'content_filter',
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text();
    let errorData: OpenRouterError;

    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: { message: errorText } };
    }

    const message = errorData.error?.message || 'Unknown error';

    switch (response.status) {
      case 401:
      case 403:
        throw new AuthenticationError(message, 'openrouter', errorData);
      case 429:
        const retryAfter = response.headers.get('retry-after');
        throw new RateLimitError(
          message,
          'openrouter',
          retryAfter ? parseInt(retryAfter) : undefined,
          errorData
        );
      case 404:
        throw new ModelNotFoundError(this.config.model, 'openrouter', errorData);
      case 503:
        throw new LLMProviderError(
          'OpenRouter service unavailable',
          'SERVICE_UNAVAILABLE',
          'openrouter',
          503,
          true,
          errorData
        );
      default:
        throw new LLMProviderError(
          message,
          `OPENROUTER_${response.status}`,
          'openrouter',
          response.status,
          response.status >= 500,
          errorData
        );
    }
  }

  private updateRateLimitInfo(response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');

    if (remaining) {
      this.rateLimitRemaining = parseInt(remaining);
    }

    if (reset) {
      this.rateLimitReset = new Date(parseInt(reset) * 1000);
    }
  }

  protected getRateLimitRemaining(): number | undefined {
    return this.rateLimitRemaining;
  }

  protected getRateLimitReset(): Date | undefined {
    return this.rateLimitReset;
  }

  private trackCost(model: string, cost?: LLMResponse['cost']): void {
    if (!cost) return;

    const existing = this.costTracker.get(model);
    if (existing) {
      existing.promptCost += cost.promptCost;
      existing.completionCost += cost.completionCost;
    } else {
      this.costTracker.set(model, {
        model,
        promptCost: cost.promptCost,
        completionCost: cost.completionCost,
        currency: cost.currency,
      });
    }
  }
}
