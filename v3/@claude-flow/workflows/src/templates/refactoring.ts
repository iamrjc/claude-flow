/**
 * Refactoring Workflow Template
 *
 * Code analysis, pattern detection, automated transformations, and test verification.
 * Supports multiple refactoring patterns and safe transformation strategies.
 *
 * @module @claude-flow/workflows/templates
 */

import { TaskType, TaskPriority } from '@claude-flow/agents';
import type { WorkflowTemplate, WorkflowParameters } from '../engine/workflow-engine.js';

export interface RefactoringParameters extends WorkflowParameters {
  /** Target files or directories to refactor */
  target: string | string[];
  /** Refactoring patterns to apply */
  patterns?: string[];
  /** Refactoring strategy: 'safe' | 'moderate' | 'aggressive' */
  strategy?: 'safe' | 'moderate' | 'aggressive';
  /** Run tests after refactoring */
  runTests?: boolean;
  /** Preserve behavior (no logic changes) */
  preserveBehavior?: boolean;
  /** Generate migration guide */
  generateMigrationGuide?: boolean;
  /** Create backup before refactoring */
  createBackup?: boolean;
  /** Minimum confidence threshold (0-1) */
  confidenceThreshold?: number;
  /** Target code metrics (optional) */
  targetMetrics?: {
    cyclomaticComplexity?: number;
    maintainabilityIndex?: number;
    duplicateCode?: number;
  };
}

/**
 * Refactoring Workflow Template
 *
 * Steps:
 * 1. Code Analysis - Analyze code structure, metrics, and smell patterns
 * 2. Pattern Detection - Identify refactoring opportunities
 * 3. Backup Creation - Create safety backup before transformations
 * 4. Plan Transformations - Plan refactoring steps with risk assessment
 * 5. Apply Transformations - Execute refactoring patterns safely
 * 6. Test Verification - Run tests to ensure behavior preservation
 * 7. Metrics Validation - Verify improvement in code metrics
 * 8. Generate Report - Document changes and migration guide
 */
export const refactoringTemplate: WorkflowTemplate = {
  id: 'refactoring',
  name: 'Code Refactoring',
  description: 'Automated code refactoring with pattern detection, safe transformations, and test verification',
  version: '1.0.0',
  category: 'quality',
  tags: ['refactoring', 'code-quality', 'patterns', 'transformation'],

  parameters: {
    target: {
      type: 'string',
      required: true,
      description: 'Target files or directories to refactor',
    },
    patterns: {
      type: 'array',
      required: false,
      default: ['extract-method', 'rename', 'move', 'inline', 'extract-variable'],
      description: 'Refactoring patterns to apply',
    },
    strategy: {
      type: 'string',
      required: false,
      default: 'safe',
      enum: ['safe', 'moderate', 'aggressive'],
      description: 'Refactoring strategy (safe = conservative, aggressive = more changes)',
    },
    runTests: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Run tests after refactoring',
    },
    preserveBehavior: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Preserve existing behavior (no logic changes)',
    },
    generateMigrationGuide: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Generate migration guide for breaking changes',
    },
    createBackup: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Create backup before refactoring',
    },
    confidenceThreshold: {
      type: 'number',
      required: false,
      default: 0.8,
      min: 0,
      max: 1,
      description: 'Minimum confidence threshold for transformations',
    },
    targetMetrics: {
      type: 'object',
      required: false,
      description: 'Target code quality metrics',
    },
  },

  steps: [
    {
      id: 'analyze-code',
      name: 'Code Analysis',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Analyze code structure, complexity metrics, and code smells',
      input: {
        target: '${parameters.target}',
        targetMetrics: '${parameters.targetMetrics}',
      },
      timeout: 120000,
      retryable: false,
    },
    {
      id: 'detect-patterns',
      name: 'Pattern Detection',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Identify refactoring opportunities and applicable patterns',
      input: {
        codeAnalysis: '${steps.analyze-code.output}',
        patterns: '${parameters.patterns}',
        strategy: '${parameters.strategy}',
        confidenceThreshold: '${parameters.confidenceThreshold}',
      },
      timeout: 180000,
      retryable: true,
    },
    {
      id: 'create-backup',
      name: 'Create Backup',
      type: TaskType.CODE,
      priority: TaskPriority.CRITICAL,
      description: 'Create safety backup before transformations',
      input: {
        target: '${parameters.target}',
      },
      timeout: 60000,
      retryable: true,
      condition: '${parameters.createBackup}',
    },
    {
      id: 'plan-transformations',
      name: 'Plan Transformations',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Plan refactoring steps with dependency ordering and risk assessment',
      input: {
        detectedPatterns: '${steps.detect-patterns.output}',
        codeAnalysis: '${steps.analyze-code.output}',
        strategy: '${parameters.strategy}',
        preserveBehavior: '${parameters.preserveBehavior}',
      },
      timeout: 120000,
      retryable: true,
    },
    {
      id: 'apply-transformations',
      name: 'Apply Transformations',
      type: TaskType.REFACTOR,
      priority: TaskPriority.HIGH,
      description: 'Execute refactoring patterns with safety checks',
      input: {
        transformationPlan: '${steps.plan-transformations.output}',
        target: '${parameters.target}',
        preserveBehavior: '${parameters.preserveBehavior}',
      },
      timeout: 300000,
      retryable: true,
    },
    {
      id: 'run-tests',
      name: 'Test Verification',
      type: TaskType.TEST,
      priority: TaskPriority.CRITICAL,
      description: 'Run tests to ensure behavior preservation',
      input: {
        target: '${parameters.target}',
        transformations: '${steps.apply-transformations.output}',
      },
      timeout: 300000,
      retryable: false,
      condition: '${parameters.runTests}',
    },
    {
      id: 'validate-metrics',
      name: 'Metrics Validation',
      type: TaskType.ANALYZE,
      priority: TaskPriority.NORMAL,
      description: 'Verify improvement in code quality metrics',
      input: {
        target: '${parameters.target}',
        beforeMetrics: '${steps.analyze-code.output.metrics}',
        targetMetrics: '${parameters.targetMetrics}',
      },
      timeout: 60000,
      retryable: true,
    },
    {
      id: 'generate-report',
      name: 'Generate Report',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.NORMAL,
      description: 'Document changes, improvements, and generate migration guide',
      input: {
        transformations: '${steps.apply-transformations.output}',
        testResults: '${steps.run-tests.output}',
        metrics: '${steps.validate-metrics.output}',
        generateMigrationGuide: '${parameters.generateMigrationGuide}',
      },
      timeout: 120000,
      retryable: true,
    },
  ],

  estimatedDuration: 1200000, // 20 minutes
  estimatedCost: 0.12,
  resourceRequirements: {
    cpu: 'high',
    memory: 'high',
    agents: 4,
  },

  resumable: true,
  checkpoints: ['detect-patterns', 'create-backup', 'apply-transformations', 'run-tests'],

  metadata: {
    author: 'Claude Flow Team',
    createdAt: '2026-02-02',
    complexity: 'high',
    useCase: 'Automated code refactoring with safety checks and behavior preservation',
  },
};

/**
 * Create refactoring workflow with custom parameters
 */
export function createRefactoringWorkflow(params: Partial<RefactoringParameters>): WorkflowTemplate {
  return {
    ...refactoringTemplate,
    parameters: {
      ...refactoringTemplate.parameters,
      ...Object.entries(params).reduce((acc, [key, value]) => {
        if (refactoringTemplate.parameters[key]) {
          acc[key] = { ...refactoringTemplate.parameters[key], default: value };
        }
        return acc;
      }, {} as any),
    },
  };
}
