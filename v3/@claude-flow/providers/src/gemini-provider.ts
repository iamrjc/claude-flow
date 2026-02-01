/**
 * V3 Gemini Provider (Enhanced)
 *
 * Supports Gemini 2.0 Flash, 1.5 Pro, and 1.5 Flash models with:
 * - Vision support (generateWithImages)
 * - Token counting
 * - Token budget tracking (2M free tokens/day)
 * - Multi-turn conversations
 *
 * @module @claude-flow/providers/gemini-provider
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
} from './types.js';
import {
  GeminiConfig,
  GeminiModelInfo,
  GeminiGenerateOptions,
  GeminiMessage,
  GeminiContent,
  GeminiPart,
  GeminiRequest,
  GeminiResponse,
  GeminiTokenCountRequest,
  GeminiTokenCountResponse,
  GeminiModelListResponse,
  GeminiTokenBudget,
  GeminiStreamChunk,
} from './gemini-types.js';

export class GeminiProvider extends BaseProvider {
  readonly name: LLMProvider = 'google';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
    maxContextLength: {
      'gemini-2.0-flash-exp': 1000000,
      'gemini-1.5-pro': 2000000,
      'gemini-1.5-flash': 1000000,
    },
    maxOutputTokens: {
      'gemini-2.0-flash-exp': 8192,
      'gemini-1.5-pro': 8192,
      'gemini-1.5-flash': 8192,
    },
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsSystemMessages: true,
    supportsVision: true,
    supportsAudio: true,
    supportsFineTuning: false,
    supportsEmbeddings: true,
    supportsBatching: true,
    rateLimit: {
      requestsPerMinute: 1000,
      tokensPerMinute: 4000000,
      concurrentRequests: 100,
    },
    pricing: {
      'gemini-2.0-flash-exp': {
        promptCostPer1k: 0.0, // Free tier
        completionCostPer1k: 0.0,
        currency: 'USD',
      },
      'gemini-1.5-pro': {
        promptCostPer1k: 0.00125,
        completionCostPer1k: 0.005,
        currency: 'USD',
      },
      'gemini-1.5-flash': {
        promptCostPer1k: 0.000075,
        completionCostPer1k: 0.0003,
        currency: 'USD',
      },
    },
  };

  private baseUrl: string;
  private apiKey: string;
  private geminiConfig: GeminiConfig;
  private tokenBudget: GeminiTokenBudget;

  constructor(options: BaseProviderOptions & { geminiConfig?: GeminiConfig }) {
    super(options);

    // Initialize Gemini-specific config
    this.geminiConfig = options.geminiConfig || {};
    this.apiKey = this.geminiConfig.apiKey || this.config.apiKey || process.env.GOOGLE_API_KEY || '';
    this.baseUrl = this.geminiConfig.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';

    // Initialize token budget (2M tokens/day free tier)
    this.tokenBudget = this.initializeTokenBudget();
  }

  protected async doInitialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AuthenticationError(
        'API key is required',
        'google'
      );
    }

    this.logger.info('Gemini provider initialized', {
      model: this.config.model,
      baseUrl: this.baseUrl,
      budgetRemaining: this.tokenBudget.remaining,
    });
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    const geminiRequest = this.buildRequest(request);
    const model = request.model || this.config.model;
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    // Check token budget
    this.checkTokenBudget(request);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.geminiConfig.timeout || 60000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as GeminiResponse;
      const result = this.transformResponse(data, request);

      // Update token budget
      this.updateTokenBudget(result.usage.totalTokens);

      return result;
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    }
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const geminiRequest = this.buildRequest(request);
    const model = request.model || this.config.model;
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    // Check token budget
    this.checkTokenBudget(request);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (this.geminiConfig.timeout || 60000) * 2);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequest),
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
              const chunk: GeminiStreamChunk = JSON.parse(data);
              const candidate = chunk.candidates?.[0];

              if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    yield {
                      type: 'content',
                      delta: { content: part.text },
                    };
                  }
                }
              }

              if (chunk.usageMetadata) {
                promptTokens = chunk.usageMetadata.promptTokenCount;
                completionTokens = chunk.usageMetadata.candidatesTokenCount;
                totalTokens = chunk.usageMetadata.totalTokenCount;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Update token budget
      this.updateTokenBudget(totalTokens);

      // Final event with usage
      const pricing = this.capabilities.pricing[model];
      yield {
        type: 'done',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        cost: {
          promptCost: (promptTokens / 1000) * pricing.promptCostPer1k,
          completionCost: (completionTokens / 1000) * pricing.completionCostPer1k,
          totalCost:
            (promptTokens / 1000) * pricing.promptCostPer1k +
            (completionTokens / 1000) * pricing.completionCostPer1k,
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
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return this.capabilities.supportedModels;
      }

      const data = (await response.json()) as GeminiModelListResponse;
      const geminiModels = data.models
        .filter((m) => m.name.includes('gemini'))
        .map((m) => m.name.replace('models/', '') as LLMModel);

      return geminiModels.length > 0 ? geminiModels : this.capabilities.supportedModels;
    } catch {
      return this.capabilities.supportedModels;
    }
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    const descriptions: Record<string, string> = {
      'gemini-2.0-flash-exp': 'Latest Gemini 2.0 experimental with multimodal capabilities',
      'gemini-1.5-pro': 'Most capable Gemini model with 2M context window',
      'gemini-1.5-flash': 'Fast and efficient Gemini model',
    };

    return {
      model,
      name: model,
      description: descriptions[model] || 'Google Gemini model',
      contextLength: this.capabilities.maxContextLength[model] || 1000000,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 8192,
      supportedFeatures: ['chat', 'completion', 'vision', 'audio', 'tool_calling'],
      pricing: this.capabilities.pricing[model],
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

      return {
        healthy: response.ok,
        timestamp: new Date(),
        details: {
          budgetRemaining: this.tokenBudget.remaining,
          budgetUsed: this.tokenBudget.used,
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

  // ===== GEMINI-SPECIFIC METHODS =====

  /**
   * Generate text from a simple prompt (convenience method)
   */
  async generate(prompt: string, options?: GeminiGenerateOptions): Promise<LLMResponse> {
    return this.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      topP: options?.topP,
      topK: options?.topK,
      stopSequences: options?.stopSequences,
    });
  }

  /**
   * Chat with the model (convenience method)
   */
  async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: GeminiGenerateOptions
  ): Promise<LLMResponse> {
    return this.complete({
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : (m.role as 'user' | 'system'),
        content: m.content,
      })),
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      topP: options?.topP,
      topK: options?.topK,
      stopSequences: options?.stopSequences,
    });
  }

  /**
   * Generate with images (vision support)
   * @param prompt - Text prompt
   * @param images - Array of base64-encoded images or image URLs
   */
  async generateWithImages(
    prompt: string,
    images: string[],
    options?: GeminiGenerateOptions
  ): Promise<LLMResponse> {
    const parts: GeminiPart[] = [{ text: prompt }];

    for (const image of images) {
      // Detect if it's a URL or base64
      if (image.startsWith('http://') || image.startsWith('https://')) {
        throw new Error('Image URLs not supported. Please provide base64-encoded images.');
      }

      // Assume it's base64 (with or without data:image prefix)
      let base64Data = image;
      let mimeType = 'image/jpeg';

      if (image.startsWith('data:')) {
        const match = image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        }
      }

      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    const request: GeminiRequest = {
      contents: [{ role: 'user', parts }],
    };

    if (options) {
      request.generationConfig = {
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        maxOutputTokens: options.maxTokens,
        stopSequences: options.stopSequences,
      };
    }

    const model = this.config.model;
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await response.json()) as GeminiResponse;
    const result = this.transformResponse(data, { messages: [{ role: 'user', content: prompt }] });

    // Update token budget
    this.updateTokenBudget(result.usage.totalTokens);

    return result;
  }

  /**
   * Count tokens in text
   */
  async countTokens(text: string): Promise<number> {
    const request: GeminiTokenCountRequest = {
      contents: [{ role: 'user', parts: [{ text }] }],
    };

    const model = this.config.model;
    const url = `${this.baseUrl}/models/${model}:countTokens?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        // Fallback to estimation
        return this.estimateTokens(text);
      }

      const data = (await response.json()) as GeminiTokenCountResponse;
      return data.totalTokens;
    } catch {
      return this.estimateTokens(text);
    }
  }

  /**
   * Get current token budget status
   */
  getTokenBudget(): GeminiTokenBudget {
    // Reset if past midnight UTC
    const now = new Date();
    if (now >= this.tokenBudget.resetAt) {
      this.tokenBudget = this.initializeTokenBudget();
    }

    return { ...this.tokenBudget };
  }

  /**
   * Public health check (alias for compatibility)
   */
  async checkHealth(): Promise<HealthCheckResult> {
    return this.healthCheck();
  }

  // ===== PRIVATE METHODS =====

  private buildRequest(request: LLMRequest): GeminiRequest {
    // Extract system message
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    // Transform messages to Gemini format
    const contents: GeminiContent[] = otherMessages.map((msg) => ({
      role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
    }));

    const geminiRequest: GeminiRequest = { contents };

    if (systemMessage) {
      geminiRequest.systemInstruction = {
        parts: [
          {
            text:
              typeof systemMessage.content === 'string'
                ? systemMessage.content
                : JSON.stringify(systemMessage.content),
          },
        ],
      };
    }

    const generationConfig: GeminiRequest['generationConfig'] = {};

    if (request.temperature !== undefined || this.config.temperature !== undefined) {
      generationConfig.temperature = request.temperature ?? this.config.temperature;
    }
    if (request.topP !== undefined || this.config.topP !== undefined) {
      generationConfig.topP = request.topP ?? this.config.topP;
    }
    if (request.topK !== undefined || this.config.topK !== undefined) {
      generationConfig.topK = request.topK ?? this.config.topK;
    }
    if (request.maxTokens || this.config.maxTokens) {
      generationConfig.maxOutputTokens = request.maxTokens || this.config.maxTokens;
    }
    if (request.stopSequences || this.config.stopSequences) {
      generationConfig.stopSequences = request.stopSequences || this.config.stopSequences;
    }

    if (Object.keys(generationConfig).length > 0) {
      geminiRequest.generationConfig = generationConfig;
    }

    if (request.tools) {
      geminiRequest.tools = [
        {
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          })),
        },
      ];
    }

    return geminiRequest;
  }

  private transformResponse(data: GeminiResponse, request: LLMRequest): LLMResponse {
    const candidate = data.candidates[0];
    const model = request.model || this.config.model;
    const pricing = this.capabilities.pricing[model];

    const textParts = candidate.content.parts.filter((p) => p.text);
    const content = textParts.map((p) => p.text).join('');

    const toolCalls = candidate.content.parts
      .filter((p) => p.functionCall)
      .map((p) => ({
        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: 'function' as const,
        function: {
          name: p.functionCall!.name,
          arguments: JSON.stringify(p.functionCall!.args),
        },
      }));

    const promptTokens = data.usageMetadata?.promptTokenCount || 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || 0;

    const promptCost = (promptTokens / 1000) * pricing.promptCostPer1k;
    const completionCost = (completionTokens / 1000) * pricing.completionCostPer1k;

    return {
      id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      model: model as LLMModel,
      provider: 'google',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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
      finishReason: candidate.finishReason === 'STOP' ? 'stop' : 'length',
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text();
    let errorData: { error?: { message?: string } };

    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: { message: errorText } };
    }

    const message = errorData.error?.message || 'Unknown error';

    switch (response.status) {
      case 401:
      case 403:
        throw new AuthenticationError(message, 'google', errorData);
      case 429:
        throw new RateLimitError(message, 'google', undefined, errorData);
      default:
        throw new LLMProviderError(
          message,
          `GEMINI_${response.status}`,
          'google',
          response.status,
          response.status >= 500,
          errorData
        );
    }
  }

  private initializeTokenBudget(): GeminiTokenBudget {
    const now = new Date();
    const resetAt = new Date(now);
    resetAt.setUTCHours(24, 0, 0, 0); // Next midnight UTC

    return {
      dailyLimit: 2000000, // 2M tokens/day free tier
      used: 0,
      remaining: 2000000,
      resetAt,
      warningThreshold: 0.8, // 80%
    };
  }

  private checkTokenBudget(request: LLMRequest): void {
    const now = new Date();
    if (now >= this.tokenBudget.resetAt) {
      this.tokenBudget = this.initializeTokenBudget();
    }

    const estimatedTokens = this.estimateTokens(JSON.stringify(request.messages));
    const maxTokens = request.maxTokens || this.config.maxTokens || 2048;
    const totalEstimated = estimatedTokens + maxTokens;

    if (this.tokenBudget.remaining < totalEstimated) {
      this.logger.warn('Token budget exceeded', {
        remaining: this.tokenBudget.remaining,
        estimated: totalEstimated,
        resetAt: this.tokenBudget.resetAt,
      });
    }
  }

  private updateTokenBudget(tokens: number): void {
    this.tokenBudget.used += tokens;
    this.tokenBudget.remaining = Math.max(0, this.tokenBudget.dailyLimit - this.tokenBudget.used);

    // Check if we've crossed the warning threshold
    const usagePercent = this.tokenBudget.used / this.tokenBudget.dailyLimit;
    if (usagePercent >= this.tokenBudget.warningThreshold) {
      this.logger.warn('Token budget warning', {
        used: this.tokenBudget.used,
        limit: this.tokenBudget.dailyLimit,
        percent: (usagePercent * 100).toFixed(1) + '%',
      });
    }
  }
}
