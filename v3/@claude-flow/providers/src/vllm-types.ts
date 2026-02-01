/**
 * vLLM Provider Configuration Types
 *
 * @module @claude-flow/providers/vllm-types
 */

export interface VLLMConfig {
  host?: string;           // default: 'http://localhost:8000'
  port?: number;           // default: 8000
  model?: string;          // model name (required for vLLM)
  maxTokens?: number;      // max tokens to generate
  temperature?: number;    // sampling temperature
  timeout?: number;        // request timeout in ms, default: 30000ms
  retries?: number;        // number of retries, default: 3
}

export interface VLLMModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  root?: string;
  parent?: string;
  permission?: Array<{
    id: string;
    object: string;
    created: number;
    allow_create_engine: boolean;
    allow_sampling: boolean;
    allow_logprobs: boolean;
    allow_search_indices: boolean;
    allow_view: boolean;
    allow_fine_tuning: boolean;
    organization: string;
    group: null | string;
    is_blocking: boolean;
  }>;
}

export interface VLLMGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  stream?: boolean;
  logprobs?: number;
  echo?: boolean;
  bestOf?: number;
  n?: number;
  user?: string;
}

export interface VLLMCompletionResponse {
  id: string;
  object: 'text_completion' | 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    text?: string;
    message?: {
      role: string;
      content: string;
    };
    index: number;
    logprobs: null | {
      tokens: string[];
      token_logprobs: number[];
      top_logprobs: Array<Record<string, number>>;
      text_offset: number[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface VLLMListModelsResponse {
  object: 'list';
  data: VLLMModelInfo[];
}

export interface VLLMHealthResponse {
  status: 'healthy' | 'unhealthy';
  uptime?: number;
  version?: string;
}
