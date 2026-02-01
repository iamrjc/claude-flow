/**
 * Provider Selector Unit Tests
 *
 * Tests for WP02: Provider Selection Algorithm
 * Coverage target: >80%
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProviderSelector,
  selectProvider,
  TaskContext,
  RoutingPreferences,
} from '../provider-selector.js';
import { detectAgentBoosterIntent } from '../agent-booster-detector.js';
import { analyzeComplexity } from '../complexity-analyzer.js';
import { selectCloudProvider } from '../cloud-router.js';

// Helper to create test task
function createTask(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    prompt: 'Test task',
    contextSize: 1000,
    ...overrides,
  };
}

describe('Provider Selector (WP02)', () => {
  let selector: ProviderSelector;

  beforeEach(() => {
    selector = new ProviderSelector();
  });

  describe('Tier 1: Agent Booster Detection', () => {
    it('should detect var-to-const transform', () => {
      const task = createTask({ prompt: 'Convert var to const in this file' });
      const result = detectAgentBoosterIntent(task);

      expect(result.isBooster).toBe(true);
      expect(result.intent).toBe('var-to-const');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect add-types intent', () => {
      const task = createTask({ prompt: 'Add TypeScript type annotations' });
      const result = detectAgentBoosterIntent(task);

      expect(result.isBooster).toBe(true);
      expect(result.intent).toBe('add-types');
    });

    it('should detect format-code intent', () => {
      const task = createTask({ prompt: 'Format this code with prettier' });
      const result = detectAgentBoosterIntent(task);

      expect(result.isBooster).toBe(true);
      expect(result.intent).toBe('format-code');
    });

    it('should detect remove-console intent', () => {
      const task = createTask({ prompt: 'Remove all console.log statements' });
      const result = detectAgentBoosterIntent(task);

      expect(result.isBooster).toBe(true);
      expect(result.intent).toBe('remove-console');
    });

    it('should reject complex tasks', () => {
      const task = createTask({ prompt: 'Architect a new authentication system' });
      const result = detectAgentBoosterIntent(task);

      expect(result.isBooster).toBe(false);
    });

    it('should reject long prompts', () => {
      const task = createTask({ prompt: 'Convert var to const. '.repeat(50) });
      const result = detectAgentBoosterIntent(task);

      expect(result.isBooster).toBe(false);
    });
  });

  describe('Tier 2: Complexity Analysis', () => {
    it('should score simple tasks low', () => {
      const task = createTask({ prompt: 'Print hello world', contextSize: 100 });
      const result = analyzeComplexity(task);

      expect(result.score).toBeLessThan(0.3);
    });

    it('should score architecture tasks high', () => {
      const task = createTask({
        prompt: 'Architect a comprehensive system design for a microservices platform with security audit and performance optimization. First analyze the existing code, then refactor it, finally add integration tests.',
        contextSize: 50000,
      });
      const result = analyzeComplexity(task);

      // With multiple high-complexity keywords + multi-step signals + large context
      expect(result.score).toBeGreaterThan(0.4);
      expect(result.factors.codeKeywords).toBeGreaterThan(0.5);
    });

    it('should detect multi-step signals', () => {
      const task = createTask({
        prompt: 'First analyze the code, then refactor it, finally add tests',
      });
      const result = analyzeComplexity(task);

      expect(result.factors.multiStepSignals).toBeGreaterThan(0);
    });

    it('should detect tool requirements', () => {
      const task = createTask({
        prompt: 'Read the file and search for the function',
        requiresTools: true,
      });
      const result = analyzeComplexity(task);

      expect(result.factors.toolRequirements).toBeGreaterThan(0.5);
    });

    it('should factor in context size', () => {
      const smallTask = createTask({ prompt: 'Simple task', contextSize: 1000 });
      const largeTask = createTask({ prompt: 'Simple task', contextSize: 80000 });

      const smallResult = analyzeComplexity(smallTask);
      const largeResult = analyzeComplexity(largeTask);

      expect(largeResult.factors.contextSize).toBeGreaterThan(smallResult.factors.contextSize);
    });
  });

  describe('Tier 3: Cloud Router', () => {
    it('should select Gemini for data analysis tasks', () => {
      const task = createTask({ prompt: 'Analyze this dataset and extract metrics' });
      const result = selectCloudProvider(task);

      expect(result.provider).toBe('gemini');
    });

    it('should select Claude for architecture tasks', () => {
      const task = createTask({ prompt: 'Design a new architecture pattern for the system' });
      const result = selectCloudProvider(task);

      expect(result.provider).toBe('sonnet');
    });

    it('should select Opus for critical security tasks', () => {
      const task = createTask({
        prompt: 'Perform a critical security audit of the production system',
      });
      const result = selectCloudProvider(task);

      expect(result.provider).toBe('opus');
    });

    it('should default to Gemini for unclassified tasks', () => {
      const task = createTask({ prompt: 'Do something generic' });
      const result = selectCloudProvider(task);

      expect(result.provider).toBe('gemini');
    });
  });

  describe('selectProvider (main function)', () => {
    it('should route simple transforms to Agent Booster', async () => {
      const task = createTask({ prompt: 'Convert var to const' });
      const result = await selectProvider(task);

      expect(result.tier).toBe(1);
      expect(result.provider).toBe('agent-booster');
    });

    it('should route low complexity to local', async () => {
      const task = createTask({ prompt: 'Add a simple log statement', contextSize: 500 });
      const result = await selectProvider(task, { preferLocal: true });

      expect(result.tier).toBe(2);
      expect(result.provider).toBe('ollama');
    });

    it('should route high complexity to cloud', async () => {
      const task = createTask({
        prompt: 'Architect a comprehensive microservices system with security audit and performance optimization. First analyze the existing architecture, then design the new system, finally create integration tests for all components.',
        contextSize: 50000,
      });
      const result = await selectProvider(task);

      expect(result.tier).toBe(3);
      expect(['gemini', 'sonnet', 'opus']).toContain(result.provider);
    });

    it('should respect explicit model request', async () => {
      const task = createTask({
        prompt: 'Do something',
        model: 'claude-3-opus',
      });
      const result = await selectProvider(task);

      expect(result.model).toBe('claude-3-opus');
      expect(result.reason).toContain('Explicit');
    });

    it('should use local in offline mode', async () => {
      const task = createTask({ prompt: 'Analyze this complex data' });
      const result = await selectProvider(task, { offline: true });

      expect(['ollama', 'agent-booster']).toContain(result.provider);
    });

    it('should use local in privacy mode', async () => {
      const task = createTask({ prompt: 'Process sensitive information' });
      const result = await selectProvider(task, { privacyMode: true });

      expect(['ollama', 'agent-booster']).toContain(result.provider);
    });

    it('should prefer cost optimization when requested', async () => {
      const task = createTask({
        prompt: 'Moderate complexity task for implementation',
        contextSize: 5000,
      });
      const result = await selectProvider(task, { costOptimize: true });

      // Should prefer free options
      expect(['ollama', 'gemini', 'agent-booster']).toContain(result.provider);
    });
  });

  describe('ProviderSelector class', () => {
    it('should select with state awareness', async () => {
      const task = createTask({ prompt: 'Simple task' });
      const result = await selector.select(task);

      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('confidence');
    });

    it('should track Gemini usage', () => {
      selector.recordGeminiUsage(10000);
      selector.recordGeminiUsage(5000);

      const usage = selector.getGeminiUsage();
      expect(usage.used).toBe(15000);
      expect(usage.remaining).toBe(2000000 - 15000);
    });

    it('should update provider health', async () => {
      selector.updateHealth('ollama', { available: false });

      const task = createTask({ prompt: 'Simple task' });
      const result = await selector.select(task, { preferLocal: true });

      // Should fall back when Ollama unavailable
      expect(result.provider).not.toBe('ollama');
    });

    it('should provide alternatives', async () => {
      const task = createTask({
        prompt: 'Analyze data and generate a report',
        contextSize: 10000,
      });
      const result = await selector.select(task);

      expect(result.alternatives).toBeDefined();
      expect(result.alternatives!.length).toBeGreaterThan(0);
    });
  });
});
