/**
 * Agent Booster Detector for WP02
 *
 * Tier 1 Detection: Identifies simple, well-defined operations that can be
 * handled by fast, local WASM-based transformations without invoking LLMs.
 *
 * Agent Booster provides:
 * - <1ms execution (352x faster than LLM)
 * - $0 cost
 * - Deterministic results
 *
 * @module @claude-flow/integration/agent-booster-detector
 */

import {
  AgentBoosterIntent,
  AgentBoosterDetectionResult,
  TaskContext,
} from './types/routing.js';

// Intent detection patterns
const BOOSTER_PATTERNS: Record<AgentBoosterIntent, RegExp[]> = {
  'var-to-const': [
    /\bconvert\s+var\s+to\s+const\b/i,
    /\bchange\s+var\s+to\s+const\b/i,
    /\breplace\s+var\s+with\s+const\b/i,
    /\bvar\s*->\s*const\b/i,
  ],
  'add-types': [
    /\badd\s+type(s|script)?\s*(annotation)?s?\b/i,
    /\btype\s+this\b/i,
    /\badd\s+typescript\b/i,
  ],
  'add-error-handling': [
    /\badd\s+(try[/-]?catch|error\s+handling)\b/i,
    /\bwrap\s+in\s+try\b/i,
  ],
  'async-await': [
    /\bconvert\s+to\s+async\b/i,
    /\badd\s+async\s*\/?\s*await\b/i,
    /\bpromise\s+to\s+async\b/i,
  ],
  'add-logging': [
    /\badd\s+(console\.)?log(ging|s)?\b/i,
    /\badd\s+debug\s+(log|statement)s?\b/i,
  ],
  'remove-console': [
    /\bremove\s+(all\s+)?(console\.)?log(s|ging)?\s*(statement)?s?\b/i,
    /\bstrip\s+(all\s+)?(console\.)?log(s)?\b/i,
    /\bdelete\s+(all\s+)?(console\.)?log(s)?\b/i,
  ],
  'format-code': [
    /\bformat\s+(this\s+)?(code|file)\b/i,
    /\bprettier\b/i,
    /\bindent(ation)?\b/i,
    /\bfix\s+(formatting|whitespace)\b/i,
  ],
  'simple-rename': [
    /\brename\s+\w+\s+to\s+\w+\b/i,
    /\bchange\s+name\s+(of|from)\b/i,
  ],
};

// Keywords that indicate task is too complex for booster
const COMPLEXITY_KEYWORDS = [
  'architect',
  'design',
  'implement',
  'refactor',
  'optimize',
  'analyze',
  'review',
  'debug',
  'security',
  'performance',
  'complex',
  'comprehensive',
  'multi-step',
  'multiple files',
];

/**
 * Detects if a task can be handled by Agent Booster (Tier 1)
 */
export function detectAgentBoosterIntent(
  task: TaskContext
): AgentBoosterDetectionResult {
  const prompt = task.prompt.toLowerCase();

  // Quick rejection for long prompts (booster tasks are simple)
  if (prompt.length > 500) {
    return {
      isBooster: false,
      confidence: 0,
      reason: 'Prompt too long for booster task',
    };
  }

  // Quick rejection for complexity keywords
  for (const keyword of COMPLEXITY_KEYWORDS) {
    if (prompt.includes(keyword)) {
      return {
        isBooster: false,
        confidence: 0,
        reason: `Complexity keyword detected: "${keyword}"`,
      };
    }
  }

  // Check each booster intent pattern
  for (const [intent, patterns] of Object.entries(BOOSTER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        return {
          isBooster: true,
          intent: intent as AgentBoosterIntent,
          confidence: 0.95,
          reason: `Matched booster pattern for "${intent}"`,
        };
      }
    }
  }

  // Check for simple single-action tasks
  const simpleTaskPatterns = [
    /^fix\s+(typo|spelling)/i,
    /^add\s+(a\s+)?comment/i,
    /^remove\s+unused/i,
    /^update\s+(import|export)/i,
  ];

  for (const pattern of simpleTaskPatterns) {
    if (pattern.test(prompt)) {
      return {
        isBooster: true,
        intent: 'format-code',
        confidence: 0.8,
        reason: 'Simple single-action task detected',
      };
    }
  }

  return {
    isBooster: false,
    confidence: 0,
  };
}

/**
 * AgentBoosterDetector class for stateful detection with configuration
 */
export class AgentBoosterDetector {
  private enabled: boolean;
  private customPatterns: Map<AgentBoosterIntent, RegExp[]>;

  constructor(options: { enabled?: boolean } = {}) {
    this.enabled = options.enabled ?? true;
    this.customPatterns = new Map();
  }

  /**
   * Detect booster intent for a task
   */
  detect(task: TaskContext): AgentBoosterDetectionResult {
    if (!this.enabled) {
      return {
        isBooster: false,
        confidence: 0,
        reason: 'Agent Booster disabled',
      };
    }

    // Check custom patterns first
    const prompt = task.prompt.toLowerCase();
    for (const [intent, patterns] of this.customPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(prompt)) {
          return {
            isBooster: true,
            intent,
            confidence: 0.9,
            reason: `Matched custom pattern for "${intent}"`,
          };
        }
      }
    }

    // Fall back to default detection
    return detectAgentBoosterIntent(task);
  }

  /**
   * Add custom detection pattern
   */
  addPattern(intent: AgentBoosterIntent, pattern: RegExp): void {
    const patterns = this.customPatterns.get(intent) || [];
    patterns.push(pattern);
    this.customPatterns.set(intent, patterns);
  }

  /**
   * Enable/disable the detector
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
