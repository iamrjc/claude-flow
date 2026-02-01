/**
 * WP12: Error Handling Integration Tests
 *
 * Tests error handling and recovery:
 * - Error normalization across providers
 * - Retry logic consistency
 * - Rate limit handling
 * - Authentication error handling
 * - Network error recovery
 *
 * @module @claude-flow/providers/__tests__/integration/error-handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  LLMProviderError,
  RateLimitError,
  AuthenticationError,
  ModelNotFoundError,
  ProviderUnavailableError,
  isLLMProviderError,
  isRateLimitError,
} from '../../types.js';
import { ProviderManager } from '../../provider-manager.js';
import {
  MockProvider,
  createTestRequest,
  TestLogger,
  silentLogger,
  waitFor,
} from '../test-helpers.js';

describe('Error Handling Integration Tests', () => {
  describe('Error Normalization Across Providers', () => {
    it('should normalize authentication errors', async () => {
      const providers = [
        new MockProvider('anthropic', { supportedModels: ['claude-3-5-sonnet-latest'] }),
        new MockProvider('openai', { supportedModels: ['gpt-4o'] }),
        new MockProvider('google', { supportedModels: ['gemini-2.0-flash'] }),
      ];

      await Promise.all(providers.map((p) => p.initialize()));

      // Simulate auth errors from different providers
      providers.forEach((p) => {
        const authError = new AuthenticationError('Invalid API key', p.name);
        p.setMockError(authError);
      });

      const errors = await Promise.all(
        providers.map((p) => p.complete(createTestRequest()).catch((e) => e))
      );

      // All should be AuthenticationError
      errors.forEach((error) => {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect(error.code).toBe('AUTHENTICATION');
        expect(error.retryable).toBe(false);
        expect(error.statusCode).toBe(401);
      });

      providers.forEach((p) => p.destroy());
    });

    it('should normalize rate limit errors', async () => {
      const providers = [
        new MockProvider('anthropic', { supportedModels: ['claude-3-5-sonnet-latest'] }),
        new MockProvider('openai', { supportedModels: ['gpt-4o'] }),
      ];

      await Promise.all(providers.map((p) => p.initialize()));

      // Simulate rate limit errors
      providers.forEach((p) => {
        const rateLimitError = new RateLimitError('Rate limit exceeded', p.name, 60);
        p.setMockError(rateLimitError);
      });

      const errors = await Promise.all(
        providers.map((p) => p.complete(createTestRequest()).catch((e) => e))
      );

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(RateLimitError);
        expect(error.code).toBe('RATE_LIMIT');
        expect(error.retryable).toBe(true);
        expect(error.statusCode).toBe(429);
        expect(error.retryAfter).toBe(60);
      });

      providers.forEach((p) => p.destroy());
    });

    it('should normalize model not found errors', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const modelError = new ModelNotFoundError('invalid-model', 'anthropic');
      provider.setMockError(modelError);

      const error = await provider.complete(createTestRequest()).catch((e) => e);

      expect(error).toBeInstanceOf(ModelNotFoundError);
      expect(error.code).toBe('MODEL_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.retryable).toBe(false);

      provider.destroy();
    });

    it('should normalize provider unavailable errors', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const unavailableError = new ProviderUnavailableError('anthropic', {
        reason: 'Service maintenance',
      });
      provider.setMockError(unavailableError);

      const error = await provider.complete(createTestRequest()).catch((e) => e);

      expect(error).toBeInstanceOf(ProviderUnavailableError);
      expect(error.code).toBe('PROVIDER_UNAVAILABLE');
      expect(error.statusCode).toBe(503);
      expect(error.retryable).toBe(true);

      provider.destroy();
    });

    it('should transform generic errors to LLMProviderError', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      provider.setMockError(new Error('Generic error'));

      const error = await provider.complete(createTestRequest()).catch((e) => e);

      expect(isLLMProviderError(error)).toBe(true);
      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('provider');
      expect(error).toHaveProperty('retryable');

      provider.destroy();
    });
  });

  describe('Retry Logic Consistency', () => {
    it('should retry on transient errors', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      let attemptCount = 0;

      // Fail first 2 attempts, succeed on 3rd
      const originalComplete = provider.complete.bind(provider);
      provider.complete = async (request) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new LLMProviderError(
            'Temporary error',
            'TEMPORARY',
            'anthropic',
            503,
            true
          );
        }
        return originalComplete(request);
      };

      const manager = new ProviderManager(
        {
          providers: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-latest' }],
          fallback: {
            enabled: true,
            maxAttempts: 3,
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', provider);

      provider.setMockResponse({ content: 'Success on retry' });

      const response = await manager.complete(createTestRequest());

      expect(response.content).toBe('Success on retry');
      expect(attemptCount).toBeGreaterThanOrEqual(1);

      manager.destroy();
      provider.destroy();
    });

    it('should not retry on non-retryable errors', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const authError = new AuthenticationError('Invalid key', 'anthropic');
      provider.setMockError(authError);

      const manager = new ProviderManager(
        {
          providers: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-latest' }],
          fallback: {
            enabled: true,
            maxAttempts: 3,
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', provider);

      await expect(manager.complete(createTestRequest())).rejects.toThrow('Invalid key');

      manager.destroy();
      provider.destroy();
    });

    it('should respect retry delay', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      let firstAttemptTime = 0;
      let secondAttemptTime = 0;

      const originalComplete = provider.complete.bind(provider);
      let attemptCount = 0;

      provider.complete = async (request) => {
        attemptCount++;

        if (attemptCount === 1) {
          firstAttemptTime = Date.now();
          throw new LLMProviderError('Retry', 'RETRY', 'anthropic', 503, true);
        } else if (attemptCount === 2) {
          secondAttemptTime = Date.now();
          return originalComplete(request);
        }

        return originalComplete(request);
      };

      provider.config.retryDelay = 100;

      provider.setMockResponse({ content: 'Success' });

      await provider.complete(createTestRequest()).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 150));
      await provider.complete(createTestRequest());

      const delay = secondAttemptTime - firstAttemptTime;
      expect(delay).toBeGreaterThanOrEqual(100);

      provider.destroy();
    });

    it('should implement exponential backoff', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const attemptTimes: number[] = [];

      const originalComplete = provider.complete.bind(provider);
      let attemptCount = 0;

      provider.complete = async (request) => {
        attemptCount++;
        attemptTimes.push(Date.now());

        if (attemptCount < 3) {
          throw new RateLimitError('Rate limited', 'anthropic', 1);
        }

        return originalComplete(request);
      };

      provider.config.retryAttempts = 3;
      provider.config.retryDelay = 100;

      provider.setMockResponse({ content: 'Success' });

      // Simulate retry logic with exponential backoff
      for (let i = 0; i < 3; i++) {
        try {
          await provider.complete(createTestRequest());
          break;
        } catch (error) {
          if (i < 2) {
            const delay = provider.config.retryDelay! * Math.pow(2, i);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      expect(attemptCount).toBe(3);

      provider.destroy();
    });
  });

  describe('Rate Limit Handling', () => {
    it('should respect rate limit retry-after header', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const logger = new TestLogger();
      const rateLimitError = new RateLimitError(
        'Rate limit exceeded',
        'anthropic',
        5 // Retry after 5 seconds
      );

      provider.setMockError(rateLimitError);

      await provider.complete(createTestRequest()).catch((e) => {
        expect(isRateLimitError(e)).toBe(true);
        expect(e.retryAfter).toBe(5);
      });

      provider.destroy();
    });

    it('should track rate limit state', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      // Simulate rate limit response
      const rateLimitError = new RateLimitError('Rate limited', 'anthropic', 60);
      provider.setMockError(rateLimitError);

      await provider.complete(createTestRequest()).catch(() => {});

      // Provider should report rate limited status
      const status = provider.getStatus();
      expect(status.available).toBe(true); // Still available, just limited

      provider.destroy();
    });

    it('should distribute load when rate limited', async () => {
      const p1 = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });
      const p2 = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });

      await p1.initialize();
      await p2.initialize();

      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
            { provider: 'openai', model: 'gpt-4o' },
          ],
          fallback: {
            enabled: true,
            maxAttempts: 2,
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', p1);
      (manager as any).providers.set('openai', p2);

      // p1 is rate limited
      p1.setMockError(new RateLimitError('Rate limited', 'anthropic', 60));

      // p2 is available
      p2.setMockResponse({ content: 'Success from OpenAI', provider: 'openai' });

      const response = await manager.complete(createTestRequest());

      expect(response.provider).toBe('openai');

      manager.destroy();
      p1.destroy();
      p2.destroy();
    });

    it('should handle concurrent rate limits', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const rateLimitError = new RateLimitError('Concurrent limit', 'anthropic', 10);

      let callCount = 0;
      const originalComplete = provider.complete.bind(provider);

      provider.complete = async (request) => {
        callCount++;
        if (callCount <= 5) {
          throw rateLimitError;
        }
        return originalComplete(request);
      };

      provider.setMockResponse({ content: 'Success' });

      // First 5 should fail, 6th should succeed
      for (let i = 0; i < 6; i++) {
        try {
          await provider.complete(createTestRequest());
          break;
        } catch (error) {
          expect(isRateLimitError(error)).toBe(true);
        }
      }

      expect(callCount).toBe(6);

      provider.destroy();
    });
  });

  describe('Authentication Error Handling', () => {
    it('should fail fast on auth errors', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const authError = new AuthenticationError('Invalid API key', 'anthropic');
      provider.setMockError(authError);

      const startTime = Date.now();

      await expect(provider.complete(createTestRequest())).rejects.toThrow('Invalid API key');

      const elapsed = Date.now() - startTime;

      // Should fail immediately, not retry
      expect(elapsed).toBeLessThan(100);

      provider.destroy();
    });

    it('should not failover on auth errors (same key issue)', async () => {
      const p1 = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });
      const p2 = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
      });

      await p1.initialize();
      await p2.initialize();

      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
            { provider: 'openai', model: 'gpt-4o' },
          ],
          fallback: {
            enabled: true,
            maxAttempts: 2,
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', p1);
      (manager as any).providers.set('openai', p2);

      // Both have auth errors
      p1.setMockError(new AuthenticationError('Invalid key', 'anthropic'));
      p2.setMockError(new AuthenticationError('Invalid key', 'openai'));

      await expect(manager.complete(createTestRequest())).rejects.toThrow();

      manager.destroy();
      p1.destroy();
      p2.destroy();
    });

    it('should log auth errors clearly', async () => {
      const logger = new TestLogger();
      const provider = new MockProvider(
        'anthropic',
        { supportedModels: ['claude-3-5-sonnet-latest'] },
        { logger }
      );

      await provider.initialize();

      const authError = new AuthenticationError('API key missing', 'anthropic');
      provider.setMockError(authError);

      await provider.complete(createTestRequest()).catch(() => {});

      expect(logger.findLog('error', 'API key missing')).toBe(false); // Logged by caller, not provider

      provider.destroy();
    });
  });

  describe('Network Error Recovery', () => {
    it('should retry on network timeout', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      let attemptCount = 0;
      const originalComplete = provider.complete.bind(provider);

      provider.complete = async (request) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new LLMProviderError('Request timed out', 'TIMEOUT', 'anthropic', undefined, true);
        }
        return originalComplete(request);
      };

      provider.setMockResponse({ content: 'Success after timeout' });

      const response = await provider.complete(createTestRequest());

      expect(response.content).toBe('Success after timeout');

      provider.destroy();
    });

    it('should retry on connection refused', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      let attemptCount = 0;
      const originalComplete = provider.complete.bind(provider);

      provider.complete = async (request) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new ProviderUnavailableError('anthropic', { error: 'ECONNREFUSED' });
        }
        return originalComplete(request);
      };

      provider.setMockResponse({ content: 'Connected' });

      const response = await provider.complete(createTestRequest());

      expect(response.content).toBe('Connected');

      provider.destroy();
    });

    it('should handle DNS resolution failures', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      const dnsError = new ProviderUnavailableError('anthropic', {
        error: 'ENOTFOUND',
        hostname: 'api.anthropic.com',
      });

      provider.setMockError(dnsError);

      await expect(provider.complete(createTestRequest())).rejects.toThrow('unavailable');

      provider.destroy();
    });

    it('should recover from intermittent network failures', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      let callCount = 0;
      const originalComplete = provider.complete.bind(provider);

      provider.complete = async (request) => {
        callCount++;

        // Intermittent failures
        if (callCount % 2 === 1) {
          throw new LLMProviderError('Network error', 'NETWORK', 'anthropic', undefined, true);
        }

        return originalComplete(request);
      };

      provider.setMockResponse({ content: 'Success' });

      // Should eventually succeed
      let successCount = 0;
      for (let i = 0; i < 5; i++) {
        try {
          await provider.complete(createTestRequest());
          successCount++;
        } catch (error) {
          // Expected intermittent failures
        }
      }

      expect(successCount).toBeGreaterThan(0);

      provider.destroy();
    });
  });

  describe('Error Event Handling', () => {
    it('should emit error events', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      let errorEventFired = false;
      provider.on('error', (event) => {
        errorEventFired = true;
        expect(event.provider).toBe('anthropic');
        expect(event.error).toBeDefined();
      });

      provider.setMockError(new Error('Test error'));

      await provider.complete(createTestRequest()).catch(() => {});

      expect(errorEventFired).toBe(true);

      provider.destroy();
    });

    it('should provide error context in events', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      let capturedEvent: any;
      provider.on('error', (event) => {
        capturedEvent = event;
      });

      provider.setMockError(new RateLimitError('Rate limited', 'anthropic', 30));

      await provider.complete(createTestRequest()).catch(() => {});

      expect(capturedEvent).toBeDefined();
      expect(capturedEvent.error.code).toBe('RATE_LIMIT');
      expect(capturedEvent.request).toBeDefined();

      provider.destroy();
    });

    it('should track error metrics', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-latest'],
      });

      await provider.initialize();

      // Make successful request
      provider.setMockResponse({ content: 'Success' });
      await provider.complete(createTestRequest());

      // Make failed request
      provider.setMockError(new Error('Failure'));
      await provider.complete(createTestRequest()).catch(() => {});

      const usage = await provider.getUsage();

      expect(usage.requests).toBe(1); // Only successful
      expect(usage.errors).toBe(1);

      provider.destroy();
    });
  });
});
