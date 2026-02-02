# @claude-flow/workflows

Workflow Templates for Claude Flow V3 - Customizable workflow templates for common development tasks including code review, research, refactoring, testing, and documentation.

## Features

- **5 Built-in Templates**: Code review, research, refactoring, testing, and documentation workflows
- **Customizable Parameters**: All templates support parameter customization
- **Progress Tracking**: Real-time workflow progress with events
- **Resumable Workflows**: Pause and resume workflows with checkpoint support
- **Error Handling**: Automatic retry logic and error recovery
- **Validation**: Schema validation and dependency checking
- **Resource Estimation**: Estimate duration, cost, and resource requirements

## Installation

```bash
npm install @claude-flow/workflows
```

## Quick Start

```typescript
import {
  WorkflowEngine,
  WorkflowValidator,
  codeReviewTemplate,
  researchTemplate,
} from '@claude-flow/workflows';

// Create engine and validator
const engine = new WorkflowEngine();
const validator = new WorkflowValidator();

// Register templates
engine.registerTemplate(codeReviewTemplate);
engine.registerTemplate(researchTemplate);

// Validate template
const validation = validator.validateTemplate(codeReviewTemplate);
console.log(validation);

// Start a workflow
const workflowId = await engine.startWorkflow('code-review', {
  target: '/src',
  depth: 'deep',
  reviewerCount: 5,
});

// Track progress
engine.on('workflow-progress', (progress) => {
  console.log(`Progress: ${progress.progress}% - ${progress.message}`);
});

// Get workflow status
const status = engine.getWorkflowStatus(workflowId);
console.log(status);
```

## Built-in Templates

### 1. Code Review Template

Comprehensive code review with parallel reviewers, static analysis, and aggregated findings.

```typescript
import { codeReviewTemplate, createCodeReviewWorkflow } from '@claude-flow/workflows';

// Use default template
const workflowId = await engine.startWorkflow('code-review', {
  target: '/src',
  depth: 'standard',
  reviewerCount: 3,
  focusAreas: ['security', 'performance', 'maintainability'],
  minCoverage: 80,
});

// Or create customized template
const customTemplate = createCodeReviewWorkflow({
  target: '/src',
  depth: 'deep',
  reviewerCount: 5,
  runStaticAnalysis: true,
  checkCoverage: true,
});
```

**Steps:**
1. Initialize - Parse targets, validate parameters
2. Static Analysis - Run linters, type checkers, security scanners
3. Parallel Review - Spawn multiple reviewers with different focus areas
4. Comment Generation - Generate inline code comments
5. Coverage Check - Verify test coverage meets requirements
6. Aggregate - Combine findings, prioritize issues
7. Report - Generate review summary and recommendations

### 2. Research Template

Comprehensive research with parallel information gathering, synthesis, and citation management.

```typescript
import { researchTemplate, createResearchWorkflow } from '@claude-flow/workflows';

const workflowId = await engine.startWorkflow('research', {
  query: 'What are the latest trends in AI?',
  depth: 'comprehensive',
  researcherCount: 4,
  includeCitations: true,
  citationFormat: 'apa',
  outputFormat: 'markdown',
});
```

**Steps:**
1. Query Analysis - Parse query, identify key concepts
2. Source Planning - Determine which sources to search
3. Parallel Gathering - Spawn multiple researchers
4. Verification - Cross-reference findings
5. Citation Management - Extract and format citations
6. Synthesis - Combine findings into coherent narrative
7. Report Generation - Create final research output

### 3. Refactoring Template

Automated code refactoring with pattern detection, safe transformations, and test verification.

```typescript
import { refactoringTemplate, createRefactoringWorkflow } from '@claude-flow/workflows';

const workflowId = await engine.startWorkflow('refactoring', {
  target: '/src',
  patterns: ['extract-method', 'rename', 'move'],
  strategy: 'safe',
  runTests: true,
  preserveBehavior: true,
  createBackup: true,
});
```

**Steps:**
1. Code Analysis - Analyze code structure, metrics
2. Pattern Detection - Identify refactoring opportunities
3. Backup Creation - Create safety backup
4. Plan Transformations - Plan refactoring steps
5. Apply Transformations - Execute refactoring patterns
6. Test Verification - Run tests to ensure behavior preservation
7. Metrics Validation - Verify improvement in code metrics
8. Generate Report - Document changes and migration guide

### 4. Testing Template

Comprehensive testing with generation, coverage analysis, mutation testing, and reporting.

```typescript
import { testingTemplate, createTestingWorkflow } from '@claude-flow/workflows';

const workflowId = await engine.startWorkflow('testing', {
  target: '/src',
  testTypes: ['unit', 'integration'],
  framework: 'vitest',
  generateTests: true,
  runTests: true,
  checkCoverage: true,
  minCoverage: 80,
  mutationTesting: false,
});
```

**Steps:**
1. Code Analysis - Analyze code structure and identify test gaps
2. Test Planning - Plan test strategy and coverage targets
3. Test Generation - Generate missing tests
4. Test Execution - Run all tests in parallel
5. Coverage Analysis - Analyze code coverage
6. Mutation Testing - Run mutation tests
7. Generate Report - Create comprehensive test report

### 5. Documentation Template

Comprehensive documentation generation with code scanning, examples, and consistency checks.

```typescript
import { documentationTemplate, createDocumentationWorkflow } from '@claude-flow/workflows';

const workflowId = await engine.startWorkflow('documentation', {
  target: '/src',
  docTypes: ['api', 'guide'],
  format: 'markdown',
  generateExamples: true,
  checkConsistency: true,
  includeDiagrams: true,
});
```

**Steps:**
1. Code Scan - Scan code structure, exports, types
2. Extract Metadata - Extract function signatures, types
3. Generate API Docs - Create API reference documentation
4. Generate Examples - Create code examples
5. Generate Diagrams - Create architectural diagrams
6. Check Consistency - Verify documentation consistency
7. Generate TOC - Create table of contents
8. Compile Documentation - Combine all documentation

## Workflow Engine API

### WorkflowEngine

```typescript
const engine = new WorkflowEngine();

// Register templates
engine.registerTemplate(template);

// Get template
const template = engine.getTemplate('template-id');

// List all templates
const templates = engine.listTemplates();

// Start workflow
const workflowId = await engine.startWorkflow('template-id', parameters);

// Control workflow
await engine.pauseWorkflow(workflowId);
await engine.resumeWorkflow(workflowId);
await engine.cancelWorkflow(workflowId, 'reason');

// Get status and results
const status = engine.getWorkflowStatus(workflowId);
const result = engine.getWorkflowResult(workflowId);

// Events
engine.on('workflow-started', (event) => {});
engine.on('workflow-progress', (progress) => {});
engine.on('workflow-completed', (event) => {});
engine.on('workflow-failed', (event) => {});
engine.on('workflow-paused', (event) => {});
engine.on('workflow-cancelled', (event) => {});
engine.on('step-started', (event) => {});
engine.on('step-completed', (event) => {});
engine.on('step-failed', (event) => {});
engine.on('checkpoint-saved', (event) => {});
```

## Workflow Validator API

### WorkflowValidator

```typescript
const validator = new WorkflowValidator();

// Validate template
const templateValidation = validator.validateTemplate(template);
console.log(templateValidation.valid);
console.log(templateValidation.errors);
console.log(templateValidation.warnings);

// Validate parameters
const paramValidation = validator.validateParameters(template, parameters);
console.log(paramValidation.valid);

// Analyze dependencies
const depAnalysis = validator.analyzeDependencies(template);
console.log(depAnalysis.cycles); // Circular dependencies
console.log(depAnalysis.executionOrder); // Topologically sorted steps

// Estimate resources
const estimation = validator.estimateResources(template);
console.log(estimation.estimatedDuration);
console.log(estimation.estimatedCost);
console.log(estimation.requiredAgents);
```

## Creating Custom Templates

```typescript
import { WorkflowTemplate, TaskType, TaskPriority } from '@claude-flow/workflows';

const customTemplate: WorkflowTemplate = {
  id: 'my-workflow',
  name: 'My Custom Workflow',
  description: 'Custom workflow description',
  version: '1.0.0',
  category: 'custom',
  tags: ['custom', 'example'],

  parameters: {
    myParam: {
      type: 'string',
      required: true,
      description: 'My parameter',
      default: 'default-value',
    },
  },

  steps: [
    {
      id: 'step1',
      name: 'First Step',
      type: TaskType.CODE,
      priority: TaskPriority.HIGH,
      description: 'First step description',
      input: {
        param: '${parameters.myParam}',
      },
      timeout: 30000,
      retryable: true,
    },
    {
      id: 'step2',
      name: 'Second Step',
      type: TaskType.ANALYZE,
      priority: TaskPriority.NORMAL,
      description: 'Second step description',
      input: {
        prevResult: '${steps.step1.output}',
      },
      timeout: 60000,
      retryable: true,
    },
  ],

  estimatedDuration: 90000,
  estimatedCost: 0.01,
  resourceRequirements: {
    cpu: 'medium',
    memory: 'medium',
    agents: 2,
  },

  resumable: true,
  checkpoints: ['step1'],

  metadata: {
    author: 'Your Name',
    createdAt: '2026-02-02',
    complexity: 'medium',
    useCase: 'Custom use case',
  },
};

// Register and use
engine.registerTemplate(customTemplate);
const workflowId = await engine.startWorkflow('my-workflow', {
  myParam: 'custom-value',
});
```

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## TypeScript Support

Full TypeScript support with type definitions included.

```typescript
import type {
  WorkflowTemplate,
  WorkflowParameters,
  WorkflowContext,
  WorkflowResult,
  WorkflowProgress,
  ValidationResult,
  ResourceEstimation,
} from '@claude-flow/workflows';
```

## License

MIT

## Contributing

Contributions are welcome! Please see the main claude-flow repository for contribution guidelines.
