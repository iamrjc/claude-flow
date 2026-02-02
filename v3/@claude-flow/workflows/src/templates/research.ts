/**
 * Research Workflow Template
 *
 * Parallel information gathering, synthesis, and citation management.
 * Customizable sources, depth, and output format.
 *
 * @module @claude-flow/workflows/templates
 */

import { TaskType, TaskPriority } from '@claude-flow/agents';
import type { WorkflowTemplate, WorkflowParameters } from '../engine/workflow-engine.js';

export interface ResearchParameters extends WorkflowParameters {
  /** Research topic or question */
  query: string;
  /** Research depth: 'quick' | 'standard' | 'comprehensive' */
  depth?: 'quick' | 'standard' | 'comprehensive';
  /** Information sources to search */
  sources?: string[];
  /** Number of parallel researchers */
  researcherCount?: number;
  /** Include citations */
  includeCitations?: boolean;
  /** Citation format: 'apa' | 'mla' | 'chicago' | 'bibtex' */
  citationFormat?: 'apa' | 'mla' | 'chicago' | 'bibtex';
  /** Generate summary */
  generateSummary?: boolean;
  /** Generate detailed report */
  generateReport?: boolean;
  /** Maximum number of sources to cite */
  maxSources?: number;
  /** Research output format: 'markdown' | 'json' | 'html' */
  outputFormat?: 'markdown' | 'json' | 'html';
}

/**
 * Research Workflow Template
 *
 * Steps:
 * 1. Query Analysis - Parse query, identify key concepts and search terms
 * 2. Source Planning - Determine which sources to search and prioritize
 * 3. Parallel Gathering - Spawn multiple researchers to gather information
 * 4. Verification - Cross-reference findings and verify accuracy
 * 5. Citation Management - Extract and format citations
 * 6. Synthesis - Combine findings into coherent narrative
 * 7. Report Generation - Create final research output
 */
export const researchTemplate: WorkflowTemplate = {
  id: 'research',
  name: 'Research Workflow',
  description: 'Comprehensive research with parallel gathering, synthesis, and citation management',
  version: '1.0.0',
  category: 'research',
  tags: ['research', 'information-gathering', 'synthesis', 'citations'],

  parameters: {
    query: {
      type: 'string',
      required: true,
      description: 'Research topic or question',
    },
    depth: {
      type: 'string',
      required: false,
      default: 'standard',
      enum: ['quick', 'standard', 'comprehensive'],
      description: 'Research depth level',
    },
    sources: {
      type: 'array',
      required: false,
      default: ['documentation', 'code', 'articles', 'papers'],
      description: 'Information sources to search',
    },
    researcherCount: {
      type: 'number',
      required: false,
      default: 4,
      min: 1,
      max: 10,
      description: 'Number of parallel researchers',
    },
    includeCitations: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Include citations in output',
    },
    citationFormat: {
      type: 'string',
      required: false,
      default: 'apa',
      enum: ['apa', 'mla', 'chicago', 'bibtex'],
      description: 'Citation format',
    },
    generateSummary: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Generate executive summary',
    },
    generateReport: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Generate detailed report',
    },
    maxSources: {
      type: 'number',
      required: false,
      default: 20,
      min: 1,
      max: 100,
      description: 'Maximum number of sources to cite',
    },
    outputFormat: {
      type: 'string',
      required: false,
      default: 'markdown',
      enum: ['markdown', 'json', 'html'],
      description: 'Research output format',
    },
  },

  steps: [
    {
      id: 'analyze-query',
      name: 'Query Analysis',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Parse query, identify key concepts and search terms',
      input: {
        query: '${parameters.query}',
        depth: '${parameters.depth}',
      },
      timeout: 30000,
      retryable: false,
    },
    {
      id: 'plan-sources',
      name: 'Source Planning',
      type: TaskType.RESEARCH,
      priority: TaskPriority.HIGH,
      description: 'Determine which sources to search and prioritize',
      input: {
        query: '${parameters.query}',
        sources: '${parameters.sources}',
        queryAnalysis: '${steps.analyze-query.output}',
      },
      timeout: 30000,
      retryable: true,
    },
    {
      id: 'parallel-gathering',
      name: 'Parallel Information Gathering',
      type: TaskType.RESEARCH,
      priority: TaskPriority.HIGH,
      description: 'Spawn multiple researchers to gather information from different sources',
      input: {
        query: '${parameters.query}',
        searchTerms: '${steps.analyze-query.output.searchTerms}',
        sources: '${steps.plan-sources.output.prioritizedSources}',
        depth: '${parameters.depth}',
        maxSources: '${parameters.maxSources}',
      },
      timeout: 300000,
      retryable: true,
      parallel: true,
      parallelCount: '${parameters.researcherCount}',
    },
    {
      id: 'verify-findings',
      name: 'Verify Findings',
      type: TaskType.REVIEW,
      priority: TaskPriority.NORMAL,
      description: 'Cross-reference findings and verify accuracy',
      input: {
        findings: '${steps.parallel-gathering.output}',
        query: '${parameters.query}',
      },
      timeout: 120000,
      retryable: true,
    },
    {
      id: 'manage-citations',
      name: 'Citation Management',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.NORMAL,
      description: 'Extract and format citations',
      input: {
        findings: '${steps.verify-findings.output}',
        citationFormat: '${parameters.citationFormat}',
        maxSources: '${parameters.maxSources}',
      },
      timeout: 60000,
      retryable: true,
      condition: '${parameters.includeCitations}',
    },
    {
      id: 'synthesize',
      name: 'Synthesize Findings',
      type: TaskType.ANALYZE,
      priority: TaskPriority.HIGH,
      description: 'Combine findings into coherent narrative',
      input: {
        verifiedFindings: '${steps.verify-findings.output}',
        citations: '${steps.manage-citations.output}',
        query: '${parameters.query}',
      },
      timeout: 180000,
      retryable: true,
    },
    {
      id: 'generate-summary',
      name: 'Generate Summary',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.NORMAL,
      description: 'Create executive summary',
      input: {
        synthesis: '${steps.synthesize.output}',
      },
      timeout: 60000,
      retryable: true,
      condition: '${parameters.generateSummary}',
    },
    {
      id: 'generate-report',
      name: 'Generate Report',
      type: TaskType.DOCUMENT,
      priority: TaskPriority.HIGH,
      description: 'Create final research output',
      input: {
        synthesis: '${steps.synthesize.output}',
        summary: '${steps.generate-summary.output}',
        citations: '${steps.manage-citations.output}',
        outputFormat: '${parameters.outputFormat}',
      },
      timeout: 120000,
      retryable: true,
      condition: '${parameters.generateReport}',
    },
  ],

  estimatedDuration: 900000, // 15 minutes
  estimatedCost: 0.08,
  resourceRequirements: {
    cpu: 'high',
    memory: 'medium',
    agents: 6,
  },

  resumable: true,
  checkpoints: ['parallel-gathering', 'verify-findings', 'synthesize'],

  metadata: {
    author: 'Claude Flow Team',
    createdAt: '2026-02-02',
    complexity: 'high',
    useCase: 'Comprehensive research with parallel information gathering and citation management',
  },
};

/**
 * Create research workflow with custom parameters
 */
export function createResearchWorkflow(params: Partial<ResearchParameters>): WorkflowTemplate {
  return {
    ...researchTemplate,
    parameters: {
      ...researchTemplate.parameters,
      ...Object.entries(params).reduce((acc, [key, value]) => {
        if (researchTemplate.parameters[key]) {
          acc[key] = { ...researchTemplate.parameters[key], default: value };
        }
        return acc;
      }, {} as any),
    },
  };
}
