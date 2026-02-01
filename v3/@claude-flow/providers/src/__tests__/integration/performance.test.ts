/**
 * WP12: Performance Integration Tests
 *
 * Tests performance characteristics:
 * - Provider initialization time
 * - Request latency per provider
 * - Concurrent request handling
 * - Memory usage under load
 * - Circuit breaker activation
 *
 * @module @claude-flow/providers/__tests__/integration/performance
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderManager } from '../../provider-manager.js';
import {
  MockProvider,
  createTestRequest,
  Timer,
  MemoryTracker,
  silentLogger,
} from '../test-helpers.js';

describe('Performance Integration Tests', () => {
  describe('Provider Initialization Time', () => {
    it('should initialize provider quickly', async () => {
      const timer = new Timer();

      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const elapsed = timer.elapsed();

      // Should initialize in under 1 second
      expect(elapsed).toBeLessThan(1000);

      provider.destroy();
    });

    it('should initialize multiple providers concurrently', async () => {
      const timer = new Timer();

      const providers = [
        new MockProvider('anthropic', { supportedModels: ['claude-3-5-sonnet-latest'] }),
        new MockProvider('openai', { supportedModels: ['gpt-4o'] }),
        new MockProvider('google', { supportedModels: ['gemini-2.0-flash'] }),
      ];

      await Promise.all(providers.map((p) => p.initialize()));

      const elapsed = timer.elapsed();

      // Concurrent initialization should be fast
      expect(elapsed).toBeLessThan(2000);

      providers.forEach((p) => p.destroy());
    });

    it('should warm up provider manager efficiently', async () => {
      const timer = new Timer();

      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
            { provider: 'openai', model: 'gpt-4o' },
          ],
        },
        silentLogger
      );

      const p1 = new MockProvider('anthropic', { supportedModels: ['claude-3-5-sonnet-latest'] });
      const p2 = new MockProvider('openai', { supportedModels: ['gpt-4o'] });

      await p1.initialize();
      await p2.initialize();

      (manager as any).providers.set('anthropic', p1);
      (manager as any).providers.set('openai', p2);

      const elapsed = timer.elapsed();

      expect(elapsed).toBeLessThan(3000);

      manager.destroy();
      p1.destroy();
      p2.destroy();
    });
  });

  describe('Request Latency Per Provider', () => {
    it('should measure baseline latency', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      provider.setResponseDelay(100); // Simulate network delay

      const timer = new Timer();
      const response = await provider.complete(createTestRequest());
      const elapsed = timer.elapsed();

      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(response.latency).toBeDefined();

      provider.destroy();
    });

    it('should compare latency across providers', async () => {
      const fastProvider = new MockProvider('google', {
        supportedModels: ['gemini-2.0-flash'],
      });
      const slowProvider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-opus-20240229'],
      });

      await fastProvider.initialize();
      await slowProvider.initialize();

      fastProvider.setResponseDelay(50);
      slowProvider.setResponseDelay(200);

      const timer1 = new Timer();
      await fastProvider.complete(createTestRequest());
      const fastTime = timer1.elapsed();

      const timer2 = new Timer();
      await slowProvider.complete(createTestRequest());
      const slowTime = timer2.elapsed();

      expect(fastTime).toBeLessThan(slowTime);

      fastProvider.destroy();
      slowProvider.destroy();
    });

    it('should track average latency over multiple requests', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      provider.setResponseDelay(100);

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await provider.complete(createTestRequest());
      }

      const usage = await provider.getUsage();

      expect(usage.averageLatency).toBeGreaterThan(90);
      expect(usage.averageLatency).toBeLessThan(150);

      provider.destroy();
    });

    it('should identify latency outliers', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const latencies: number[] = [];

      // Normal requests
      for (let i = 0; i < 3; i++) {
        provider.setResponseDelay(100);
        const timer = new Timer();
        await provider.complete(createTestRequest());
        latencies.push(timer.elapsed());
      }

      // Outlier request
      provider.setResponseDelay(500);
      const timer = new Timer();
      await provider.complete(createTestRequest());
      const outlier = timer.elapsed();

      expect(outlier).toBeGreaterThan(latencies[0] * 3);

      provider.destroy();
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent requests efficiently', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      provider.setResponseDelay(100);

      const timer = new Timer();

      // 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        provider.complete(createTestRequest())
      );

      await Promise.all(promises);

      const elapsed = timer.elapsed();

      // Should process concurrently, not sequentially
      // Sequential would take 1000ms+, concurrent should be ~100ms
      expect(elapsed).toBeLessThan(500);

      provider.destroy();
    });

    it('should maintain accuracy under concurrent load', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const concurrency = 20;
      const promises = Array.from({ length: concurrency }, (_, i) => {
        provider.setMockResponse({
          id: `response-${i}`,
          content: `Response ${i}`,
        });
        return provider.complete(createTestRequest());
      });

      const responses = await Promise.all(promises);

      // All responses should be unique and correct
      expect(responses.length).toBe(concurrency);
      responses.forEach((response, i) => {
        expect(response.id).toBeDefined();
      });

      provider.destroy();
    });

    it('should not degrade under sustained load', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      provider.setResponseDelay(50);

      // Measure first batch
      const timer1 = new Timer();
      await Promise.all(
        Array.from({ length: 10 }, () => provider.complete(createTestRequest()))
      );
      const time1 = timer1.elapsed();

      // Measure second batch
      const timer2 = new Timer();
      await Promise.all(
        Array.from({ length: 10 }, () => provider.complete(createTestRequest()))
      );
      const time2 = timer2.elapsed();

      // Second batch should not be significantly slower
      const degradation = (time2 - time1) / time1;
      expect(degradation).toBeLessThan(0.5); // Less than 50% degradation

      provider.destroy();
    });

    it('should queue requests when at capacity', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      provider.setResponseDelay(200);

      // Launch many requests
      const promises = Array.from({ length: 50 }, () =>
        provider.complete(createTestRequest())
      );

      // Check status while processing
      await new Promise((resolve) => setTimeout(resolve, 50));
      const status = provider.getStatus();

      expect(status.queueLength).toBeGreaterThan(0);

      await Promise.all(promises);

      provider.destroy();
    });
  });

  describe('Memory Usage Under Load', () => {
    it('should not leak memory on repeated requests', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const tracker = new MemoryTracker();
      tracker.snapshot('baseline');

      // Make many requests
      for (let i = 0; i < 100; i++) {
        await provider.complete(createTestRequest());
      }

      tracker.snapshot('after-requests');

      const delta = tracker.getDelta();

      // Should not grow significantly (under 10MB)
      expect(delta).toBeLessThan(10);

      provider.destroy();
    });

    it('should clean up resources after destroy', async () => {
      const tracker = new MemoryTracker();
      tracker.snapshot('baseline');

      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      // Make requests
      for (let i = 0; i < 50; i++) {
        await provider.complete(createTestRequest());
      }

      tracker.snapshot('after-usage');

      provider.destroy();

      // Give GC time to run
      if (global.gc) global.gc();
      await new Promise((resolve) => setTimeout(resolve, 100));

      tracker.snapshot('after-destroy');

      const snapshots = tracker.getSnapshots();

      // Memory after destroy should be closer to baseline
      expect(snapshots[2].delta).toBeLessThan(snapshots[1].delta * 1.5);
    });

    it('should limit cache size to prevent memory bloat', async () => {
      const manager = new ProviderManager(
        {
          providers: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-latest' }],
          cache: {
            enabled: true,
            ttl: 60000,
            maxSize: 100,
          },
        },
        silentLogger
      );

      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();
      (manager as any).providers.set('anthropic', provider);

      const tracker = new MemoryTracker();
      tracker.snapshot('baseline');

      // Make many unique requests (should exceed cache size)
      for (let i = 0; i < 200; i++) {
        await manager.complete(createTestRequest(`Unique prompt ${i}`));
      }

      tracker.snapshot('after-cache-overflow');

      // Cache should be bounded
      const cacheSize = (manager as any).cache.size;
      expect(cacheSize).toBeLessThanOrEqual(100);

      manager.destroy();
      provider.destroy();
    });
  });

  describe('Circuit Breaker Activation', () => {
    it('should open circuit breaker after threshold failures', async () => {
      const provider = new MockProvider(
        'anthropic',
        { supportedModels: ['claude-3-5-sonnet-latest'] },
        {
          circuitBreakerOptions: {
            threshold: 3,
            resetTimeout: 5000,
          },
        }
      );

      await provider.initialize();

      // Cause failures
      for (let i = 0; i < 3; i++) {
        provider.setMockError(new Error(`Failure ${i}`));
        await provider.complete(createTestRequest()).catch(() => {});
      }

      // Circuit breaker should be open
      provider.setMockError(new Error('Should not reach this'));

      await expect(provider.complete(createTestRequest())).rejects.toThrow('Circuit breaker');

      provider.destroy();
    });

    it('should reset circuit breaker after timeout', async () => {
      const provider = new MockProvider(
        'anthropic',
        { supportedModels: ['claude-3-5-sonnet-latest'] },
        {
          circuitBreakerOptions: {
            threshold: 2,
            resetTimeout: 100, // Short timeout for testing
          },
        }
      );

      await provider.initialize();

      // Trigger circuit breaker
      for (let i = 0; i < 2; i++) {
        provider.setMockError(new Error('Failure'));
        await provider.complete(createTestRequest()).catch(() => {});
      }

      // Should be open
      await expect(provider.complete(createTestRequest())).rejects.toThrow('Circuit breaker');

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be half-open, allow one request
      provider.setMockResponse({ content: 'Success after reset' });
      const response = await provider.complete(createTestRequest());

      expect(response.content).toBe('Success after reset');

      provider.destroy();
    });

    it('should close circuit breaker on success', async () => {
      const provider = new MockProvider(
        'anthropic',
        { supportedModels: ['claude-3-5-sonnet-latest'] },
        {
          circuitBreakerOptions: {
            threshold: 3,
            resetTimeout: 100,
          },
        }
      );

      await provider.initialize();

      // One failure
      provider.setMockError(new Error('Failure'));
      await provider.complete(createTestRequest()).catch(() => {});

      // Then success
      provider.setMockResponse({ content: 'Success' });
      await provider.complete(createTestRequest());

      // Circuit should be closed (not trigger with more failures needed)
      const circuitBreaker = (provider as any).circuitBreaker;
      expect(circuitBreaker.getState()).toBe('closed');

      provider.destroy();
    });

    it('should track circuit breaker state per provider', async () => {
      const p1 = new MockProvider(
        'anthropic',
        { supportedModels: ['claude-3-5-sonnet-latest'] },
        { circuitBreakerOptions: { threshold: 2 } }
      );

      const p2 = new MockProvider(
        'openai',
        { supportedModels: ['gpt-4o'] },
        { circuitBreakerOptions: { threshold: 2 } }
      );

      await p1.initialize();
      await p2.initialize();

      // Fail p1
      for (let i = 0; i < 2; i++) {
        p1.setMockError(new Error('P1 Failure'));
        await p1.complete(createTestRequest()).catch(() => {});
      }

      // p1 circuit should be open
      await expect(p1.complete(createTestRequest())).rejects.toThrow('Circuit breaker');

      // p2 should still work
      p2.setMockResponse({ content: 'P2 works' });
      const response = await p2.complete(createTestRequest());
      expect(response.content).toBe('P2 works');

      p1.destroy();
      p2.destroy();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should benchmark request throughput', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      provider.setResponseDelay(10);

      const requestCount = 100;
      const timer = new Timer();

      const promises = Array.from({ length: requestCount }, () =>
        provider.complete(createTestRequest())
      );

      await Promise.all(promises);

      const elapsed = timer.elapsed();
      const throughput = (requestCount / elapsed) * 1000; // requests per second

      console.log(`Throughput: ${throughput.toFixed(2)} req/sec`);

      expect(throughput).toBeGreaterThan(10); // At least 10 req/sec

      provider.destroy();
    });

    it('should benchmark streaming performance', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
        supportsStreaming: true,
      });

      await provider.initialize();

      provider.setResponseDelay(100);

      const timer = new Timer();

      let chunkCount = 0;
      for await (const event of provider.streamComplete(createTestRequest())) {
        if (event.type === 'content') {
          chunkCount++;
        }
      }

      const elapsed = timer.elapsed();

      console.log(`Streaming: ${chunkCount} chunks in ${elapsed}ms`);

      expect(chunkCount).toBeGreaterThan(0);

      provider.destroy();
    });

    it('should measure provider manager overhead', async () => {
      // Direct provider
      const directProvider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await directProvider.initialize();
      directProvider.setResponseDelay(10);

      const timer1 = new Timer();
      await directProvider.complete(createTestRequest());
      const directTime = timer1.elapsed();

      // Via manager
      const manager = new ProviderManager(
        {
          providers: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-latest' }],
        },
        silentLogger
      );

      const managedProvider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await managedProvider.initialize();
      managedProvider.setResponseDelay(10);
      (manager as any).providers.set('anthropic', managedProvider);

      const timer2 = new Timer();
      await manager.complete(createTestRequest());
      const managedTime = timer2.elapsed();

      const overhead = managedTime - directTime;

      console.log(`Manager overhead: ${overhead}ms`);

      // Overhead should be minimal (< 50ms)
      expect(overhead).toBeLessThan(50);

      directProvider.destroy();
      manager.destroy();
      managedProvider.destroy();
    });
  });
});
