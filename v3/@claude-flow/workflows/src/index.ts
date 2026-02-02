/**
 * @claude-flow/workflows - Workflow Templates
 *
 * Customizable workflow templates for common development tasks.
 * Includes code review, research, refactoring, testing, and documentation workflows.
 *
 * @module @claude-flow/workflows
 */

// Engine
export {
  WorkflowEngine,
  WorkflowStatus,
  type WorkflowTemplate,
  type WorkflowStep,
  type WorkflowParameters,
  type WorkflowParameterDef,
  type WorkflowContext,
  type WorkflowResult,
  type WorkflowProgress,
} from './engine/workflow-engine.js';

export {
  WorkflowValidator,
  type ValidationResult,
  type ResourceEstimation,
  type DependencyAnalysis,
} from './engine/workflow-validator.js';

// Templates
export {
  codeReviewTemplate,
  createCodeReviewWorkflow,
  type CodeReviewParameters,
} from './templates/code-review.js';

export {
  researchTemplate,
  createResearchWorkflow,
  type ResearchParameters,
} from './templates/research.js';

export {
  refactoringTemplate,
  createRefactoringWorkflow,
  type RefactoringParameters,
} from './templates/refactoring.js';

export {
  testingTemplate,
  createTestingWorkflow,
  type TestingParameters,
} from './templates/testing.js';

export {
  documentationTemplate,
  createDocumentationWorkflow,
  type DocumentationParameters,
} from './templates/documentation.js';
