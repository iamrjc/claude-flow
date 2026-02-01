/**
 * LiteLLM Provider Configuration Types
 *
 * LiteLLM is a unified interface for 100+ LLMs that can be self-hosted or used as a proxy.
 *
 * @module @claude-flow/providers/litellm-types
 */

import { LLMProviderConfig, LLMModel } from './types.js';

/**
 * LiteLLM-specific configuration
 */
export interface LiteLLMConfig extends LLMProviderConfig {
  provider: 'litellm';

  /**
   * Proxy configuration for self-hosted LiteLLM
   */
  proxy?: ProxyConfig;

  /**
   * Model mapping configuration (generic name -> provider-specific)
   */
  modelMapping?: ModelMapping;

  /**
   * Fallback chain configuration
   */
  fallbackChain?: LLMModel[];

  /**
   * Budget configuration
   */
  budget?: BudgetConfig;

  /**
   * Cache configuration for repeated queries
   */
  cacheConfig?: CacheConfig;

  /**
   * Custom headers for proxy requests
   */
  customHeaders?: Record<string, string>;
}

/**
 * Proxy configuration for self-hosted LiteLLM
 */
export interface ProxyConfig {
  /**
   * Proxy URL (e.g., 'http://localhost:4000' for self-hosted)
   * If not provided, uses hosted service: 'https://api.litellm.ai'
   */
  url: string;

  /**
   * API key for the proxy
   */
  apiKey?: string;

  /**
   * Timeout for proxy requests (ms)
   */
  timeout?: number;

  /**
   * Enable retry on proxy failures
   */
  enableRetry?: boolean;

  /**
   * Virtual key for multi-tenant setups
   */
  virtualKey?: string;
}

/**
 * Model mapping (generic name -> provider-specific)
 * Examples:
 * - 'claude-3-opus' -> 'anthropic/claude-3-opus-20240229'
 * - 'gpt-4' -> 'openai/gpt-4'
 * - 'gemini-pro' -> 'google/gemini-1.5-pro'
 */
export interface ModelMapping {
  [genericName: string]: string;
}

/**
 * Budget configuration
 */
export interface BudgetConfig {
  /**
   * Maximum cost per request (USD)
   */
  maxCostPerRequest?: number;

  /**
   * Daily budget limit (USD)
   */
  dailyLimit?: number;

  /**
   * Monthly budget limit (USD)
   */
  monthlyLimit?: number;

  /**
   * Current spend tracking
   */
  currentSpend?: {
    daily: number;
    monthly: number;
  };

  /**
   * Warning threshold (0-1, e.g., 0.8 for 80%)
   */
  warningThreshold?: number;

  /**
   * Reset timestamps
   */
  resetAt?: {
    daily: Date;
    monthly: Date;
  };
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /**
   * Enable caching
   */
  enabled: boolean;

  /**
   * Cache TTL in seconds
   */
  ttl: number;

  /**
   * Max cache size (number of entries)
   */
  maxSize: number;

  /**
   * Cache key strategy
   */
  keyStrategy?: 'hash' | 'full';
}

/**
 * LiteLLM model information
 */
export interface LiteLLMModel {
  id: string;
  provider: string;
  displayName: string;
  maxTokens: number;
  supportedEndpoints: string[];
  pricing?: {
    promptCostPer1k: number;
    completionCostPer1k: number;
    currency: string;
  };
}

/**
 * LiteLLM request format
 */
export interface LiteLLMRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    tool_call_id?: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };

  // LiteLLM-specific
  litellm_params?: {
    custom_llm_provider?: string;
    api_base?: string;
    api_key?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * LiteLLM response format (OpenAI-compatible)
 */
export interface LiteLLMResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };

  // LiteLLM-specific metadata
  _response_ms?: number;
  _hidden_params?: {
    model_id?: string;
    custom_llm_provider?: string;
    original_response?: Record<string, unknown>;
  };
}

/**
 * LiteLLM streaming chunk
 */
export interface LiteLLMStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * LiteLLM error response
 */
export interface LiteLLMError {
  error: {
    message: string;
    type: string;
    code?: string;
    param?: string;
  };
}

/**
 * LiteLLM model list response
 */
export interface LiteLLMModelListResponse {
  data: Array<{
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
  }>;
}

/**
 * Cache entry
 */
export interface CacheEntry {
  key: string;
  response: LiteLLMResponse;
  timestamp: number;
  expiresAt: number;
}

/**
 * Fallback result
 */
export interface FallbackResult {
  success: boolean;
  model: string;
  response?: Record<string, unknown>;
  error?: Error;
  attempts: number;
}
