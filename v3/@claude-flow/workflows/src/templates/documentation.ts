/**
 * Documentation Workflow Template
 *
 * Automated documentation generation with code scanning, example generation,
 * and consistency checking. Supports multiple doc formats and standards.
 *
 * @module @claude-flow/workflows/templates
 */

import { TaskType, TaskPriority } from '@claude-flow/agents';
import type { WorkflowTemplate, WorkflowParameters } from '../engine/workflow-engine.js';

export interface DocumentationParameters extends WorkflowParameters {
  /** Target files or directories to document */
  target: string | string[];
  /** Documentation types: 'api' | 'architecture' | 'guide' | 'reference' */
  docTypes?: ('api' | 'architecture' | 'guide' | 'reference')[];
  /** Documentation format: 'markdown' | 'html' | 'jsdoc' | 'typedoc' */
  format?: 'markdown' | 'html' | 'jsdoc' | 'typedoc';
  /** Generate code examples */
  generateExamples?: boolean;
  /** Example types: 'basic' | 'advanced' | 'edge-cases' */
  exampleTypes?: ('basic' | 'advanced' | 'edge-cases')[];
  /** Check documentation consistency */
  checkConsistency?: boolean;
  /** Update existing docs */
  updateExisting?: boolean;
  /** Generate table of contents */
  generateTOC?: boolean;
  /** Include diagrams */
  includeDiagrams?: boolean;
  /** Diagram types: 'class' | 'sequence' | 'flow' */
  diagramTypes?: ('class' | 'sequence' | 'flow')[];
  /** Documentation style guide */
  styleGuide?: string;
}

/**
 * Documentation Workflow Template
 *
 * Steps:
 * 1. Code Scan - Scan code structure, exports, types, and interfaces
 * 2. Extract Metadata - Extract function signatures, types, and descriptions
 * 3. Generate API Docs - Create API reference documentation
 * 4. Generate Examples - Create code examples for key functionality
 * 5. Generate Diagrams - Create architectural and flow diagrams
 * 6. Check Consistency - Verify documentation consistency with code
 * 7. Generate TOC - Create table of contents and navigation
 * 8. Compile Documentation - Combine all documentation into final output
 */
export const documentationTemplate: WorkflowTemplate = {
  id: 'documentation',
  name: 'Documentation Generation',
  description: 'Comprehensive documentation generation with code scanning, examples, and consistency checks',
  version: '1.0.0',
  category: 'documentation',
  tags: ['documentation', 'api-docs', 'examples', 'diagrams'],

  parameters: {
    target: {
      type: 'string',
      required: true,
      description: 'Target files or directories to document',
    },
    docTypes: {
      type: 'array',
      required: false,
      default: ['api', 'guide'],
      description: 'Documentation types to generate',
    },
    format: {
      type: 'string',
      required: false,
      default: 'markdown',
      enum: ['markdown', 'html', 'jsdoc', 'typedoc'],
      description: 'Documentation output format',
    },
    generateExamples: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Generate code examples',
    },
    exampleTypes: {
      type: 'array',
      required: false,
      default: ['basic', 'advanced'],
      description: 'Types of examples to generate',
    },
    checkConsistency: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Check documentation consistency with code',
    },
    updateExisting: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Update existing documentation',
    },
    generateTOC: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Generate table of contents',
    },
    includeDiagrams: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Include architectural diagrams',
    },
    diagramTypes: {
      type: 'array',
      required: false,
      default: ['class', 'flow'],
      description: 'Types of diagrams to generate',
    },
    styleGuide: {
      type: 'string',
      required: false,
      description: 'Documentation style guide URL or path',
    },
  },

  steps: [
    {
      id: 'scan-code',
      name: 'Code Scan',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Scan code structure, exports, types, and interfaces',
      input: {
        target: '${parameters.target}',
        docTypes: '${parameters.docTypes}',
      },
      timeout: 120000,
      retryable: false,
    },
    {
      id: 'extract-metadata',
      name: 'Extract Metadata',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Extract function signatures, types, parameters, and descriptions',
      input: {
        codeScan: '${steps.scan-code.output}',
        format: '${parameters.format}',
      },
      timeout: 120000,
      retryable: true,
    },
    {
      id: 'generate-api-docs',
      name: 'Generate API Documentation',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.HIGH,
      description: 'Create API reference documentation',
      input: {
        metadata: '${steps.extract-metadata.output}',
        format: '${parameters.format}',
        docTypes: '${parameters.docTypes}',
        updateExisting: '${parameters.updateExisting}',
      },
      timeout: 180000,
      retryable: true,
    },
    {
      id: 'generate-examples',
      name: 'Generate Examples',
      type: TaskType.CODE,
      priority: TaskPriority.NORMAL,
      description: 'Create code examples for key functionality',
      input: {
        metadata: '${steps.extract-metadata.output}',
        exampleTypes: '${parameters.exampleTypes}',
        format: '${parameters.format}',
      },
      timeout: 240000,
      retryable: true,
      condition: '${parameters.generateExamples}',
    },
    {
      id: 'generate-diagrams',
      name: 'Generate Diagrams',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.NORMAL,
      description: 'Create architectural and flow diagrams',
      input: {
        metadata: '${steps.extract-metadata.output}',
        diagramTypes: '${parameters.diagramTypes}',
      },
      timeout: 180000,
      retryable: true,
      condition: '${parameters.includeDiagrams}',
    },
    {
      id: 'check-consistency',
      name: 'Consistency Check',
      type: TaskType.REVIEW,
      priority: TaskPriority.NORMAL,
      description: 'Verify documentation consistency with code',
      input: {
        apiDocs: '${steps.generate-api-docs.output}',
        examples: '${steps.generate-examples.output}',
        metadata: '${steps.extract-metadata.output}',
        styleGuide: '${parameters.styleGuide}',
      },
      timeout: 120000,
      retryable: true,
      condition: '${parameters.checkConsistency}',
    },
    {
      id: 'generate-toc',
      name: 'Generate Table of Contents',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.NORMAL,
      description: 'Create table of contents and navigation',
      input: {
        apiDocs: '${steps.generate-api-docs.output}',
        format: '${parameters.format}',
      },
      timeout: 30000,
      retryable: true,
      condition: '${parameters.generateTOC}',
    },
    {
      id: 'compile-docs',
      name: 'Compile Documentation',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.HIGH,
      description: 'Combine all documentation into final output',
      input: {
        apiDocs: '${steps.generate-api-docs.output}',
        examples: '${steps.generate-examples.output}',
        diagrams: '${steps.generate-diagrams.output}',
        toc: '${steps.generate-toc.output}',
        consistencyReport: '${steps.check-consistency.output}',
        format: '${parameters.format}',
      },
      timeout: 120000,
      retryable: true,
    },
  ],

  estimatedDuration: 900000, // 15 minutes
  estimatedCost: 0.09,
  resourceRequirements: {
    cpu: 'medium',
    memory: 'medium',
    agents: 4,
  },

  resumable: true,
  checkpoints: ['extract-metadata', 'generate-api-docs', 'generate-examples'],

  metadata: {
    author: 'Claude Flow Team',
    createdAt: '2026-02-02',
    complexity: 'medium',
    useCase: 'Comprehensive documentation generation with examples and consistency checking',
  },
};

/**
 * Create documentation workflow with custom parameters
 */
export function createDocumentationWorkflow(params: Partial<DocumentationParameters>): WorkflowTemplate {
  return {
    ...documentationTemplate,
    parameters: {
      ...documentationTemplate.parameters,
      ...Object.entries(params).reduce((acc, [key, value]) => {
        if (documentationTemplate.parameters[key]) {
          acc[key] = { ...documentationTemplate.parameters[key], default: value };
        }
        return acc;
      }, {} as any),
    },
  };
}
