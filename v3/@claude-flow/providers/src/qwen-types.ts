/**
 * Qwen-Agent Provider Configuration Types
 *
 * @module @claude-flow/providers/qwen-types
 */

export interface QwenConfig {
  host?: string;           // default: 'http://localhost:11434' (Ollama) or DashScope API
  port?: number;           // default: 11434 for local, 443 for DashScope
  model?: string;          // default: 'qwen2.5:7b'
  maxTokens?: number;      // default: 4096
  temperature?: number;    // default: 0.7
  timeout?: number;        // default: 30000ms
  retries?: number;        // default: 3
  apiKey?: string;         // For DashScope API
  useLocal?: boolean;      // true = Ollama/vLLM, false = DashScope
}

export interface QwenModelInfo {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface QwenGenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  stream?: boolean;
}

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface QwenResponse {
  id: string;
  model: string;
  created_at?: string;
  message: {
    role: string;
    content: string;
    tool_calls?: QwenToolCall[];
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface QwenToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
}

export interface QwenTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface QwenListResponse {
  models: QwenModelInfo[];
}

export interface QwenEmbeddingResponse {
  embedding: number[];
}

export interface QwenStreamChunk {
  model: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: QwenToolCall[];
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}
