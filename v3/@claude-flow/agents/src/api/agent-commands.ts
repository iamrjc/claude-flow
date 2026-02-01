/**
 * Agent CLI Commands
 *
 * Command interfaces for CLI integration.
 *
 * @module @claude-flow/agents/api/agent-commands
 */

import { AgentLifecycleService } from '../application/services/agent-lifecycle-service.js';
import {
  AgentId,
  AgentType,
  AgentTemplate,
  AgentCapabilities,
  AgentStatus,
} from '../domain/models/agent.js';
import { PoolId, ScalingConfig } from '../domain/models/agent-pool.js';

/**
 * Command result
 */
export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Spawn Agent Command
 */
export interface SpawnAgentArgs {
  type: AgentType;
  name?: string;
  capabilities?: string[]; // Simplified capabilities for CLI
  config?: Record<string, unknown>;
}

export class SpawnAgentCommand {
  constructor(private agentService: AgentLifecycleService) {}

  async execute(args: SpawnAgentArgs): Promise<CommandResult> {
    try {
      const template = this.createTemplate(args);
      const agentId = await this.agentService.spawnAgent(template);

      return {
        success: true,
        message: `Agent spawned successfully: ${agentId.value}`,
        data: {
          agentId: agentId.value,
          type: args.type,
          name: args.name,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to spawn agent: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private createTemplate(args: SpawnAgentArgs): AgentTemplate {
    const capabilities = this.parseCapabilities(args.type, args.capabilities);

    return {
      type: args.type,
      capabilities,
      name: args.name,
      config: args.config,
    };
  }

  private parseCapabilities(type: AgentType, capabilities?: string[]): AgentCapabilities {
    // Default capabilities based on type
    const defaults: AgentCapabilities = {
      canCode: type === 'coder' || type === 'architect',
      canReview: type === 'reviewer' || type === 'architect',
      canTest: type === 'tester',
      canResearch: type === 'researcher' || type === 'architect',
      canArchitect: type === 'architect',
      canCoordinate: type === 'coordinator' || type === 'planner',
      specializations: capabilities || [type],
    };

    return defaults;
  }
}

/**
 * Terminate Agent Command
 */
export interface TerminateAgentArgs {
  agentId: string;
}

export class TerminateAgentCommand {
  constructor(private agentService: AgentLifecycleService) {}

  async execute(args: TerminateAgentArgs): Promise<CommandResult> {
    try {
      const agentId = AgentId.from(args.agentId);
      await this.agentService.terminateAgent(agentId);

      return {
        success: true,
        message: `Agent terminated successfully: ${args.agentId}`,
        data: { agentId: args.agentId },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to terminate agent: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * List Agents Command
 */
export interface ListAgentsArgs {
  type?: AgentType;
  status?: AgentStatus;
  minHealthScore?: number;
}

export class ListAgentsCommand {
  constructor(private agentService: AgentLifecycleService) {}

  async execute(args: ListAgentsArgs = {}): Promise<CommandResult> {
    try {
      const agents = await this.agentService.listAgents(args);

      const agentData = agents.map((agent) => ({
        id: agent.id.value,
        type: agent.getType(),
        status: agent.getStatus(),
        name: agent.getName(),
        metrics: agent.getMetrics().toJSON(),
        health: agent.reportHealth().healthScore,
      }));

      return {
        success: true,
        message: `Found ${agents.length} agent(s)`,
        data: {
          count: agents.length,
          agents: agentData,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to list agents: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * Agent Health Command
 */
export interface AgentHealthArgs {
  agentId: string;
}

export class AgentHealthCommand {
  constructor(private agentService: AgentLifecycleService) {}

  async execute(args: AgentHealthArgs): Promise<CommandResult> {
    try {
      const agentId = AgentId.from(args.agentId);
      const health = await this.agentService.getAgentHealth(agentId);

      return {
        success: true,
        message: `Agent health retrieved`,
        data: health.toJSON(),
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get agent health: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * Create Pool Command
 */
export interface CreatePoolArgs {
  type: AgentType;
  name?: string;
  minSize: number;
  maxSize: number;
  targetSize: number;
  scaleUpThreshold?: number;
  scaleDownThreshold?: number;
  cooldownPeriod?: number;
}

export class CreatePoolCommand {
  constructor(private agentService: AgentLifecycleService) {}

  async execute(args: CreatePoolArgs): Promise<CommandResult> {
    try {
      const scalingConfig: ScalingConfig = {
        minSize: args.minSize,
        maxSize: args.maxSize,
        targetSize: args.targetSize,
        scaleUpThreshold: args.scaleUpThreshold || 0.8,
        scaleDownThreshold: args.scaleDownThreshold || 0.2,
        cooldownPeriod: args.cooldownPeriod || 60000, // 1 minute default
      };

      const poolId = await this.agentService.createPool(args.type, scalingConfig, args.name);

      return {
        success: true,
        message: `Pool created successfully: ${poolId.value}`,
        data: {
          poolId: poolId.value,
          type: args.type,
          name: args.name,
          scalingConfig,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create pool: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * Scale Pool Command
 */
export interface ScalePoolArgs {
  poolId: string;
  targetSize: number;
}

export class ScalePoolCommand {
  constructor(private agentService: AgentLifecycleService) {}

  async execute(args: ScalePoolArgs): Promise<CommandResult> {
    try {
      const poolId = PoolId.from(args.poolId);
      await this.agentService.scalePool(poolId, args.targetSize);

      return {
        success: true,
        message: `Pool scaled successfully to ${args.targetSize} agents`,
        data: {
          poolId: args.poolId,
          targetSize: args.targetSize,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to scale pool: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * Get Statistics Command
 */
export class GetStatisticsCommand {
  constructor(private agentService: AgentLifecycleService) {}

  async execute(): Promise<CommandResult> {
    try {
      const stats = await this.agentService.getStatistics();

      return {
        success: true,
        message: 'Statistics retrieved successfully',
        data: stats,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
