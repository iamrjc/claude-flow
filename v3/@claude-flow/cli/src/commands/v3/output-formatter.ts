/**
 * V3 Output Formatters
 * Advanced formatting for tables, JSON, progress bars, and spinners
 */

import type { TableOptions } from '../../types.js';
import { output } from '../../output.js';
import { padString } from './command-utils.js';

/**
 * Table Formatter
 * Format data as tables with borders and alignment
 */
export class TableFormatter {
  /**
   * Format and print a table
   */
  static format(options: TableOptions): void {
    const {
      columns,
      data,
      border = true,
      header = true,
      padding = 1
    } = options;

    if (data.length === 0) {
      return;
    }

    // Calculate column widths
    const widths = columns.map(col => {
      const headerWidth = col.header.length;
      const dataWidth = Math.max(
        ...data.map(row => {
          const value = row[col.key];
          const formatted = col.format ? col.format(value) : String(value ?? '');
          // Remove ANSI codes for width calculation
          const plain = formatted.replace(/\x1b\[[0-9;]*m/g, '');
          return plain.length;
        })
      );
      return col.width || Math.max(headerWidth, dataWidth);
    });

    // Print header
    if (header) {
      if (border) {
        this.printBorder(widths, padding, 'top');
      }

      const headerCells = columns.map((col, i) => {
        const width = widths[i];
        return padString(col.header, width, col.align || 'left');
      });

      output.writeln(this.formatRow(headerCells, padding, border));

      if (border) {
        this.printBorder(widths, padding, 'middle');
      }
    } else if (border) {
      this.printBorder(widths, padding, 'top');
    }

    // Print data rows
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const cells = columns.map((col, j) => {
        const value = row[col.key];
        const formatted = col.format ? col.format(value) : String(value ?? '');
        const width = widths[j];

        // For colored text, we need to pad without the ANSI codes
        const plain = formatted.replace(/\x1b\[[0-9;]*m/g, '');
        const colorCodeLength = formatted.length - plain.length;
        const paddingWidth = width + colorCodeLength;

        return padString(formatted, paddingWidth, col.align || 'left');
      });

      output.writeln(this.formatRow(cells, padding, border));
    }

    // Print bottom border
    if (border) {
      this.printBorder(widths, padding, 'bottom');
    }
  }

  private static formatRow(cells: string[], padding: number, border: boolean): string {
    const pad = ' '.repeat(padding);
    const separator = border ? '│' : ' ';
    const left = border ? '│' : '';
    const right = border ? '│' : '';

    return left + pad + cells.join(pad + separator + pad) + pad + right;
  }

  private static printBorder(widths: number[], padding: number, position: 'top' | 'middle' | 'bottom'): void {
    const chars = {
      top: { left: '┌', middle: '┬', right: '┐', horizontal: '─' },
      middle: { left: '├', middle: '┼', right: '┤', horizontal: '─' },
      bottom: { left: '└', middle: '┴', right: '┘', horizontal: '─' }
    };

    const style = chars[position];
    const segments = widths.map(width => style.horizontal.repeat(width + padding * 2));

    output.writeln(style.left + segments.join(style.middle) + style.right);
  }
}

/**
 * JSON Formatter
 * Format and print JSON data
 */
export class JSONFormatter {
  /**
   * Format and print JSON data
   */
  static format(data: unknown, pretty = true): void {
    const json = pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    output.writeln(json);
  }

  /**
   * Format JSON with syntax highlighting
   */
  static formatWithColor(data: unknown): void {
    const json = JSON.stringify(data, null, 2);

    // Simple syntax highlighting
    const highlighted = json
      .replace(/"([^"]+)":/g, output.cyan('"$1"') + ':')  // Keys
      .replace(/: "([^"]*)"/g, ': ' + output.green('"$1"'))  // String values
      .replace(/: (\d+)/g, ': ' + output.yellow('$1'))  // Number values
      .replace(/: (true|false)/g, ': ' + output.blue('$1'))  // Boolean values
      .replace(/: null/g, ': ' + output.dim('null'));  // Null values

    output.writeln(highlighted);
  }
}

/**
 * Progress Bar
 * Display progress for long-running operations
 */
export class ProgressBar {
  private total: number;
  private current: number;
  private width: number;
  private text: string;
  private startTime: number;

  constructor(total: number, options: { width?: number; text?: string } = {}) {
    this.total = total;
    this.current = 0;
    this.width = options.width || 40;
    this.text = options.text || 'Progress';
    this.startTime = Date.now();
  }

  /**
   * Update progress
   */
  update(current: number, text?: string): void {
    this.current = current;
    if (text) {
      this.text = text;
    }
    this.render();
  }

  /**
   * Increment progress by 1
   */
  increment(text?: string): void {
    this.update(this.current + 1, text);
  }

  /**
   * Mark as complete
   */
  complete(text?: string): void {
    this.update(this.total, text);
    output.writeln('');  // New line after completion
  }

  /**
   * Render progress bar
   */
  private render(): void {
    const percentage = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.floor(percentage * this.width);
    const empty = this.width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percent = (percentage * 100).toFixed(1);

    // Calculate ETA
    const elapsed = Date.now() - this.startTime;
    const eta = percentage > 0
      ? (elapsed / percentage) - elapsed
      : 0;

    const etaStr = this.formatDuration(eta);

    // Clear line and render
    process.stdout.write('\r\x1b[K');
    process.stdout.write(`${this.text} [${bar}] ${percent}% ETA: ${etaStr}`);
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

/**
 * Spinner
 * Display spinner for async operations
 */
export class Spinner {
  private text: string;
  private frames: string[];
  private interval: NodeJS.Timeout | null = null;
  private currentFrame = 0;

  constructor(text: string, style: 'dots' | 'line' | 'arc' | 'circle' = 'dots') {
    this.text = text;
    this.frames = this.getFrames(style);
  }

  /**
   * Start spinner
   */
  start(): void {
    if (this.interval) return;

    this.currentFrame = 0;
    this.interval = setInterval(() => {
      this.render();
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  /**
   * Update spinner text
   */
  update(text: string): void {
    this.text = text;
  }

  /**
   * Stop spinner with success message
   */
  succeed(text?: string): void {
    this.stop(output.success('✓'), text);
  }

  /**
   * Stop spinner with error message
   */
  fail(text?: string): void {
    this.stop(output.error('✗'), text);
  }

  /**
   * Stop spinner with warning message
   */
  warn(text?: string): void {
    this.stop(output.warning('⚠'), text);
  }

  /**
   * Stop spinner with info message
   */
  info(text?: string): void {
    this.stop(output.info('ℹ'), text);
  }

  /**
   * Stop spinner
   */
  stop(symbol?: string, text?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    process.stdout.write('\r\x1b[K');

    if (symbol) {
      output.writeln(`${symbol} ${text || this.text}`);
    } else if (text) {
      output.writeln(text);
    }
  }

  private render(): void {
    const frame = this.frames[this.currentFrame];
    process.stdout.write(`\r${output.cyan(frame)} ${this.text}`);
  }

  private getFrames(style: string): string[] {
    const styles: Record<string, string[]> = {
      dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
      line: ['-', '\\', '|', '/'],
      arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
      circle: ['◐', '◓', '◑', '◒']
    };

    return styles[style] || styles.dots;
  }
}

/**
 * Box Formatter
 * Draw boxes around text
 */
export class BoxFormatter {
  /**
   * Format text in a box
   */
  static format(text: string, title?: string, style: 'single' | 'double' = 'single'): void {
    const lines = text.split('\n');
    const width = Math.max(...lines.map(l => l.length), title ? title.length : 0);

    const chars = style === 'double'
      ? { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' }
      : { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };

    // Top border
    if (title) {
      const titlePadding = Math.max(0, width - title.length);
      output.writeln(chars.tl + chars.h + ` ${title} ` + chars.h.repeat(titlePadding) + chars.tr);
    } else {
      output.writeln(chars.tl + chars.h.repeat(width + 2) + chars.tr);
    }

    // Content
    for (const line of lines) {
      const padding = ' '.repeat(Math.max(0, width - line.length));
      output.writeln(chars.v + ' ' + line + padding + ' ' + chars.v);
    }

    // Bottom border
    output.writeln(chars.bl + chars.h.repeat(width + 2) + chars.br);
  }
}

/**
 * List Formatter
 * Format items as a list
 */
export class ListFormatter {
  /**
   * Format and print a bulleted list
   */
  static format(items: string[], bullet = '•', indent = 2): void {
    const prefix = ' '.repeat(indent) + bullet + ' ';

    for (const item of items) {
      output.writeln(prefix + item);
    }
  }

  /**
   * Format and print a numbered list
   */
  static formatNumbered(items: string[], indent = 2): void {
    const maxDigits = String(items.length).length;

    for (let i = 0; i < items.length; i++) {
      const number = String(i + 1).padStart(maxDigits, ' ');
      const prefix = ' '.repeat(indent) + number + '. ';
      output.writeln(prefix + items[i]);
    }
  }
}
