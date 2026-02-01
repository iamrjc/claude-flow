/**
 * Ollama Provider Configuration Types
 *
 * @module @claude-flow/providers/ollama-types
 */

export interface OllamaConfig {
  host?: string;           // default: 'http://localhost:11434'
  timeout?: number;        // default: 30000ms
  retries?: number;        // default: 3
  keepAlive?: string;      // default: '5m'
}

export interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaListResponse {
  models: OllamaModelInfo[];
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}
