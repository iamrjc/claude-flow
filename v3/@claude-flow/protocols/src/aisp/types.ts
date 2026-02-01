/**
 * AISP (AI Symbolic Protocol) Type Definitions
 *
 * Core types for the AISP parser and symbol system.
 * Supports 512 symbols across 8 categories.
 */

/**
 * Symbol categories as defined in the AISP specification
 */
export type SymbolCategory =
  | 'quantifiers'    // 12 symbols - universal, existential, etc.
  | 'logic'          // 24 symbols - and, or, not, implies, etc.
  | 'definitions'    // 16 symbols - define, type, class, etc.
  | 'sets'           // 32 symbols - union, intersection, subset, etc.
  | 'relations'      // 48 symbols - equals, less-than, maps-to, etc.
  | 'functions'      // 64 symbols - compose, apply, lambda, etc.
  | 'topology'       // 128 symbols - open, closed, continuous, etc.
  | 'evidence';      // 188 symbols - proof, hypothesis, theorem, etc.

/**
 * Token types for lexical analysis
 */
export type TokenType =
  | 'SYMBOL'         // AISP symbol (∀, ∃, ∧, etc.)
  | 'IDENTIFIER'     // Variable or function name
  | 'NUMBER'         // Numeric literal
  | 'STRING'         // String literal
  | 'OPERATOR'       // Operator (+, -, *, /)
  | 'PUNCTUATION'    // Punctuation (, ; : etc.)
  | 'WHITESPACE'     // Spaces, tabs, newlines
  | 'COMMENT'        // Comments
  | 'EOF';           // End of file

/**
 * A single token from the lexer
 */
export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  symbolId?: string;        // If type is SYMBOL, the symbol ID
  category?: SymbolCategory; // If type is SYMBOL, the category
}

/**
 * Symbol definition in the symbol table
 */
export interface SymbolDefinition {
  id: string;               // Unique symbol ID (e.g., 'forall', 'exists')
  unicode: string;          // Unicode character (e.g., '∀', '∃')
  ascii: string;            // ASCII fallback (e.g., 'forall', 'exists')
  category: SymbolCategory; // Symbol category
  description: string;      // Human-readable description
  precedence: number;       // Operator precedence (higher = tighter binding)
  associativity: 'left' | 'right' | 'none'; // For operators
  arity: number;            // Number of arguments (0 = constant, -1 = variadic)
  aliases?: string[];       // Alternative representations
}

/**
 * AST node types
 */
export type ASTNodeType =
  | 'Program'
  | 'Expression'
  | 'QuantifierExpression'
  | 'BinaryExpression'
  | 'UnaryExpression'
  | 'Application'
  | 'Lambda'
  | 'Identifier'
  | 'Literal'
  | 'SetExpression'
  | 'TupleExpression'
  | 'ProofBlock'
  | 'Definition'
  | 'TypeAnnotation';

/**
 * Base AST node
 */
export interface ASTNode {
  type: ASTNodeType;
  line: number;
  column: number;
}

/**
 * Program node - root of AST
 */
export interface ProgramNode extends ASTNode {
  type: 'Program';
  body: ASTNode[];
}

/**
 * Identifier node
 */
export interface IdentifierNode extends ASTNode {
  type: 'Identifier';
  name: string;
}

/**
 * Literal node (number, string, boolean)
 */
export interface LiteralNode extends ASTNode {
  type: 'Literal';
  value: string | number | boolean;
  raw: string;
}

/**
 * Quantifier expression (∀x, ∃x)
 */
export interface QuantifierExpressionNode extends ASTNode {
  type: 'QuantifierExpression';
  quantifier: string;         // The quantifier symbol
  variable: IdentifierNode;   // Bound variable
  domain?: ASTNode;           // Optional domain restriction
  body: ASTNode;              // Quantified expression
}

/**
 * Binary expression (a ∧ b, x → y)
 */
export interface BinaryExpressionNode extends ASTNode {
  type: 'BinaryExpression';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

/**
 * Unary expression (¬a)
 */
export interface UnaryExpressionNode extends ASTNode {
  type: 'UnaryExpression';
  operator: string;
  argument: ASTNode;
  prefix: boolean;
}

/**
 * Function application (f(x))
 */
export interface ApplicationNode extends ASTNode {
  type: 'Application';
  callee: ASTNode;
  arguments: ASTNode[];
}

/**
 * Lambda expression (λx.e)
 */
export interface LambdaNode extends ASTNode {
  type: 'Lambda';
  parameters: IdentifierNode[];
  body: ASTNode;
}

/**
 * Set expression ({a, b, c} or {x | P(x)})
 */
export interface SetExpressionNode extends ASTNode {
  type: 'SetExpression';
  elements?: ASTNode[];       // For enumerated sets
  variable?: IdentifierNode;  // For set comprehension
  predicate?: ASTNode;        // For set comprehension
}

/**
 * Tuple expression ((a, b, c))
 */
export interface TupleExpressionNode extends ASTNode {
  type: 'TupleExpression';
  elements: ASTNode[];
}

/**
 * Proof block
 */
export interface ProofBlockNode extends ASTNode {
  type: 'ProofBlock';
  steps: ASTNode[];
  conclusion?: ASTNode;
}

/**
 * Definition (def name = value)
 */
export interface DefinitionNode extends ASTNode {
  type: 'Definition';
  name: IdentifierNode;
  value: ASTNode;
  typeAnnotation?: TypeAnnotationNode;
}

/**
 * Type annotation (x : T)
 */
export interface TypeAnnotationNode extends ASTNode {
  type: 'TypeAnnotation';
  expression: ASTNode;
  typeExpression: ASTNode;
}

/**
 * Parser configuration options
 */
export interface ParserConfig {
  strict?: boolean;           // Strict mode (error on unknown symbols)
  allowUnicode?: boolean;     // Allow Unicode symbols
  allowASCII?: boolean;       // Allow ASCII fallbacks
  customSymbols?: SymbolDefinition[]; // Additional custom symbols
  maxDepth?: number;          // Maximum nesting depth
}

/**
 * Parse result
 */
export interface ParseResult {
  success: boolean;
  ast?: ProgramNode;
  errors: ParseError[];
  warnings: ParseWarning[];
  tokens?: Token[];           // For debugging
}

/**
 * Parse error
 */
export interface ParseError {
  message: string;
  line: number;
  column: number;
  code: string;               // Error code (e.g., 'E001')
  source?: string;            // Source context
}

/**
 * Parse warning
 */
export interface ParseWarning {
  message: string;
  line: number;
  column: number;
  code: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  message: string;
  node?: ASTNode;
  code: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  message: string;
  node?: ASTNode;
  code: string;
}

/**
 * Symbol lookup result
 */
export interface SymbolLookup {
  found: boolean;
  symbol?: SymbolDefinition;
  suggestions?: string[];     // If not found, similar symbols
}
