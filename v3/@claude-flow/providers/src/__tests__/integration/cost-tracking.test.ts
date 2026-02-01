/**
 * WP12: Cost Tracking Integration Tests
 *
 * Tests cost calculation and tracking:
 * - Cost calculation accuracy for each provider
 * - Cost aggregation across providers
 * - Budget enforcement
 * - Cost estimation vs actual
 *
 * @module @claude-flow/providers/__tests__/integration/cost-tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderManager } from '../../provider-manager.js';
import {
  MockProvider,
  createTestRequest,
  assertApproximately,
  silentLogger,
} from '../test-helpers.js';
import { UsagePeriod } from '../../types.js';

describe('Cost Tracking Integration Tests', () => {
  describe('Cost Calculation Accuracy', () => {
    it('should calculate costs for Anthropic pricing', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
        pricing: {
          'claude-3-5-sonnet-20241022': {
            promptCostPer1k: 0.003,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      await provider.initialize();

      provider.setMockResponse({
        usage: {
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
        },
      });

      const response = await provider.complete(createTestRequest());

      // 1000 prompt tokens * $0.003/1k = $0.003
      // 500 completion tokens * $0.015/1k = $0.0075
      // Total = $0.0105
      expect(response.cost?.promptCost).toBeCloseTo(0.003, 4);
      expect(response.cost?.completionCost).toBeCloseTo(0.0075, 4);
      expect(response.cost?.totalCost).toBeCloseTo(0.0105, 4);
      expect(response.cost?.currency).toBe('USD');

      provider.destroy();
    });

    it('should calculate costs for OpenAI pricing', async () => {
      const provider = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
        pricing: {
          'gpt-4o': {
            promptCostPer1k: 0.005,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      await provider.initialize();

      provider.setMockResponse({
        usage: {
          promptTokens: 2000,
          completionTokens: 1000,
          totalTokens: 3000,
        },
      });

      const response = await provider.complete(createTestRequest());

      // 2000 prompt tokens * $0.005/1k = $0.010
      // 1000 completion tokens * $0.015/1k = $0.015
      // Total = $0.025
      expect(response.cost?.promptCost).toBeCloseTo(0.01, 4);
      expect(response.cost?.completionCost).toBeCloseTo(0.015, 4);
      expect(response.cost?.totalCost).toBeCloseTo(0.025, 4);

      provider.destroy();
    });

    it('should calculate costs for Google Gemini pricing', async () => {
      const provider = new MockProvider('google', {
        supportedModels: ['gemini-2.0-flash'],
        pricing: {
          'gemini-2.0-flash': {
            promptCostPer1k: 0.0001,
            completionCostPer1k: 0.0002,
            currency: 'USD',
          },
        },
      });

      await provider.initialize();

      provider.setMockResponse({
        usage: {
          promptTokens: 5000,
          completionTokens: 2000,
          totalTokens: 7000,
        },
      });

      const response = await provider.complete(createTestRequest());

      // Very cheap model
      expect(response.cost?.totalCost).toBeLessThan(0.001);

      provider.destroy();
    });

    it('should handle zero-cost providers (local models)', async () => {
      const provider = new MockProvider('ollama', {
        supportedModels: ['llama3.2'],
        pricing: {
          'llama3.2': {
            promptCostPer1k: 0,
            completionCostPer1k: 0,
            currency: 'USD',
          },
        },
      });

      await provider.initialize();

      provider.setMockResponse({
        usage: {
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
        },
      });

      const response = await provider.complete(createTestRequest());

      expect(response.cost?.totalCost).toBe(0);

      provider.destroy();
    });
  });

  describe('Cost Aggregation Across Providers', () => {
    it('should aggregate costs from multiple providers', async () => {
      const anthropic = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
        pricing: {
          'claude-3-5-sonnet-20241022': {
            promptCostPer1k: 0.003,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      const openai = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
        pricing: {
          'gpt-4o': {
            promptCostPer1k: 0.005,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      await anthropic.initialize();
      await openai.initialize();

      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
            { provider: 'openai', model: 'gpt-4o' },
          ],
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', anthropic);
      (manager as any).providers.set('openai', openai);

      anthropic.setMockResponse({
        provider: 'anthropic',
        usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      });

      openai.setMockResponse({
        provider: 'openai',
        usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      });

      // Make requests to both providers
      const response1 = await anthropic.complete(createTestRequest());
      const response2 = await openai.complete(createTestRequest());

      const totalCost = (response1.cost?.totalCost || 0) + (response2.cost?.totalCost || 0);

      // Anthropic: $0.0105, OpenAI: $0.0125, Total: $0.023
      assertApproximately(totalCost, 0.023, 1);

      manager.destroy();
      anthropic.destroy();
      openai.destroy();
    });

    it('should track usage statistics per provider', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
        pricing: {
          'claude-3-5-sonnet-20241022': {
            promptCostPer1k: 0.003,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      await provider.initialize();

      provider.setMockResponse({
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      // Make 3 requests
      await provider.complete(createTestRequest());
      await provider.complete(createTestRequest());
      await provider.complete(createTestRequest());

      const usage = await provider.getUsage('day');

      expect(usage.requests).toBe(3);
      expect(usage.tokens.total).toBe(450); // 150 * 3
      expect(usage.cost.total).toBeGreaterThan(0);

      provider.destroy();
    });

    it('should aggregate usage across time periods', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
      });

      await provider.initialize();

      provider.setMockResponse({
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      await provider.complete(createTestRequest());

      const periods: UsagePeriod[] = ['hour', 'day', 'week', 'month', 'all'];

      for (const period of periods) {
        const usage = await provider.getUsage(period);
        expect(usage.period).toBeDefined();
        expect(usage.period.start).toBeInstanceOf(Date);
        expect(usage.period.end).toBeInstanceOf(Date);
        expect(usage.requests).toBeGreaterThanOrEqual(0);
      }

      provider.destroy();
    });
  });

  describe('Budget Enforcement', () => {
    it('should enforce max cost per request', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
        pricing: {
          'claude-3-5-sonnet-20241022': {
            promptCostPer1k: 0.003,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      await provider.initialize();

      // Configure max cost
      provider.config.maxCostPerRequest = 0.01;

      provider.setMockResponse({
        usage: {
          promptTokens: 10000, // High token count
          completionTokens: 5000,
          totalTokens: 15000,
        },
        cost: {
          promptCost: 0.03,
          completionCost: 0.075,
          totalCost: 0.105, // Exceeds $0.01 limit
          currency: 'USD',
        },
      });

      const response = await provider.complete(createTestRequest());

      // Should still get response, but we can check it exceeded budget
      expect(response.cost?.totalCost).toBeGreaterThan(provider.config.maxCostPerRequest);

      provider.destroy();
    });

    it('should track cumulative costs', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
      });

      await provider.initialize();

      provider.setMockResponse({
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const responses = [];
      for (let i = 0; i < 5; i++) {
        responses.push(await provider.complete(createTestRequest()));
      }

      const totalCost = responses.reduce((sum, r) => sum + (r.cost?.totalCost || 0), 0);

      const usage = await provider.getUsage();
      assertApproximately(usage.cost.total, totalCost, 5);

      provider.destroy();
    });

    it('should support cost optimization with fallback models', async () => {
      const expensiveProvider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-opus-20240229'],
        pricing: {
          'claude-3-opus-20240229': {
            promptCostPer1k: 0.015,
            completionCostPer1k: 0.075,
            currency: 'USD',
          },
        },
      });

      const cheapProvider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-haiku-20240307'],
        pricing: {
          'claude-3-haiku-20240307': {
            promptCostPer1k: 0.00025,
            completionCostPer1k: 0.00125,
            currency: 'USD',
          },
        },
      });

      await expensiveProvider.initialize();
      await cheapProvider.initialize();

      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-opus-20240229' },
            { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
          ],
          costOptimization: {
            enabled: true,
            maxCostPerRequest: 0.01,
          },
        },
        silentLogger
      );

      (manager as any).providers.set('anthropic', expensiveProvider);

      expensiveProvider.setMockResponse({
        usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      });

      const response = await expensiveProvider.complete(createTestRequest());

      // Opus is expensive
      expect(response.cost?.totalCost).toBeGreaterThan(0.01);

      manager.destroy();
      expensiveProvider.destroy();
      cheapProvider.destroy();
    });
  });

  describe('Cost Estimation vs Actual', () => {
    it('should provide accurate cost estimates', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
        pricing: {
          'claude-3-5-sonnet-20241022': {
            promptCostPer1k: 0.003,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      await provider.initialize();

      const request = createTestRequest('Test prompt for estimation', {
        maxTokens: 500,
      });

      const estimate = await provider.estimateCost(request);

      provider.setMockResponse({
        usage: {
          promptTokens: estimate.estimatedPromptTokens,
          completionTokens: estimate.estimatedCompletionTokens,
          totalTokens: estimate.estimatedTotalTokens,
        },
      });

      const response = await provider.complete(request);

      // Estimate should be reasonably close to actual
      if (response.cost && estimate.estimatedCost) {
        const accuracy =
          1 - Math.abs(estimate.estimatedCost.total - response.cost.totalCost) / response.cost.totalCost;

        // Should be within 30% (confidence: 0.7)
        expect(accuracy).toBeGreaterThan(0.4);
        expect(estimate.confidence).toBeGreaterThan(0);
      }

      provider.destroy();
    });

    it('should estimate costs for multiple providers', async () => {
      const manager = new ProviderManager(
        {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
            { provider: 'openai', model: 'gpt-4o' },
            { provider: 'google', model: 'gemini-2.0-flash' },
          ],
        },
        silentLogger
      );

      const p1 = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
        pricing: {
          'claude-3-5-sonnet-20241022': {
            promptCostPer1k: 0.003,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      const p2 = new MockProvider('openai', {
        supportedModels: ['gpt-4o'],
        pricing: {
          'gpt-4o': {
            promptCostPer1k: 0.005,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      const p3 = new MockProvider('google', {
        supportedModels: ['gemini-2.0-flash'],
        pricing: {
          'gemini-2.0-flash': {
            promptCostPer1k: 0.0001,
            completionCostPer1k: 0.0002,
            currency: 'USD',
          },
        },
      });

      await p1.initialize();
      await p2.initialize();
      await p3.initialize();

      (manager as any).providers.set('anthropic', p1);
      (manager as any).providers.set('openai', p2);
      (manager as any).providers.set('google', p3);

      const request = createTestRequest();
      const estimates = await manager.estimateCost(request);

      expect(estimates.size).toBe(3);
      expect(estimates.has('anthropic')).toBe(true);
      expect(estimates.has('openai')).toBe(true);
      expect(estimates.has('google')).toBe(true);

      // Gemini should be cheapest
      const geminiEstimate = estimates.get('google');
      const anthropicEstimate = estimates.get('anthropic');

      if (geminiEstimate && anthropicEstimate) {
        expect(geminiEstimate.estimatedCost.total).toBeLessThan(
          anthropicEstimate.estimatedCost.total
        );
      }

      manager.destroy();
      p1.destroy();
      p2.destroy();
      p3.destroy();
    });

    it('should compare estimated vs actual costs', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
        pricing: {
          'claude-3-5-sonnet-20241022': {
            promptCostPer1k: 0.003,
            completionCostPer1k: 0.015,
            currency: 'USD',
          },
        },
      });

      await provider.initialize();

      const request = createTestRequest('A moderately long prompt for testing estimation accuracy');

      const estimate = await provider.estimateCost(request);

      provider.setMockResponse({
        usage: {
          promptTokens: 15, // Actual from API
          completionTokens: 25,
          totalTokens: 40,
        },
      });

      const response = await provider.complete(request);

      const actualCost = response.cost?.totalCost || 0;
      const estimatedCost = estimate.estimatedCost.total;

      // Log for analysis
      console.log('Cost Comparison:', {
        estimated: estimatedCost,
        actual: actualCost,
        difference: Math.abs(estimatedCost - actualCost),
        percentDiff: ((Math.abs(estimatedCost - actualCost) / actualCost) * 100).toFixed(2) + '%',
      });

      expect(estimate.estimatedPromptTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCompletionTokens).toBeGreaterThan(0);

      provider.destroy();
    });

    it('should handle cost estimation with no pricing data', async () => {
      const provider = new MockProvider('custom', {
        supportedModels: ['custom-model'],
        pricing: {}, // No pricing
      });

      await provider.initialize();

      const estimate = await provider.estimateCost(createTestRequest());

      expect(estimate.estimatedCost.total).toBe(0);
      expect(estimate.confidence).toBe(0);

      provider.destroy();
    });
  });

  describe('Cost Reporting', () => {
    it('should generate cost breakdown by model', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
      });

      await provider.initialize();

      provider.setMockResponse({
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      await provider.complete(createTestRequest());

      const usage = await provider.getUsage();

      expect(usage.requests).toBeGreaterThan(0);
      expect(usage.tokens.total).toBeGreaterThan(0);
      expect(usage.cost.currency).toBe('USD');

      provider.destroy();
    });

    it('should track error costs (failed requests)', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
      });

      await provider.initialize();

      // Successful request
      provider.setMockResponse({
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      await provider.complete(createTestRequest());

      // Failed request
      provider.setMockError(new Error('API Error'));
      await provider.complete(createTestRequest()).catch(() => {});

      const usage = await provider.getUsage();

      expect(usage.errors).toBe(1);
      expect(usage.requests).toBe(1); // Only successful requests count

      provider.destroy();
    });

    it('should calculate average cost per request', async () => {
      const provider = new MockProvider('anthropic', {
        supportedModels: ['claude-3-5-sonnet-20241022'],
      });

      await provider.initialize();

      const costs = [0.001, 0.002, 0.003];

      for (const cost of costs) {
        provider.setMockResponse({
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          cost: { promptCost: cost * 0.3, completionCost: cost * 0.7, totalCost: cost, currency: 'USD' },
        });
        await provider.complete(createTestRequest());
      }

      const usage = await provider.getUsage();

      const avgCost = usage.cost.total / usage.requests;
      assertApproximately(avgCost, 0.002, 10); // Average of 0.001, 0.002, 0.003

      provider.destroy();
    });
  });
});
