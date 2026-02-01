/**
 * ONNXProvider Unit Tests
 *
 * Tests for WP05: ONNX Provider Implementation
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ONNXProvider } from '../onnx-provider.js';
import type { ONNXConfig } from '../onnx-types.js';

// Create mock session - shared reference
let sharedMockSession: any;

const createMockSession = () => {
  sharedMockSession = {
    run: vi.fn(),
    release: vi.fn().mockResolvedValue(undefined),
    inputNames: ['input'],
    outputNames: ['output'],
  };
  return sharedMockSession;
};

// Mock onnxruntime-node
vi.mock('onnxruntime-node', () => ({
  InferenceSession: {
    create: vi.fn(() => {
      if (!sharedMockSession) {
        createMockSession();
      }
      return Promise.resolve(sharedMockSession);
    }),
  },
  Tensor: vi.fn(),
}));

describe('ONNXProvider', () => {
  let provider: ONNXProvider;
  let config: ONNXConfig;
  let mockOrt: any;
  let mockSession: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a fresh mock session (resets sharedMockSession)
    mockSession = createMockSession();

    // Get the mocked module
    mockOrt = await import('onnxruntime-node');

    config = {
      modelPath: '/path/to/model.onnx',
      executionProviders: ['cpu'],
      sessionOptions: {
        graphOptimizationLevel: 'all',
        enableCpuMemArena: true,
      },
    };

    provider = new ONNXProvider({ config });
  });

  afterEach(async () => {
    await provider.dispose();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      await provider.initialize();

      expect(mockOrt.InferenceSession.create).toHaveBeenCalledWith(
        '/path/to/model.onnx',
        expect.objectContaining({
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
        })
      );
    });

    it('should load model on initialization', async () => {
      await provider.initialize();

      const sessionInfo = provider.getSessionInfo();
      expect(sessionInfo).not.toBeNull();
      expect(sessionInfo?.inputNames).toEqual(['input']);
      expect(sessionInfo?.outputNames).toEqual(['output']);
    });

    it('should not reinitialize if already initialized', async () => {
      await provider.initialize();
      await provider.initialize();

      expect(mockOrt.InferenceSession.create).toHaveBeenCalledTimes(1);
    });

    it('should throw on initialization failure', async () => {
      mockOrt.InferenceSession.create.mockRejectedValueOnce(new Error('Model not found'));

      await expect(provider.initialize()).rejects.toThrow('ONNX initialization failed');
    });

    it('should use custom session options', async () => {
      const customProvider = new ONNXProvider({
        config: {
          modelPath: '/model.onnx',
          sessionOptions: {
            graphOptimizationLevel: 'extended',
            enableProfiling: true,
            logSeverityLevel: 1,
          },
        },
      });

      await customProvider.initialize();

      expect(mockOrt.InferenceSession.create).toHaveBeenCalledWith(
        '/model.onnx',
        expect.objectContaining({
          graphOptimizationLevel: 'extended',
          enableProfiling: true,
          logSeverityLevel: 1,
        })
      );

      await customProvider.dispose();
    });
  });

  describe('loadModel()', () => {
    it('should load model from path', async () => {
      await provider.initialize();

      expect(mockOrt.InferenceSession.create).toHaveBeenCalledWith(
        '/path/to/model.onnx',
        expect.any(Object)
      );
    });

    it('should throw if ONNX Runtime not initialized', async () => {
      const uninitializedProvider = new ONNXProvider({ config });

      // Try to load without initializing
      await expect(uninitializedProvider.loadModel('/model.onnx')).rejects.toThrow(
        'ONNX Runtime not initialized'
      );
    });

    it('should emit model_loaded event', async () => {
      const eventSpy = vi.fn();
      provider.on('model_loaded', eventSpy);

      await provider.initialize();

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          modelPath: '/path/to/model.onnx',
          inputNames: ['input'],
          outputNames: ['output'],
        })
      );
    });
  });

  describe('runInference()', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should run inference with single input', async () => {
      const inputData = new Float32Array([1, 2, 3, 4]);
      const outputData = new Float32Array([5, 6, 7, 8]);

      mockSession.run.mockResolvedValueOnce({
        output: { data: outputData, dims: [4] },
      });

      const result = await provider.runInference(inputData);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            data: inputData,
            dims: [4],
          }),
        })
      );

      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0]).toBe(outputData);
      expect(result.outputNames).toEqual(['output']);
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should run inference with multiple inputs', async () => {
      mockSession.inputNames = ['input1', 'input2'];
      mockSession.outputNames = ['output1', 'output2'];

      const input1 = new Float32Array([1, 2]);
      const input2 = new Float32Array([3, 4]);
      const output1 = new Float32Array([5, 6]);
      const output2 = new Float32Array([7, 8]);

      mockSession.run.mockResolvedValueOnce({
        output1: { data: output1, dims: [2] },
        output2: { data: output2, dims: [2] },
      });

      const result = await provider.runInference([input1, input2]);

      expect(result.outputs).toHaveLength(2);
      expect(result.outputs[0]).toBe(output1);
      expect(result.outputs[1]).toBe(output2);
    });

    it('should respect timeout option', async () => {
      const inputData = new Float32Array([1, 2, 3]);

      mockSession.run.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ output: { data: new Float32Array([1]), dims: [1] } }), 1000);
          })
      );

      await expect(provider.runInference(inputData, { timeout: 100 })).rejects.toThrow('timed out');
    });

    it('should throw if model not loaded', async () => {
      const uninitializedProvider = new ONNXProvider({ config });
      const inputData = new Float32Array([1, 2, 3]);

      await expect(uninitializedProvider.runInference(inputData)).rejects.toThrow(
        'Model not loaded'
      );
    });

    it('should throw on input mismatch', async () => {
      const input1 = new Float32Array([1, 2]);
      const input2 = new Float32Array([3, 4]);

      // Session expects 1 input, we provide 2
      await expect(provider.runInference([input1, input2])).rejects.toThrow('Input mismatch');
    });

    it('should emit inference_complete event', async () => {
      const eventSpy = vi.fn();
      provider.on('inference_complete', eventSpy);

      const inputData = new Float32Array([1, 2, 3]);
      mockSession.run.mockResolvedValueOnce({
        output: { data: new Float32Array([1]), dims: [1] },
      });

      await provider.runInference(inputData);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          latency: expect.any(Number),
          inputSize: 3,
          outputSize: 1,
        })
      );
    });

    it('should emit inference_error event on failure', async () => {
      const eventSpy = vi.fn();
      provider.on('inference_error', eventSpy);

      const inputData = new Float32Array([1, 2, 3]);
      mockSession.run.mockRejectedValueOnce(new Error('Inference failed'));

      await expect(provider.runInference(inputData)).rejects.toThrow('Inference failed');
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Inference failed'),
        })
      );
    });
  });

  describe('getModelMetadata()', () => {
    it('should return model information', async () => {
      await provider.initialize();

      const metadata = provider.getModelMetadata();

      expect(metadata.name).toBe('model.onnx');
      expect(metadata.inputNames).toEqual(['input']);
      expect(metadata.outputNames).toEqual(['output']);
      expect(metadata.modelFormat).toBe('ONNX');
    });

    it('should throw if model not loaded', () => {
      expect(() => provider.getModelMetadata()).toThrow('Model not loaded');
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy when initialized', async () => {
      await provider.initialize();

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.modelLoaded).toBe(true);
      expect(health.initialized).toBe(true);
      expect(health.inferenceCount).toBe(0);
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it('should return unhealthy when not initialized', async () => {
      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.modelLoaded).toBe(false);
      expect(health.initialized).toBe(false);
    });

    it('should track inference metrics', async () => {
      await provider.initialize();

      const inputData = new Float32Array([1, 2, 3]);
      mockSession.run.mockResolvedValue({
        output: { data: new Float32Array([1]), dims: [1] },
      });

      await provider.runInference(inputData);
      await provider.runInference(inputData);

      const health = await provider.healthCheck();

      expect(health.inferenceCount).toBe(2);
      expect(health.averageLatency).toBeGreaterThanOrEqual(0);
      expect(health.errorRate).toBe(0);
    });

    it('should calculate error rate', async () => {
      await provider.initialize();

      const inputData = new Float32Array([1, 2, 3]);

      // First call succeeds
      mockSession.run.mockResolvedValueOnce({
        output: { data: new Float32Array([1]), dims: [1] },
      });
      await provider.runInference(inputData);

      // Second call fails
      mockSession.run.mockRejectedValueOnce(new Error('Inference failed'));
      try {
        await provider.runInference(inputData);
      } catch {
        // Expected to fail
      }

      const health = await provider.healthCheck();

      expect(health.inferenceCount).toBeGreaterThanOrEqual(1);
      expect(health.errorRate).toBeGreaterThan(0);
    });
  });

  describe('getSessionInfo()', () => {
    it('should return session information', async () => {
      await provider.initialize();

      const sessionInfo = provider.getSessionInfo();

      expect(sessionInfo).not.toBeNull();
      expect(sessionInfo?.inputNames).toEqual(['input']);
      expect(sessionInfo?.outputNames).toEqual(['output']);
      expect(sessionInfo?.executionProviders).toEqual(['cpu']);
    });

    it('should return null if session not created', () => {
      const sessionInfo = provider.getSessionInfo();

      expect(sessionInfo).toBeNull();
    });
  });

  describe('dispose()', () => {
    it('should release session on dispose', async () => {
      await provider.initialize();
      await provider.dispose();

      expect(mockSession.release).toHaveBeenCalled();
    });

    it('should handle dispose errors gracefully', async () => {
      await provider.initialize();
      mockSession.release.mockRejectedValueOnce(new Error('Release failed'));

      await expect(provider.dispose()).resolves.not.toThrow();
    });

    it('should clear all event listeners', async () => {
      const listener = vi.fn();
      provider.on('model_loaded', listener);

      await provider.dispose();

      expect(provider.listenerCount('model_loaded')).toBe(0);
    });

    it('should reset initialization state', async () => {
      await provider.initialize();
      await provider.dispose();

      const health = await provider.healthCheck();

      expect(health.initialized).toBe(false);
      expect(health.modelLoaded).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle session creation failure', async () => {
      mockOrt.InferenceSession.create.mockRejectedValueOnce(new Error('Invalid model'));

      await expect(provider.initialize()).rejects.toThrow('ONNX initialization failed');
    });

    it('should handle inference errors', async () => {
      await provider.initialize();

      const inputData = new Float32Array([1, 2, 3]);
      mockSession.run.mockRejectedValueOnce(new Error('CUDA out of memory'));

      await expect(provider.runInference(inputData)).rejects.toThrow('Inference failed');
    });

    it('should handle malformed inference results', async () => {
      await provider.initialize();

      const inputData = new Float32Array([1, 2, 3]);
      mockSession.run.mockResolvedValueOnce({});

      const result = await provider.runInference(inputData);

      expect(result.outputs).toHaveLength(0);
    });
  });

  describe('configuration', () => {
    it('should support multiple execution providers', async () => {
      const gpuProvider = new ONNXProvider({
        config: {
          modelPath: '/model.onnx',
          executionProviders: ['cuda', 'cpu'],
        },
      });

      await gpuProvider.initialize();

      expect(mockOrt.InferenceSession.create).toHaveBeenCalledWith(
        '/model.onnx',
        expect.objectContaining({
          executionProviders: ['cuda', 'cpu'],
        })
      );

      await gpuProvider.dispose();
    });

    it('should use default execution provider if not specified', async () => {
      const defaultProvider = new ONNXProvider({
        config: {
          modelPath: '/model.onnx',
        },
      });

      await defaultProvider.initialize();

      expect(mockOrt.InferenceSession.create).toHaveBeenCalledWith(
        '/model.onnx',
        expect.objectContaining({
          executionProviders: ['cpu'],
        })
      );

      await defaultProvider.dispose();
    });

    it('should respect custom timeout', async () => {
      const customTimeoutProvider = new ONNXProvider({
        config: {
          modelPath: '/model.onnx',
          timeout: 5000,
        },
      });

      await customTimeoutProvider.initialize();

      const inputData = new Float32Array([1, 2, 3]);
      mockSession.run.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ output: { data: new Float32Array([1]), dims: [1] } }), 6000);
          })
      );

      await expect(customTimeoutProvider.runInference(inputData)).rejects.toThrow('timed out');

      await customTimeoutProvider.dispose();
    });
  });
});
