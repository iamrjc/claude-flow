/**
 * Test Helpers - Shared utilities for provider integration tests
 *
 * Provides:
 * - MockProvider factory
 * - Response generators for each provider
 * - Timing utilities
 * - Memory tracking helpers
 *
 * @module @claude-flow/providers/test-helpers
 */

import {
  LLMProvider,
  LLMModel,
  LLMResponse,
  LLMStreamEvent,
  LLMRequest,
  LLMMessage,
  ProviderCapabilities,
  ModelInfo,
  HealthCheckResult,
  ProviderStatus,
  CostEstimate,
  UsageStats,
  UsagePeriod,
} from '../types.js';
import { BaseProvider, BaseProviderOptions, ILogger } from '../base-provider.js';

/**
 * Silent logger for tests (no console output)
 */
export const silentLogger: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/**
 * Test logger that captures logs
 */
export class TestLogger implements ILogger {
  logs: Array<{ level: string; message: string; meta?: unknown }> = [];

  info(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', message, meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', message, meta });
  }

  error(message: string, error?: unknown): void {
    this.logs.push({ level: 'error', message, meta: error });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', message, meta });
  }

  clear(): void {
    this.logs = [];
  }

  findLog(level: string, pattern: string): boolean {
    return this.logs.some((log) => log.level === level && log.message.includes(pattern));
  }
}

/**
 * Mock Provider Implementation
 */
export class MockProvider extends BaseProvider {
  readonly name: LLMProvider;
  readonly capabilities: ProviderCapabilities;

  private mockResponse?: LLMResponse;
  private mockError?: Error;
  private responseDelay = 0;

  constructor(
    name: LLMProvider,
    capabilities: Partial<ProviderCapabilities>,
    options?: Partial<BaseProviderOptions>
  ) {
    super({
      config: {
        provider: name,
        model: 'mock-model',
        maxTokens: 1000,
        temperature: 0.7,
      },
      logger: options?.logger || silentLogger,
      ...options,
    });

    this.name = name;
    this.capabilities = {
      supportedModels: ['mock-model'],
      maxContextLength: { 'mock-model': 100000 },
      maxOutputTokens: { 'mock-model': 4096 },
      supportsStreaming: true,
      supportsToolCalling: false,
      supportsSystemMessages: true,
      supportsVision: false,
      supportsAudio: false,
      supportsFineTuning: false,
      supportsEmbeddings: false,
      supportsBatching: false,
      pricing: {
        'mock-model': {
          promptCostPer1k: 0.001,
          completionCostPer1k: 0.002,
          currency: 'USD',
        },
      },
      ...capabilities,
    };
  }

  /**
   * Set mock response for next request
   */
  setMockResponse(response: Partial<LLMResponse>): void {
    this.mockResponse = {
      id: 'mock-id',
      model: 'mock-model',
      provider: this.name,
      content: 'Mock response',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      cost: {
        promptCost: 0.00001,
        completionCost: 0.00004,
        totalCost: 0.00005,
        currency: 'USD',
      },
      finishReason: 'stop',
      ...response,
    };
  }

  /**
   * Set error to throw on next request
   */
  setMockError(error: Error): void {
    this.mockError = error;
  }

  /**
   * Set artificial delay for responses (ms)
   */
  setResponseDelay(ms: number): void {
    this.responseDelay = ms;
  }

  protected async doInitialize(): Promise<void> {
    // Mock initialization
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    if (this.responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelay));
    }

    if (this.mockError) {
      const error = this.mockError;
      this.mockError = undefined;
      throw error;
    }

    if (this.mockResponse) {
      return this.mockResponse;
    }

    return {
      id: `mock-${Date.now()}`,
      model: request.model || this.config.model,
      provider: this.name,
      content: 'Mock response content',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      cost: {
        promptCost: 0.00001,
        completionCost: 0.00004,
        totalCost: 0.00005,
        currency: 'USD',
      },
      finishReason: 'stop',
    };
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    if (this.mockError) {
      const error = this.mockError;
      this.mockError = undefined;
      throw error;
    }

    const chunks = ['Hello', ' from', ' mock', ' provider'];

    for (const chunk of chunks) {
      if (this.responseDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.responseDelay / chunks.length));
      }

      yield {
        type: 'content',
        delta: { content: chunk },
      };
    }

    yield {
      type: 'done',
      usage: {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
      },
      cost: {
        promptCost: 0.00001,
        completionCost: 0.000008,
        totalCost: 0.000018,
        currency: 'USD',
      },
    };
  }

  async listModels(): Promise<LLMModel[]> {
    return this.capabilities.supportedModels;
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    return {
      model,
      name: `Mock ${model}`,
      description: 'Mock model for testing',
      contextLength: this.capabilities.maxContextLength[model] || 100000,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 4096,
      supportedFeatures: ['text'],
      pricing: this.capabilities.pricing?.[model],
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    return {
      healthy: true,
      latency: 10,
      timestamp: new Date(),
      details: { status: 'mock-healthy' },
    };
  }
}

/**
 * Create a mock Response object for fetch mocking
 */
export const mockResponse = (data: {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  body?: unknown;
}): Response => {
  return {
    ok: data.ok ?? true,
    status: data.status ?? 200,
    statusText: data.ok === false ? 'Error' : 'OK',
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: function () {
      return this;
    },
    body: data.body ?? null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: data.text ?? (async () => ''),
    json: data.json ?? (async () => ({})),
  } as Response;
};

/**
 * Generate a mock Anthropic API response
 */
export const mockAnthropicResponse = (content: string, tokens = { input: 10, output: 20 }) => ({
  id: `msg_${Date.now()}`,
  type: 'message',
  role: 'assistant',
  model: 'claude-3-5-sonnet-20241022',
  content: [{ type: 'text', text: content }],
  stop_reason: 'end_turn',
  usage: {
    input_tokens: tokens.input,
    output_tokens: tokens.output,
  },
});

/**
 * Generate a mock OpenAI API response
 */
export const mockOpenAIResponse = (content: string, tokens = { prompt: 10, completion: 20 }) => ({
  id: `chatcmpl-${Date.now()}`,
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content,
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: tokens.prompt,
    completion_tokens: tokens.completion,
    total_tokens: tokens.prompt + tokens.completion,
  },
});

/**
 * Generate a mock Google Gemini API response
 */
export const mockGeminiResponse = (content: string, tokens = { prompt: 10, completion: 20 }) => ({
  candidates: [
    {
      content: {
        parts: [{ text: content }],
        role: 'model',
      },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: {
    promptTokenCount: tokens.prompt,
    candidatesTokenCount: tokens.completion,
    totalTokenCount: tokens.prompt + tokens.completion,
  },
});

/**
 * Create a test request
 */
export const createTestRequest = (
  content = 'Test prompt',
  options: Partial<LLMRequest> = {}
): LLMRequest => ({
  messages: [{ role: 'user', content }],
  maxTokens: 100,
  temperature: 0.7,
  ...options,
});

/**
 * Timing utility
 */
export class Timer {
  private start: number;

  constructor() {
    this.start = Date.now();
  }

  elapsed(): number {
    return Date.now() - this.start;
  }

  reset(): void {
    this.start = Date.now();
  }
}

/**
 * Memory tracking utility
 */
export class MemoryTracker {
  private baseline: number;
  private snapshots: Array<{ label: string; memory: number; delta: number }> = [];

  constructor() {
    this.baseline = this.getCurrentMemory();
  }

  snapshot(label: string): void {
    const current = this.getCurrentMemory();
    const delta = current - this.baseline;
    this.snapshots.push({ label, memory: current, delta });
  }

  getSnapshots() {
    return this.snapshots;
  }

  private getCurrentMemory(): number {
    if (global.gc) {
      global.gc();
    }
    return process.memoryUsage().heapUsed / 1024 / 1024; // MB
  }

  getDelta(): number {
    const current = this.getCurrentMemory();
    return current - this.baseline;
  }
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Collect all events from an async iterable
 */
export async function collectStreamEvents(
  stream: AsyncIterable<LLMStreamEvent>
): Promise<LLMStreamEvent[]> {
  const events: LLMStreamEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

/**
 * Assert that two numbers are approximately equal (within percentage)
 */
export function assertApproximately(
  actual: number,
  expected: number,
  tolerancePercent: number,
  message?: string
): void {
  const diff = Math.abs(actual - expected);
  const tolerance = expected * (tolerancePercent / 100);

  if (diff > tolerance) {
    throw new Error(
      message ||
        `Expected ${actual} to be approximately ${expected} (±${tolerancePercent}%), but difference was ${diff}`
    );
  }
}
