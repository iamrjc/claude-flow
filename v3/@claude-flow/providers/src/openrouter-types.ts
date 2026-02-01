/**
 * OpenRouter Provider Configuration Types
 *
 * @module @claude-flow/providers/openrouter-types
 */

import { LLMProviderConfig } from './types.js';

export interface OpenRouterConfig extends LLMProviderConfig {
  apiKey?: string; // Can be provided via OPENROUTER_API_KEY env var
  baseUrl?: string; // Default: https://openrouter.ai/api/v1
  timeout?: number; // Request timeout in ms
  siteUrl?: string; // Optional HTTP-Referer header
  siteName?: string; // Optional X-Title header
  fallbackModels?: string[]; // Fallback models if primary fails
}

/**
 * OpenRouter model information
 */
export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  pricing: {
    prompt: number; // Cost per token
    completion: number; // Cost per token
  };
  topProvider: {
    contextLength: number;
    maxCompletionTokens: number;
    isModerated: boolean;
  };
  created: number;
  object: string;
}

/**
 * Cost information per model
 */
export interface CostInfo {
  model: string;
  promptCost: number; // Cost per 1K tokens
  completionCost: number; // Cost per 1K tokens
  currency: string;
}

/**
 * OpenRouter request format
 */
export interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: string }>;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  tools?: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: string | { type: string; function: { name: string } };
  // OpenRouter-specific
  provider?: {
    order?: string[];
    allow_fallbacks?: boolean;
  };
  transforms?: string[];
}

/**
 * OpenRouter response format
 */
export interface OpenRouterResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // OpenRouter-specific
  system_fingerprint?: string;
}

/**
 * OpenRouter streaming chunk
 */
export interface OpenRouterStreamChunk {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter error response
 */
export interface OpenRouterError {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

/**
 * OpenRouter model list response
 */
export interface OpenRouterModelListResponse {
  data: OpenRouterModel[];
}

/**
 * OpenRouter generation metadata
 */
export interface OpenRouterGenerationMetadata {
  id: string;
  provider_name?: string;
  model: string;
  finish_reason: string;
  tokens_prompt: number;
  tokens_completion: number;
  native_tokens_prompt?: number;
  native_tokens_completion?: number;
  num_media_generations?: number;
  created_at: string;
  latency_ms?: number;
  moderation?: {
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  };
}
