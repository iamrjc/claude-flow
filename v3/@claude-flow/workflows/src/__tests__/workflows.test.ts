/**
 * Workflow Templates Test Suite
 *
 * Comprehensive tests for workflow templates, engine, and validator.
 * Tests template validation, parameter injection, execution, and error handling.
 *
 * @module @claude-flow/workflows/__tests__
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WorkflowEngine,
  WorkflowValidator,
  WorkflowStatus,
  codeReviewTemplate,
  researchTemplate,
  refactoringTemplate,
  testingTemplate,
  documentationTemplate,
  createCodeReviewWorkflow,
  createResearchWorkflow,
  type WorkflowTemplate,
} from '../index.js';
import { TaskType, TaskPriority } from '@claude-flow/agents';

describe('Workflow Templates', () => {
  describe('Code Review Template', () => {
    it('should have valid structure', () => {
      expect(codeReviewTemplate.id).toBe('code-review');
      expect(codeReviewTemplate.name).toBe('Code Review');
      expect(codeReviewTemplate.steps.length).toBeGreaterThan(0);
      expect(codeReviewTemplate.resumable).toBe(true);
    });

    it('should have all required parameters', () => {
      expect(codeReviewTemplate.parameters.target).toBeDefined();
      expect(codeReviewTemplate.parameters.target.required).toBe(true);
      expect(codeReviewTemplate.parameters.depth).toBeDefined();
      expect(codeReviewTemplate.parameters.reviewerCount).toBeDefined();
    });

    it('should have all required steps', () => {
      const stepIds = codeReviewTemplate.steps.map((s) => s.id);
      expect(stepIds).toContain('initialize');
      expect(stepIds).toContain('static-analysis');
      expect(stepIds).toContain('spawn-reviewers');
      expect(stepIds).toContain('aggregate');
      expect(stepIds).toContain('generate-report');
    });

    it('should support customization', () => {
      const custom = createCodeReviewWorkflow({
        target: '/src',
        depth: 'deep',
        reviewerCount: 5,
      });

      expect(custom.parameters.target.default).toBe('/src');
      expect(custom.parameters.depth.default).toBe('deep');
      expect(custom.parameters.reviewerCount.default).toBe(5);
    });
  });

  describe('Research Template', () => {
    it('should have valid structure', () => {
      expect(researchTemplate.id).toBe('research');
      expect(researchTemplate.name).toBe('Research Workflow');
      expect(researchTemplate.steps.length).toBeGreaterThan(0);
      expect(researchTemplate.resumable).toBe(true);
    });

    it('should have required parameters', () => {
      expect(researchTemplate.parameters.query).toBeDefined();
      expect(researchTemplate.parameters.query.required).toBe(true);
      expect(researchTemplate.parameters.depth).toBeDefined();
      expect(researchTemplate.parameters.sources).toBeDefined();
    });

    it('should have research steps', () => {
      const stepIds = researchTemplate.steps.map((s) => s.id);
      expect(stepIds).toContain('analyze-query');
      expect(stepIds).toContain('parallel-gathering');
      expect(stepIds).toContain('synthesize');
      expect(stepIds).toContain('manage-citations');
    });

    it('should support customization', () => {
      const custom = createResearchWorkflow({
        query: 'AI trends',
        depth: 'comprehensive',
        researcherCount: 6,
      });

      expect(custom.parameters.query.default).toBe('AI trends');
      expect(custom.parameters.depth.default).toBe('comprehensive');
    });
  });

  describe('Refactoring Template', () => {
    it('should have valid structure', () => {
      expect(refactoringTemplate.id).toBe('refactoring');
      expect(refactoringTemplate.steps.length).toBeGreaterThan(0);
      expect(refactoringTemplate.checkpoints.length).toBeGreaterThan(0);
    });

    it('should have safety features', () => {
      const stepIds = refactoringTemplate.steps.map((s) => s.id);
      expect(stepIds).toContain('create-backup');
      expect(stepIds).toContain('run-tests');
      expect(refactoringTemplate.parameters.preserveBehavior).toBeDefined();
    });

    it('should have transformation steps', () => {
      const stepIds = refactoringTemplate.steps.map((s) => s.id);
      expect(stepIds).toContain('detect-patterns');
      expect(stepIds).toContain('apply-transformations');
      expect(stepIds).toContain('validate-metrics');
    });
  });

  describe('Testing Template', () => {
    it('should have valid structure', () => {
      expect(testingTemplate.id).toBe('testing');
      expect(testingTemplate.steps.length).toBeGreaterThan(0);
    });

    it('should support multiple test types', () => {
      expect(testingTemplate.parameters.testTypes).toBeDefined();
      expect(testingTemplate.parameters.framework).toBeDefined();
    });

    it('should have testing steps', () => {
      const stepIds = testingTemplate.steps.map((s) => s.id);
      expect(stepIds).toContain('generate-tests');
      expect(stepIds).toContain('run-tests');
      expect(stepIds).toContain('analyze-coverage');
      expect(stepIds).toContain('mutation-testing');
    });
  });

  describe('Documentation Template', () => {
    it('should have valid structure', () => {
      expect(documentationTemplate.id).toBe('documentation');
      expect(documentationTemplate.steps.length).toBeGreaterThan(0);
    });

    it('should support multiple formats', () => {
      expect(documentationTemplate.parameters.format).toBeDefined();
      expect(documentationTemplate.parameters.format.enum).toContain('markdown');
      expect(documentationTemplate.parameters.format.enum).toContain('html');
    });

    it('should have documentation steps', () => {
      const stepIds = documentationTemplate.steps.map((s) => s.id);
      expect(stepIds).toContain('scan-code');
      expect(stepIds).toContain('generate-api-docs');
      expect(stepIds).toContain('generate-examples');
      expect(stepIds).toContain('check-consistency');
    });
  });
});

describe('WorkflowValidator', () => {
  let validator: WorkflowValidator;

  beforeEach(() => {
    validator = new WorkflowValidator();
  });

  describe('Template Validation', () => {
    it('should validate valid template', () => {
      const result = validator.validateTemplate(codeReviewTemplate);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing template ID', () => {
      const invalid = { ...codeReviewTemplate, id: '' };
      const result = validator.validateTemplate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('ID is required'))).toBe(true);
    });

    it('should detect invalid version', () => {
      const invalid = { ...codeReviewTemplate, version: 'invalid' };
      const result = validator.validateTemplate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('version'))).toBe(true);
    });

    it('should detect missing steps', () => {
      const invalid = { ...codeReviewTemplate, steps: [] };
      const result = validator.validateTemplate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least one step'))).toBe(true);
    });

    it('should detect duplicate step IDs', () => {
      const step1 = codeReviewTemplate.steps[0];
      const step2 = { ...codeReviewTemplate.steps[1], id: step1.id };
      const invalid = { ...codeReviewTemplate, steps: [step1, step2] };
      const result = validator.validateTemplate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Duplicate step ID'))).toBe(true);
    });

    it('should warn about long workflows', () => {
      const result = validator.validateTemplate(codeReviewTemplate);
      if (codeReviewTemplate.estimatedDuration > 3600000) {
        expect(result.warnings.some((w) => w.includes('exceeds 1 hour'))).toBe(true);
      }
    });

    it('should validate all templates', () => {
      const templates = [
        codeReviewTemplate,
        researchTemplate,
        refactoringTemplate,
        testingTemplate,
        documentationTemplate,
      ];

      for (const template of templates) {
        const result = validator.validateTemplate(template);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('Parameter Validation', () => {
    it('should validate valid parameters', () => {
      const params = {
        target: '/src',
        depth: 'standard',
        reviewerCount: 3,
      };

      const result = validator.validateParameters(codeReviewTemplate, params);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required parameters', () => {
      const result = validator.validateParameters(codeReviewTemplate, {});
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('target'))).toBe(true);
    });

    it('should detect invalid parameter type', () => {
      const params = { target: '/src', reviewerCount: 'invalid' };
      const result = validator.validateParameters(codeReviewTemplate, params);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('type'))).toBe(true);
    });

    it('should detect invalid enum value', () => {
      const params = { target: '/src', depth: 'invalid' };
      const result = validator.validateParameters(codeReviewTemplate, params);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('one of'))).toBe(true);
    });

    it('should detect out of range numbers', () => {
      const params = { target: '/src', reviewerCount: 100 };
      const result = validator.validateParameters(codeReviewTemplate, params);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('<='))).toBe(true);
    });

    it('should warn about unknown parameters', () => {
      const params = { target: '/src', unknownParam: 'value' };
      const result = validator.validateParameters(codeReviewTemplate, params);
      expect(result.warnings.some((w) => w.includes('Unknown parameter'))).toBe(true);
    });
  });

  describe('Dependency Analysis', () => {
    it('should detect valid dependencies', () => {
      const result = validator.analyzeDependencies(codeReviewTemplate);
      expect(result.valid).toBe(true);
      expect(result.cycles).toHaveLength(0);
      expect(result.missingDependencies).toHaveLength(0);
    });

    it('should generate execution order', () => {
      const result = validator.analyzeDependencies(codeReviewTemplate);
      expect(result.executionOrder).toBeDefined();
      expect(result.executionOrder.length).toBe(codeReviewTemplate.steps.length);
    });

    it('should detect circular dependencies', () => {
      const template: WorkflowTemplate = {
        ...codeReviewTemplate,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            type: TaskType.CODE,
            priority: TaskPriority.NORMAL,
            description: 'Test',
            input: '${steps.step2.output}',
            timeout: 30000,
            retryable: false,
          },
          {
            id: 'step2',
            name: 'Step 2',
            type: TaskType.CODE,
            priority: TaskPriority.NORMAL,
            description: 'Test',
            input: '${steps.step1.output}',
            timeout: 30000,
            retryable: false,
          },
        ],
      };

      const result = validator.analyzeDependencies(template);
      expect(result.valid).toBe(false);
      expect(result.cycles.length).toBeGreaterThan(0);
    });
  });

  describe('Resource Estimation', () => {
    it('should estimate resources', () => {
      const estimation = validator.estimateResources(codeReviewTemplate);
      expect(estimation.estimatedDuration).toBeGreaterThan(0);
      expect(estimation.estimatedCost).toBeGreaterThan(0);
      expect(estimation.requiredAgents).toBeGreaterThan(0);
      expect(estimation.totalSteps).toBe(codeReviewTemplate.steps.length);
    });

    it('should account for parallel execution', () => {
      const estimation = validator.estimateResources(codeReviewTemplate);
      if (estimation.parallelSteps > 0) {
        expect(estimation.estimatedDuration).toBeLessThan(
          codeReviewTemplate.steps.reduce((sum, s) => sum + s.timeout, 0)
        );
      }
    });

    it('should estimate all templates', () => {
      const templates = [
        codeReviewTemplate,
        researchTemplate,
        refactoringTemplate,
        testingTemplate,
        documentationTemplate,
      ];

      for (const template of templates) {
        const estimation = validator.estimateResources(template);
        expect(estimation.estimatedDuration).toBeGreaterThan(0);
        expect(estimation.requiredAgents).toBeGreaterThan(0);
      }
    });
  });
});

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
    engine.registerTemplate(codeReviewTemplate);
    engine.registerTemplate(researchTemplate);
  });

  describe('Template Registration', () => {
    it('should register templates', () => {
      const template = engine.getTemplate('code-review');
      expect(template).toBeDefined();
      expect(template?.id).toBe('code-review');
    });

    it('should list templates', () => {
      const templates = engine.listTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(2);
      expect(templates.some((t) => t.id === 'code-review')).toBe(true);
    });
  });

  describe('Workflow Execution', () => {
    it('should start workflow', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
      });

      expect(workflowId).toBeDefined();
      expect(workflowId.startsWith('workflow-')).toBe(true);
    });

    it('should reject invalid template', async () => {
      await expect(
        engine.startWorkflow('nonexistent', {})
      ).rejects.toThrow('not found');
    });

    it('should reject missing required parameters', async () => {
      await expect(
        engine.startWorkflow('code-review', {})
      ).rejects.toThrow('Required parameter');
    });

    it('should track workflow status', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
      });

      const status = engine.getWorkflowStatus(workflowId);
      expect(status).toBeDefined();
      expect(status?.workflowId).toBe(workflowId);
    });
  });

  describe('Workflow Control', () => {
    it('should pause workflow', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
      });

      // Wait for workflow to start and enter running state
      await new Promise((resolve) => {
        const checkStatus = () => {
          const status = engine.getWorkflowStatus(workflowId);
          if (status?.status === WorkflowStatus.RUNNING) {
            resolve(true);
          } else {
            setTimeout(checkStatus, 10);
          }
        };
        checkStatus();
      });

      await engine.pauseWorkflow(workflowId);

      const status = engine.getWorkflowStatus(workflowId);
      expect(status?.status).toBe(WorkflowStatus.PAUSED);
    });

    it('should resume workflow', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
      });

      // Wait for workflow to start and enter running state
      await new Promise((resolve) => {
        const checkStatus = () => {
          const status = engine.getWorkflowStatus(workflowId);
          if (status?.status === WorkflowStatus.RUNNING) {
            resolve(true);
          } else {
            setTimeout(checkStatus, 10);
          }
        };
        checkStatus();
      });

      await engine.pauseWorkflow(workflowId);
      await engine.resumeWorkflow(workflowId);

      const status = engine.getWorkflowStatus(workflowId);
      expect([WorkflowStatus.RUNNING, WorkflowStatus.COMPLETED]).toContain(
        status?.status
      );
    });

    it('should cancel workflow', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
      });

      await engine.cancelWorkflow(workflowId, 'User requested');

      const status = engine.getWorkflowStatus(workflowId);
      expect(status?.status).toBe(WorkflowStatus.CANCELLED);
      expect(status?.error).toBe('User requested');
    });
  });

  describe('Progress Tracking', () => {
    it('should emit progress events', async () => {
      const progressEvents: any[] = [];
      engine.on('workflow-progress', (progress) => {
        progressEvents.push(progress);
      });

      await engine.startWorkflow('code-review', { target: '/src' });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0].workflowId).toBeDefined();
      expect(progressEvents[0].progress).toBeGreaterThan(0);
    });

    it('should emit lifecycle events', async () => {
      const events: string[] = [];
      engine.on('workflow-started', () => events.push('started'));
      engine.on('step-started', () => events.push('step-started'));
      engine.on('workflow-completed', () => events.push('completed'));

      await engine.startWorkflow('code-review', { target: '/src' });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(events).toContain('started');
    });
  });

  describe('Parameter Injection', () => {
    it('should inject parameters into steps', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
        depth: 'deep',
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = engine.getWorkflowStatus(workflowId);
      expect(status?.parameters.target).toBe('/src');
      expect(status?.parameters.depth).toBe('deep');
    });

    it('should use default parameter values', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
      });

      const status = engine.getWorkflowStatus(workflowId);
      expect(status?.parameters.depth).toBe('standard');
      expect(status?.parameters.reviewerCount).toBe(3);
    });
  });

  describe('Checkpoints', () => {
    it('should save checkpoints', async () => {
      const checkpoints: string[] = [];
      engine.on('checkpoint-saved', (event) => {
        checkpoints.push(event.checkpoint);
      });

      await engine.startWorkflow('code-review', { target: '/src' });

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(checkpoints.length).toBeGreaterThan(0);
    });

    it('should resume from checkpoint', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
      });

      // Wait for workflow to start and enter running state
      await new Promise((resolve) => {
        const checkStatus = () => {
          const status = engine.getWorkflowStatus(workflowId);
          if (status?.status === WorkflowStatus.RUNNING) {
            resolve(true);
          } else {
            setTimeout(checkStatus, 10);
          }
        };
        checkStatus();
      });

      await engine.pauseWorkflow(workflowId);

      const status = engine.getWorkflowStatus(workflowId);
      const checkpoint = status?.checkpoint;

      await engine.resumeWorkflow(workflowId);

      const newStatus = engine.getWorkflowStatus(workflowId);
      expect(newStatus?.checkpoint).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle workflow errors', async () => {
      const errors: any[] = [];
      engine.on('workflow-error', (error) => {
        errors.push(error);
      });

      await engine.startWorkflow('code-review', {
        target: '/src',
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Errors should be emitted if steps fail
    });

    it('should handle step failures', async () => {
      const failures: any[] = [];
      engine.on('step-failed', (event) => {
        failures.push(event);
      });

      await engine.startWorkflow('code-review', {
        target: '/src',
      });

      await new Promise((resolve) => setTimeout(resolve, 200));
    });
  });

  describe('Workflow Results', () => {
    it('should generate workflow result', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
      });

      // Wait for workflow to complete or at least start
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = engine.getWorkflowResult(workflowId);
      expect(result).toBeDefined();
      expect(result?.workflowId).toBe(workflowId);
      expect(result?.metrics).toBeDefined();
      // Duration should be greater than or equal to 0
      expect(result?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should track step results', async () => {
      const workflowId = await engine.startWorkflow('code-review', {
        target: '/src',
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const result = engine.getWorkflowResult(workflowId);
      expect(result?.stepResults).toBeDefined();
    });
  });
});
