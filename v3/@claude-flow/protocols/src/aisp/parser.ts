/**
 * AISP Parser
 *
 * Recursive descent parser for AISP (AI Symbolic Protocol) expressions.
 * Builds an Abstract Syntax Tree from tokens.
 */

import type {
  Token,
  TokenType,
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
  TupleExpressionNode,
  DefinitionNode,
  TypeAnnotationNode,
  ParseResult,
  ParseError,
  ParseWarning,
  ParserConfig,
} from './types.js';
import { Tokenizer } from './tokenizer.js';
import { lookupById, lookupByAscii } from './symbols.js';

/**
 * Parser state
 */
interface ParserState {
  tokens: Token[];
  current: number;
  errors: ParseError[];
  warnings: ParseWarning[];
}

/**
 * AISP Parser class
 */
export class Parser {
  private state: ParserState;
  private config: ParserConfig;

  constructor(config: ParserConfig = {}) {
    this.config = {
      strict: false,
      allowUnicode: true,
      allowASCII: true,
      maxDepth: 100,
      ...config,
    };
    this.state = {
      tokens: [],
      current: 0,
      errors: [],
      warnings: [],
    };
  }

  /**
   * Parse input string
   */
  parse(input: string): ParseResult {
    const tokenizer = new Tokenizer(input, this.config);
    const tokens = tokenizer.tokenize();

    return this.parseTokens(tokens);
  }

  /**
   * Parse from tokens
   */
  parseTokens(tokens: Token[]): ParseResult {
    this.state = {
      tokens,
      current: 0,
      errors: [],
      warnings: [],
    };

    try {
      const body: ASTNode[] = [];

      while (!this.isAtEnd()) {
        const node = this.parseStatement();
        if (node) {
          body.push(node);
        }
      }

      const ast: ProgramNode = {
        type: 'Program',
        body,
        line: 1,
        column: 1,
      };

      return {
        success: this.state.errors.length === 0,
        ast,
        errors: this.state.errors,
        warnings: this.state.warnings,
        tokens,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parse error';
      this.addError(message, 'E999');

      return {
        success: false,
        errors: this.state.errors,
        warnings: this.state.warnings,
        tokens,
      };
    }
  }

  /**
   * Parse a statement
   */
  private parseStatement(): ASTNode | null {
    // Skip semicolons
    while (this.check('PUNCTUATION') && this.peek().value === ';') {
      this.advance();
    }

    if (this.isAtEnd()) {
      return null;
    }

    // Check for definitions
    if (this.checkSymbol('def') || this.checkSymbol('let')) {
      return this.parseDefinition();
    }

    // Check for theorems/lemmas
    if (this.checkSymbol('theorem') || this.checkSymbol('lemma') || this.checkSymbol('axiom')) {
      return this.parseDefinition();
    }

    return this.parseExpression();
  }

  /**
   * Parse a definition
   */
  private parseDefinition(): DefinitionNode {
    const token = this.advance(); // def, let, theorem, etc.
    const startLine = token.line;
    const startColumn = token.column;

    const name = this.parseIdentifier();

    // Optional type annotation
    let typeAnnotation: TypeAnnotationNode | undefined;
    if (this.check('PUNCTUATION') && this.peek().value === ':' && !this.checkNext('PUNCTUATION', '=')) {
      this.advance(); // :
      const typeExpr = this.parseExpression(0);
      typeAnnotation = {
        type: 'TypeAnnotation',
        expression: name,
        typeExpression: typeExpr,
        line: name.line,
        column: name.column,
      };
    }

    // Expect = or :=
    if (this.checkSymbol('def') || (this.check('PUNCTUATION') && this.peek().value === '=')) {
      this.advance();
    } else if (this.check('OPERATOR') && this.peek().value === ':=') {
      this.advance();
    }

    const value = this.parseExpression();

    return {
      type: 'Definition',
      name,
      value,
      typeAnnotation,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * Parse an expression with precedence climbing
   */
  private parseExpression(minPrecedence = 0): ASTNode {
    let left = this.parseUnary();

    while (!this.isAtEnd()) {
      const token = this.peek();

      // Check for binary operators
      if (token.type === 'SYMBOL' || token.type === 'OPERATOR') {
        const precedence = this.getPrecedence(token);
        if (precedence <= minPrecedence) {
          break;
        }

        const operator = this.advance();
        const associativity = this.getAssociativity(operator);
        const nextMinPrec = associativity === 'right' ? precedence : precedence + 1;

        const right = this.parseExpression(nextMinPrec);

        left = {
          type: 'BinaryExpression',
          operator: operator.value,
          left,
          right,
          line: operator.line,
          column: operator.column,
        } as BinaryExpressionNode;
      } else if (token.type === 'PUNCTUATION' && token.value === ':') {
        // Type annotation
        const colonToken = this.advance();
        const typeExpr = this.parseExpression(this.getPrecedence(token) + 1);

        left = {
          type: 'TypeAnnotation',
          expression: left,
          typeExpression: typeExpr,
          line: colonToken.line,
          column: colonToken.column,
        } as TypeAnnotationNode;
      } else {
        break;
      }
    }

    return left;
  }

  /**
   * Parse unary expression
   */
  private parseUnary(): ASTNode {
    const token = this.peek();

    // Unary operators: ¬, -, ~, etc.
    if (token.type === 'SYMBOL' && this.isUnaryOperator(token.value)) {
      const operator = this.advance();
      const argument = this.parseUnary();

      return {
        type: 'UnaryExpression',
        operator: operator.value,
        argument,
        prefix: true,
        line: operator.line,
        column: operator.column,
      } as UnaryExpressionNode;
    }

    // Quantifiers: ∀, ∃
    if (token.type === 'SYMBOL' && this.isQuantifier(token.symbolId)) {
      return this.parseQuantifier();
    }

    // Lambda: λ, \, fn
    if (this.checkSymbol('lambda') || (token.type === 'OPERATOR' && token.value === '\\')) {
      return this.parseLambda();
    }

    return this.parseApplication();
  }

  /**
   * Parse quantifier expression
   */
  private parseQuantifier(): QuantifierExpressionNode {
    const quantifier = this.advance();
    const variable = this.parseIdentifier();

    // Optional domain: x ∈ A
    let domain: ASTNode | undefined;
    if (this.checkSymbol('in')) {
      this.advance(); // ∈
      domain = this.parsePrimary();
    }

    // Expect . or ,
    if (this.check('PUNCTUATION') && (this.peek().value === '.' || this.peek().value === ',')) {
      this.advance();
    }

    const body = this.parseExpression();

    return {
      type: 'QuantifierExpression',
      quantifier: quantifier.value,
      variable,
      domain,
      body,
      line: quantifier.line,
      column: quantifier.column,
    };
  }

  /**
   * Parse lambda expression
   */
  private parseLambda(): LambdaNode {
    const lambdaToken = this.advance(); // λ or \
    const parameters: IdentifierNode[] = [];

    // Parse parameters
    while (!this.isAtEnd() && !this.check('PUNCTUATION', '.') && !this.check('OPERATOR', '->')) {
      parameters.push(this.parseIdentifier());
    }

    // Expect . or ->
    if (this.check('PUNCTUATION') && this.peek().value === '.') {
      this.advance();
    } else if (this.check('OPERATOR') && this.peek().value === '->') {
      this.advance();
    }

    const body = this.parseExpression();

    return {
      type: 'Lambda',
      parameters,
      body,
      line: lambdaToken.line,
      column: lambdaToken.column,
    };
  }

  /**
   * Parse function application
   */
  private parseApplication(): ASTNode {
    let expr = this.parsePrimary();

    while (!this.isAtEnd()) {
      if (this.check('PUNCTUATION') && this.peek().value === '(') {
        // Function call: f(x, y)
        const args = this.parseArgumentList();
        expr = {
          type: 'Application',
          callee: expr,
          arguments: args,
          line: expr.line,
          column: expr.column,
        } as ApplicationNode;
      } else if (this.check('IDENTIFIER') || this.check('NUMBER') ||
                 (this.check('PUNCTUATION') && this.peek().value === '(')) {
        // Juxtaposition application: f x
        const arg = this.parsePrimary();
        expr = {
          type: 'Application',
          callee: expr,
          arguments: [arg],
          line: expr.line,
          column: expr.column,
        } as ApplicationNode;
      } else {
        break;
      }
    }

    return expr;
  }

  /**
   * Parse argument list
   */
  private parseArgumentList(): ASTNode[] {
    this.expect('PUNCTUATION', '(');
    const args: ASTNode[] = [];

    if (!this.check('PUNCTUATION', ')')) {
      do {
        args.push(this.parseExpression());
      } while (this.match('PUNCTUATION', ','));
    }

    this.expect('PUNCTUATION', ')');
    return args;
  }

  /**
   * Parse primary expression
   */
  private parsePrimary(): ASTNode {
    const token = this.peek();

    // Parenthesized expression or tuple
    if (token.type === 'PUNCTUATION' && token.value === '(') {
      return this.parseParenthesized();
    }

    // Set expression
    if (token.type === 'PUNCTUATION' && token.value === '{') {
      return this.parseSetExpression();
    }

    // List expression
    if (token.type === 'PUNCTUATION' && token.value === '[') {
      return this.parseListExpression();
    }

    // Number literal
    if (token.type === 'NUMBER') {
      return this.parseNumber();
    }

    // String literal
    if (token.type === 'STRING') {
      return this.parseString();
    }

    // Symbol (as literal)
    if (token.type === 'SYMBOL') {
      return this.parseSymbolLiteral();
    }

    // Identifier
    if (token.type === 'IDENTIFIER') {
      return this.parseIdentifier();
    }

    // Error recovery
    this.addError(`Unexpected token: ${token.value}`, 'E001');
    this.advance();

    return {
      type: 'Identifier',
      name: '?',
      line: token.line,
      column: token.column,
    } as IdentifierNode;
  }

  /**
   * Parse parenthesized expression or tuple
   */
  private parseParenthesized(): ASTNode {
    const openParen = this.advance(); // (
    const elements: ASTNode[] = [];

    if (!this.check('PUNCTUATION', ')')) {
      elements.push(this.parseExpression());

      while (this.match('PUNCTUATION', ',')) {
        elements.push(this.parseExpression());
      }
    }

    this.expect('PUNCTUATION', ')');

    // Single element = parenthesized expression
    if (elements.length === 1) {
      return elements[0];
    }

    // Multiple elements = tuple
    return {
      type: 'TupleExpression',
      elements,
      line: openParen.line,
      column: openParen.column,
    } as TupleExpressionNode;
  }

  /**
   * Parse set expression
   */
  private parseSetExpression(): SetExpressionNode {
    const openBrace = this.advance(); // {
    const elements: ASTNode[] = [];

    if (!this.check('PUNCTUATION', '}')) {
      const first = this.parseExpression();

      // Check for set comprehension: {x | P(x)}
      if (this.check('PUNCTUATION', '|') || this.checkSymbol('such_that')) {
        this.advance(); // |
        const predicate = this.parseExpression();
        this.expect('PUNCTUATION', '}');

        return {
          type: 'SetExpression',
          variable: first as IdentifierNode,
          predicate,
          line: openBrace.line,
          column: openBrace.column,
        };
      }

      // Enumerated set
      elements.push(first);
      while (this.match('PUNCTUATION', ',')) {
        elements.push(this.parseExpression());
      }
    }

    this.expect('PUNCTUATION', '}');

    return {
      type: 'SetExpression',
      elements,
      line: openBrace.line,
      column: openBrace.column,
    };
  }

  /**
   * Parse list expression
   */
  private parseListExpression(): ASTNode {
    const openBracket = this.advance(); // [
    const elements: ASTNode[] = [];

    if (!this.check('PUNCTUATION', ']')) {
      elements.push(this.parseExpression());

      while (this.match('PUNCTUATION', ',')) {
        elements.push(this.parseExpression());
      }
    }

    this.expect('PUNCTUATION', ']');

    // Return as a set expression (lists are represented as ordered sets)
    return {
      type: 'SetExpression',
      elements,
      line: openBracket.line,
      column: openBracket.column,
    } as SetExpressionNode;
  }

  /**
   * Parse number literal
   */
  private parseNumber(): LiteralNode {
    const token = this.advance();
    const value = token.value.includes('.')
      ? parseFloat(token.value)
      : parseInt(token.value, 10);

    return {
      type: 'Literal',
      value,
      raw: token.value,
      line: token.line,
      column: token.column,
    };
  }

  /**
   * Parse string literal
   */
  private parseString(): LiteralNode {
    const token = this.advance();

    return {
      type: 'Literal',
      value: token.value,
      raw: `"${token.value}"`,
      line: token.line,
      column: token.column,
    };
  }

  /**
   * Parse symbol as literal (for constants like ⊤, ⊥, ∅)
   */
  private parseSymbolLiteral(): ASTNode {
    const token = this.advance();

    // Check if it's a constant symbol (arity 0)
    if (token.symbolId) {
      const lookup = lookupById(token.symbolId);
      if (lookup.found && lookup.symbol && lookup.symbol.arity === 0) {
        return {
          type: 'Literal',
          value: token.value,
          raw: token.value,
          line: token.line,
          column: token.column,
        } as LiteralNode;
      }
    }

    // Otherwise treat as identifier
    return {
      type: 'Identifier',
      name: token.value,
      line: token.line,
      column: token.column,
    } as IdentifierNode;
  }

  /**
   * Parse identifier
   */
  private parseIdentifier(): IdentifierNode {
    const token = this.expect('IDENTIFIER');

    return {
      type: 'Identifier',
      name: token.value,
      line: token.line,
      column: token.column,
    };
  }

  /**
   * Get operator precedence
   */
  private getPrecedence(token: Token): number {
    if (token.symbolId) {
      const lookup = lookupById(token.symbolId);
      if (lookup.found && lookup.symbol) {
        return lookup.symbol.precedence;
      }
    }

    // Default precedences for basic operators
    const precedences: Record<string, number> = {
      '=': 25,
      '<': 25,
      '>': 25,
      '<=': 25,
      '>=': 25,
      '+': 50,
      '-': 50,
      '*': 60,
      '/': 60,
      '^': 70,
    };

    return precedences[token.value] || 0;
  }

  /**
   * Get operator associativity
   */
  private getAssociativity(token: Token): 'left' | 'right' | 'none' {
    if (token.symbolId) {
      const lookup = lookupById(token.symbolId);
      if (lookup.found && lookup.symbol) {
        return lookup.symbol.associativity;
      }
    }

    // Default: left associative
    return 'left';
  }

  /**
   * Check if operator is unary
   */
  private isUnaryOperator(value: string): boolean {
    return ['¬', 'not', '-', '~', '!'].includes(value);
  }

  /**
   * Check if symbol is a quantifier
   */
  private isQuantifier(symbolId?: string): boolean {
    if (!symbolId) return false;
    return ['forall', 'exists', 'nexists', 'unique'].includes(symbolId);
  }

  /**
   * Check if current token matches a symbol by ID
   */
  private checkSymbol(symbolId: string): boolean {
    const token = this.peek();
    if (token.symbolId === symbolId) return true;

    // Also check ASCII representation
    if (token.type === 'IDENTIFIER' || token.type === 'OPERATOR') {
      const lookup = lookupByAscii(token.value);
      return lookup.found && lookup.symbol?.id === symbolId;
    }

    return false;
  }

  // Token navigation helpers

  private peek(): Token {
    return this.state.tokens[this.state.current] || { type: 'EOF', value: '', line: 0, column: 0 };
  }

  private peekNext(): Token {
    return this.state.tokens[this.state.current + 1] || { type: 'EOF', value: '', line: 0, column: 0 };
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.state.current++;
    }
    return this.state.tokens[this.state.current - 1];
  }

  private check(type: TokenType, value?: string): boolean {
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private checkNext(type: TokenType, value?: string): boolean {
    const token = this.peekNext();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private match(type: TokenType, value?: string): boolean {
    if (this.check(type, value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(type: TokenType, value?: string): Token {
    if (this.check(type, value)) {
      return this.advance();
    }

    const token = this.peek();
    const expected = value ? `'${value}'` : type;
    this.addError(`Expected ${expected}, got '${token.value}'`, 'E002');

    return token;
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private addError(message: string, code: string): void {
    const token = this.peek();
    this.state.errors.push({
      message,
      code,
      line: token.line,
      column: token.column,
    });
  }

  private addWarning(message: string, code: string): void {
    const token = this.peek();
    this.state.warnings.push({
      message,
      code,
      line: token.line,
      column: token.column,
    });
  }
}

/**
 * Convenience function to parse input
 */
export function parse(input: string, config?: ParserConfig): ParseResult {
  const parser = new Parser(config);
  return parser.parse(input);
}
