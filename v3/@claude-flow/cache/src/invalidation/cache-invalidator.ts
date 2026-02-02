/**
 * Cache invalidation with manual, pattern-based, event-driven, and cascade strategies
 * WP27: Caching Layer - Cache Invalidator
 */

import { EventEmitter } from 'events';

export interface InvalidationRule {
  id: string;
  type: 'manual' | 'pattern' | 'event' | 'cascade' | 'time';
  pattern?: string | RegExp;
  event?: string;
  cascadeTo?: string[];
  ttl?: number;
  enabled: boolean;
  created: number;
  lastTriggered?: number;
  triggerCount: number;
}

export interface InvalidationOptions {
  enableCascade?: boolean;
  maxCascadeDepth?: number;
  eventBus?: EventEmitter;
}

export interface InvalidationStats {
  totalInvalidations: number;
  manualInvalidations: number;
  patternInvalidations: number;
  eventInvalidations: number;
  cascadeInvalidations: number;
  timeInvalidations: number;
  rules: number;
}

/**
 * Cache invalidation manager with multiple strategies
 */
export class CacheInvalidator extends EventEmitter {
  private rules: Map<string, InvalidationRule>;
  private stats: InvalidationStats;
  private options: Required<InvalidationOptions>;
  private cascadeInProgress: Set<string>;
  private eventBus: EventEmitter;

  constructor(options: InvalidationOptions = {}) {
    super();
    this.rules = new Map();
    this.cascadeInProgress = new Set();
    this.stats = {
      totalInvalidations: 0,
      manualInvalidations: 0,
      patternInvalidations: 0,
      eventInvalidations: 0,
      cascadeInvalidations: 0,
      timeInvalidations: 0,
      rules: 0,
    };
    this.options = {
      enableCascade: options.enableCascade ?? true,
      maxCascadeDepth: options.maxCascadeDepth ?? 5,
      eventBus: options.eventBus ?? new EventEmitter(),
    };
    this.eventBus = this.options.eventBus;

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for event-driven invalidation
   */
  private setupEventListeners(): void {
    // Listen to all events and check for matching rules
    const originalEmit = this.eventBus.emit.bind(this.eventBus);
    this.eventBus.emit = (event: string, ...args: any[]): boolean => {
      this.checkEventRules(event, args);
      return originalEmit(event, ...args);
    };
  }

  /**
   * Add invalidation rule
   */
  addRule(rule: Omit<InvalidationRule, 'created' | 'triggerCount'>): string {
    const id = rule.id || this.generateRuleId();
    const fullRule: InvalidationRule = {
      ...rule,
      id,
      created: Date.now(),
      triggerCount: 0,
      enabled: rule.enabled ?? true,
    };

    this.rules.set(id, fullRule);
    this.stats.rules = this.rules.size;
    this.emit('rule-added', fullRule);

    return id;
  }

  /**
   * Remove invalidation rule
   */
  removeRule(id: string): boolean {
    const removed = this.rules.delete(id);
    if (removed) {
      this.stats.rules = this.rules.size;
      this.emit('rule-removed', id);
    }
    return removed;
  }

  /**
   * Enable/disable rule
   */
  setRuleEnabled(id: string, enabled: boolean): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;

    rule.enabled = enabled;
    this.emit('rule-updated', rule);
    return true;
  }

  /**
   * Get rule by ID
   */
  getRule(id: string): InvalidationRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Get all rules
   */
  getRules(): InvalidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Manually invalidate by key
   */
  invalidate(key: string, cascade: boolean = true): void {
    this.stats.totalInvalidations++;
    this.stats.manualInvalidations++;
    this.emit('invalidate', key, 'manual');

    if (cascade && this.options.enableCascade) {
      this.processCascade(key, 0);
    }
  }

  /**
   * Invalidate by pattern
   */
  invalidatePattern(pattern: string | RegExp, cascade: boolean = true): string[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const matchedKeys: string[] = [];

    // Emit pattern invalidation event with regex
    this.emit('invalidate-pattern', regex);

    this.stats.totalInvalidations++;
    this.stats.patternInvalidations++;

    // Cascade if enabled
    if (cascade && this.options.enableCascade) {
      for (const key of matchedKeys) {
        this.processCascade(key, 0);
      }
    }

    return matchedKeys;
  }

  /**
   * Invalidate all
   */
  invalidateAll(): void {
    this.stats.totalInvalidations++;
    this.emit('invalidate-all');
  }

  /**
   * Check and trigger event-based rules
   */
  private checkEventRules(event: string, args: any[]): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.type !== 'event') continue;
      if (rule.event === event) {
        this.triggerRule(rule, { event, args });
      }
    }
  }

  /**
   * Trigger invalidation rule
   */
  private triggerRule(rule: InvalidationRule, context?: any): void {
    rule.lastTriggered = Date.now();
    rule.triggerCount++;

    this.stats.totalInvalidations++;

    switch (rule.type) {
      case 'pattern':
        if (rule.pattern) {
          this.stats.patternInvalidations++;
          this.invalidatePattern(rule.pattern, false);
        }
        break;

      case 'event':
        this.stats.eventInvalidations++;
        this.emit('invalidate-event', rule.event, context);
        break;

      case 'cascade':
        if (rule.cascadeTo) {
          this.stats.cascadeInvalidations++;
          for (const key of rule.cascadeTo) {
            this.invalidate(key, false);
          }
        }
        break;

      case 'time':
        this.stats.timeInvalidations++;
        this.emit('invalidate-time', rule.id);
        break;
    }

    this.emit('rule-triggered', rule, context);
  }

  /**
   * Process cascade invalidation
   */
  private processCascade(key: string, depth: number): void {
    if (depth >= this.options.maxCascadeDepth) {
      this.emit('cascade-depth-exceeded', key, depth);
      return;
    }

    // Prevent infinite loops
    if (this.cascadeInProgress.has(key)) {
      return;
    }

    this.cascadeInProgress.add(key);

    // Find cascade rules for this key
    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.type !== 'cascade') continue;

      if (rule.pattern) {
        const regex =
          typeof rule.pattern === 'string'
            ? new RegExp(rule.pattern)
            : rule.pattern;
        if (regex.test(key) && rule.cascadeTo) {
          this.stats.cascadeInvalidations++;
          for (const cascadeKey of rule.cascadeTo) {
            this.emit('invalidate', cascadeKey, 'cascade', key);
            this.processCascade(cascadeKey, depth + 1);
          }
        }
      }
    }

    this.cascadeInProgress.delete(key);
  }

  /**
   * Add pattern-based invalidation rule
   */
  addPatternRule(
    pattern: string | RegExp,
    id?: string
  ): string {
    return this.addRule({
      id: id ?? this.generateRuleId(),
      type: 'pattern',
      pattern,
      enabled: true,
    });
  }

  /**
   * Add event-based invalidation rule
   */
  addEventRule(
    event: string,
    invalidatePattern?: string | RegExp,
    id?: string
  ): string {
    return this.addRule({
      id: id ?? this.generateRuleId(),
      type: 'event',
      event,
      pattern: invalidatePattern,
      enabled: true,
    });
  }

  /**
   * Add cascade invalidation rule
   */
  addCascadeRule(
    pattern: string | RegExp,
    cascadeTo: string[],
    id?: string
  ): string {
    return this.addRule({
      id: id ?? this.generateRuleId(),
      type: 'cascade',
      pattern,
      cascadeTo,
      enabled: true,
    });
  }

  /**
   * Add time-based invalidation rule
   */
  addTimeRule(ttl: number, pattern?: string | RegExp, id?: string): string {
    const ruleId = this.addRule({
      id: id ?? this.generateRuleId(),
      type: 'time',
      pattern,
      ttl,
      enabled: true,
    });

    // Schedule invalidation
    setTimeout(() => {
      const rule = this.rules.get(ruleId);
      if (rule && rule.enabled) {
        if (rule.pattern) {
          this.invalidatePattern(rule.pattern);
        } else {
          this.invalidateAll();
        }
        this.triggerRule(rule);
      }
    }, ttl);

    return ruleId;
  }

  /**
   * Get invalidation statistics
   */
  getStats(): InvalidationStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalInvalidations: 0,
      manualInvalidations: 0,
      patternInvalidations: 0,
      eventInvalidations: 0,
      cascadeInvalidations: 0,
      timeInvalidations: 0,
      rules: this.rules.size,
    };
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules.clear();
    this.stats.rules = 0;
    this.emit('rules-cleared');
  }

  /**
   * Generate unique rule ID
   */
  private generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export rules to JSON
   */
  export(): string {
    const rules = Array.from(this.rules.values()).map((rule) => ({
      ...rule,
      pattern: rule.pattern instanceof RegExp ? rule.pattern.source : rule.pattern,
    }));
    return JSON.stringify(rules, null, 2);
  }

  /**
   * Import rules from JSON
   */
  import(json: string): number {
    try {
      const rules = JSON.parse(json) as any[];
      let imported = 0;

      for (const rule of rules) {
        // Convert pattern string back to RegExp if needed
        if (rule.pattern && typeof rule.pattern === 'string') {
          try {
            rule.pattern = new RegExp(rule.pattern);
          } catch {
            // Keep as string if not valid regex
          }
        }

        this.addRule(rule);
        imported++;
      }

      this.emit('rules-imported', imported);
      return imported;
    } catch (err) {
      this.emit('error', err);
      return 0;
    }
  }

  /**
   * Destroy invalidator
   */
  destroy(): void {
    this.clearRules();
    this.removeAllListeners();
  }
}
