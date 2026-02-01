/**
 * ONNX Provider Configuration Types
 *
 * @module @claude-flow/providers/onnx-types
 */

export interface ONNXConfig {
  modelPath: string;                    // Path to ONNX model file
  executionProviders?: string[];        // e.g., ['cpu', 'cuda', 'wasm']
  sessionOptions?: ONNXSessionOptions;
  timeout?: number;                     // default: 30000ms
  retries?: number;                     // default: 3
}

export interface ONNXSessionOptions {
  enableCpuMemArena?: boolean;         // default: true
  enableMemPattern?: boolean;          // default: true
  executionMode?: 'sequential' | 'parallel'; // default: 'sequential'
  graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all'; // default: 'all'
  logId?: string;
  logSeverityLevel?: number;           // 0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Fatal
  enableProfiling?: boolean;           // default: false
  interOpNumThreads?: number;
  intraOpNumThreads?: number;
}

export interface ONNXModelInfo {
  name: string;
  inputNames: string[];
  outputNames: string[];
  inputShapes: number[][];
  outputShapes: number[][];
  modelFormat: string;                 // e.g., 'ONNX'
  modelVersion?: string;
  domain?: string;
  producerName?: string;
  producerVersion?: string;
  description?: string;
}

export interface ONNXInferenceOptions {
  inputNames?: string[];
  outputNames?: string[];
  timeout?: number;                    // Override config timeout
}

export interface ONNXInferenceResult {
  outputs: Float32Array[];
  outputNames: string[];
  latency: number;                     // milliseconds
}

export interface ONNXTensor {
  data: Float32Array | Float32Array[];
  dims: number[];
  type?: 'float32' | 'int32' | 'int64' | 'string' | 'bool';
}
