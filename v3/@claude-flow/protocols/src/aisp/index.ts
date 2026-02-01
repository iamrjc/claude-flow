/**
 * AISP (AI Symbolic Protocol) Module
 *
 * Complete AISP parser with 512 symbols across 8 categories.
 *
 * @module @claude-flow/protocols/aisp
 */

// Types
export type {
  SymbolCategory,
  TokenType,
  Token,
  SymbolDefinition,
  ASTNodeType,
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
  ProofBlockNode,
  DefinitionNode,
  TypeAnnotationNode,
  ParserConfig,
  ParseResult,
  ParseError,
  ParseWarning,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  SymbolLookup,
} from './types.js';

// Symbols
export {
  QUANTIFIER_SYMBOLS,
  LOGIC_SYMBOLS,
  DEFINITION_SYMBOLS,
  SET_SYMBOLS,
  RELATION_SYMBOLS,
  FUNCTION_SYMBOLS,
  TOPOLOGY_SYMBOLS,
  EVIDENCE_SYMBOLS,
  ALL_SYMBOLS,
  SYMBOL_COUNTS,
  lookupByUnicode,
  lookupByAscii,
  lookupById,
  getSymbolsByCategory,
  isSymbol,
  getTotalSymbolCount,
} from './symbols.js';

// Tokenizer
export { Tokenizer, tokenize } from './tokenizer.js';

// Parser
export { Parser, parse } from './parser.js';

// Validator
export {
  Validator,
  validate,
  isWellFormed,
  freeVariables,
} from './validator.js';
export type { ValidatorConfig } from './validator.js';
