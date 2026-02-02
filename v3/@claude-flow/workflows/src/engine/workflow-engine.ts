/**
 * Workflow Engine
 *
 * Template loading, parameter injection, progress tracking, and error handling.
 * Manages workflow execution lifecycle with resumable state.
 *
 * @module @claude-flow/workflows/engine
 */

import { EventEmitter } from 'events';
import { TaskType, TaskPriority } from '@claude-flow/agents';

/**
 * Workflow parameter definition
 */
export interface WorkflowParameterDef {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  default?: any;
  enum?: any[];
  min?: number;
  max?: number;
}

/**
 * Workflow parameters
 */
export interface WorkflowParameters {
  [key: string]: any;
}

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  id: string;
  name: string;
  type: TaskType;
  priority: TaskPriority;
  description: string;
  input: any;
  timeout: number;
  retryable: boolean;
  condition?: string;
  parallel?: boolean;
  parallelCount?: number | string;
}

/**
 * Workflow template definition
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  parameters: Record<string, WorkflowParameterDef>;
  steps: WorkflowStep[];
  estimatedDuration: number;
  estimatedCost: number;
  resourceRequirements: {
    cpu: 'low' | 'medium' | 'high';
    memory: 'low' | 'medium' | 'high';
    agents: number;
  };
  resumable: boolean;
  checkpoints: string[];
  metadata: {
    author: string;
    createdAt: string;
    complexity: 'low' | 'medium' | 'high';
    useCase: string;
  };
}

/**
 * Workflow execution state
 */
export enum WorkflowStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  workflowId: string;
  templateId: string;
  status: WorkflowStatus;
  parameters: WorkflowParameters;
  stepResults: Map<string, any>;
  currentStep?: string;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  checkpoint?: string;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  workflowId: string;
  status: WorkflowStatus;
  output?: any;
  error?: string;
  duration: number;
  stepResults: Record<string, any>;
  metrics: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    cost: number;
  };
}

/**
 * Workflow progress event
 */
export interface WorkflowProgress {
  workflowId: string;
  step: string;
  stepIndex: number;
  totalSteps: number;
  progress: number;
  message: string;
}

/**
 * Workflow Engine
 *
 * Manages workflow template loading, parameter injection, execution,
 * progress tracking, error handling, and resumable state.
 */
export class WorkflowEngine extends EventEmitter {
  private templates: Map<string, WorkflowTemplate> = new Map();
  private contexts: Map<string, WorkflowContext> = new Map();

  /**
   * Register a workflow template
   */
  registerTemplate(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get a workflow template by ID
   */
  getTemplate(templateId: string): WorkflowTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * List all registered templates
   */
  listTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Start a workflow execution
   */
  async startWorkflow(
    templateId: string,
    parameters: WorkflowParameters
  ): Promise<string> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Workflow template '${templateId}' not found`);
    }

    // Validate parameters
    const validatedParams = this.validateParameters(template, parameters);

    // Create execution context
    const workflowId = this.generateWorkflowId();
    const context: WorkflowContext = {
      workflowId,
      templateId,
      status: WorkflowStatus.PENDING,
      parameters: validatedParams,
      stepResults: new Map(),
      startedAt: new Date(),
    };

    this.contexts.set(workflowId, context);
    this.emit('workflow-started', { workflowId, templateId });

    // Start execution asynchronously
    this.executeWorkflow(workflowId).catch((error) => {
      this.emit('workflow-error', { workflowId, error: error.message });
    });

    return workflowId;
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(workflowId: string): Promise<void> {
    const context = this.contexts.get(workflowId);
    if (!context) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }

    if (context.status !== WorkflowStatus.PAUSED) {
      throw new Error(`Workflow '${workflowId}' is not paused`);
    }

    context.status = WorkflowStatus.RUNNING;
    this.emit('workflow-resumed', { workflowId });

    await this.executeWorkflow(workflowId);
  }

  /**
   * Pause a running workflow
   */
  async pauseWorkflow(workflowId: string): Promise<void> {
    const context = this.contexts.get(workflowId);
    if (!context) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }

    if (context.status !== WorkflowStatus.RUNNING) {
      throw new Error(`Workflow '${workflowId}' is not running`);
    }

    context.status = WorkflowStatus.PAUSED;
    this.emit('workflow-paused', { workflowId });
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId: string, reason?: string): Promise<void> {
    const context = this.contexts.get(workflowId);
    if (!context) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }

    context.status = WorkflowStatus.CANCELLED;
    context.error = reason;
    context.completedAt = new Date();
    this.emit('workflow-cancelled', { workflowId, reason });
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): WorkflowContext | undefined {
    return this.contexts.get(workflowId);
  }

  /**
   * Execute workflow steps
   */
  private async executeWorkflow(workflowId: string): Promise<void> {
    const context = this.contexts.get(workflowId);
    if (!context) {
      throw new Error(`Workflow context '${workflowId}' not found`);
    }

    const template = this.templates.get(context.templateId);
    if (!template) {
      throw new Error(`Workflow template '${context.templateId}' not found`);
    }

    context.status = WorkflowStatus.RUNNING;

    try {
      const startIndex = context.checkpoint
        ? template.steps.findIndex((s) => s.id === context.checkpoint)
        : 0;

      for (let i = startIndex; i < template.steps.length; i++) {
        // Check if workflow was paused or cancelled
        const currentContext = this.contexts.get(workflowId);
        if (currentContext?.status === WorkflowStatus.PAUSED) {
          currentContext.checkpoint = template.steps[i].id;
          return;
        }

        if (currentContext?.status === WorkflowStatus.CANCELLED) {
          return;
        }

        const step = template.steps[i];
        context.currentStep = step.id;

        // Emit progress
        this.emitProgress(workflowId, step, i, template.steps.length);

        // Check condition
        if (step.condition && !this.evaluateCondition(step.condition, context)) {
          this.emit('step-skipped', { workflowId, stepId: step.id });
          continue;
        }

        // Execute step
        const result = await this.executeStep(workflowId, step, context);
        context.stepResults.set(step.id, result);

        // Save checkpoint if this is a checkpoint step
        if (template.checkpoints.includes(step.id)) {
          context.checkpoint = step.id;
          this.emit('checkpoint-saved', { workflowId, checkpoint: step.id });
        }
      }

      // Workflow completed successfully
      context.status = WorkflowStatus.COMPLETED;
      context.completedAt = new Date();
      this.emit('workflow-completed', { workflowId });
    } catch (error: any) {
      context.status = WorkflowStatus.FAILED;
      context.error = error.message;
      context.completedAt = new Date();
      this.emit('workflow-failed', { workflowId, error: error.message });
      throw error;
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    workflowId: string,
    step: WorkflowStep,
    context: WorkflowContext
  ): Promise<any> {
    this.emit('step-started', { workflowId, stepId: step.id });

    try {
      // Inject parameters into step input
      const injectedInput = this.injectParameters(step.input, context);

      // Execute step (this would integrate with task execution service)
      const result = await this.executeStepLogic(step, injectedInput);

      this.emit('step-completed', { workflowId, stepId: step.id, result });
      return result;
    } catch (error: any) {
      if (step.retryable) {
        // Implement retry logic here
        this.emit('step-retry', { workflowId, stepId: step.id, error: error.message });
        // For now, just re-throw
      }

      this.emit('step-failed', { workflowId, stepId: step.id, error: error.message });
      throw error;
    }
  }

  /**
   * Execute step logic (placeholder for actual task execution)
   */
  private async executeStepLogic(step: WorkflowStep, input: any): Promise<any> {
    // This is where you would integrate with TaskExecutionService
    // For now, return a mock result
    return {
      success: true,
      stepId: step.id,
      input,
      output: `Executed step ${step.name}`,
      timestamp: new Date(),
    };
  }

  /**
   * Validate workflow parameters
   */
  private validateParameters(
    template: WorkflowTemplate,
    parameters: WorkflowParameters
  ): WorkflowParameters {
    const validated: WorkflowParameters = {};

    // Check required parameters
    for (const [key, def] of Object.entries(template.parameters)) {
      if (def.required && !(key in parameters)) {
        throw new Error(`Required parameter '${key}' is missing`);
      }

      const value = parameters[key] ?? def.default;

      if (value === undefined && def.required) {
        throw new Error(`Required parameter '${key}' has no value`);
      }

      // Type validation
      if (value !== undefined) {
        this.validateParameterType(key, value, def);
      }

      validated[key] = value;
    }

    return validated;
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(
    key: string,
    value: any,
    def: WorkflowParameterDef
  ): void {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (def.type !== actualType) {
      throw new Error(
        `Parameter '${key}' expected type ${def.type}, got ${actualType}`
      );
    }

    // Enum validation
    if (def.enum && !def.enum.includes(value)) {
      throw new Error(
        `Parameter '${key}' must be one of: ${def.enum.join(', ')}`
      );
    }

    // Range validation
    if (def.type === 'number') {
      if (def.min !== undefined && value < def.min) {
        throw new Error(`Parameter '${key}' must be >= ${def.min}`);
      }
      if (def.max !== undefined && value > def.max) {
        throw new Error(`Parameter '${key}' must be <= ${def.max}`);
      }
    }
  }

  /**
   * Inject parameters into step input
   */
  private injectParameters(input: any, context: WorkflowContext): any {
    if (typeof input === 'string') {
      return this.interpolateString(input, context);
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.injectParameters(item, context));
    }

    if (typeof input === 'object' && input !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(input)) {
        result[key] = this.injectParameters(value, context);
      }
      return result;
    }

    return input;
  }

  /**
   * Interpolate parameter references in strings
   */
  private interpolateString(str: string, context: WorkflowContext): any {
    const paramPattern = /\$\{parameters\.(\w+)\}/g;
    const stepPattern = /\$\{steps\.([^}]+)\}/g;

    let result = str;

    // Replace parameter references
    result = result.replace(paramPattern, (_, key) => {
      const value = context.parameters[key];
      return value !== undefined ? String(value) : '';
    });

    // Replace step output references
    result = result.replace(stepPattern, (_, path) => {
      const parts = path.split('.');
      const stepId = parts[0];
      const stepResult = context.stepResults.get(stepId);

      if (!stepResult) {
        return '';
      }

      let value = stepResult;
      for (let i = 1; i < parts.length; i++) {
        value = value?.[parts[i]];
      }

      return value !== undefined ? String(value) : '';
    });

    // Try to parse as JSON if it looks like an object/array
    if (result.startsWith('{') || result.startsWith('[')) {
      try {
        return JSON.parse(result);
      } catch {
        return result;
      }
    }

    return result;
  }

  /**
   * Evaluate step condition
   */
  private evaluateCondition(condition: string, context: WorkflowContext): boolean {
    const interpolated = this.interpolateString(condition, context);

    if (typeof interpolated === 'boolean') {
      return interpolated;
    }

    if (typeof interpolated === 'string') {
      return interpolated.toLowerCase() === 'true';
    }

    return Boolean(interpolated);
  }

  /**
   * Emit progress event
   */
  private emitProgress(
    workflowId: string,
    step: WorkflowStep,
    stepIndex: number,
    totalSteps: number
  ): void {
    const progress: WorkflowProgress = {
      workflowId,
      step: step.id,
      stepIndex,
      totalSteps,
      progress: ((stepIndex + 1) / totalSteps) * 100,
      message: `Executing: ${step.name}`,
    };

    this.emit('workflow-progress', progress);
  }

  /**
   * Generate unique workflow ID
   */
  private generateWorkflowId(): string {
    return `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get workflow result
   */
  getWorkflowResult(workflowId: string): WorkflowResult | null {
    const context = this.contexts.get(workflowId);
    if (!context) {
      return null;
    }

    const template = this.templates.get(context.templateId);
    const duration = context.completedAt
      ? context.completedAt.getTime() - context.startedAt.getTime()
      : Date.now() - context.startedAt.getTime();

    const stepResults: Record<string, any> = {};
    context.stepResults.forEach((value, key) => {
      stepResults[key] = value;
    });

    let completedSteps = 0;
    let failedSteps = 0;
    let skippedSteps = 0;

    if (template) {
      completedSteps = context.stepResults.size;
      failedSteps = context.status === WorkflowStatus.FAILED ? 1 : 0;
      skippedSteps = template.steps.length - completedSteps - failedSteps;
    }

    return {
      workflowId,
      status: context.status,
      output: context.stepResults.get('generate-report'),
      error: context.error,
      duration,
      stepResults,
      metrics: {
        totalSteps: template?.steps.length ?? 0,
        completedSteps,
        failedSteps,
        skippedSteps,
        cost: template?.estimatedCost ?? 0,
      },
    };
  }
}
