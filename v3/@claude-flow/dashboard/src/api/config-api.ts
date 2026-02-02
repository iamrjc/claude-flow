/**
 * Config API - WP32
 *
 * GET /api/config - Get current configuration
 * PUT /api/config - Update configuration
 * POST /api/config/reload - Reload configuration from disk
 *
 * @module @claude-flow/dashboard/api
 */

export interface ClaudeFlowConfig {
  swarm: {
    topology: string;
    maxAgents: number;
    strategy: string;
    consensus: string;
  };
  memory: {
    backend: string;
    path: string;
    hnsw: boolean;
  };
  performance: {
    autoScaling: boolean;
    maxConcurrentTasks: number;
    taskTimeout: number;
  };
  logging: {
    level: string;
    format: string;
    outputs: string[];
  };
  api: {
    port: number;
    host: string;
    authEnabled: boolean;
  };
}

export interface ConfigUpdateResult {
  success: boolean;
  updated: string[];
  errors?: string[];
  config: ClaudeFlowConfig;
}

export interface ConfigReloadResult {
  success: boolean;
  message: string;
  config: ClaudeFlowConfig;
  timestamp: number;
}

/**
 * Config API - Manage system configuration
 */
export class ConfigAPI {
  private config: ClaudeFlowConfig;
  private originalConfig: ClaudeFlowConfig;

  constructor(initialConfig?: Partial<ClaudeFlowConfig>) {
    this.config = {
      swarm: {
        topology: 'hierarchical',
        maxAgents: 15,
        strategy: 'specialized',
        consensus: 'raft',
      },
      memory: {
        backend: 'hybrid',
        path: './data/memory',
        hnsw: true,
      },
      performance: {
        autoScaling: true,
        maxConcurrentTasks: 50,
        taskTimeout: 300000,
      },
      logging: {
        level: 'info',
        format: 'json',
        outputs: ['console', 'file'],
      },
      api: {
        port: 3000,
        host: 'localhost',
        authEnabled: false,
      },
      ...initialConfig,
    };

    this.originalConfig = JSON.parse(JSON.stringify(this.config));
  }

  /**
   * GET /api/config - Get current configuration
   */
  async getConfig(): Promise<ClaudeFlowConfig> {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * PUT /api/config - Update configuration
   */
  async updateConfig(updates: Partial<ClaudeFlowConfig>): Promise<ConfigUpdateResult> {
    const updated: string[] = [];
    const errors: string[] = [];

    try {
      // Validate and apply updates
      if (updates.swarm) {
        if (updates.swarm.topology) {
          if (!['hierarchical', 'mesh', 'adaptive', 'hybrid'].includes(updates.swarm.topology)) {
            errors.push(`Invalid topology: ${updates.swarm.topology}`);
          } else {
            this.config.swarm.topology = updates.swarm.topology;
            updated.push('swarm.topology');
          }
        }

        if (updates.swarm.maxAgents !== undefined) {
          if (updates.swarm.maxAgents < 1 || updates.swarm.maxAgents > 100) {
            errors.push('maxAgents must be between 1 and 100');
          } else {
            this.config.swarm.maxAgents = updates.swarm.maxAgents;
            updated.push('swarm.maxAgents');
          }
        }

        if (updates.swarm.strategy) {
          if (!['specialized', 'balanced', 'adaptive'].includes(updates.swarm.strategy)) {
            errors.push(`Invalid strategy: ${updates.swarm.strategy}`);
          } else {
            this.config.swarm.strategy = updates.swarm.strategy;
            updated.push('swarm.strategy');
          }
        }

        if (updates.swarm.consensus) {
          if (!['raft', 'byzantine', 'gossip', 'quorum'].includes(updates.swarm.consensus)) {
            errors.push(`Invalid consensus: ${updates.swarm.consensus}`);
          } else {
            this.config.swarm.consensus = updates.swarm.consensus;
            updated.push('swarm.consensus');
          }
        }
      }

      if (updates.memory) {
        if (updates.memory.backend) {
          if (!['sqlite', 'agentdb', 'hybrid'].includes(updates.memory.backend)) {
            errors.push(`Invalid memory backend: ${updates.memory.backend}`);
          } else {
            this.config.memory.backend = updates.memory.backend;
            updated.push('memory.backend');
          }
        }

        if (updates.memory.path) {
          this.config.memory.path = updates.memory.path;
          updated.push('memory.path');
        }

        if (updates.memory.hnsw !== undefined) {
          this.config.memory.hnsw = updates.memory.hnsw;
          updated.push('memory.hnsw');
        }
      }

      if (updates.performance) {
        if (updates.performance.autoScaling !== undefined) {
          this.config.performance.autoScaling = updates.performance.autoScaling;
          updated.push('performance.autoScaling');
        }

        if (updates.performance.maxConcurrentTasks !== undefined) {
          if (updates.performance.maxConcurrentTasks < 1 || updates.performance.maxConcurrentTasks > 1000) {
            errors.push('maxConcurrentTasks must be between 1 and 1000');
          } else {
            this.config.performance.maxConcurrentTasks = updates.performance.maxConcurrentTasks;
            updated.push('performance.maxConcurrentTasks');
          }
        }

        if (updates.performance.taskTimeout !== undefined) {
          if (updates.performance.taskTimeout < 1000 || updates.performance.taskTimeout > 3600000) {
            errors.push('taskTimeout must be between 1000ms and 3600000ms');
          } else {
            this.config.performance.taskTimeout = updates.performance.taskTimeout;
            updated.push('performance.taskTimeout');
          }
        }
      }

      if (updates.logging) {
        if (updates.logging.level) {
          if (!['debug', 'info', 'warn', 'error'].includes(updates.logging.level)) {
            errors.push(`Invalid log level: ${updates.logging.level}`);
          } else {
            this.config.logging.level = updates.logging.level;
            updated.push('logging.level');
          }
        }

        if (updates.logging.format) {
          if (!['json', 'text', 'pretty'].includes(updates.logging.format)) {
            errors.push(`Invalid log format: ${updates.logging.format}`);
          } else {
            this.config.logging.format = updates.logging.format;
            updated.push('logging.format');
          }
        }

        if (updates.logging.outputs) {
          this.config.logging.outputs = updates.logging.outputs;
          updated.push('logging.outputs');
        }
      }

      if (updates.api) {
        if (updates.api.port !== undefined) {
          if (updates.api.port < 1 || updates.api.port > 65535) {
            errors.push('port must be between 1 and 65535');
          } else {
            this.config.api.port = updates.api.port;
            updated.push('api.port');
          }
        }

        if (updates.api.host) {
          this.config.api.host = updates.api.host;
          updated.push('api.host');
        }

        if (updates.api.authEnabled !== undefined) {
          this.config.api.authEnabled = updates.api.authEnabled;
          updated.push('api.authEnabled');
        }
      }

      return {
        success: errors.length === 0,
        updated,
        errors: errors.length > 0 ? errors : undefined,
        config: await this.getConfig(),
      };
    } catch (error) {
      return {
        success: false,
        updated,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        config: await this.getConfig(),
      };
    }
  }

  /**
   * POST /api/config/reload - Reload configuration from disk
   */
  async reloadConfig(): Promise<ConfigReloadResult> {
    try {
      // In a real implementation, this would read from a config file
      // For now, reset to original config
      this.config = JSON.parse(JSON.stringify(this.originalConfig));

      return {
        success: true,
        message: 'Configuration reloaded successfully',
        config: await this.getConfig(),
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to reload configuration',
        config: await this.getConfig(),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.swarm.maxAgents < 1 || this.config.swarm.maxAgents > 100) {
      errors.push('Invalid maxAgents value');
    }

    if (this.config.performance.maxConcurrentTasks < 1) {
      errors.push('Invalid maxConcurrentTasks value');
    }

    if (this.config.performance.taskTimeout < 1000) {
      errors.push('Invalid taskTimeout value');
    }

    if (this.config.api.port < 1 || this.config.api.port > 65535) {
      errors.push('Invalid port value');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get config diff from original
   */
  getConfigDiff(): { changed: string[]; values: Record<string, any> } {
    const changed: string[] = [];
    const values: Record<string, any> = {};

    const checkDiff = (path: string, current: any, original: any) => {
      if (JSON.stringify(current) !== JSON.stringify(original)) {
        changed.push(path);
        values[path] = { current, original };
      }
    };

    checkDiff('swarm', this.config.swarm, this.originalConfig.swarm);
    checkDiff('memory', this.config.memory, this.originalConfig.memory);
    checkDiff('performance', this.config.performance, this.originalConfig.performance);
    checkDiff('logging', this.config.logging, this.originalConfig.logging);
    checkDiff('api', this.config.api, this.originalConfig.api);

    return { changed, values };
  }
}

/**
 * Create config API instance
 */
export function createConfigAPI(initialConfig?: Partial<ClaudeFlowConfig>): ConfigAPI {
  return new ConfigAPI(initialConfig);
}
