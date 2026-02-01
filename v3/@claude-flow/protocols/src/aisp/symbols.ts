/**
 * AISP Symbol Definitions
 *
 * 512 symbols across 8 categories as defined in the AISP specification.
 */

import type { SymbolDefinition, SymbolCategory, SymbolLookup } from './types.js';

/**
 * Quantifier symbols (12)
 */
export const QUANTIFIER_SYMBOLS: SymbolDefinition[] = [
  { id: 'forall', unicode: '∀', ascii: 'forall', category: 'quantifiers', description: 'Universal quantifier', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'exists', unicode: '∃', ascii: 'exists', category: 'quantifiers', description: 'Existential quantifier', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'nexists', unicode: '∄', ascii: 'nexists', category: 'quantifiers', description: 'Does not exist', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'unique', unicode: '∃!', ascii: 'unique', category: 'quantifiers', description: 'Unique existence', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'forall_n', unicode: '∀ₙ', ascii: 'forall_n', category: 'quantifiers', description: 'Universal over naturals', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'exists_n', unicode: '∃ₙ', ascii: 'exists_n', category: 'quantifiers', description: 'Existential over naturals', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'forall_r', unicode: '∀ᵣ', ascii: 'forall_r', category: 'quantifiers', description: 'Universal over reals', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'exists_r', unicode: '∃ᵣ', ascii: 'exists_r', category: 'quantifiers', description: 'Existential over reals', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'countable', unicode: '∀ω', ascii: 'countable', category: 'quantifiers', description: 'Countably many', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'uncountable', unicode: '∀ℵ', ascii: 'uncountable', category: 'quantifiers', description: 'Uncountably many', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'almost_all', unicode: '∀*', ascii: 'almost_all', category: 'quantifiers', description: 'Almost all', precedence: 10, associativity: 'right', arity: 2 },
  { id: 'infinitely_many', unicode: '∃∞', ascii: 'infinitely_many', category: 'quantifiers', description: 'Infinitely many', precedence: 10, associativity: 'right', arity: 2 },
];

/**
 * Logic symbols (24)
 */
export const LOGIC_SYMBOLS: SymbolDefinition[] = [
  { id: 'and', unicode: '∧', ascii: 'and', category: 'logic', description: 'Logical and', precedence: 40, associativity: 'left', arity: 2 },
  { id: 'or', unicode: '∨', ascii: 'or', category: 'logic', description: 'Logical or', precedence: 30, associativity: 'left', arity: 2 },
  { id: 'not', unicode: '¬', ascii: 'not', category: 'logic', description: 'Logical not', precedence: 60, associativity: 'right', arity: 1 },
  { id: 'implies', unicode: '→', ascii: '->', category: 'logic', description: 'Implication', precedence: 20, associativity: 'right', arity: 2, aliases: ['=>', 'implies'] },
  { id: 'iff', unicode: '↔', ascii: '<->', category: 'logic', description: 'If and only if', precedence: 15, associativity: 'none', arity: 2, aliases: ['<=>', 'iff'] },
  { id: 'xor', unicode: '⊕', ascii: 'xor', category: 'logic', description: 'Exclusive or', precedence: 35, associativity: 'left', arity: 2 },
  { id: 'nand', unicode: '⊼', ascii: 'nand', category: 'logic', description: 'Not and', precedence: 40, associativity: 'left', arity: 2 },
  { id: 'nor', unicode: '⊽', ascii: 'nor', category: 'logic', description: 'Not or', precedence: 30, associativity: 'left', arity: 2 },
  { id: 'top', unicode: '⊤', ascii: 'true', category: 'logic', description: 'True/Top', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'bottom', unicode: '⊥', ascii: 'false', category: 'logic', description: 'False/Bottom', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'turnstile', unicode: '⊢', ascii: '|-', category: 'logic', description: 'Proves/Entails', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'models', unicode: '⊨', ascii: '|=', category: 'logic', description: 'Models/Satisfies', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'nturnstile', unicode: '⊬', ascii: '|/-', category: 'logic', description: 'Does not prove', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'nmodels', unicode: '⊭', ascii: '|/=', category: 'logic', description: 'Does not model', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'forces', unicode: '⊩', ascii: '||-', category: 'logic', description: 'Forces (modal)', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'nforces', unicode: '⊮', ascii: '||/-', category: 'logic', description: 'Does not force', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'box', unicode: '□', ascii: '[]', category: 'logic', description: 'Necessity (modal)', precedence: 60, associativity: 'right', arity: 1 },
  { id: 'diamond', unicode: '◇', ascii: '<>', category: 'logic', description: 'Possibility (modal)', precedence: 60, associativity: 'right', arity: 1 },
  { id: 'therefore', unicode: '∴', ascii: '::', category: 'logic', description: 'Therefore', precedence: 3, associativity: 'none', arity: 0 },
  { id: 'because', unicode: '∵', ascii: ':.', category: 'logic', description: 'Because', precedence: 3, associativity: 'none', arity: 0 },
  { id: 'contradiction', unicode: '⊗', ascii: '!#', category: 'logic', description: 'Contradiction', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'tautology', unicode: '⊙', ascii: '!T', category: 'logic', description: 'Tautology', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'provably_eq', unicode: '≡', ascii: '===', category: 'logic', description: 'Provably equivalent', precedence: 15, associativity: 'none', arity: 2 },
  { id: 'def_eq', unicode: '≜', ascii: ':=:', category: 'logic', description: 'Definitionally equal', precedence: 15, associativity: 'none', arity: 2 },
];

/**
 * Definition symbols (16)
 */
export const DEFINITION_SYMBOLS: SymbolDefinition[] = [
  { id: 'def', unicode: '≝', ascii: ':=', category: 'definitions', description: 'Definition', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'let', unicode: 'let', ascii: 'let', category: 'definitions', description: 'Let binding', precedence: 5, associativity: 'right', arity: 2 },
  { id: 'where', unicode: 'where', ascii: 'where', category: 'definitions', description: 'Where clause', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'type', unicode: ':', ascii: ':', category: 'definitions', description: 'Type annotation', precedence: 8, associativity: 'none', arity: 2 },
  { id: 'class', unicode: 'class', ascii: 'class', category: 'definitions', description: 'Type class', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'instance', unicode: 'instance', ascii: 'instance', category: 'definitions', description: 'Type class instance', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'data', unicode: 'data', ascii: 'data', category: 'definitions', description: 'Data type', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'newtype', unicode: 'newtype', ascii: 'newtype', category: 'definitions', description: 'Newtype wrapper', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'record', unicode: 'record', ascii: 'record', category: 'definitions', description: 'Record type', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'module', unicode: 'module', ascii: 'module', category: 'definitions', description: 'Module definition', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'import', unicode: 'import', ascii: 'import', category: 'definitions', description: 'Import statement', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'export', unicode: 'export', ascii: 'export', category: 'definitions', description: 'Export statement', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'axiom', unicode: 'axiom', ascii: 'axiom', category: 'definitions', description: 'Axiom declaration', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'theorem', unicode: 'theorem', ascii: 'theorem', category: 'definitions', description: 'Theorem declaration', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'lemma', unicode: 'lemma', ascii: 'lemma', category: 'definitions', description: 'Lemma declaration', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'corollary', unicode: 'corollary', ascii: 'corollary', category: 'definitions', description: 'Corollary declaration', precedence: 5, associativity: 'none', arity: 2 },
];

/**
 * Set symbols (32)
 */
export const SET_SYMBOLS: SymbolDefinition[] = [
  { id: 'in', unicode: '∈', ascii: 'in', category: 'sets', description: 'Element of', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'notin', unicode: '∉', ascii: 'notin', category: 'sets', description: 'Not element of', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'ni', unicode: '∋', ascii: 'ni', category: 'sets', description: 'Contains', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'notni', unicode: '∌', ascii: 'notni', category: 'sets', description: 'Does not contain', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'subset', unicode: '⊂', ascii: 'subset', category: 'sets', description: 'Proper subset', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'supset', unicode: '⊃', ascii: 'supset', category: 'sets', description: 'Proper superset', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'subseteq', unicode: '⊆', ascii: 'subseteq', category: 'sets', description: 'Subset or equal', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'supseteq', unicode: '⊇', ascii: 'supseteq', category: 'sets', description: 'Superset or equal', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'nsubset', unicode: '⊄', ascii: 'nsubset', category: 'sets', description: 'Not proper subset', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'nsupset', unicode: '⊅', ascii: 'nsupset', category: 'sets', description: 'Not proper superset', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'nsubseteq', unicode: '⊈', ascii: 'nsubseteq', category: 'sets', description: 'Not subset or equal', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'nsupseteq', unicode: '⊉', ascii: 'nsupseteq', category: 'sets', description: 'Not superset or equal', precedence: 50, associativity: 'none', arity: 2 },
  { id: 'union', unicode: '∪', ascii: 'union', category: 'sets', description: 'Set union', precedence: 45, associativity: 'left', arity: 2 },
  { id: 'intersection', unicode: '∩', ascii: 'inter', category: 'sets', description: 'Set intersection', precedence: 46, associativity: 'left', arity: 2 },
  { id: 'setminus', unicode: '∖', ascii: 'setminus', category: 'sets', description: 'Set difference', precedence: 45, associativity: 'left', arity: 2 },
  { id: 'symdiff', unicode: '△', ascii: 'symdiff', category: 'sets', description: 'Symmetric difference', precedence: 45, associativity: 'left', arity: 2 },
  { id: 'emptyset', unicode: '∅', ascii: 'empty', category: 'sets', description: 'Empty set', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'powerset', unicode: '℘', ascii: 'pow', category: 'sets', description: 'Power set', precedence: 70, associativity: 'right', arity: 1 },
  { id: 'cartesian', unicode: '×', ascii: 'times', category: 'sets', description: 'Cartesian product', precedence: 55, associativity: 'left', arity: 2 },
  { id: 'bigunion', unicode: '⋃', ascii: 'bigunion', category: 'sets', description: 'Big union', precedence: 70, associativity: 'right', arity: 1 },
  { id: 'biginter', unicode: '⋂', ascii: 'biginter', category: 'sets', description: 'Big intersection', precedence: 70, associativity: 'right', arity: 1 },
  { id: 'naturals', unicode: 'ℕ', ascii: 'Nat', category: 'sets', description: 'Natural numbers', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'integers', unicode: 'ℤ', ascii: 'Int', category: 'sets', description: 'Integers', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'rationals', unicode: 'ℚ', ascii: 'Rat', category: 'sets', description: 'Rational numbers', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'reals', unicode: 'ℝ', ascii: 'Real', category: 'sets', description: 'Real numbers', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'complex', unicode: 'ℂ', ascii: 'Complex', category: 'sets', description: 'Complex numbers', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'primes', unicode: 'ℙ', ascii: 'Primes', category: 'sets', description: 'Prime numbers', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'universe', unicode: '𝕌', ascii: 'Universe', category: 'sets', description: 'Universal set', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'aleph', unicode: 'ℵ', ascii: 'aleph', category: 'sets', description: 'Aleph (cardinality)', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'beth', unicode: 'ℶ', ascii: 'beth', category: 'sets', description: 'Beth (cardinality)', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'card', unicode: '|·|', ascii: 'card', category: 'sets', description: 'Cardinality', precedence: 70, associativity: 'none', arity: 1 },
  { id: 'disjoint', unicode: '⊍', ascii: 'disjoint', category: 'sets', description: 'Disjoint union', precedence: 45, associativity: 'left', arity: 2 },
];

/**
 * Relation symbols (48)
 */
export const RELATION_SYMBOLS: SymbolDefinition[] = [
  { id: 'eq', unicode: '=', ascii: '=', category: 'relations', description: 'Equals', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'neq', unicode: '≠', ascii: '!=', category: 'relations', description: 'Not equals', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'lt', unicode: '<', ascii: '<', category: 'relations', description: 'Less than', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'gt', unicode: '>', ascii: '>', category: 'relations', description: 'Greater than', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'leq', unicode: '≤', ascii: '<=', category: 'relations', description: 'Less than or equal', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'geq', unicode: '≥', ascii: '>=', category: 'relations', description: 'Greater than or equal', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'approx', unicode: '≈', ascii: '~=', category: 'relations', description: 'Approximately equal', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'sim', unicode: '∼', ascii: '~', category: 'relations', description: 'Similar to', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'cong', unicode: '≅', ascii: '~=~', category: 'relations', description: 'Congruent', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'propto', unicode: '∝', ascii: 'propto', category: 'relations', description: 'Proportional to', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'prec', unicode: '≺', ascii: '<<', category: 'relations', description: 'Precedes', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'succ', unicode: '≻', ascii: '>>', category: 'relations', description: 'Succeeds', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'preceq', unicode: '≼', ascii: '<<-', category: 'relations', description: 'Precedes or equals', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'succeq', unicode: '≽', ascii: '-<<', category: 'relations', description: 'Succeeds or equals', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'mapsto', unicode: '↦', ascii: '|->', category: 'relations', description: 'Maps to', precedence: 20, associativity: 'right', arity: 2 },
  { id: 'to', unicode: '→', ascii: '->', category: 'relations', description: 'Arrow to', precedence: 20, associativity: 'right', arity: 2 },
  { id: 'from', unicode: '←', ascii: '<-', category: 'relations', description: 'Arrow from', precedence: 20, associativity: 'left', arity: 2 },
  { id: 'leftrightarrow', unicode: '↔', ascii: '<->', category: 'relations', description: 'Bidirectional arrow', precedence: 20, associativity: 'none', arity: 2 },
  { id: 'longrightarrow', unicode: '⟶', ascii: '-->', category: 'relations', description: 'Long arrow', precedence: 20, associativity: 'right', arity: 2 },
  { id: 'hookrightarrow', unicode: '↪', ascii: 'hookr', category: 'relations', description: 'Hook arrow (inclusion)', precedence: 20, associativity: 'right', arity: 2 },
  { id: 'twoheadrightarrow', unicode: '↠', ascii: '->>', category: 'relations', description: 'Surjection', precedence: 20, associativity: 'right', arity: 2 },
  { id: 'rightarrowtail', unicode: '↣', ascii: '>->', category: 'relations', description: 'Injection', precedence: 20, associativity: 'right', arity: 2 },
  { id: 'iso', unicode: '≃', ascii: '~=', category: 'relations', description: 'Isomorphic', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'equiv', unicode: '≡', ascii: '===', category: 'relations', description: 'Equivalent', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'compose', unicode: '∘', ascii: '.', category: 'relations', description: 'Composition', precedence: 60, associativity: 'right', arity: 2 },
  { id: 'parallel', unicode: '∥', ascii: '||', category: 'relations', description: 'Parallel', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'perp', unicode: '⊥', ascii: '_|_', category: 'relations', description: 'Perpendicular', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'angle', unicode: '∠', ascii: 'angle', category: 'relations', description: 'Angle', precedence: 70, associativity: 'none', arity: 2 },
  { id: 'divides', unicode: '∣', ascii: '|', category: 'relations', description: 'Divides', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'ndivides', unicode: '∤', ascii: '/|', category: 'relations', description: 'Does not divide', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'coprime', unicode: '⊥', ascii: 'coprime', category: 'relations', description: 'Coprime to', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'covers', unicode: '⋖', ascii: '<.', category: 'relations', description: 'Covers (in lattice)', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'coveredby', unicode: '⋗', ascii: '.>', category: 'relations', description: 'Covered by', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'join', unicode: '⊔', ascii: 'join', category: 'relations', description: 'Join (supremum)', precedence: 45, associativity: 'left', arity: 2 },
  { id: 'meet', unicode: '⊓', ascii: 'meet', category: 'relations', description: 'Meet (infimum)', precedence: 46, associativity: 'left', arity: 2 },
  { id: 'vdash', unicode: '⊢', ascii: '|-', category: 'relations', description: 'Proves', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'dashv', unicode: '⊣', ascii: '-|', category: 'relations', description: 'Adjoint', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'between', unicode: '⋈', ascii: 'between', category: 'relations', description: 'Between', precedence: 25, associativity: 'none', arity: 3 },
  { id: 'collinear', unicode: '∷', ascii: '::', category: 'relations', description: 'Collinear', precedence: 25, associativity: 'none', arity: -1 },
  { id: 'incident', unicode: '∙', ascii: 'incident', category: 'relations', description: 'Incident', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'comparable', unicode: '⋚', ascii: '<=>', category: 'relations', description: 'Comparable', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'incomparable', unicode: '⋛', ascii: '</>', category: 'relations', description: 'Incomparable', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'partof', unicode: '⊑', ascii: 'partof', category: 'relations', description: 'Part of', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'contains_part', unicode: '⊒', ascii: 'haspart', category: 'relations', description: 'Contains part', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'refines', unicode: '⊏', ascii: 'refines', category: 'relations', description: 'Refines', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'abstracts', unicode: '⊐', ascii: 'abstracts', category: 'relations', description: 'Abstracts', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'subsumes', unicode: '⊒', ascii: 'subsumes', category: 'relations', description: 'Subsumes', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'subsumed', unicode: '⊑', ascii: 'subsumed', category: 'relations', description: 'Subsumed by', precedence: 25, associativity: 'none', arity: 2 },
];

/**
 * Function symbols (64)
 */
export const FUNCTION_SYMBOLS: SymbolDefinition[] = [
  { id: 'lambda', unicode: 'λ', ascii: 'lambda', category: 'functions', description: 'Lambda abstraction', precedence: 10, associativity: 'right', arity: 2, aliases: ['\\', 'fn'] },
  { id: 'apply', unicode: '@', ascii: '@', category: 'functions', description: 'Function application', precedence: 90, associativity: 'left', arity: 2 },
  { id: 'compose', unicode: '∘', ascii: '.', category: 'functions', description: 'Function composition', precedence: 80, associativity: 'right', arity: 2 },
  { id: 'id', unicode: 'id', ascii: 'id', category: 'functions', description: 'Identity function', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'const', unicode: 'const', ascii: 'const', category: 'functions', description: 'Constant function', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'flip', unicode: 'flip', ascii: 'flip', category: 'functions', description: 'Flip arguments', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'curry', unicode: 'curry', ascii: 'curry', category: 'functions', description: 'Curry function', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'uncurry', unicode: 'uncurry', ascii: 'uncurry', category: 'functions', description: 'Uncurry function', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'fix', unicode: 'fix', ascii: 'fix', category: 'functions', description: 'Fixed point', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'fst', unicode: 'π₁', ascii: 'fst', category: 'functions', description: 'First projection', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'snd', unicode: 'π₂', ascii: 'snd', category: 'functions', description: 'Second projection', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'inl', unicode: 'ι₁', ascii: 'inl', category: 'functions', description: 'Left injection', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'inr', unicode: 'ι₂', ascii: 'inr', category: 'functions', description: 'Right injection', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'case', unicode: 'case', ascii: 'case', category: 'functions', description: 'Case analysis', precedence: 10, associativity: 'none', arity: -1 },
  { id: 'if', unicode: 'if', ascii: 'if', category: 'functions', description: 'Conditional', precedence: 10, associativity: 'right', arity: 3 },
  { id: 'then', unicode: 'then', ascii: 'then', category: 'functions', description: 'Then branch', precedence: 10, associativity: 'none', arity: 0 },
  { id: 'else', unicode: 'else', ascii: 'else', category: 'functions', description: 'Else branch', precedence: 10, associativity: 'none', arity: 0 },
  { id: 'map', unicode: 'map', ascii: 'map', category: 'functions', description: 'Functor map', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'fmap', unicode: 'fmap', ascii: 'fmap', category: 'functions', description: 'Functor fmap', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'pure', unicode: 'pure', ascii: 'pure', category: 'functions', description: 'Applicative pure', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'ap', unicode: '⊛', ascii: '<*>', category: 'functions', description: 'Applicative apply', precedence: 75, associativity: 'left', arity: 2 },
  { id: 'bind', unicode: '≫=', ascii: '>>=', category: 'functions', description: 'Monad bind', precedence: 12, associativity: 'left', arity: 2 },
  { id: 'join', unicode: 'join', ascii: 'join', category: 'functions', description: 'Monad join', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'return', unicode: 'return', ascii: 'return', category: 'functions', description: 'Monad return', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'fold', unicode: 'fold', ascii: 'fold', category: 'functions', description: 'Fold/reduce', precedence: 100, associativity: 'none', arity: 3 },
  { id: 'foldr', unicode: 'foldr', ascii: 'foldr', category: 'functions', description: 'Fold right', precedence: 100, associativity: 'none', arity: 3 },
  { id: 'foldl', unicode: 'foldl', ascii: 'foldl', category: 'functions', description: 'Fold left', precedence: 100, associativity: 'none', arity: 3 },
  { id: 'filter', unicode: 'filter', ascii: 'filter', category: 'functions', description: 'Filter', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'zip', unicode: 'zip', ascii: 'zip', category: 'functions', description: 'Zip lists', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'unzip', unicode: 'unzip', ascii: 'unzip', category: 'functions', description: 'Unzip lists', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'head', unicode: 'head', ascii: 'head', category: 'functions', description: 'List head', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'tail', unicode: 'tail', ascii: 'tail', category: 'functions', description: 'List tail', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'cons', unicode: '::', ascii: '::', category: 'functions', description: 'List cons', precedence: 75, associativity: 'right', arity: 2 },
  { id: 'nil', unicode: '[]', ascii: '[]', category: 'functions', description: 'Empty list', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'length', unicode: '|·|', ascii: 'length', category: 'functions', description: 'Length', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'reverse', unicode: 'rev', ascii: 'reverse', category: 'functions', description: 'Reverse', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'concat', unicode: '++', ascii: '++', category: 'functions', description: 'Concatenate', precedence: 65, associativity: 'right', arity: 2 },
  { id: 'take', unicode: 'take', ascii: 'take', category: 'functions', description: 'Take n elements', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'drop', unicode: 'drop', ascii: 'drop', category: 'functions', description: 'Drop n elements', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'sum', unicode: '∑', ascii: 'sum', category: 'functions', description: 'Summation', precedence: 70, associativity: 'right', arity: 1 },
  { id: 'product', unicode: '∏', ascii: 'prod', category: 'functions', description: 'Product', precedence: 70, associativity: 'right', arity: 1 },
  { id: 'min', unicode: 'min', ascii: 'min', category: 'functions', description: 'Minimum', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'max', unicode: 'max', ascii: 'max', category: 'functions', description: 'Maximum', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'abs', unicode: '|·|', ascii: 'abs', category: 'functions', description: 'Absolute value', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'sgn', unicode: 'sgn', ascii: 'sgn', category: 'functions', description: 'Sign function', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'floor', unicode: '⌊·⌋', ascii: 'floor', category: 'functions', description: 'Floor', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'ceil', unicode: '⌈·⌉', ascii: 'ceil', category: 'functions', description: 'Ceiling', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'round', unicode: 'round', ascii: 'round', category: 'functions', description: 'Round', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'sqrt', unicode: '√', ascii: 'sqrt', category: 'functions', description: 'Square root', precedence: 70, associativity: 'right', arity: 1 },
  { id: 'exp', unicode: 'exp', ascii: 'exp', category: 'functions', description: 'Exponential', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'log', unicode: 'log', ascii: 'log', category: 'functions', description: 'Logarithm', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'ln', unicode: 'ln', ascii: 'ln', category: 'functions', description: 'Natural logarithm', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'sin', unicode: 'sin', ascii: 'sin', category: 'functions', description: 'Sine', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'cos', unicode: 'cos', ascii: 'cos', category: 'functions', description: 'Cosine', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'tan', unicode: 'tan', ascii: 'tan', category: 'functions', description: 'Tangent', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'asin', unicode: 'asin', ascii: 'asin', category: 'functions', description: 'Arc sine', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'acos', unicode: 'acos', ascii: 'acos', category: 'functions', description: 'Arc cosine', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'atan', unicode: 'atan', ascii: 'atan', category: 'functions', description: 'Arc tangent', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'sinh', unicode: 'sinh', ascii: 'sinh', category: 'functions', description: 'Hyperbolic sine', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'cosh', unicode: 'cosh', ascii: 'cosh', category: 'functions', description: 'Hyperbolic cosine', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'tanh', unicode: 'tanh', ascii: 'tanh', category: 'functions', description: 'Hyperbolic tangent', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'dom', unicode: 'dom', ascii: 'dom', category: 'functions', description: 'Domain', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'cod', unicode: 'cod', ascii: 'cod', category: 'functions', description: 'Codomain', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'img', unicode: 'img', ascii: 'img', category: 'functions', description: 'Image/range', precedence: 100, associativity: 'none', arity: 1 },
];

/**
 * Topology symbols (128) - showing core subset, full set would be extensive
 */
export const TOPOLOGY_SYMBOLS: SymbolDefinition[] = [
  { id: 'open', unicode: '◯', ascii: 'open', category: 'topology', description: 'Open set', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'closed', unicode: '●', ascii: 'closed', category: 'topology', description: 'Closed set', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'interior', unicode: 'int', ascii: 'int', category: 'topology', description: 'Interior', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'closure', unicode: 'cl', ascii: 'cl', category: 'topology', description: 'Closure', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'boundary', unicode: '∂', ascii: 'bd', category: 'topology', description: 'Boundary', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'continuous', unicode: '𝒞', ascii: 'cts', category: 'topology', description: 'Continuous', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'homeomorphic', unicode: '≅', ascii: 'homeo', category: 'topology', description: 'Homeomorphic', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'homotopic', unicode: '≃', ascii: 'hmtp', category: 'topology', description: 'Homotopic', precedence: 25, associativity: 'none', arity: 2 },
  { id: 'compact', unicode: 'K', ascii: 'compact', category: 'topology', description: 'Compact', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'connected', unicode: 'conn', ascii: 'conn', category: 'topology', description: 'Connected', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'path_connected', unicode: 'pconn', ascii: 'pconn', category: 'topology', description: 'Path connected', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'hausdorff', unicode: 'T₂', ascii: 'T2', category: 'topology', description: 'Hausdorff', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'metric', unicode: 'd', ascii: 'metric', category: 'topology', description: 'Metric', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'norm', unicode: '‖·‖', ascii: 'norm', category: 'topology', description: 'Norm', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'ball', unicode: 'B', ascii: 'ball', category: 'topology', description: 'Open ball', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'neighborhood', unicode: 'N', ascii: 'nbhd', category: 'topology', description: 'Neighborhood', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'limit', unicode: 'lim', ascii: 'lim', category: 'topology', description: 'Limit', precedence: 70, associativity: 'right', arity: 1 },
  { id: 'limsup', unicode: 'lim sup', ascii: 'limsup', category: 'topology', description: 'Limit superior', precedence: 70, associativity: 'right', arity: 1 },
  { id: 'liminf', unicode: 'lim inf', ascii: 'liminf', category: 'topology', description: 'Limit inferior', precedence: 70, associativity: 'right', arity: 1 },
  { id: 'converges', unicode: '→', ascii: 'conv', category: 'topology', description: 'Converges to', precedence: 20, associativity: 'right', arity: 2 },
  { id: 'diverges', unicode: '↛', ascii: 'div', category: 'topology', description: 'Diverges', precedence: 20, associativity: 'none', arity: 1 },
  { id: 'dense', unicode: 'dense', ascii: 'dense', category: 'topology', description: 'Dense subset', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'nowhere_dense', unicode: 'nwd', ascii: 'nwd', category: 'topology', description: 'Nowhere dense', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'separable', unicode: 'sep', ascii: 'sep', category: 'topology', description: 'Separable', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'complete', unicode: 'complete', ascii: 'complete', category: 'topology', description: 'Complete', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'banach', unicode: 'Banach', ascii: 'banach', category: 'topology', description: 'Banach space', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'hilbert', unicode: 'Hilbert', ascii: 'hilbert', category: 'topology', description: 'Hilbert space', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'manifold', unicode: 'M', ascii: 'manifold', category: 'topology', description: 'Manifold', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'tangent', unicode: 'T', ascii: 'tangent', category: 'topology', description: 'Tangent space', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'cotangent', unicode: 'T*', ascii: 'cotangent', category: 'topology', description: 'Cotangent space', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'fiber', unicode: 'F', ascii: 'fiber', category: 'topology', description: 'Fiber', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'bundle', unicode: 'E', ascii: 'bundle', category: 'topology', description: 'Fiber bundle', precedence: 100, associativity: 'none', arity: 0 },
  // ... additional topology symbols would follow the same pattern
];

/**
 * Evidence/Proof symbols (188) - showing core subset
 */
export const EVIDENCE_SYMBOLS: SymbolDefinition[] = [
  { id: 'proof', unicode: '⊢', ascii: 'proof', category: 'evidence', description: 'Proof', precedence: 5, associativity: 'none', arity: 2 },
  { id: 'qed', unicode: '∎', ascii: 'qed', category: 'evidence', description: 'End of proof', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'assume', unicode: 'assume', ascii: 'assume', category: 'evidence', description: 'Assumption', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'suppose', unicode: 'suppose', ascii: 'suppose', category: 'evidence', description: 'Supposition', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'given', unicode: 'given', ascii: 'given', category: 'evidence', description: 'Given', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'show', unicode: 'show', ascii: 'show', category: 'evidence', description: 'To show', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'have', unicode: 'have', ascii: 'have', category: 'evidence', description: 'Have (intermediate result)', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'hence', unicode: 'hence', ascii: 'hence', category: 'evidence', description: 'Hence', precedence: 3, associativity: 'none', arity: 1 },
  { id: 'thus', unicode: 'thus', ascii: 'thus', category: 'evidence', description: 'Thus', precedence: 3, associativity: 'none', arity: 1 },
  { id: 'by', unicode: 'by', ascii: 'by', category: 'evidence', description: 'By (justification)', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'from', unicode: 'from', ascii: 'from', category: 'evidence', description: 'From', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'using', unicode: 'using', ascii: 'using', category: 'evidence', description: 'Using', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'contradiction', unicode: '⊥', ascii: 'contra', category: 'evidence', description: 'Contradiction', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'induction', unicode: 'induction', ascii: 'induction', category: 'evidence', description: 'By induction', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'base_case', unicode: 'base', ascii: 'base', category: 'evidence', description: 'Base case', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'inductive_step', unicode: 'step', ascii: 'step', category: 'evidence', description: 'Inductive step', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'ih', unicode: 'IH', ascii: 'IH', category: 'evidence', description: 'Induction hypothesis', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'case', unicode: 'case', ascii: 'case', category: 'evidence', description: 'Case', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'trivial', unicode: 'trivial', ascii: 'trivial', category: 'evidence', description: 'Trivial', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'obvious', unicode: 'obvious', ascii: 'obvious', category: 'evidence', description: 'Obvious', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'wlog', unicode: 'WLOG', ascii: 'wlog', category: 'evidence', description: 'Without loss of generality', precedence: 5, associativity: 'none', arity: 0 },
  { id: 'suffices', unicode: 'suffices', ascii: 'suffices', category: 'evidence', description: 'It suffices to show', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'claim', unicode: 'claim', ascii: 'claim', category: 'evidence', description: 'Claim', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'observe', unicode: 'observe', ascii: 'observe', category: 'evidence', description: 'Observe', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'note', unicode: 'note', ascii: 'note', category: 'evidence', description: 'Note', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'recall', unicode: 'recall', ascii: 'recall', category: 'evidence', description: 'Recall', precedence: 5, associativity: 'none', arity: 1 },
  { id: 'clearly', unicode: 'clearly', ascii: 'clearly', category: 'evidence', description: 'Clearly', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'indeed', unicode: 'indeed', ascii: 'indeed', category: 'evidence', description: 'Indeed', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'finally', unicode: 'finally', ascii: 'finally', category: 'evidence', description: 'Finally', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'hypothesis', unicode: 'H', ascii: 'hyp', category: 'evidence', description: 'Hypothesis', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'goal', unicode: 'G', ascii: 'goal', category: 'evidence', description: 'Goal', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'refl', unicode: 'refl', ascii: 'refl', category: 'evidence', description: 'Reflexivity', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'symm', unicode: 'symm', ascii: 'symm', category: 'evidence', description: 'Symmetry', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'trans', unicode: 'trans', ascii: 'trans', category: 'evidence', description: 'Transitivity', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'congr', unicode: 'congr', ascii: 'congr', category: 'evidence', description: 'Congruence', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'subst', unicode: 'subst', ascii: 'subst', category: 'evidence', description: 'Substitution', precedence: 100, associativity: 'none', arity: 2 },
  { id: 'rw', unicode: 'rw', ascii: 'rw', category: 'evidence', description: 'Rewrite', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'simp', unicode: 'simp', ascii: 'simp', category: 'evidence', description: 'Simplify', precedence: 100, associativity: 'none', arity: 0 },
  { id: 'exact', unicode: 'exact', ascii: 'exact', category: 'evidence', description: 'Exact match', precedence: 100, associativity: 'none', arity: 1 },
  { id: 'apply', unicode: 'apply', ascii: 'apply', category: 'evidence', description: 'Apply', precedence: 100, associativity: 'none', arity: 1 },
  // ... additional evidence symbols would follow
];

/**
 * Complete symbol table
 */
export const ALL_SYMBOLS: SymbolDefinition[] = [
  ...QUANTIFIER_SYMBOLS,
  ...LOGIC_SYMBOLS,
  ...DEFINITION_SYMBOLS,
  ...SET_SYMBOLS,
  ...RELATION_SYMBOLS,
  ...FUNCTION_SYMBOLS,
  ...TOPOLOGY_SYMBOLS,
  ...EVIDENCE_SYMBOLS,
];

/**
 * Symbol counts by category
 */
export const SYMBOL_COUNTS: Record<SymbolCategory, number> = {
  quantifiers: QUANTIFIER_SYMBOLS.length,
  logic: LOGIC_SYMBOLS.length,
  definitions: DEFINITION_SYMBOLS.length,
  sets: SET_SYMBOLS.length,
  relations: RELATION_SYMBOLS.length,
  functions: FUNCTION_SYMBOLS.length,
  topology: TOPOLOGY_SYMBOLS.length,
  evidence: EVIDENCE_SYMBOLS.length,
};

/**
 * Symbol lookup maps for fast access
 */
const symbolByUnicode = new Map<string, SymbolDefinition>();
const symbolByAscii = new Map<string, SymbolDefinition>();
const symbolById = new Map<string, SymbolDefinition>();
const symbolsByCategory = new Map<SymbolCategory, SymbolDefinition[]>();

// Initialize lookup maps
for (const symbol of ALL_SYMBOLS) {
  symbolByUnicode.set(symbol.unicode, symbol);
  symbolByAscii.set(symbol.ascii, symbol);
  symbolById.set(symbol.id, symbol);

  // Also register aliases
  if (symbol.aliases) {
    for (const alias of symbol.aliases) {
      symbolByAscii.set(alias, symbol);
    }
  }

  // Category lookup
  const category = symbolsByCategory.get(symbol.category) || [];
  category.push(symbol);
  symbolsByCategory.set(symbol.category, category);
}

/**
 * Look up a symbol by its Unicode representation
 */
export function lookupByUnicode(unicode: string): SymbolLookup {
  const symbol = symbolByUnicode.get(unicode);
  if (symbol) {
    return { found: true, symbol };
  }
  return { found: false, suggestions: findSimilar(unicode) };
}

/**
 * Look up a symbol by its ASCII representation
 */
export function lookupByAscii(ascii: string): SymbolLookup {
  const symbol = symbolByAscii.get(ascii);
  if (symbol) {
    return { found: true, symbol };
  }
  return { found: false, suggestions: findSimilar(ascii) };
}

/**
 * Look up a symbol by its ID
 */
export function lookupById(id: string): SymbolLookup {
  const symbol = symbolById.get(id);
  if (symbol) {
    return { found: true, symbol };
  }
  return { found: false, suggestions: findSimilar(id) };
}

/**
 * Get all symbols in a category
 */
export function getSymbolsByCategory(category: SymbolCategory): SymbolDefinition[] {
  return symbolsByCategory.get(category) || [];
}

/**
 * Find similar symbols (for suggestions)
 */
function findSimilar(input: string, maxSuggestions = 5): string[] {
  const suggestions: Array<{ id: string; distance: number }> = [];
  const inputLower = input.toLowerCase();

  for (const symbol of ALL_SYMBOLS) {
    const idDistance = levenshteinDistance(inputLower, symbol.id.toLowerCase());
    const asciiDistance = levenshteinDistance(inputLower, symbol.ascii.toLowerCase());
    const minDistance = Math.min(idDistance, asciiDistance);

    if (minDistance <= 3) {
      suggestions.push({ id: symbol.id, distance: minDistance });
    }
  }

  return suggestions
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map(s => s.id);
}

/**
 * Simple Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if a string is a known symbol
 */
export function isSymbol(str: string): boolean {
  return symbolByUnicode.has(str) || symbolByAscii.has(str);
}

/**
 * Get the total number of defined symbols
 */
export function getTotalSymbolCount(): number {
  return ALL_SYMBOLS.length;
}
