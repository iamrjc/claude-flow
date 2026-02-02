/**
 * Testing Workflow Template
 *
 * Automated test generation, coverage analysis, mutation testing, and reporting.
 * Supports multiple testing strategies and quality gates.
 *
 * @module @claude-flow/workflows/templates
 */

import { TaskType, TaskPriority } from '@claude-flow/agents';
import type { WorkflowTemplate, WorkflowParameters } from '../engine/workflow-engine.js';

export interface TestingParameters extends WorkflowParameters {
  /** Target files or directories to test */
  target: string | string[];
  /** Test types to generate: 'unit' | 'integration' | 'e2e' | 'all' */
  testTypes?: ('unit' | 'integration' | 'e2e')[];
  /** Generate missing tests */
  generateTests?: boolean;
  /** Run existing tests */
  runTests?: boolean;
  /** Check code coverage */
  checkCoverage?: boolean;
  /** Minimum coverage threshold */
  minCoverage?: number;
  /** Run mutation testing */
  mutationTesting?: boolean;
  /** Generate test report */
  generateReport?: boolean;
  /** Test framework: 'vitest' | 'jest' | 'mocha' */
  framework?: 'vitest' | 'jest' | 'mocha';
  /** Parallel test execution */
  parallel?: boolean;
  /** Maximum test generation count per file */
  maxTestsPerFile?: number;
}

/**
 * Testing Workflow Template
 *
 * Steps:
 * 1. Code Analysis - Analyze code structure and identify test gaps
 * 2. Test Planning - Plan test strategy and coverage targets
 * 3. Test Generation - Generate missing unit, integration, and e2e tests
 * 4. Test Execution - Run all tests in parallel
 * 5. Coverage Analysis - Analyze code coverage and identify gaps
 * 6. Mutation Testing - Run mutation tests to verify test quality
 * 7. Generate Report - Create comprehensive test report
 */
export const testingTemplate: WorkflowTemplate = {
  id: 'testing',
  name: 'Testing Workflow',
  description: 'Comprehensive testing with generation, coverage analysis, mutation testing, and reporting',
  version: '1.0.0',
  category: 'quality',
  tags: ['testing', 'coverage', 'mutation-testing', 'quality'],

  parameters: {
    target: {
      type: 'string',
      required: true,
      description: 'Target files or directories to test',
    },
    testTypes: {
      type: 'array',
      required: false,
      default: ['unit', 'integration'],
      description: 'Test types to generate',
    },
    generateTests: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Generate missing tests',
    },
    runTests: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Run existing and generated tests',
    },
    checkCoverage: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Check code coverage',
    },
    minCoverage: {
      type: 'number',
      required: false,
      default: 80,
      min: 0,
      max: 100,
      description: 'Minimum coverage threshold percentage',
    },
    mutationTesting: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Run mutation testing',
    },
    generateReport: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Generate test report',
    },
    framework: {
      type: 'string',
      required: false,
      default: 'vitest',
      enum: ['vitest', 'jest', 'mocha'],
      description: 'Test framework to use',
    },
    parallel: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Run tests in parallel',
    },
    maxTestsPerFile: {
      type: 'number',
      required: false,
      default: 10,
      min: 1,
      max: 50,
      description: 'Maximum tests to generate per file',
    },
  },

  steps: [
    {
      id: 'analyze-code',
      name: 'Code Analysis',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Analyze code structure and identify test gaps',
      input: {
        target: '${parameters.target}',
        testTypes: '${parameters.testTypes}',
      },
      timeout: 120000,
      retryable: false,
    },
    {
      id: 'plan-tests',
      name: 'Test Planning',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Plan test strategy and coverage targets',
      input: {
        codeAnalysis: '${steps.analyze-code.output}',
        testTypes: '${parameters.testTypes}',
        minCoverage: '${parameters.minCoverage}',
        maxTestsPerFile: '${parameters.maxTestsPerFile}',
      },
      timeout: 60000,
      retryable: true,
    },
    {
      id: 'generate-tests',
      name: 'Test Generation',
      type: TaskType.TEST,
      priority: TaskPriority.HIGH,
      description: 'Generate missing unit, integration, and e2e tests',
      input: {
        testPlan: '${steps.plan-tests.output}',
        target: '${parameters.target}',
        framework: '${parameters.framework}',
        testTypes: '${parameters.testTypes}',
      },
      timeout: 300000,
      retryable: true,
      condition: '${parameters.generateTests}',
    },
    {
      id: 'run-tests',
      name: 'Test Execution',
      type: TaskType.TEST,
      priority: TaskPriority.CRITICAL,
      description: 'Run all tests in parallel',
      input: {
        target: '${parameters.target}',
        framework: '${parameters.framework}',
        parallel: '${parameters.parallel}',
        generatedTests: '${steps.generate-tests.output}',
      },
      timeout: 300000,
      retryable: false,
      condition: '${parameters.runTests}',
    },
    {
      id: 'analyze-coverage',
      name: 'Coverage Analysis',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Analyze code coverage and identify gaps',
      input: {
        target: '${parameters.target}',
        testResults: '${steps.run-tests.output}',
        minCoverage: '${parameters.minCoverage}',
      },
      timeout: 120000,
      retryable: true,
      condition: '${parameters.checkCoverage}',
    },
    {
      id: 'mutation-testing',
      name: 'Mutation Testing',
      type: TaskType.TEST,
      priority: TaskPriority.NORMAL,
      description: 'Run mutation tests to verify test quality',
      input: {
        target: '${parameters.target}',
        testResults: '${steps.run-tests.output}',
      },
      timeout: 600000,
      retryable: true,
      condition: '${parameters.mutationTesting}',
    },
    {
      id: 'generate-report',
      name: 'Generate Report',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.NORMAL,
      description: 'Create comprehensive test report',
      input: {
        testResults: '${steps.run-tests.output}',
        coverage: '${steps.analyze-coverage.output}',
        mutationResults: '${steps.mutation-testing.output}',
        testPlan: '${steps.plan-tests.output}',
      },
      timeout: 60000,
      retryable: true,
      condition: '${parameters.generateReport}',
    },
  ],

  estimatedDuration: 900000, // 15 minutes
  estimatedCost: 0.10,
  resourceRequirements: {
    cpu: 'high',
    memory: 'medium',
    agents: 3,
  },

  resumable: true,
  checkpoints: ['generate-tests', 'run-tests', 'analyze-coverage'],

  metadata: {
    author: 'Claude Flow Team',
    createdAt: '2026-02-02',
    complexity: 'medium',
    useCase: 'Comprehensive testing with automated generation, coverage, and mutation testing',
  },
};

/**
 * Create testing workflow with custom parameters
 */
export function createTestingWorkflow(params: Partial<TestingParameters>): WorkflowTemplate {
  return {
    ...testingTemplate,
    parameters: {
      ...testingTemplate.parameters,
      ...Object.entries(params).reduce((acc, [key, value]) => {
        if (testingTemplate.parameters[key]) {
          acc[key] = { ...testingTemplate.parameters[key], default: value };
        }
        return acc;
      }, {} as any),
    },
  };
}
