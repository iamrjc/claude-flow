/**
 * Neural Plugin
 *
 * Implements ClaudeFlowPlugin interface for SONA, ReasoningBank,
 * pattern recognition, and adaptive learning.
 */

import type { IPlugin } from '../core/plugin-interface.js';
import type {
  PluginMetadata,
  PluginContext,
  PluginLifecycleState,
  MCPToolDefinition,
  HealthCheckResult,
} from '../types/index.js';

import { SONAController, createSONAController } from './sona.js';
import { ReasoningBankWrapper, createReasoningBankWrapper } from './reasoning-bank.js';
import { PatternRecognizer, createPatternRecognizer } from './pattern-recognition.js';
import {
  createLearningAlgorithm,
  createExperienceBuffer,
} from './learning-algorithms.js';
import { AttentionManager, createAttentionManager } from './attention.js';

import type {
  NeuralPluginConfig,
  DEFAULT_NEURAL_PLUGIN_CONFIG,
  LearningAlgorithm,
  ExperienceBuffer,
  SONAControlParams,
  ReasoningBankParams,
  PatternRecognitionParams,
  LearningParams,
  NeuralPluginState,
} from './types.js';

/**
 * Neural Plugin
 *
 * Provides SONA, ReasoningBank, pattern recognition, and learning capabilities
 */
export class NeuralPlugin implements IPlugin {
  readonly metadata: PluginMetadata = {
    name: '@claude-flow/neural-plugin',
    version: '3.0.0-alpha.1',
    description: 'Neural learning plugin with SONA, ReasoningBank, and pattern recognition',
    author: 'Claude Flow Team',
    license: 'MIT',
    dependencies: ['@claude-flow/neural'],
  };

  private _state: PluginLifecycleState = 'uninitialized';
  private context: PluginContext | null = null;
  private config: NeuralPluginConfig;
  private startTime = 0;

  // Core components
  private sona: SONAController | null = null;
  private reasoningBank: ReasoningBankWrapper | null = null;
  private patternRecognizer: PatternRecognizer | null = null;
  private learningAlgorithm: LearningAlgorithm | null = null;
  private experienceBuffer: ExperienceBuffer | null = null;
  private attentionManager: AttentionManager | null = null;

  constructor(config: Partial<NeuralPluginConfig> = {}) {
    this.config = { ...DEFAULT_NEURAL_PLUGIN_CONFIG, ...config };
  }

  get state(): PluginLifecycleState {
    return this._state;
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  /**
   * Initialize plugin
   */
  async initialize(context: PluginContext): Promise<void> {
    if (this._state !== 'uninitialized') {
      throw new Error(`Cannot initialize plugin in state: ${this._state}`);
    }

    this._state = 'initializing';
    this.context = context;
    this.startTime = Date.now();

    try {
      // Initialize SONA
      this.sona = createSONAController(this.config.defaultMode);
      await this.sona.initialize();

      // Initialize ReasoningBank if enabled
      if (this.config.enableReasoningBank) {
        this.reasoningBank = createReasoningBankWrapper({
          maxTrajectories: this.config.maxTrajectories,
          vectorDimension: this.config.vectorDimension,
        });
        await this.reasoningBank.initialize();
      }

      // Initialize pattern recognizer if enabled
      if (this.config.enablePatternRecognition) {
        this.patternRecognizer = createPatternRecognizer({
          maxPatterns: this.config.maxPatterns,
        });
      }

      // Initialize learning algorithm if enabled
      if (this.config.enableLearning) {
        this.learningAlgorithm = createLearningAlgorithm(this.config.algorithm);
        this.experienceBuffer = createExperienceBuffer(10000);
      }

      // Initialize attention manager if enabled
      if (this.config.enableAttention) {
        this.attentionManager = createAttentionManager();
      }

      this._state = 'initialized';
    } catch (error) {
      this._state = 'error';
      throw error;
    }
  }

  /**
   * Shutdown plugin
   */
  async shutdown(): Promise<void> {
    if (this._state !== 'initialized') {
      return;
    }

    this._state = 'shutting-down';

    try {
      // Shutdown SONA
      if (this.sona) {
        await this.sona.shutdown();
        this.sona = null;
      }

      // Shutdown ReasoningBank
      if (this.reasoningBank) {
        await this.reasoningBank.shutdown();
        this.reasoningBank = null;
      }

      // Clear other components
      this.patternRecognizer = null;
      this.learningAlgorithm = null;
      this.experienceBuffer = null;
      this.attentionManager = null;

      this._state = 'shutdown';
    } catch (error) {
      this._state = 'error';
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const issues: string[] = [];

    // Check SONA health
    if (this.sona) {
      const sonaHealth = this.sona.healthCheck();
      if (!sonaHealth.healthy) {
        issues.push(...sonaHealth.issues);
      }
    } else {
      issues.push('SONA not initialized');
    }

    // Check ReasoningBank health
    if (this.config.enableReasoningBank) {
      if (this.reasoningBank) {
        const rbHealth = this.reasoningBank.healthCheck();
        if (!rbHealth.healthy) {
          issues.push(...rbHealth.issues);
        }
      } else {
        issues.push('ReasoningBank not initialized');
      }
    }

    return {
      healthy: issues.length === 0,
      timestamp: Date.now(),
      details: {
        issues,
        state: this._state,
        uptime: Date.now() - this.startTime,
      },
    };
  }

  // ==========================================================================
  // Extension Point Registration
  // ==========================================================================

  /**
   * Register MCP tools
   */
  registerMCPTools(): MCPToolDefinition[] {
    if (!this.config.enableMCPTools) return [];

    return [
      {
        name: 'neural_sona_control',
        description: 'Control SONA: set mode, get stats, apply adaptations',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['setMode', 'getMode', 'getStats', 'adapt'],
              description: 'Action to perform',
            },
            mode: {
              type: 'string',
              enum: ['real-time', 'balanced', 'research', 'edge', 'batch'],
              description: 'SONA mode (for setMode)',
            },
            input: {
              type: 'array',
              items: { type: 'number' },
              description: 'Input vector (for adapt)',
            },
            domain: {
              type: 'string',
              description: 'Domain for adaptation (for adapt)',
            },
          },
          required: ['action'],
        },
        handler: this.handleSONAControl.bind(this),
      },
      {
        name: 'neural_reasoning_bank',
        description: 'ReasoningBank operations: store, retrieve, judge, distill, consolidate',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['store', 'retrieve', 'judge', 'distill', 'consolidate'],
              description: 'Action to perform',
            },
            trajectoryId: {
              type: 'string',
              description: 'Trajectory ID',
            },
            query: {
              type: 'string',
              description: 'Query string (for retrieve)',
            },
            k: {
              type: 'number',
              description: 'Number of results (for retrieve)',
            },
          },
          required: ['action'],
        },
        handler: this.handleReasoningBank.bind(this),
      },
      {
        name: 'neural_pattern_recognition',
        description: 'Pattern recognition: detect, match, compute similarity',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['detect', 'match', 'similarity'],
              description: 'Action to perform',
            },
            context: {
              type: 'string',
              description: 'Context string',
            },
            patternType: {
              type: 'string',
              enum: ['code', 'workflow', 'error', 'success', 'optimization'],
              description: 'Pattern type to detect',
            },
            pattern1: {
              type: 'string',
              description: 'First pattern ID (for similarity)',
            },
            pattern2: {
              type: 'string',
              description: 'Second pattern ID (for similarity)',
            },
          },
          required: ['action'],
        },
        handler: this.handlePatternRecognition.bind(this),
      },
      {
        name: 'neural_learning',
        description: 'Learning operations: train, predict, stats, reset',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['train', 'predict', 'stats', 'reset'],
              description: 'Action to perform',
            },
            trajectoryId: {
              type: 'string',
              description: 'Trajectory ID (for train)',
            },
            state: {
              type: 'array',
              items: { type: 'number' },
              description: 'State vector (for predict)',
            },
            explore: {
              type: 'boolean',
              description: 'Explore vs exploit (for predict)',
            },
          },
          required: ['action'],
        },
        handler: this.handleLearning.bind(this),
      },
    ];
  }

  // ==========================================================================
  // MCP Tool Handlers
  // ==========================================================================

  private async handleSONAControl(params: SONAControlParams): Promise<any> {
    if (!this.sona) throw new Error('SONA not initialized');

    switch (params.action) {
      case 'setMode':
        if (!params.mode) throw new Error('mode required');
        await this.sona.setMode(params.mode);
        return { success: true, mode: params.mode };

      case 'getMode':
        return this.sona.getConfig();

      case 'getStats':
        return this.sona.getStats();

      case 'adapt':
        if (!params.input) throw new Error('input required');
        const input = new Float32Array(params.input);
        const output = await this.sona.applyAdaptations(input, params.domain);
        return { output: Array.from(output) };

      default:
        throw new Error(`Unknown action: ${params.action}`);
    }
  }

  private async handleReasoningBank(params: ReasoningBankParams): Promise<any> {
    if (!this.reasoningBank) throw new Error('ReasoningBank not initialized');

    switch (params.action) {
      case 'retrieve':
        if (!params.query) throw new Error('query required');
        return this.reasoningBank.retrieveByContent(params.query, params.k);

      case 'consolidate':
        return this.reasoningBank.consolidate();

      default:
        throw new Error(`Unknown action: ${params.action}`);
    }
  }

  private async handlePatternRecognition(params: PatternRecognitionParams): Promise<any> {
    if (!this.patternRecognizer) throw new Error('PatternRecognizer not initialized');

    switch (params.action) {
      case 'detect':
        if (!params.context) throw new Error('context required');
        const embedding = new Float32Array(768); // Placeholder
        return this.patternRecognizer.detectPattern(params.context, embedding);

      default:
        throw new Error(`Unknown action: ${params.action}`);
    }
  }

  private async handleLearning(params: LearningParams): Promise<any> {
    if (!this.learningAlgorithm) throw new Error('Learning algorithm not initialized');

    switch (params.action) {
      case 'stats':
        return this.learningAlgorithm.getStats();

      case 'reset':
        this.learningAlgorithm.reset();
        return { success: true };

      case 'predict':
        if (!params.state) throw new Error('state required');
        const state = new Float32Array(params.state);
        const action = this.learningAlgorithm.getAction(state, params.explore ?? true);
        return { action };

      default:
        throw new Error(`Unknown action: ${params.action}`);
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Get plugin state snapshot
   */
  getState(): NeuralPluginState {
    const sonaStats = this.sona?.getStats();

    return {
      mode: sonaStats?.config.mode || 'balanced',
      activeTrajectories: sonaStats?.trajectories.active || 0,
      totalPatterns: sonaStats?.patterns.totalPatterns || 0,
      totalMemories: this.reasoningBank?.getStats().memoryCount || 0,
      learningCycles: sonaStats?.performance.learningCycles || 0,
      avgAdaptationTime: sonaStats?.performance.avgLatencyMs || 0,
      algorithm: this.config.algorithm,
      uptime: Date.now() - this.startTime,
    };
  }
}

/**
 * Factory function
 */
export function createNeuralPlugin(config?: Partial<NeuralPluginConfig>): NeuralPlugin {
  return new NeuralPlugin(config);
}

/**
 * Default export
 */
export default createNeuralPlugin;
