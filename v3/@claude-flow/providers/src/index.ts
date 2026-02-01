/**
 * @claude-flow/providers
 *
 * Multi-LLM Provider System for Claude Flow V3
 *
 * Supports:
 * - Anthropic (Claude 3.5, 3 Opus, Sonnet, Haiku)
 * - OpenAI (GPT-4o, o1, GPT-4, GPT-3.5)
 * - Google (Gemini 2.0, 1.5 Pro, Flash)
 * - Cohere (Command R+, R, Light)
 * - Ollama (Local: Llama, Mistral, CodeLlama, Phi)
 * - vLLM (OpenAI-compatible high-throughput inference)
 * - Qwen (Qwen 2.5 models via Ollama/vLLM/DashScope)
 * - OpenRouter (Unified API for 100+ models)
 * - LiteLLM (Unified interface for 100+ LLMs with proxy support)
 *
 * Features:
 * - Load balancing (round-robin, latency, cost-based)
 * - Automatic failover
 * - Request caching
 * - Cost optimization (85%+ savings with intelligent routing)
 * - Circuit breaker protection
 * - Health monitoring
 *
 * @module @claude-flow/providers
 */

// Export types
export * from './types.js';

// Export base provider
export { BaseProvider, consoleLogger } from './base-provider.js';
export type { BaseProviderOptions, ILogger } from './base-provider.js';

// Export providers
export { AnthropicProvider } from './anthropic-provider.js';
export { OpenAIProvider } from './openai-provider.js';
export { GoogleProvider } from './google-provider.js';
export { GeminiProvider } from './gemini-provider.js';
export { CohereProvider } from './cohere-provider.js';
export { OllamaProvider } from './ollama-provider.js';
export { RuVectorProvider } from './ruvector-provider.js';
export { ONNXProvider } from './onnx-provider.js';
export { VLLMProvider } from './vllm-provider.js';
export { QwenProvider } from './qwen-provider.js';
export { OpenRouterProvider } from './openrouter-provider.js';
export { LiteLLMProvider } from './litellm-provider.js';

// Export Ollama types
export type { OllamaConfig, OllamaModelInfo, OllamaListResponse, OllamaEmbeddingResponse, OllamaPullProgress } from './ollama-types.js';

// Export Gemini types
export type {
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
  GeminiStreamChunk
} from './gemini-types.js';

// Export ONNX types
export type { ONNXConfig, ONNXModelInfo, ONNXInferenceOptions, ONNXInferenceResult, ONNXTensor, ONNXSessionOptions } from './onnx-types.js';
export type { ONNXProviderOptions } from './onnx-provider.js';

// Export vLLM types
export type { VLLMConfig, VLLMModelInfo, VLLMGenerateOptions, VLLMCompletionResponse, VLLMListModelsResponse, VLLMHealthResponse } from './vllm-types.js';

// Export Qwen types
export type { QwenConfig, QwenModelInfo, QwenGenerateOptions, QwenMessage, QwenResponse, QwenToolCall, QwenTool, QwenListResponse, QwenEmbeddingResponse, QwenStreamChunk } from './qwen-types.js';

// Export OpenRouter types
export type {
  OpenRouterConfig,
  OpenRouterModel,
  CostInfo,
  OpenRouterRequest,
  OpenRouterResponse,
  OpenRouterStreamChunk,
  OpenRouterError,
  OpenRouterModelListResponse,
  OpenRouterGenerationMetadata
} from './openrouter-types.js';

// Export LiteLLM types
export type {
  LiteLLMConfig,
  ProxyConfig,
  ModelMapping,
  BudgetConfig,
  CacheConfig,
  LiteLLMModel,
  LiteLLMRequest,
  LiteLLMResponse,
  LiteLLMStreamChunk,
  LiteLLMError,
  LiteLLMModelListResponse,
  CacheEntry,
  FallbackResult
} from './litellm-types.js';

// Export provider manager
export { ProviderManager, createProviderManager } from './provider-manager.js';
export type { EnhancedProviderManagerConfig } from './provider-manager.js';

// Export provider router
export { ProviderRouter } from './provider-router.js';
export type {
  RouteRequirements,
  ProviderPoolConfig,
  ABTestConfig,
  ABTestMetrics,
  RouteResult,
} from './provider-router.js';
