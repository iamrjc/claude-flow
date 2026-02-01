/**
 * V3 LiteLLM Provider
 *
 * Supports 100+ LLMs through LiteLLM unified interface with:
 * - Self-hosted and hosted proxy support
 * - Model prefix routing (e.g., 'anthropic/claude-3-opus')
 * - Fallback chains for reliability
 * - Budget limits and spend tracking
 * - Cache support for repeated queries
 *
 * @module @claude-flow/providers/litellm-provider
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
} from './types.js';
import {
  LiteLLMConfig,
  LiteLLMRequest,
  LiteLLMResponse,
  LiteLLMStreamChunk,
  LiteLLMError,
  LiteLLMModelListResponse,
  CacheEntry,
  FallbackResult,
  BudgetConfig,
} from './litellm-types.js';

export class LiteLLMProvider extends BaseProvider {
  readonly name: LLMProvider = 'litellm';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      // Anthropic
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      // OpenAI
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini',
      // Google
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      // Generic/custom
      'custom-model',
    ],
    maxContextLength: {
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-opus-20240229': 200000,
      'gpt-4o': 128000,
      'gpt-4-turbo': 128000,
      'gemini-1.5-pro': 2000000,
    },
    maxOutputTokens: {
      'claude-3-5-sonnet-20241022': 8192,
      'claude-3-opus-20240229': 4096,
      'gpt-4o': 4096,
      'gemini-1.5-pro': 8192,
    },
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsSystemMessages: true,
    supportsVision: true,
    supportsAudio: false,
    supportsFineTuning: false,
    supportsEmbeddings: false,
    supportsBatching: true,
    rateLimit: {
      requestsPerMinute: 100,
      tokensPerMinute: 100000,
      concurrentRequests: 10,
    },
    pricing: {
      'claude-3-5-sonnet-20241022': {
        promptCostPer1k: 0.003,
        completionCostPer1k: 0.015,
        currency: 'USD',
      },
      'claude-3-opus-20240229': {
        promptCostPer1k: 0.015,
        completionCostPer1k: 0.075,
        currency: 'USD',
      },
      'gpt-4o': {
        promptCostPer1k: 0.005,
        completionCostPer1k: 0.015,
        currency: 'USD',
      },
      'gpt-4-turbo': {
        promptCostPer1k: 0.01,
        completionCostPer1k: 0.03,
        currency: 'USD',
      },
      'gemini-1.5-pro': {
        promptCostPer1k: 0.00125,
        completionCostPer1k: 0.005,
        currency: 'USD',
      },
    },
  };

  private baseUrl: string;
  private apiKey: string;
  private litellmConfig: LiteLLMConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private budget: BudgetConfig;

  constructor(options: BaseProviderOptions & { litellmConfig?: LiteLLMConfig }) {
    super(options);

    this.litellmConfig = options.litellmConfig || (this.config as LiteLLMConfig);

    // Determine base URL (self-hosted vs hosted)
    if (this.litellmConfig.proxy?.url) {
      this.baseUrl = this.litellmConfig.proxy.url;
      this.apiKey = this.litellmConfig.proxy.apiKey || this.config.apiKey || '';
    } else {
      this.baseUrl = this.config.apiUrl || 'https://api.litellm.ai';
      this.apiKey = this.config.apiKey || process.env.LITELLM_API_KEY || '';
    }

    // Initialize budget
    this.budget = this.initializeBudget();

    // Initialize cache if enabled
    if (this.litellmConfig.cacheConfig?.enabled) {
      this.startCacheCleanup();
    }
  }

  protected async doInitialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AuthenticationError('API key is required for LiteLLM', 'litellm');
    }

    this.logger.info('LiteLLM provider initialized', {
      model: this.config.model,
      baseUrl: this.baseUrl,
      proxy: !!this.litellmConfig.proxy,
      cacheEnabled: this.litellmConfig.cacheConfig?.enabled,
      fallbackChain: this.litellmConfig.fallbackChain,
    });
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    // Check cache first
    if (this.litellmConfig.cacheConfig?.enabled) {
      const cached = this.getCachedResponse(request);
      if (cached) {
        this.logger.debug('Cache hit', { model: request.model || this.config.model });
        return cached;
      }
    }

    // Check budget before making request
    this.checkBudget(request);

    // Try primary model first
    const primaryModel = request.model || this.config.model;
    let lastError: Error | undefined;

    try {
      const response = await this.makeRequest(primaryModel, request);

      // Update budget tracking
      if (response.cost && response.cost.totalCost !== undefined) {
        this.updateBudget(response.cost.totalCost);
      }

      // Cache the response
      if (this.litellmConfig.cacheConfig?.enabled) {
        this.cacheResponse(request, response);
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      this.logger.warn(`Primary model ${primaryModel} failed`, { error: lastError.message });
    }

    // Try fallback chain if configured
    if (this.litellmConfig.fallbackChain && this.litellmConfig.fallbackChain.length > 0) {
      const fallbackResult = await this.tryFallbackChain(request);
      if (fallbackResult.success && fallbackResult.response) {
        return fallbackResult.response as unknown as LLMResponse;
      }
    }

    // All attempts failed
    throw lastError || new LLMProviderError(
      'All model attempts failed',
      'ALL_MODELS_FAILED',
      'litellm',
      undefined,
      true
    );
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const model = this.resolveModel(request.model || this.config.model);
    const litellmRequest = this.buildRequest(request, model, true);
    const url = `${this.baseUrl}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.litellmConfig.proxy?.timeout || 120000
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(litellmRequest),
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
              const chunk: LiteLLMStreamChunk = JSON.parse(data);
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
            } catch (parseError) {
              this.logger.warn('Failed to parse stream chunk', { error: parseError });
            }
          }
        }
      }

      // Calculate cost
      const cost = this.calculateCost(model, promptTokens, completionTokens);

      // Update budget
      if (cost && cost.totalCost !== undefined) {
        this.updateBudget(cost.totalCost);
      }

      // Final event with usage
      yield {
        type: 'done',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        cost,
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
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        return this.capabilities.supportedModels;
      }

      const data = (await response.json()) as LiteLLMModelListResponse;
      const models = data.data.map((m) => m.id as LLMModel);

      return models.length > 0 ? models : this.capabilities.supportedModels;
    } catch (error) {
      this.logger.warn('Failed to list models, using defaults', { error });
      return this.capabilities.supportedModels;
    }
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    return {
      model,
      name: model,
      description: `LiteLLM model: ${model}`,
      contextLength: this.capabilities.maxContextLength[model] || 100000,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 4096,
      supportedFeatures: ['chat', 'completion', 'streaming', 'tool_calling'],
      pricing: this.capabilities.pricing[model],
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      const url = `${this.baseUrl}/health`;
      const response = await fetch(url, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      return {
        healthy: response.ok,
        timestamp: new Date(),
        details: {
          budgetRemaining: this.budget.dailyLimit
            ? this.budget.dailyLimit - (this.budget.currentSpend?.daily || 0)
            : undefined,
          cacheSize: this.cache.size,
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

  // ===== LITELLM-SPECIFIC METHODS =====

  /**
   * Resolve model name with provider prefix if using model mapping
   */
  private resolveModel(model: LLMModel): string {
    if (this.litellmConfig.modelMapping?.[model]) {
      return this.litellmConfig.modelMapping[model];
    }

    // If model doesn't have a provider prefix, try to infer it
    if (!model.includes('/')) {
      // Try to infer provider from model name
      if (model.startsWith('claude')) return `anthropic/${model}`;
      if (model.startsWith('gpt') || model.startsWith('o1')) return `openai/${model}`;
      if (model.startsWith('gemini')) return `google/${model}`;
    }

    return model;
  }

  /**
   * Build request headers
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };

    // Add custom headers if configured
    if (this.litellmConfig.customHeaders) {
      Object.assign(headers, this.litellmConfig.customHeaders);
    }

    // Add virtual key if using multi-tenant proxy
    if (this.litellmConfig.proxy?.virtualKey) {
      headers['X-LiteLLM-Virtual-Key'] = this.litellmConfig.proxy.virtualKey;
    }

    return headers;
  }

  /**
   * Build LiteLLM request from generic request
   */
  private buildRequest(request: LLMRequest, model: string, stream = false): LiteLLMRequest {
    const litellmRequest: LiteLLMRequest = {
      model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        ...(msg.name && { name: msg.name }),
        ...(msg.toolCallId && { tool_call_id: msg.toolCallId }),
      })),
      stream,
    };

    // Add generation parameters
    if (request.temperature !== undefined || this.config.temperature !== undefined) {
      litellmRequest.temperature = request.temperature ?? this.config.temperature;
    }
    if (request.maxTokens || this.config.maxTokens) {
      litellmRequest.max_tokens = request.maxTokens || this.config.maxTokens;
    }
    if (request.topP !== undefined || this.config.topP !== undefined) {
      litellmRequest.top_p = request.topP ?? this.config.topP;
    }
    if (request.frequencyPenalty !== undefined || this.config.frequencyPenalty !== undefined) {
      litellmRequest.frequency_penalty = request.frequencyPenalty ?? this.config.frequencyPenalty;
    }
    if (request.presencePenalty !== undefined || this.config.presencePenalty !== undefined) {
      litellmRequest.presence_penalty = request.presencePenalty ?? this.config.presencePenalty;
    }
    if (request.stopSequences || this.config.stopSequences) {
      litellmRequest.stop = request.stopSequences || this.config.stopSequences;
    }

    // Add tools if provided
    if (request.tools) {
      litellmRequest.tools = request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      }));
      if (request.toolChoice) {
        litellmRequest.tool_choice = request.toolChoice;
      }
    }

    return litellmRequest;
  }

  /**
   * Make a request to LiteLLM
   */
  private async makeRequest(model: LLMModel, request: LLMRequest): Promise<LLMResponse> {
    const resolvedModel = this.resolveModel(model);
    const litellmRequest = this.buildRequest(request, resolvedModel);
    const url = `${this.baseUrl}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.litellmConfig.proxy?.timeout || 60000
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(litellmRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as LiteLLMResponse;
      return this.transformResponse(data, model);
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    }
  }

  /**
   * Transform LiteLLM response to generic response
   */
  private transformResponse(data: LiteLLMResponse, model: LLMModel): LLMResponse {
    const choice = data.choices[0];
    const content = choice.message.content || '';
    const toolCalls = choice.message.tool_calls;

    const promptTokens = data.usage.prompt_tokens;
    const completionTokens = data.usage.completion_tokens;
    const totalTokens = data.usage.total_tokens;

    const cost = this.calculateCost(model, promptTokens, completionTokens);

    return {
      id: data.id,
      model,
      provider: 'litellm',
      content,
      toolCalls: toolCalls?.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      cost,
      finishReason: choice.finish_reason,
      latency: data._response_ms,
    };
  }

  /**
   * Calculate cost for a request
   */
  private calculateCost(
    model: LLMModel,
    promptTokens: number,
    completionTokens: number
  ): LLMResponse['cost'] {
    const pricing = this.capabilities.pricing[model] || {
      promptCostPer1k: 0,
      completionCostPer1k: 0,
      currency: 'USD',
    };

    const promptCost = (promptTokens / 1000) * pricing.promptCostPer1k;
    const completionCost = (completionTokens / 1000) * pricing.completionCostPer1k;

    return {
      promptCost,
      completionCost,
      totalCost: promptCost + completionCost,
      currency: pricing.currency,
    };
  }

  /**
   * Handle error responses
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text();
    let errorData: LiteLLMError;

    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: { message: errorText, type: 'unknown' } };
    }

    const message = errorData.error?.message || 'Unknown error';

    switch (response.status) {
      case 401:
      case 403:
        throw new AuthenticationError(message, 'litellm', errorData);
      case 404:
        throw new ModelNotFoundError(this.config.model, 'litellm', errorData);
      case 429:
        throw new RateLimitError(message, 'litellm', undefined, errorData);
      default:
        throw new LLMProviderError(
          message,
          `LITELLM_${response.status}`,
          'litellm',
          response.status,
          response.status >= 500,
          errorData
        );
    }
  }

  /**
   * Try fallback chain
   */
  private async tryFallbackChain(request: LLMRequest): Promise<FallbackResult> {
    const chain = this.litellmConfig.fallbackChain || [];
    let attempts = 0;
    let lastError: Error | undefined;

    for (const fallbackModel of chain) {
      attempts++;
      try {
        this.logger.info(`Trying fallback model: ${fallbackModel}`, { attempt: attempts });
        const response = await this.makeRequest(fallbackModel, request);
        return { success: true, model: fallbackModel, response: response as unknown as Record<string, unknown>, attempts };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Fallback model ${fallbackModel} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { success: false, model: '', attempts, error: lastError };
  }

  /**
   * Initialize budget
   */
  private initializeBudget(): BudgetConfig {
    const now = new Date();
    const dailyReset = new Date(now);
    dailyReset.setUTCHours(24, 0, 0, 0);

    const monthlyReset = new Date(now);
    monthlyReset.setUTCMonth(monthlyReset.getUTCMonth() + 1, 1);
    monthlyReset.setUTCHours(0, 0, 0, 0);

    return {
      dailyLimit: this.litellmConfig.budget?.dailyLimit || 100,
      monthlyLimit: this.litellmConfig.budget?.monthlyLimit || 1000,
      currentSpend: { daily: 0, monthly: 0 },
      warningThreshold: this.litellmConfig.budget?.warningThreshold || 0.8,
      resetAt: { daily: dailyReset, monthly: monthlyReset },
    };
  }

  /**
   * Check budget before making request
   */
  private checkBudget(request: LLMRequest): void {
    const now = new Date();

    // Reset if needed
    if (this.budget.resetAt?.daily && now >= this.budget.resetAt.daily) {
      this.budget.currentSpend!.daily = 0;
      const nextDaily = new Date(now);
      nextDaily.setUTCHours(24, 0, 0, 0);
      this.budget.resetAt.daily = nextDaily;
    }

    if (this.budget.resetAt?.monthly && now >= this.budget.resetAt.monthly) {
      this.budget.currentSpend!.monthly = 0;
      const nextMonthly = new Date(now);
      nextMonthly.setUTCMonth(nextMonthly.getUTCMonth() + 1, 1);
      nextMonthly.setUTCHours(0, 0, 0, 0);
      this.budget.resetAt.monthly = nextMonthly;
    }

    // Check limits
    if (this.budget.dailyLimit && this.budget.currentSpend!.daily >= this.budget.dailyLimit) {
      throw new LLMProviderError(
        'Daily budget limit exceeded',
        'BUDGET_EXCEEDED',
        'litellm',
        undefined,
        false
      );
    }
  }

  /**
   * Update budget after request
   */
  private updateBudget(cost: number): void {
    this.budget.currentSpend!.daily += cost;
    this.budget.currentSpend!.monthly += cost;

    // Check warning threshold
    if (this.budget.dailyLimit) {
      const dailyPercent = this.budget.currentSpend!.daily / this.budget.dailyLimit;
      if (dailyPercent >= (this.budget.warningThreshold || 0.8)) {
        this.logger.warn('Budget warning threshold exceeded', {
          daily: this.budget.currentSpend!.daily,
          limit: this.budget.dailyLimit,
          percent: (dailyPercent * 100).toFixed(1) + '%',
        });
      }
    }
  }

  /**
   * Get cached response
   */
  private getCachedResponse(request: LLMRequest): LLMResponse | null {
    const key = this.getCacheKey(request);
    const entry = this.cache.get(key);

    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Transform cached LiteLLMResponse back to LLMResponse
    const cachedResponse = entry.response as LiteLLMResponse;
    const model = request.model || this.config.model;
    return this.transformResponse(cachedResponse, model);
  }

  /**
   * Cache response
   */
  private cacheResponse(request: LLMRequest, response: LLMResponse): void {
    const config = this.litellmConfig.cacheConfig;
    if (!config?.enabled) return;

    const key = this.getCacheKey(request);
    const now = Date.now();

    // Create LiteLLMResponse from LLMResponse for caching
    const litellmResponse: LiteLLMResponse = {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.content,
            ...(response.toolCalls && {
              tool_calls: response.toolCalls.map(tc => ({
                id: tc.id,
                type: tc.type,
                function: tc.function,
              })),
            }),
          },
          finish_reason: response.finishReason || 'stop',
        },
      ],
      usage: {
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_tokens: response.usage.totalTokens,
      },
    };

    const entry: CacheEntry = {
      key,
      response: litellmResponse,
      timestamp: now,
      expiresAt: now + (config.ttl * 1000),
    };

    this.cache.set(key, entry);

    // Enforce max size
    if (config.maxSize && this.cache.size > config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(request: LLMRequest): string {
    const strategy = this.litellmConfig.cacheConfig?.keyStrategy || 'hash';

    if (strategy === 'full') {
      return JSON.stringify({
        model: request.model || this.config.model,
        messages: request.messages,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      });
    }

    // Simple hash strategy
    const str = JSON.stringify(request.messages);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `${request.model || this.config.model}-${hash}`;
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }

  /**
   * Get current budget status
   */
  getBudget(): BudgetConfig {
    return { ...this.budget };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.cache.clear();
    super.destroy();
  }
}
