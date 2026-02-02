/**
 * Code Review Workflow Template
 *
 * Spawns reviewers, analyzes code, generates comments, aggregates findings.
 * Customizable review depth, focus areas, and quality gates.
 *
 * @module @claude-flow/workflows/templates
 */

import { TaskType, TaskPriority } from '@claude-flow/agents';
import type { WorkflowTemplate, WorkflowStep, WorkflowParameters } from '../engine/workflow-engine.js';

export interface CodeReviewParameters extends WorkflowParameters {
  /** Files or directories to review */
  target: string | string[];
  /** Review depth: 'shallow' | 'standard' | 'deep' */
  depth?: 'shallow' | 'standard' | 'deep';
  /** Focus areas: security, performance, maintainability, etc. */
  focusAreas?: string[];
  /** Number of parallel reviewers */
  reviewerCount?: number;
  /** Minimum severity to report: 'info' | 'warning' | 'error' | 'critical' */
  minSeverity?: 'info' | 'warning' | 'error' | 'critical';
  /** Generate inline comments */
  generateComments?: boolean;
  /** Run static analysis tools */
  runStaticAnalysis?: boolean;
  /** Check test coverage */
  checkCoverage?: boolean;
  /** Required code coverage percentage */
  minCoverage?: number;
}

/**
 * Code Review Workflow Template
 *
 * Steps:
 * 1. Initialize - Parse targets, validate parameters
 * 2. Static Analysis - Run linters, type checkers, security scanners
 * 3. Parallel Review - Spawn multiple reviewers with different focus areas
 * 4. Comment Generation - Generate inline code comments
 * 5. Coverage Check - Verify test coverage meets requirements
 * 6. Aggregate - Combine findings, prioritize issues
 * 7. Report - Generate review summary and recommendations
 */
export const codeReviewTemplate: WorkflowTemplate = {
  id: 'code-review',
  name: 'Code Review',
  description: 'Comprehensive code review with parallel reviewers, static analysis, and aggregated findings',
  version: '1.0.0',
  category: 'quality',
  tags: ['review', 'quality', 'security', 'performance'],

  parameters: {
    target: {
      type: 'string',
      required: true,
      description: 'Files or directories to review (can be array)',
    },
    depth: {
      type: 'string',
      required: false,
      default: 'standard',
      enum: ['shallow', 'standard', 'deep'],
      description: 'Review depth level',
    },
    focusAreas: {
      type: 'array',
      required: false,
      default: ['security', 'performance', 'maintainability', 'best-practices'],
      description: 'Areas to focus review on',
    },
    reviewerCount: {
      type: 'number',
      required: false,
      default: 3,
      min: 1,
      max: 10,
      description: 'Number of parallel reviewers',
    },
    minSeverity: {
      type: 'string',
      required: false,
      default: 'warning',
      enum: ['info', 'warning', 'error', 'critical'],
      description: 'Minimum severity to report',
    },
    generateComments: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Generate inline code comments',
    },
    runStaticAnalysis: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Run static analysis tools',
    },
    checkCoverage: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Check test coverage',
    },
    minCoverage: {
      type: 'number',
      required: false,
      default: 80,
      min: 0,
      max: 100,
      description: 'Required code coverage percentage',
    },
  },

  steps: [
    {
      id: 'initialize',
      name: 'Initialize Review',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Parse targets, validate parameters, and prepare review context',
      input: '${parameters}',
      timeout: 30000,
      retryable: false,
    },
    {
      id: 'static-analysis',
      name: 'Static Analysis',
      type: TaskType.ANALYZE,
      priority: TaskPriority.NORMAL,
      description: 'Run linters, type checkers, and security scanners',
      input: {
        targets: '${parameters.target}',
        runStaticAnalysis: '${parameters.runStaticAnalysis}',
      },
      timeout: 120000,
      retryable: true,
      condition: '${parameters.runStaticAnalysis}',
      parallel: false,
    },
    {
      id: 'spawn-reviewers',
      name: 'Spawn Parallel Reviewers',
      type: TaskType.REVIEW,
      priority: TaskPriority.HIGH,
      description: 'Spawn multiple reviewers with different focus areas',
      input: {
        targets: '${parameters.target}',
        depth: '${parameters.depth}',
        focusAreas: '${parameters.focusAreas}',
        count: '${parameters.reviewerCount}',
        staticAnalysisResults: '${steps.static-analysis.output}',
      },
      timeout: 300000,
      retryable: true,
      parallel: true,
      parallelCount: '${parameters.reviewerCount}',
    },
    {
      id: 'generate-comments',
      name: 'Generate Comments',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.NORMAL,
      description: 'Generate inline code comments for issues',
      input: {
        reviewFindings: '${steps.spawn-reviewers.output}',
        generateComments: '${parameters.generateComments}',
        minSeverity: '${parameters.minSeverity}',
      },
      timeout: 60000,
      retryable: true,
      condition: '${parameters.generateComments}',
    },
    {
      id: 'check-coverage',
      name: 'Check Test Coverage',
      type: TaskType.TEST,
      priority: TaskPriority.NORMAL,
      description: 'Verify test coverage meets requirements',
      input: {
        targets: '${parameters.target}',
        minCoverage: '${parameters.minCoverage}',
      },
      timeout: 120000,
      retryable: true,
      condition: '${parameters.checkCoverage}',
    },
    {
      id: 'aggregate',
      name: 'Aggregate Findings',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Combine findings from all reviewers and prioritize issues',
      input: {
        reviewFindings: '${steps.spawn-reviewers.output}',
        staticAnalysis: '${steps.static-analysis.output}',
        comments: '${steps.generate-comments.output}',
        coverage: '${steps.check-coverage.output}',
        minSeverity: '${parameters.minSeverity}',
      },
      timeout: 60000,
      retryable: true,
    },
    {
      id: 'generate-report',
      name: 'Generate Report',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.NORMAL,
      description: 'Generate review summary and recommendations',
      input: {
        aggregatedFindings: '${steps.aggregate.output}',
        depth: '${parameters.depth}',
      },
      timeout: 30000,
      retryable: true,
    },
  ],

  estimatedDuration: 600000, // 10 minutes
  estimatedCost: 0.05,
  resourceRequirements: {
    cpu: 'medium',
    memory: 'medium',
    agents: 5,
  },

  resumable: true,
  checkpoints: ['static-analysis', 'spawn-reviewers', 'aggregate'],

  metadata: {
    author: 'Claude Flow Team',
    createdAt: '2026-02-02',
    complexity: 'medium',
    useCase: 'Automated code review with parallel analysis and comprehensive reporting',
  },
};

/**
 * Create code review workflow with custom parameters
 */
export function createCodeReviewWorkflow(params: Partial<CodeReviewParameters>): WorkflowTemplate {
  return {
    ...codeReviewTemplate,
    parameters: {
      ...codeReviewTemplate.parameters,
      ...Object.entries(params).reduce((acc, [key, value]) => {
        if (codeReviewTemplate.parameters[key]) {
          acc[key] = { ...codeReviewTemplate.parameters[key], default: value };
        }
        return acc;
      }, {} as any),
    },
  };
}
