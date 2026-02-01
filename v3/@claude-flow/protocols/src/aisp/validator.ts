/**
 * AISP Validator
 *
 * Semantic validation for AISP AST nodes.
 * Checks for type correctness, scope, and other semantic properties.
 */

import type {
  ASTNode,
  ProgramNode,
  IdentifierNode,
  LiteralNode,
  QuantifierExpressionNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  ApplicationNode,
  LambdaNode,
  SetExpressionNode,
  DefinitionNode,
  TypeAnnotationNode,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types.js';
import { lookupById, lookupByAscii } from './symbols.js';

/**
 * Scope for variable tracking
 */
interface Scope {
  parent: Scope | null;
  variables: Map<string, { node: ASTNode; used: boolean }>;
}

/**
 * Validator configuration
 */
export interface ValidatorConfig {
  strict?: boolean;
  checkUnusedVariables?: boolean;
  checkUndefinedVariables?: boolean;
  checkTypeAnnotations?: boolean;
}

/**
 * AISP Validator class
 */
export class Validator {
  private config: ValidatorConfig;
  private scope: Scope;
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];

  constructor(config: ValidatorConfig = {}) {
    this.config = {
      strict: false,
      checkUnusedVariables: true,
      checkUndefinedVariables: true,
      checkTypeAnnotations: false,
      ...config,
    };
    this.scope = this.createScope();
  }

  /**
   * Validate an AST
   */
  validate(ast: ProgramNode): ValidationResult {
    this.errors = [];
    this.warnings = [];
    this.scope = this.createScope();

    this.validateProgram(ast);

    // Check for unused variables in top-level scope
    if (this.config.checkUnusedVariables) {
      this.checkUnusedVariables(this.scope);
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Validate a program node
   */
  private validateProgram(node: ProgramNode): void {
    for (const statement of node.body) {
      this.validateNode(statement);
    }
  }

  /**
   * Validate any AST node
   */
  private validateNode(node: ASTNode): void {
    switch (node.type) {
      case 'Program':
        this.validateProgram(node as ProgramNode);
        break;
      case 'Definition':
        this.validateDefinition(node as DefinitionNode);
        break;
      case 'Identifier':
        this.validateIdentifier(node as IdentifierNode);
        break;
      case 'Literal':
        this.validateLiteral(node as LiteralNode);
        break;
      case 'QuantifierExpression':
        this.validateQuantifier(node as QuantifierExpressionNode);
        break;
      case 'BinaryExpression':
        this.validateBinaryExpression(node as BinaryExpressionNode);
        break;
      case 'UnaryExpression':
        this.validateUnaryExpression(node as UnaryExpressionNode);
        break;
      case 'Application':
        this.validateApplication(node as ApplicationNode);
        break;
      case 'Lambda':
        this.validateLambda(node as LambdaNode);
        break;
      case 'SetExpression':
        this.validateSetExpression(node as SetExpressionNode);
        break;
      case 'TupleExpression':
        this.validateTupleExpression(node);
        break;
      case 'TypeAnnotation':
        this.validateTypeAnnotation(node as TypeAnnotationNode);
        break;
      default:
        // Unknown node type
        if (this.config.strict) {
          this.addError(`Unknown node type: ${node.type}`, 'V001', node);
        }
    }
  }

  /**
   * Validate a definition
   */
  private validateDefinition(node: DefinitionNode): void {
    const name = node.name.name;

    // Check for redefinition
    if (this.scope.variables.has(name)) {
      this.addWarning(`Variable '${name}' is being redefined`, 'V010', node);
    }

    // Add to scope
    this.scope.variables.set(name, { node: node.name, used: false });

    // Validate the value expression
    this.validateNode(node.value);

    // Validate type annotation if present
    if (node.typeAnnotation) {
      this.validateNode(node.typeAnnotation);
    }
  }

  /**
   * Validate an identifier reference
   */
  private validateIdentifier(node: IdentifierNode): void {
    if (!this.config.checkUndefinedVariables) {
      return;
    }

    const name = node.name;

    // Check if it's a known symbol
    const lookup = lookupByAscii(name);
    if (lookup.found) {
      return; // Valid symbol
    }

    // Check if it's in scope
    const variable = this.lookupVariable(name);
    if (variable) {
      variable.used = true;
      return;
    }

    // Check for built-in identifiers
    const builtins = ['true', 'false', 'nil', 'unit'];
    if (builtins.includes(name)) {
      return;
    }

    // Undefined variable
    if (this.config.strict) {
      this.addError(`Undefined variable: '${name}'`, 'V002', node);
    } else {
      this.addWarning(`Possibly undefined variable: '${name}'`, 'V002', node);
    }
  }

  /**
   * Validate a literal
   */
  private validateLiteral(node: LiteralNode): void {
    // Literals are always valid
  }

  /**
   * Validate a quantifier expression
   */
  private validateQuantifier(node: QuantifierExpressionNode): void {
    // Create new scope for bound variable
    this.pushScope();

    // Add bound variable to scope
    this.scope.variables.set(node.variable.name, { node: node.variable, used: false });

    // Validate domain if present
    if (node.domain) {
      this.validateNode(node.domain);
    }

    // Validate body
    this.validateNode(node.body);

    // Check for unused bound variable
    if (this.config.checkUnusedVariables) {
      this.checkUnusedVariables(this.scope);
    }

    this.popScope();
  }

  /**
   * Validate a binary expression
   */
  private validateBinaryExpression(node: BinaryExpressionNode): void {
    this.validateNode(node.left);
    this.validateNode(node.right);

    // Check operator validity
    const lookup = lookupByAscii(node.operator);
    if (!lookup.found && this.config.strict) {
      this.addWarning(`Unknown operator: '${node.operator}'`, 'V003', node);
    }
  }

  /**
   * Validate a unary expression
   */
  private validateUnaryExpression(node: UnaryExpressionNode): void {
    this.validateNode(node.argument);

    // Check operator validity
    const lookup = lookupByAscii(node.operator);
    if (!lookup.found && this.config.strict) {
      this.addWarning(`Unknown unary operator: '${node.operator}'`, 'V004', node);
    }
  }

  /**
   * Validate function application
   */
  private validateApplication(node: ApplicationNode): void {
    this.validateNode(node.callee);

    for (const arg of node.arguments) {
      this.validateNode(arg);
    }
  }

  /**
   * Validate lambda expression
   */
  private validateLambda(node: LambdaNode): void {
    // Create new scope for parameters
    this.pushScope();

    // Add parameters to scope
    for (const param of node.parameters) {
      if (this.scope.variables.has(param.name)) {
        this.addWarning(`Parameter '${param.name}' shadows existing variable`, 'V005', param);
      }
      this.scope.variables.set(param.name, { node: param, used: false });
    }

    // Validate body
    this.validateNode(node.body);

    // Check for unused parameters
    if (this.config.checkUnusedVariables) {
      for (const [name, info] of this.scope.variables) {
        if (!info.used) {
          this.addWarning(`Unused parameter: '${name}'`, 'V006', info.node);
        }
      }
    }

    this.popScope();
  }

  /**
   * Validate set expression
   */
  private validateSetExpression(node: SetExpressionNode): void {
    if (node.elements) {
      // Enumerated set
      for (const element of node.elements) {
        this.validateNode(element);
      }
    } else if (node.variable && node.predicate) {
      // Set comprehension
      this.pushScope();
      this.scope.variables.set(node.variable.name, { node: node.variable, used: false });
      this.validateNode(node.predicate);

      if (this.config.checkUnusedVariables) {
        const info = this.scope.variables.get(node.variable.name);
        if (info && !info.used) {
          this.addWarning(`Unused variable in set comprehension: '${node.variable.name}'`, 'V007', node.variable);
        }
      }

      this.popScope();
    }
  }

  /**
   * Validate tuple expression
   */
  private validateTupleExpression(node: ASTNode): void {
    const tupleNode = node as unknown as { elements: ASTNode[] };
    if (tupleNode.elements) {
      for (const element of tupleNode.elements) {
        this.validateNode(element);
      }
    }
  }

  /**
   * Validate type annotation
   */
  private validateTypeAnnotation(node: TypeAnnotationNode): void {
    this.validateNode(node.expression);
    this.validateNode(node.typeExpression);

    if (this.config.checkTypeAnnotations) {
      // Additional type checking would go here
      // For now, just validate the structure
    }
  }

  // Scope management

  private createScope(parent: Scope | null = null): Scope {
    return {
      parent,
      variables: new Map(),
    };
  }

  private pushScope(): void {
    this.scope = this.createScope(this.scope);
  }

  private popScope(): void {
    if (this.scope.parent) {
      this.scope = this.scope.parent;
    }
  }

  private lookupVariable(name: string): { node: ASTNode; used: boolean } | undefined {
    let scope: Scope | null = this.scope;
    while (scope) {
      const variable = scope.variables.get(name);
      if (variable) {
        return variable;
      }
      scope = scope.parent;
    }
    return undefined;
  }

  private checkUnusedVariables(scope: Scope): void {
    for (const [name, info] of scope.variables) {
      if (!info.used) {
        this.addWarning(`Unused variable: '${name}'`, 'V008', info.node);
      }
    }
  }

  // Error handling

  private addError(message: string, code: string, node?: ASTNode): void {
    this.errors.push({ message, code, node });
  }

  private addWarning(message: string, code: string, node?: ASTNode): void {
    this.warnings.push({ message, code, node });
  }
}

/**
 * Convenience function to validate an AST
 */
export function validate(ast: ProgramNode, config?: ValidatorConfig): ValidationResult {
  const validator = new Validator(config);
  return validator.validate(ast);
}

/**
 * Check if a node is well-formed
 */
export function isWellFormed(node: ASTNode): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (!node.type || typeof node.type !== 'string') {
    return false;
  }

  if (typeof node.line !== 'number' || typeof node.column !== 'number') {
    return false;
  }

  return true;
}

/**
 * Get all free variables in an expression
 */
export function freeVariables(node: ASTNode, bound: Set<string> = new Set()): Set<string> {
  const free = new Set<string>();

  function collect(n: ASTNode, b: Set<string>): void {
    switch (n.type) {
      case 'Identifier': {
        const id = n as IdentifierNode;
        if (!b.has(id.name)) {
          free.add(id.name);
        }
        break;
      }
      case 'QuantifierExpression': {
        const q = n as QuantifierExpressionNode;
        const newBound = new Set(b);
        newBound.add(q.variable.name);
        if (q.domain) collect(q.domain, b);
        collect(q.body, newBound);
        break;
      }
      case 'Lambda': {
        const lambda = n as LambdaNode;
        const newBound = new Set(b);
        for (const param of lambda.parameters) {
          newBound.add(param.name);
        }
        collect(lambda.body, newBound);
        break;
      }
      case 'BinaryExpression': {
        const bin = n as BinaryExpressionNode;
        collect(bin.left, b);
        collect(bin.right, b);
        break;
      }
      case 'UnaryExpression': {
        const un = n as UnaryExpressionNode;
        collect(un.argument, b);
        break;
      }
      case 'Application': {
        const app = n as ApplicationNode;
        collect(app.callee, b);
        for (const arg of app.arguments) {
          collect(arg, b);
        }
        break;
      }
      case 'SetExpression': {
        const set = n as SetExpressionNode;
        if (set.elements) {
          for (const elem of set.elements) {
            collect(elem, b);
          }
        } else if (set.variable && set.predicate) {
          const newBound = new Set(b);
          newBound.add(set.variable.name);
          collect(set.predicate, newBound);
        }
        break;
      }
      case 'Definition': {
        const def = n as DefinitionNode;
        collect(def.value, b);
        break;
      }
      case 'TypeAnnotation': {
        const ta = n as TypeAnnotationNode;
        collect(ta.expression, b);
        collect(ta.typeExpression, b);
        break;
      }
      case 'Program': {
        const prog = n as ProgramNode;
        for (const stmt of prog.body) {
          collect(stmt, b);
        }
        break;
      }
    }
  }

  collect(node, bound);
  return free;
}
