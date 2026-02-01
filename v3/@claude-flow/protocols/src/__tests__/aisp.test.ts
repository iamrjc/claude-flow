/**
 * AISP Parser Unit Tests
 *
 * Tests for WP04: AISP Parser
 * Coverage target: >80%
 */

import { describe, it, expect } from 'vitest';
import {
  // Types and symbols
  ALL_SYMBOLS,
  SYMBOL_COUNTS,
  QUANTIFIER_SYMBOLS,
  LOGIC_SYMBOLS,
  SET_SYMBOLS,
  FUNCTION_SYMBOLS,
  lookupByUnicode,
  lookupByAscii,
  lookupById,
  getSymbolsByCategory,
  isSymbol,
  getTotalSymbolCount,
  // Tokenizer
  Tokenizer,
  tokenize,
  // Parser
  Parser,
  parse,
  // Validator
  Validator,
  validate,
  isWellFormed,
  freeVariables,
} from '../aisp/index.js';

describe('AISP Symbols', () => {
  describe('symbol counts', () => {
    it('should have quantifier symbols', () => {
      expect(QUANTIFIER_SYMBOLS.length).toBe(12);
      expect(SYMBOL_COUNTS.quantifiers).toBe(12);
    });

    it('should have logic symbols', () => {
      expect(LOGIC_SYMBOLS.length).toBe(24);
      expect(SYMBOL_COUNTS.logic).toBe(24);
    });

    it('should have set symbols', () => {
      expect(SET_SYMBOLS.length).toBe(32);
      expect(SYMBOL_COUNTS.sets).toBe(32);
    });

    it('should have function symbols', () => {
      expect(FUNCTION_SYMBOLS.length).toBe(64);
      expect(SYMBOL_COUNTS.functions).toBe(64);
    });

    it('should have a total symbol count', () => {
      const total = getTotalSymbolCount();
      expect(total).toBeGreaterThan(100);
      expect(total).toBe(ALL_SYMBOLS.length);
    });
  });

  describe('symbol lookup', () => {
    it('should look up by unicode', () => {
      const result = lookupByUnicode('∀');
      expect(result.found).toBe(true);
      expect(result.symbol?.id).toBe('forall');
    });

    it('should look up by ASCII', () => {
      const result = lookupByAscii('forall');
      expect(result.found).toBe(true);
      expect(result.symbol?.unicode).toBe('∀');
    });

    it('should look up by ID', () => {
      const result = lookupById('exists');
      expect(result.found).toBe(true);
      expect(result.symbol?.unicode).toBe('∃');
    });

    it('should return suggestions for unknown symbols', () => {
      const result = lookupByAscii('forral'); // typo
      expect(result.found).toBe(false);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toContain('forall');
    });

    it('should get symbols by category', () => {
      const quantifiers = getSymbolsByCategory('quantifiers');
      expect(quantifiers.length).toBe(12);
      expect(quantifiers.every(s => s.category === 'quantifiers')).toBe(true);
    });

    it('should check if string is a symbol', () => {
      expect(isSymbol('∀')).toBe(true);
      expect(isSymbol('forall')).toBe(true);
      expect(isSymbol('xyz')).toBe(false);
    });
  });

  describe('symbol properties', () => {
    it('should have required properties for each symbol', () => {
      for (const symbol of ALL_SYMBOLS) {
        expect(symbol.id).toBeDefined();
        expect(symbol.unicode).toBeDefined();
        expect(symbol.ascii).toBeDefined();
        expect(symbol.category).toBeDefined();
        expect(symbol.description).toBeDefined();
        expect(typeof symbol.precedence).toBe('number');
        expect(['left', 'right', 'none']).toContain(symbol.associativity);
        expect(typeof symbol.arity).toBe('number');
      }
    });

    it('should have unique IDs', () => {
      const ids = ALL_SYMBOLS.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});

describe('AISP Tokenizer', () => {
  describe('basic tokenization', () => {
    it('should tokenize identifiers', () => {
      const tokens = tokenize('x y z');
      expect(tokens.filter(t => t.type === 'IDENTIFIER').length).toBe(3);
    });

    it('should tokenize numbers', () => {
      const tokens = tokenize('42 3.14 1e10');
      expect(tokens.filter(t => t.type === 'NUMBER').length).toBe(3);
    });

    it('should tokenize strings', () => {
      const tokens = tokenize('"hello" \'world\'');
      expect(tokens.filter(t => t.type === 'STRING').length).toBe(2);
    });

    it('should tokenize Unicode symbols', () => {
      const tokens = tokenize('∀ ∃ ∧ ∨');
      expect(tokens.filter(t => t.type === 'SYMBOL').length).toBe(4);
    });

    it('should tokenize ASCII symbols', () => {
      const tokens = tokenize('forall exists and or');
      expect(tokens.filter(t => t.type === 'SYMBOL').length).toBe(4);
    });

    it('should include EOF token', () => {
      const tokens = tokenize('x');
      expect(tokens[tokens.length - 1].type).toBe('EOF');
    });
  });

  describe('operators', () => {
    it('should tokenize arrow operators', () => {
      const tokens = tokenize('-> <- <->');
      expect(tokens.filter(t => t.type === 'SYMBOL' || t.type === 'OPERATOR').length).toBe(3);
    });

    it('should tokenize comparison operators', () => {
      const tokens = tokenize('= != < > <= >=');
      const ops = tokens.filter(t => t.type === 'SYMBOL' || t.type === 'OPERATOR');
      expect(ops.length).toBe(6);
    });
  });

  describe('comments', () => {
    it('should skip line comments', () => {
      const tokens = tokenize('x -- comment\ny');
      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers.length).toBe(2);
    });

    it('should skip C-style line comments', () => {
      const tokens = tokenize('x // comment\ny');
      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers.length).toBe(2);
    });

    it('should skip block comments', () => {
      const tokens = tokenize('x {- block -} y');
      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers.length).toBe(2);
    });
  });

  describe('position tracking', () => {
    it('should track line numbers', () => {
      const tokens = tokenize('x\ny\nz');
      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers[0].line).toBe(1);
      expect(identifiers[1].line).toBe(2);
      expect(identifiers[2].line).toBe(3);
    });

    it('should track column numbers', () => {
      const tokens = tokenize('abc def');
      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers[0].column).toBe(1);
      expect(identifiers[1].column).toBe(5);
    });
  });
});

describe('AISP Parser', () => {
  describe('literals', () => {
    it('should parse number literals', () => {
      const result = parse('42');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('Literal');
    });

    it('should parse string literals', () => {
      const result = parse('"hello"');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('Literal');
    });
  });

  describe('identifiers', () => {
    it('should parse simple identifiers', () => {
      const result = parse('x');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('Identifier');
    });

    it('should parse identifiers with primes', () => {
      const result = parse("x'");
      expect(result.success).toBe(true);
    });
  });

  describe('binary expressions', () => {
    it('should parse addition', () => {
      const result = parse('x + y');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('BinaryExpression');
    });

    it('should parse logical and', () => {
      const result = parse('p ∧ q');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('BinaryExpression');
    });

    it('should parse implication', () => {
      const result = parse('p → q');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('BinaryExpression');
    });

    it('should respect precedence', () => {
      const result = parse('a ∧ b ∨ c');
      expect(result.success).toBe(true);
      const expr = result.ast?.body[0] as { type: string; operator: string; left: { operator: string } };
      expect(expr.type).toBe('BinaryExpression');
      // ∧ binds tighter than ∨, so (a ∧ b) ∨ c
      expect(expr.left.operator).toBe('∧');
    });
  });

  describe('unary expressions', () => {
    it('should parse negation', () => {
      const result = parse('¬p');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('UnaryExpression');
    });

    it('should parse ASCII negation', () => {
      const result = parse('not p');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('UnaryExpression');
    });
  });

  describe('quantifiers', () => {
    it('should parse universal quantifier', () => {
      const result = parse('∀x. P(x)');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('QuantifierExpression');
    });

    it('should parse existential quantifier', () => {
      const result = parse('∃x. P(x)');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('QuantifierExpression');
    });

    it('should parse ASCII quantifiers', () => {
      const result = parse('forall x. P(x)');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('QuantifierExpression');
    });

    it('should parse quantifier with domain', () => {
      const result = parse('∀x ∈ A. P(x)');
      expect(result.success).toBe(true);
      const node = result.ast?.body[0] as { type: string; domain?: unknown };
      expect(node.domain).toBeDefined();
    });
  });

  describe('lambda expressions', () => {
    it('should parse lambda with dot', () => {
      const result = parse('λx. x');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('Lambda');
    });

    it('should parse lambda with arrow', () => {
      const result = parse('λx -> x');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('Lambda');
    });

    it('should parse multi-parameter lambda', () => {
      const result = parse('λx y. x');
      expect(result.success).toBe(true);
      const lambda = result.ast?.body[0] as { type: string; parameters: unknown[] };
      expect(lambda.parameters.length).toBe(2);
    });
  });

  describe('function application', () => {
    it('should parse function call with parens', () => {
      const result = parse('f(x)');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('Application');
    });

    it('should parse juxtaposition application', () => {
      const result = parse('f x');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('Application');
    });

    it('should parse multiple arguments', () => {
      const result = parse('f(x, y, z)');
      expect(result.success).toBe(true);
      const app = result.ast?.body[0] as { type: string; arguments: unknown[] };
      expect(app.arguments.length).toBe(3);
    });
  });

  describe('set expressions', () => {
    it('should parse empty set', () => {
      const result = parse('{}');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('SetExpression');
    });

    it('should parse enumerated set', () => {
      const result = parse('{1, 2, 3}');
      expect(result.success).toBe(true);
      const set = result.ast?.body[0] as { type: string; elements?: unknown[] };
      expect(set.elements?.length).toBe(3);
    });

    it('should parse set comprehension', () => {
      const result = parse('{x | P(x)}');
      expect(result.success).toBe(true);
      const set = result.ast?.body[0] as { type: string; variable?: unknown; predicate?: unknown };
      expect(set.variable).toBeDefined();
      expect(set.predicate).toBeDefined();
    });
  });

  describe('tuples', () => {
    it('should parse tuple', () => {
      const result = parse('(a, b, c)');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('TupleExpression');
    });

    it('should parse parenthesized expression', () => {
      const result = parse('(x)');
      expect(result.success).toBe(true);
      // Single element = just the expression
      expect(result.ast?.body[0].type).toBe('Identifier');
    });
  });

  describe('definitions', () => {
    it('should parse let binding', () => {
      const result = parse('let x = 42');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('Definition');
    });

    it('should parse definition with :=', () => {
      const result = parse('def f := λx. x');
      expect(result.success).toBe(true);
      expect(result.ast?.body[0].type).toBe('Definition');
    });
  });

  describe('error handling', () => {
    it('should collect parse errors', () => {
      const result = parse('∀'); // Incomplete
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should continue parsing after error', () => {
      const result = parse('x + ; y');
      expect(result.ast?.body.length).toBeGreaterThan(0);
    });
  });
});

describe('AISP Validator', () => {
  describe('basic validation', () => {
    it('should validate well-formed AST', () => {
      const parseResult = parse('x');
      expect(parseResult.success).toBe(true);
      const result = validate(parseResult.ast!);
      expect(result.valid).toBe(true);
    });

    it('should warn about undefined variables', () => {
      const parseResult = parse('undefined_var');
      expect(parseResult.success).toBe(true);
      const result = validate(parseResult.ast!, { strict: false });
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('scope checking', () => {
    it('should recognize bound variables in quantifiers', () => {
      const parseResult = parse('∀x. x');
      expect(parseResult.success).toBe(true);
      const result = validate(parseResult.ast!, { strict: true });
      // x is bound by the quantifier, so no error
      expect(result.errors.length).toBe(0);
    });

    it('should recognize lambda parameters', () => {
      const parseResult = parse('λx. x');
      expect(parseResult.success).toBe(true);
      const result = validate(parseResult.ast!);
      expect(result.errors.length).toBe(0);
    });

    it('should warn about unused variables', () => {
      const parseResult = parse('λx. 42');
      expect(parseResult.success).toBe(true);
      const result = validate(parseResult.ast!, { checkUnusedVariables: true });
      expect(result.warnings.some(w => w.message.includes('Unused'))).toBe(true);
    });
  });

  describe('isWellFormed', () => {
    it('should return true for valid nodes', () => {
      const node = { type: 'Identifier', name: 'x', line: 1, column: 1 };
      expect(isWellFormed(node)).toBe(true);
    });

    it('should return false for invalid nodes', () => {
      expect(isWellFormed(null as any)).toBe(false);
      expect(isWellFormed({} as any)).toBe(false);
      expect(isWellFormed({ type: 'Test' } as any)).toBe(false);
    });
  });

  describe('freeVariables', () => {
    it('should find free variables', () => {
      const parseResult = parse('x + y');
      expect(parseResult.success).toBe(true);
      const free = freeVariables(parseResult.ast!.body[0]);
      expect(free.has('x')).toBe(true);
      expect(free.has('y')).toBe(true);
    });

    it('should not include bound variables', () => {
      const parseResult = parse('∀x. x + y');
      expect(parseResult.success).toBe(true);
      const free = freeVariables(parseResult.ast!.body[0]);
      expect(free.has('x')).toBe(false);
      expect(free.has('y')).toBe(true);
    });

    it('should not include lambda parameters', () => {
      const parseResult = parse('λx. x + y');
      expect(parseResult.success).toBe(true);
      const free = freeVariables(parseResult.ast!.body[0]);
      expect(free.has('x')).toBe(false);
      expect(free.has('y')).toBe(true);
    });
  });
});

describe('Integration', () => {
  it('should parse and validate complex expressions', () => {
    const input = '∀x ∈ A. ∃y ∈ B. R(x, y) → P(x) ∧ Q(y)';
    const parseResult = parse(input);
    expect(parseResult.success).toBe(true);

    const validationResult = validate(parseResult.ast!);
    expect(validationResult.valid).toBe(true);
  });

  it('should handle logical tautologies', () => {
    const input = '(P → Q) ↔ (¬P ∨ Q)';
    const parseResult = parse(input);
    expect(parseResult.success).toBe(true);
  });

  it('should handle set builder notation', () => {
    const input = '{x ∈ ℕ | x > 0}';
    const parseResult = parse(input);
    expect(parseResult.success).toBe(true);
  });

  it('should handle lambda calculus expressions', () => {
    const input = '(λf. λx. f (f x)) (λy. y)';
    const parseResult = parse(input);
    expect(parseResult.success).toBe(true);
  });
});
