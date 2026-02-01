/**
 * AISP Tokenizer
 *
 * Lexical analyzer for AISP (AI Symbolic Protocol) expressions.
 * Converts input text into a stream of tokens.
 */

import type { Token, TokenType, SymbolCategory, ParserConfig } from './types.js';
import { lookupByUnicode, lookupByAscii, isSymbol } from './symbols.js';

/**
 * Tokenizer state
 */
interface TokenizerState {
  input: string;
  position: number;
  line: number;
  column: number;
}

/**
 * Character classification helpers
 */
const isWhitespace = (char: string): boolean => /\s/.test(char);
const isDigit = (char: string): boolean => /[0-9]/.test(char);
const isAlpha = (char: string): boolean => /[a-zA-Z_]/.test(char);
const isAlphaNumeric = (char: string): boolean => /[a-zA-Z0-9_']/.test(char);
const isOperatorChar = (char: string): boolean => /[+\-*\/=<>!&|^~%@#$?:]/.test(char);

/**
 * Unicode symbol ranges for common mathematical symbols
 */
const UNICODE_MATH_RANGES: Array<[number, number]> = [
  [0x2200, 0x22FF], // Mathematical Operators
  [0x27C0, 0x27EF], // Miscellaneous Mathematical Symbols-A
  [0x2980, 0x29FF], // Miscellaneous Mathematical Symbols-B
  [0x2A00, 0x2AFF], // Supplemental Mathematical Operators
  [0x2100, 0x214F], // Letterlike Symbols
  [0x2150, 0x218F], // Number Forms
  [0x0391, 0x03C9], // Greek letters
];

function isUnicodeMath(char: string): boolean {
  const code = char.charCodeAt(0);
  return UNICODE_MATH_RANGES.some(([start, end]) => code >= start && code <= end);
}

/**
 * AISP Tokenizer class
 */
export class Tokenizer {
  private state: TokenizerState;
  private config: ParserConfig;
  private tokens: Token[] = [];

  constructor(input: string, config: ParserConfig = {}) {
    this.state = {
      input,
      position: 0,
      line: 1,
      column: 1,
    };
    this.config = {
      allowUnicode: true,
      allowASCII: true,
      ...config,
    };
  }

  /**
   * Tokenize the entire input
   */
  tokenize(): Token[] {
    this.tokens = [];

    while (!this.isAtEnd()) {
      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    // Add EOF token
    this.tokens.push({
      type: 'EOF',
      value: '',
      line: this.state.line,
      column: this.state.column,
    });

    return this.tokens;
  }

  /**
   * Get the next token
   */
  private nextToken(): Token | null {
    this.skipWhitespaceAndComments();

    if (this.isAtEnd()) {
      return null;
    }

    const char = this.peek();
    const startLine = this.state.line;
    const startColumn = this.state.column;

    // Try to match Unicode symbols first
    if (this.config.allowUnicode && isUnicodeMath(char)) {
      return this.readSymbol(startLine, startColumn);
    }

    // String literals
    if (char === '"' || char === "'") {
      return this.readString(startLine, startColumn);
    }

    // Numbers
    if (isDigit(char) || (char === '.' && isDigit(this.peekNext()))) {
      return this.readNumber(startLine, startColumn);
    }

    // Identifiers and keywords
    if (isAlpha(char)) {
      return this.readIdentifierOrKeyword(startLine, startColumn);
    }

    // Multi-character operators and ASCII symbols
    if (isOperatorChar(char)) {
      return this.readOperatorOrAsciiSymbol(startLine, startColumn);
    }

    // Punctuation
    if (this.isPunctuation(char)) {
      return this.readPunctuation(startLine, startColumn);
    }

    // Unknown character - advance and return as error
    this.advance();
    return {
      type: 'PUNCTUATION',
      value: char,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * Read a Unicode symbol
   */
  private readSymbol(startLine: number, startColumn: number): Token {
    const char = this.advance();
    const lookup = lookupByUnicode(char);

    if (lookup.found && lookup.symbol) {
      return {
        type: 'SYMBOL',
        value: char,
        line: startLine,
        column: startColumn,
        symbolId: lookup.symbol.id,
        category: lookup.symbol.category,
      };
    }

    // Unknown Unicode math character - treat as identifier
    return {
      type: 'IDENTIFIER',
      value: char,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * Read an operator or ASCII symbol
   */
  private readOperatorOrAsciiSymbol(startLine: number, startColumn: number): Token {
    let value = '';

    // Collect operator characters
    while (!this.isAtEnd() && isOperatorChar(this.peek())) {
      value += this.advance();

      // Check if this is a known ASCII symbol
      const lookup = lookupByAscii(value);
      if (lookup.found && lookup.symbol) {
        // Look ahead to see if a longer match exists
        if (this.isAtEnd() || !isOperatorChar(this.peek())) {
          return {
            type: 'SYMBOL',
            value,
            line: startLine,
            column: startColumn,
            symbolId: lookup.symbol.id,
            category: lookup.symbol.category,
          };
        }
        // Check if longer version is also a symbol
        const longerValue = value + this.peek();
        const longerLookup = lookupByAscii(longerValue);
        if (!longerLookup.found) {
          return {
            type: 'SYMBOL',
            value,
            line: startLine,
            column: startColumn,
            symbolId: lookup.symbol.id,
            category: lookup.symbol.category,
          };
        }
      }
    }

    // Final check for complete operator
    const finalLookup = lookupByAscii(value);
    if (finalLookup.found && finalLookup.symbol) {
      return {
        type: 'SYMBOL',
        value,
        line: startLine,
        column: startColumn,
        symbolId: finalLookup.symbol.id,
        category: finalLookup.symbol.category,
      };
    }

    // Not a known symbol - return as operator
    return {
      type: 'OPERATOR',
      value,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * Read an identifier or keyword
   */
  private readIdentifierOrKeyword(startLine: number, startColumn: number): Token {
    let value = '';

    while (!this.isAtEnd() && isAlphaNumeric(this.peek())) {
      value += this.advance();
    }

    // Check if it's an ASCII symbol (like 'forall', 'exists', etc.)
    if (this.config.allowASCII) {
      const lookup = lookupByAscii(value);
      if (lookup.found && lookup.symbol) {
        return {
          type: 'SYMBOL',
          value,
          line: startLine,
          column: startColumn,
          symbolId: lookup.symbol.id,
          category: lookup.symbol.category,
        };
      }
    }

    return {
      type: 'IDENTIFIER',
      value,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * Read a number literal
   */
  private readNumber(startLine: number, startColumn: number): Token {
    let value = '';
    let hasDecimal = false;
    let hasExponent = false;

    while (!this.isAtEnd()) {
      const char = this.peek();

      if (isDigit(char)) {
        value += this.advance();
      } else if (char === '.' && !hasDecimal && !hasExponent) {
        if (isDigit(this.peekNext())) {
          hasDecimal = true;
          value += this.advance();
        } else {
          break;
        }
      } else if ((char === 'e' || char === 'E') && !hasExponent) {
        hasExponent = true;
        value += this.advance();
        if (this.peek() === '+' || this.peek() === '-') {
          value += this.advance();
        }
      } else {
        break;
      }
    }

    return {
      type: 'NUMBER',
      value,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * Read a string literal
   */
  private readString(startLine: number, startColumn: number): Token {
    const quote = this.advance(); // Opening quote
    let value = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(); // Skip backslash
        if (!this.isAtEnd()) {
          const escaped = this.advance();
          switch (escaped) {
            case 'n': value += '\n'; break;
            case 't': value += '\t'; break;
            case 'r': value += '\r'; break;
            case '\\': value += '\\'; break;
            case '"': value += '"'; break;
            case "'": value += "'"; break;
            default: value += escaped;
          }
        }
      } else if (this.peek() === '\n') {
        // Unterminated string
        break;
      } else {
        value += this.advance();
      }
    }

    if (!this.isAtEnd() && this.peek() === quote) {
      this.advance(); // Closing quote
    }

    return {
      type: 'STRING',
      value,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * Read punctuation
   */
  private readPunctuation(startLine: number, startColumn: number): Token {
    const char = this.advance();

    return {
      type: 'PUNCTUATION',
      value: char,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * Skip whitespace and comments
   */
  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();

      if (isWhitespace(char)) {
        this.advance();
      } else if (char === '-' && this.peekNext() === '-') {
        // Line comment
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
      } else if (char === '{' && this.peekNext() === '-') {
        // Block comment
        this.advance(); // {
        this.advance(); // -
        let depth = 1;
        while (!this.isAtEnd() && depth > 0) {
          if (this.peek() === '{' && this.peekNext() === '-') {
            depth++;
            this.advance();
            this.advance();
          } else if (this.peek() === '-' && this.peekNext() === '}') {
            depth--;
            this.advance();
            this.advance();
          } else {
            this.advance();
          }
        }
      } else if (char === '/' && this.peekNext() === '/') {
        // C-style line comment
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
      } else if (char === '/' && this.peekNext() === '*') {
        // C-style block comment
        this.advance(); // /
        this.advance(); // *
        while (!this.isAtEnd()) {
          if (this.peek() === '*' && this.peekNext() === '/') {
            this.advance();
            this.advance();
            break;
          }
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  /**
   * Check if character is punctuation
   */
  private isPunctuation(char: string): boolean {
    return /[(),\[\]{};.]/.test(char);
  }

  /**
   * Peek at current character
   */
  private peek(): string {
    return this.state.input[this.state.position] || '\0';
  }

  /**
   * Peek at next character
   */
  private peekNext(): string {
    return this.state.input[this.state.position + 1] || '\0';
  }

  /**
   * Advance to next character
   */
  private advance(): string {
    const char = this.peek();
    this.state.position++;

    if (char === '\n') {
      this.state.line++;
      this.state.column = 1;
    } else {
      this.state.column++;
    }

    return char;
  }

  /**
   * Check if at end of input
   */
  private isAtEnd(): boolean {
    return this.state.position >= this.state.input.length;
  }
}

/**
 * Convenience function to tokenize input
 */
export function tokenize(input: string, config?: ParserConfig): Token[] {
  const tokenizer = new Tokenizer(input, config);
  return tokenizer.tokenize();
}
