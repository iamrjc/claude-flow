/**
 * Workflow Validator
 *
 * Schema validation, dependency checks, and resource estimation.
 * Validates workflow templates and parameters before execution.
 *
 * @module @claude-flow/workflows/engine
 */

import type {
  WorkflowTemplate,
  WorkflowStep,
  WorkflowParameterDef,
  WorkflowParameters,
} from './workflow-engine.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Resource estimation
 */
export interface ResourceEstimation {
  estimatedDuration: number;
  estimatedCost: number;
  requiredAgents: number;
  cpuRequirement: 'low' | 'medium' | 'high';
  memoryRequirement: 'low' | 'medium' | 'high';
  parallelSteps: number;
  totalSteps: number;
}

/**
 * Dependency analysis result
 */
export interface DependencyAnalysis {
  valid: boolean;
  cycles: string[][];
  missingDependencies: string[];
  executionOrder: string[];
}

/**
 * Workflow Validator
 *
 * Validates workflow templates, checks dependencies,
 * and estimates resource requirements.
 */
export class WorkflowValidator {
  /**
   * Validate a workflow template
   */
  validateTemplate(template: WorkflowTemplate): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate basic structure
    if (!template.id || template.id.trim().length === 0) {
      errors.push('Template ID is required');
    }

    if (!template.name || template.name.trim().length === 0) {
      errors.push('Template name is required');
    }

    if (!template.version || !this.isValidVersion(template.version)) {
      errors.push('Template version must be valid semver (e.g., 1.0.0)');
    }

    if (!template.steps || template.steps.length === 0) {
      errors.push('Template must have at least one step');
    }

    // Validate parameters
    const paramErrors = this.validateParameterDefinitions(template.parameters);
    errors.push(...paramErrors);

    // Validate steps
    if (template.steps) {
      for (let i = 0; i < template.steps.length; i++) {
        const stepErrors = this.validateStep(template.steps[i], i);
        errors.push(...stepErrors);
      }

      // Check for duplicate step IDs
      const stepIds = new Set<string>();
      for (const step of template.steps) {
        if (stepIds.has(step.id)) {
          errors.push(`Duplicate step ID: ${step.id}`);
        }
        stepIds.add(step.id);
      }
    }

    // Validate checkpoints
    if (template.checkpoints) {
      const stepIds = new Set(template.steps.map((s) => s.id));
      for (const checkpoint of template.checkpoints) {
        if (!stepIds.has(checkpoint)) {
          errors.push(`Checkpoint references non-existent step: ${checkpoint}`);
        }
      }
    }

    // Validate resource requirements
    if (template.resourceRequirements) {
      if (template.resourceRequirements.agents < 1) {
        errors.push('Resource requirements must specify at least 1 agent');
      }
    }

    // Warnings
    if (template.estimatedDuration > 3600000) {
      warnings.push('Workflow estimated duration exceeds 1 hour');
    }

    if (template.estimatedCost > 1.0) {
      warnings.push('Workflow estimated cost exceeds $1.00');
    }

    if (template.steps.length > 20) {
      warnings.push('Workflow has more than 20 steps, consider splitting');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate workflow parameters
   */
  validateParameters(
    template: WorkflowTemplate,
    parameters: WorkflowParameters
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const [key, def] of Object.entries(template.parameters)) {
      const value = parameters[key];

      // Check required parameters
      if (def.required && value === undefined) {
        errors.push(`Required parameter '${key}' is missing`);
        continue;
      }

      if (value === undefined) {
        continue;
      }

      // Type validation
      const typeError = this.validateParameterType(key, value, def);
      if (typeError) {
        errors.push(typeError);
      }

      // Enum validation
      if (def.enum && !def.enum.includes(value)) {
        errors.push(
          `Parameter '${key}' must be one of: ${def.enum.join(', ')}`
        );
      }

      // Range validation for numbers
      if (def.type === 'number') {
        if (def.min !== undefined && value < def.min) {
          errors.push(`Parameter '${key}' must be >= ${def.min}`);
        }
        if (def.max !== undefined && value > def.max) {
          errors.push(`Parameter '${key}' must be <= ${def.max}`);
        }
      }
    }

    // Check for unknown parameters
    for (const key of Object.keys(parameters)) {
      if (!(key in template.parameters)) {
        warnings.push(`Unknown parameter '${key}' will be ignored`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Analyze step dependencies
   */
  analyzeDependencies(template: WorkflowTemplate): DependencyAnalysis {
    const stepIds = new Set(template.steps.map((s) => s.id));
    const dependencies = new Map<string, Set<string>>();
    const missingDependencies: string[] = [];

    // Extract dependencies from step inputs
    for (const step of template.steps) {
      const deps = this.extractDependencies(step);
      dependencies.set(step.id, deps);

      // Check for missing dependencies
      for (const dep of deps) {
        if (!stepIds.has(dep)) {
          missingDependencies.push(`${step.id} -> ${dep}`);
        }
      }
    }

    // Check for circular dependencies
    const cycles = this.findCycles(dependencies);

    // Generate execution order (topological sort)
    const executionOrder = this.topologicalSort(template.steps, dependencies);

    return {
      valid: cycles.length === 0 && missingDependencies.length === 0,
      cycles,
      missingDependencies,
      executionOrder,
    };
  }

  /**
   * Estimate resource requirements
   */
  estimateResources(template: WorkflowTemplate): ResourceEstimation {
    let totalDuration = 0;
    let parallelSteps = 0;

    for (const step of template.steps) {
      if (step.parallel) {
        parallelSteps++;
      }
      totalDuration += step.timeout;
    }

    // Adjust for parallel execution
    const parallelSpeedup = parallelSteps > 0 ? 0.6 : 1.0;
    const estimatedDuration = totalDuration * parallelSpeedup;

    return {
      estimatedDuration,
      estimatedCost: template.estimatedCost,
      requiredAgents: template.resourceRequirements.agents,
      cpuRequirement: template.resourceRequirements.cpu,
      memoryRequirement: template.resourceRequirements.memory,
      parallelSteps,
      totalSteps: template.steps.length,
    };
  }

  /**
   * Validate parameter definitions
   */
  private validateParameterDefinitions(
    parameters: Record<string, WorkflowParameterDef>
  ): string[] {
    const errors: string[] = [];

    for (const [key, def] of Object.entries(parameters)) {
      if (!def.type) {
        errors.push(`Parameter '${key}' missing type definition`);
      }

      if (!def.description || def.description.trim().length === 0) {
        errors.push(`Parameter '${key}' missing description`);
      }

      if (def.required && def.default !== undefined) {
        errors.push(
          `Parameter '${key}' cannot be both required and have a default value`
        );
      }

      if (def.type === 'number') {
        if (def.min !== undefined && def.max !== undefined && def.min > def.max) {
          errors.push(`Parameter '${key}' min value exceeds max value`);
        }
      }
    }

    return errors;
  }

  /**
   * Validate a workflow step
   */
  private validateStep(step: WorkflowStep, index: number): string[] {
    const errors: string[] = [];
    const stepPrefix = `Step ${index} (${step.id})`;

    if (!step.id || step.id.trim().length === 0) {
      errors.push(`${stepPrefix}: ID is required`);
    }

    if (!step.name || step.name.trim().length === 0) {
      errors.push(`${stepPrefix}: Name is required`);
    }

    if (!step.description || step.description.trim().length === 0) {
      errors.push(`${stepPrefix}: Description is required`);
    }

    if (step.timeout <= 0) {
      errors.push(`${stepPrefix}: Timeout must be positive`);
    }

    if (step.timeout > 600000) {
      errors.push(`${stepPrefix}: Timeout exceeds 10 minutes`);
    }

    if (step.parallel && !step.parallelCount) {
      errors.push(`${stepPrefix}: Parallel step must specify parallelCount`);
    }

    return errors;
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(
    key: string,
    value: any,
    def: WorkflowParameterDef
  ): string | null {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (def.type !== actualType) {
      return `Parameter '${key}' expected type ${def.type}, got ${actualType}`;
    }

    return null;
  }

  /**
   * Extract dependencies from step input
   */
  private extractDependencies(step: WorkflowStep): Set<string> {
    const deps = new Set<string>();
    const pattern = /\$\{steps\.([^.}]+)/g;

    const inputStr = JSON.stringify(step.input);
    let match;

    while ((match = pattern.exec(inputStr)) !== null) {
      deps.add(match[1]);
    }

    // Also check condition
    if (step.condition) {
      const condMatch = pattern.exec(step.condition);
      if (condMatch) {
        deps.add(condMatch[1]);
      }
    }

    return deps;
  }

  /**
   * Find circular dependencies
   */
  private findCycles(dependencies: Map<string, Set<string>>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      if (path.includes(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push([...path.slice(cycleStart), node]);
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      path.push(node);

      const deps = dependencies.get(node);
      if (deps) {
        for (const dep of deps) {
          dfs(dep);
        }
      }

      path.pop();
    };

    for (const node of dependencies.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Topological sort for execution order
   */
  private topologicalSort(
    steps: WorkflowStep[],
    dependencies: Map<string, Set<string>>
  ): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (stepId: string) => {
      if (visited.has(stepId)) {
        return;
      }

      visited.add(stepId);

      const deps = dependencies.get(stepId);
      if (deps) {
        for (const dep of deps) {
          visit(dep);
        }
      }

      sorted.push(stepId);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return sorted;
  }

  /**
   * Check if version string is valid semver
   */
  private isValidVersion(version: string): boolean {
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
    return semverRegex.test(version);
  }
}
