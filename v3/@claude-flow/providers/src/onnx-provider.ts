/**
 * V3 ONNX Provider (Local ML Inference)
 *
 * Supports ONNX Runtime for local ML model inference.
 * Zero cost - runs entirely locally.
 * Ideal for embeddings, classification, and small ML tasks.
 *
 * @module @claude-flow/providers/onnx-provider
 */

import { EventEmitter } from 'events';
import type {
  ONNXConfig,
  ONNXModelInfo,
  ONNXInferenceOptions,
  ONNXInferenceResult,
  ONNXTensor,
  ONNXSessionOptions,
} from './onnx-types.js';

/**
 * ONNX Runtime types (will be dynamically imported)
 */
interface InferenceSession {
  run(feeds: Record<string, { data: Float32Array; dims: number[] }>): Promise<Record<string, { data: Float32Array; dims: number[] }>>;
  release(): Promise<void>;
  inputNames: string[];
  outputNames: string[];
}

interface Tensor {
  data: Float32Array;
  dims: number[];
  type: string;
}

interface ONNXRuntime {
  InferenceSession: {
    create(
      modelPath: string,
      options?: {
        executionProviders?: string[];
        graphOptimizationLevel?: string;
        enableCpuMemArena?: boolean;
        enableMemPattern?: boolean;
        executionMode?: string;
        interOpNumThreads?: number;
        intraOpNumThreads?: number;
        logId?: string;
        logSeverityLevel?: number;
        enableProfiling?: boolean;
      }
    ): Promise<InferenceSession>;
  };
  Tensor: {
    new (type: string, data: Float32Array, dims: number[]): Tensor;
  };
}

export interface ONNXProviderOptions {
  config: ONNXConfig;
  logger?: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: unknown): void;
    debug(message: string, meta?: Record<string, unknown>): void;
  };
}

/**
 * Console logger implementation
 */
const consoleLogger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(`[INFO] ${msg}`, meta || ''),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[WARN] ${msg}`, meta || ''),
  error: (msg: string, err?: unknown) => console.error(`[ERROR] ${msg}`, err || ''),
  debug: (msg: string, meta?: Record<string, unknown>) => console.debug(`[DEBUG] ${msg}`, meta || ''),
};

export class ONNXProvider extends EventEmitter {
  private session: InferenceSession | null = null;
  private ort: ONNXRuntime | null = null;
  private config: ONNXConfig;
  private logger: typeof consoleLogger;
  private modelInfo: ONNXModelInfo | null = null;
  private isInitialized = false;

  // Metrics
  private inferenceCount = 0;
  private totalLatency = 0;
  private errorCount = 0;

  constructor(options: ONNXProviderOptions) {
    super();
    this.config = options.config;
    this.logger = options.logger || consoleLogger;
  }

  /**
   * Initialize ONNX Runtime and load model
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('ONNX Provider already initialized');
      return;
    }

    this.logger.info('Initializing ONNX Provider', {
      modelPath: this.config.modelPath,
      executionProviders: this.config.executionProviders || ['cpu'],
    });

    try {
      // Dynamically import onnxruntime-node
      const ortModule = await import('onnxruntime-node');
      this.ort = ortModule as unknown as ONNXRuntime;

      // Load model
      await this.loadModel(this.config.modelPath);

      this.isInitialized = true;
      this.logger.info('ONNX Provider initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize ONNX Provider', error);
      throw new Error(`ONNX initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Load ONNX model from file path
   */
  async loadModel(modelPath: string): Promise<void> {
    if (!this.ort) {
      throw new Error('ONNX Runtime not initialized');
    }

    this.logger.info(`Loading ONNX model from ${modelPath}`);

    const startTime = Date.now();

    try {
      // Create session options
      const sessionOptions = this.buildSessionOptions();

      // Create inference session
      this.session = await this.ort.InferenceSession.create(modelPath, sessionOptions);

      const loadTime = Date.now() - startTime;

      // Extract model metadata (must be after session is created)
      this.modelInfo = this.extractModelInfo();

      this.logger.info(`Model loaded successfully in ${loadTime}ms`);

      this.emit('model_loaded', {
        modelPath,
        loadTime,
        inputNames: this.session.inputNames,
        outputNames: this.session.outputNames,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to load ONNX model', error);
      throw new Error(`Model loading failed: ${errorMessage}`);
    }
  }

  /**
   * Run inference on the loaded model
   */
  async runInference(
    inputs: Float32Array | Float32Array[],
    options?: ONNXInferenceOptions
  ): Promise<ONNXInferenceResult> {
    if (!this.session) {
      throw new Error('Model not loaded. Call initialize() first.');
    }

    const startTime = Date.now();

    try {
      // Prepare inputs
      const inputArray = Array.isArray(inputs) ? inputs : [inputs];
      const inputNames = options?.inputNames || this.session.inputNames;

      if (inputArray.length !== inputNames.length) {
        throw new Error(
          `Input mismatch: expected ${inputNames.length} inputs, got ${inputArray.length}`
        );
      }

      // Build feed dictionary
      const feeds: Record<string, { data: Float32Array; dims: number[] }> = {};
      inputArray.forEach((data, idx) => {
        const name = inputNames[idx];
        feeds[name] = {
          data,
          dims: this.inferInputShape(data),
        };
      });

      // Run inference with timeout
      const timeout = options?.timeout || this.config.timeout || 30000;
      const inferencePromise = this.session.run(feeds);

      const results = await this.withTimeout(inferencePromise, timeout);

      // Extract outputs
      const outputNames = options?.outputNames || this.session.outputNames;
      const outputs: Float32Array[] = [];

      outputNames.forEach((name) => {
        const tensor = results[name];
        if (tensor) {
          outputs.push(tensor.data);
        }
      });

      const latency = Date.now() - startTime;

      // Track metrics
      this.inferenceCount++;
      this.totalLatency += latency;

      const result: ONNXInferenceResult = {
        outputs,
        outputNames,
        latency,
      };

      this.emit('inference_complete', {
        latency,
        inputSize: inputArray.reduce((sum, arr) => sum + arr.length, 0),
        outputSize: outputs.reduce((sum, arr) => sum + arr.length, 0),
      });

      return result;
    } catch (error) {
      this.errorCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Inference failed', error);

      this.emit('inference_error', { error: errorMessage });

      throw new Error(`Inference failed: ${errorMessage}`);
    }
  }

  /**
   * Get model metadata and information
   */
  getModelMetadata(): ONNXModelInfo {
    if (!this.modelInfo) {
      throw new Error('Model not loaded');
    }
    return { ...this.modelInfo };
  }

  /**
   * Check provider health
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    modelLoaded: boolean;
    initialized: boolean;
    inferenceCount: number;
    averageLatency: number;
    errorRate: number;
    timestamp: Date;
  }> {
    const averageLatency = this.inferenceCount > 0 ? this.totalLatency / this.inferenceCount : 0;
    const errorRate = this.inferenceCount > 0 ? this.errorCount / this.inferenceCount : 0;

    return {
      healthy: this.isInitialized && this.session !== null,
      modelLoaded: this.session !== null,
      initialized: this.isInitialized,
      inferenceCount: this.inferenceCount,
      averageLatency,
      errorRate,
      timestamp: new Date(),
    };
  }

  /**
   * Get current session information
   */
  getSessionInfo(): {
    inputNames: string[];
    outputNames: string[];
    executionProviders: string[];
  } | null {
    if (!this.session) {
      return null;
    }

    return {
      inputNames: this.session.inputNames,
      outputNames: this.session.outputNames,
      executionProviders: this.config.executionProviders || ['cpu'],
    };
  }

  /**
   * Dispose of resources and cleanup
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing ONNX Provider');

    if (this.session) {
      try {
        await this.session.release();
        this.session = null;
      } catch (error) {
        this.logger.error('Error releasing session', error);
      }
    }

    this.isInitialized = false;
    this.modelInfo = null;
    this.removeAllListeners();

    this.logger.info('ONNX Provider disposed');
  }

  // ===== PRIVATE METHODS =====

  /**
   * Build session options from config
   */
  private buildSessionOptions(): {
    executionProviders?: string[];
    graphOptimizationLevel?: string;
    enableCpuMemArena?: boolean;
    enableMemPattern?: boolean;
    executionMode?: string;
    interOpNumThreads?: number;
    intraOpNumThreads?: number;
    logId?: string;
    logSeverityLevel?: number;
    enableProfiling?: boolean;
  } {
    const opts = this.config.sessionOptions || {};

    return {
      executionProviders: this.config.executionProviders || ['cpu'],
      graphOptimizationLevel: opts.graphOptimizationLevel || 'all',
      enableCpuMemArena: opts.enableCpuMemArena !== false,
      enableMemPattern: opts.enableMemPattern !== false,
      executionMode: opts.executionMode || 'sequential',
      interOpNumThreads: opts.interOpNumThreads,
      intraOpNumThreads: opts.intraOpNumThreads,
      logId: opts.logId,
      logSeverityLevel: opts.logSeverityLevel !== undefined ? opts.logSeverityLevel : 2,
      enableProfiling: opts.enableProfiling || false,
    };
  }

  /**
   * Extract model information from session
   */
  private extractModelInfo(): ONNXModelInfo {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    return {
      name: this.config.modelPath.split('/').pop() || 'unknown',
      inputNames: this.session.inputNames,
      outputNames: this.session.outputNames,
      inputShapes: this.session.inputNames.map(() => []), // Will be populated on first inference
      outputShapes: this.session.outputNames.map(() => []),
      modelFormat: 'ONNX',
      description: 'ONNX Runtime model',
    };
  }

  /**
   * Infer input shape from data
   */
  private inferInputShape(data: Float32Array): number[] {
    // Simple 1D shape inference - override for multi-dimensional tensors
    return [data.length];
  }

  /**
   * Add timeout to promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }
}
