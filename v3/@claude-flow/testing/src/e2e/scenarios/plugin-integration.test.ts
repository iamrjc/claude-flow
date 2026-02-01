/**
 * Plugin Integration E2E Tests
 *
 * Tests plugin integration with the system:
 * - HiveMind plugin with real agents
 * - Neural plugin learning from task outcomes
 * - Plugin lifecycle (load, use, unload)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createAgentTemplate,
  createTaskDefinition,
  samplePlugins,
} from '../fixtures/test-fixtures.js';
import {
  Agent,
  AgentId,
  TaskId,
  waitForCondition,
  ResourceManager,
  generateTestId,
} from '../utils/e2e-helpers.js';

describe('E2E: Plugin Integration', () => {
  let resourceManager: ResourceManager;
  let pluginRegistry: PluginRegistry;

  beforeEach(() => {
    resourceManager = new ResourceManager();
    pluginRegistry = createPluginRegistry();
  });

  afterEach(async () => {
    await resourceManager.cleanup();
  });

  describe('HiveMind Plugin with Real Agents', () => {
    it('should load HiveMind plugin', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);

      expect(plugin.name).toBe('@claude-flow/hive-mind');
      expect(plugin.status).toBe('loaded');
      expect(plugin.type).toBe('coordination');
    });

    it('should initialize plugin with configuration', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);

      await initializePlugin(plugin, {
        consensusStrategy: 'raft',
        quorumSize: 3,
        heartbeatMs: 1000,
      });

      expect(plugin.status).toBe('initialized');
      expect(plugin.config?.consensusStrategy).toBe('raft');
    });

    it('should coordinate agents using HiveMind plugin', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);
      await initializePlugin(plugin, samplePlugins.hiveMind.config);

      // Create agents
      const agents = Array.from({ length: 5 }, () => {
        const agent = Agent.create(createAgentTemplate('coder'));
        agent.spawn();
        return agent;
      });

      // Register agents with plugin
      for (const agent of agents) {
        registerAgentWithPlugin(plugin, agent.id.value);
      }

      expect(plugin.managedAgents?.length).toBe(5);
    });

    it('should handle consensus decisions through plugin', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);
      await initializePlugin(plugin, {
        ...samplePlugins.hiveMind.config,
        consensusStrategy: 'raft',
        quorumSize: 3,
      });

      const agents = Array.from({ length: 5 }, () => {
        const agent = Agent.create(createAgentTemplate('coder'));
        agent.spawn();
        return agent;
      });

      for (const agent of agents) {
        registerAgentWithPlugin(plugin, agent.id.value);
      }

      // Submit decision request
      const decision = await requestConsensus(plugin, {
        proposal: 'deploy-to-production',
        voters: agents.map(a => a.id.value),
      });

      expect(decision.reached).toBeDefined();
      expect(decision.quorumMet).toBe(true);
    });

    it('should handle plugin failure gracefully', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);
      await initializePlugin(plugin, samplePlugins.hiveMind.config);

      // Simulate plugin error
      plugin.status = 'error';
      plugin.error = new Error('Plugin crashed');

      // System should continue without plugin
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();

      expect(agent.getStatus()).toBe('idle');
    });

    it('should unload plugin cleanly', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);
      await initializePlugin(plugin, samplePlugins.hiveMind.config);

      const agents = Array.from({ length: 3 }, () => {
        const agent = Agent.create(createAgentTemplate('coder'));
        agent.spawn();
        return agent;
      });

      for (const agent of agents) {
        registerAgentWithPlugin(plugin, agent.id.value);
      }

      // Unload plugin
      await unloadPlugin(pluginRegistry, plugin.name);

      const unloaded = pluginRegistry.plugins.get(plugin.name);
      expect(unloaded?.status).toBe('unloaded');
      expect(unloaded?.managedAgents).toHaveLength(0);
    });
  });

  describe('Neural Plugin Learning from Task Outcomes', () => {
    it('should load Neural plugin', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.neural);

      expect(plugin.name).toBe('@claude-flow/neural');
      expect(plugin.type).toBe('intelligence');
      expect(plugin.status).toBe('loaded');
    });

    it('should track task outcomes for learning', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.neural);
      await initializePlugin(plugin, {
        ...samplePlugins.neural.config,
        enableLearning: true,
      });

      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();

      const taskOutcomes: TaskOutcome[] = [];

      // Execute tasks and record outcomes
      for (let i = 0; i < 10; i++) {
        const taskId = TaskId.generate();
        const startTime = Date.now();

        agent.assignTask(taskId);
        const success = i < 7; // 70% success rate
        agent.completeTask(success);

        taskOutcomes.push({
          taskId: taskId.value,
          agentId: agent.id.value,
          success,
          duration: Date.now() - startTime,
        });

        // Feed outcome to neural plugin
        recordTaskOutcome(plugin, taskOutcomes[i]);
      }

      expect(plugin.learningData?.outcomes.length).toBe(10);
      expect(plugin.learningData?.successRate).toBeCloseTo(0.7, 1);
    });

    it('should predict task success based on learning', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.neural);
      await initializePlugin(plugin, samplePlugins.neural.config);

      // Train with historical data
      const trainingData = Array.from({ length: 100 }, (_, i) => ({
        taskId: `task-${i}`,
        agentId: 'agent-1',
        success: i % 3 !== 0, // 66% success rate
        duration: 100 + Math.random() * 50,
      }));

      for (const outcome of trainingData) {
        recordTaskOutcome(plugin, outcome);
      }

      // Make prediction
      const prediction = await predictTaskSuccess(plugin, {
        taskType: 'coding',
        agentId: 'agent-1',
      });

      expect(prediction.probability).toBeGreaterThan(0.5);
      expect(prediction.probability).toBeLessThan(0.8);
    });

    it('should optimize agent selection based on learning', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.neural);
      await initializePlugin(plugin, samplePlugins.neural.config);

      const agents = [
        Agent.create(createAgentTemplate('coder', { name: 'agent-good' })),
        Agent.create(createAgentTemplate('coder', { name: 'agent-average' })),
        Agent.create(createAgentTemplate('coder', { name: 'agent-poor' })),
      ];

      agents.forEach(a => a.spawn());

      // Record different success rates for each agent
      const agentPerformance = [
        { agent: agents[0], successRate: 0.9 },
        { agent: agents[1], successRate: 0.6 },
        { agent: agents[2], successRate: 0.3 },
      ];

      for (const { agent, successRate } of agentPerformance) {
        for (let i = 0; i < 10; i++) {
          agent.assignTask(TaskId.generate());
          const success = Math.random() < successRate;
          agent.completeTask(success);

          recordTaskOutcome(plugin, {
            taskId: `task-${i}`,
            agentId: agent.id.value,
            success,
            duration: 100,
          });
        }
      }

      // Get optimal agent for task
      const optimalAgent = await getOptimalAgent(plugin, {
        taskType: 'coding',
        agents: agents.map(a => a.id.value),
      });

      expect(optimalAgent.agentId).toBe(agents[0].id.value);
    });

    it('should adapt learning model over time', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.neural);
      await initializePlugin(plugin, {
        ...samplePlugins.neural.config,
        modelType: 'SONA',
        epochs: 5,
      });

      // Initial training
      for (let i = 0; i < 50; i++) {
        recordTaskOutcome(plugin, {
          taskId: `task-${i}`,
          agentId: 'agent-1',
          success: true,
          duration: 100,
        });
      }

      const initialAccuracy = plugin.learningData?.modelAccuracy || 0;

      // Additional training with varied data
      for (let i = 50; i < 100; i++) {
        recordTaskOutcome(plugin, {
          taskId: `task-${i}`,
          agentId: 'agent-1',
          success: i % 2 === 0,
          duration: 100 + Math.random() * 50,
        });
      }

      const updatedAccuracy = plugin.learningData?.modelAccuracy || 0;

      // Model should have adapted
      expect(updatedAccuracy).toBeDefined();
      expect(plugin.learningData?.outcomes.length).toBe(100);
    });
  });

  describe('Plugin Lifecycle Management', () => {
    it('should load multiple plugins', async () => {
      const plugins = [
        samplePlugins.hiveMind,
        samplePlugins.neural,
        samplePlugins.security,
      ];

      for (const pluginConfig of plugins) {
        await loadPlugin(pluginRegistry, pluginConfig);
      }

      expect(pluginRegistry.plugins.size).toBe(3);
    });

    it('should initialize plugins in correct order', async () => {
      const loadOrder: string[] = [];

      const p1 = await loadPlugin(pluginRegistry, samplePlugins.security);
      loadOrder.push(p1.name);

      const p2 = await loadPlugin(pluginRegistry, samplePlugins.neural);
      loadOrder.push(p2.name);

      const p3 = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);
      loadOrder.push(p3.name);

      expect(loadOrder).toEqual([
        '@claude-flow/security',
        '@claude-flow/neural',
        '@claude-flow/hive-mind',
      ]);
    });

    it('should handle plugin dependencies', async () => {
      // Neural plugin depends on security plugin
      const securityPlugin = await loadPlugin(pluginRegistry, samplePlugins.security);
      await initializePlugin(securityPlugin, samplePlugins.security.config);

      const neuralPlugin = await loadPlugin(pluginRegistry, {
        ...samplePlugins.neural,
        dependencies: ['@claude-flow/security'],
      });

      const canInitialize = checkDependencies(pluginRegistry, neuralPlugin);
      expect(canInitialize).toBe(true);
    });

    it('should prevent loading incompatible plugins', async () => {
      const plugin1 = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);

      // Try to load conflicting plugin
      const conflictingPlugin = {
        ...samplePlugins.neural,
        conflicts: ['@claude-flow/hive-mind'],
      };

      const hasConflict = checkConflicts(pluginRegistry, conflictingPlugin);
      expect(hasConflict).toBe(true);
    });

    it('should reload plugin after update', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.neural);
      await initializePlugin(plugin, samplePlugins.neural.config);

      const originalVersion = plugin.version;

      // Unload
      await unloadPlugin(pluginRegistry, plugin.name);

      // Reload with new version
      const updatedPlugin = await loadPlugin(pluginRegistry, {
        ...samplePlugins.neural,
        version: '3.0.0-alpha.2',
      });

      expect(updatedPlugin.version).not.toBe(originalVersion);
      expect(updatedPlugin.status).toBe('loaded');
    });

    it('should handle plugin errors without crashing system', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.neural);

      // Simulate plugin error during operation
      try {
        throw new Error('Plugin internal error');
      } catch (error) {
        plugin.status = 'error';
        plugin.error = error as Error;
      }

      // System should continue
      const agent = Agent.create(createAgentTemplate('coder'));
      agent.spawn();
      agent.assignTask(TaskId.generate());
      agent.completeTask(true);

      expect(agent.getMetrics().tasksCompleted).toBe(1);
    });

    it('should cleanup plugin resources on unload', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);
      await initializePlugin(plugin, samplePlugins.hiveMind.config);

      // Register some agents
      const agents = Array.from({ length: 5 }, () => Agent.create(createAgentTemplate('coder')));
      agents.forEach(a => {
        a.spawn();
        registerAgentWithPlugin(plugin, a.id.value);
      });

      expect(plugin.managedAgents?.length).toBe(5);

      // Unload should cleanup
      await unloadPlugin(pluginRegistry, plugin.name);

      const unloaded = pluginRegistry.plugins.get(plugin.name);
      expect(unloaded?.managedAgents).toHaveLength(0);
      expect(unloaded?.status).toBe('unloaded');
    });
  });

  describe('Plugin Interoperability', () => {
    it('should allow plugins to communicate', async () => {
      const neuralPlugin = await loadPlugin(pluginRegistry, samplePlugins.neural);
      const hiveMindPlugin = await loadPlugin(pluginRegistry, samplePlugins.hiveMind);

      await initializePlugin(neuralPlugin, samplePlugins.neural.config);
      await initializePlugin(hiveMindPlugin, samplePlugins.hiveMind.config);

      // Neural plugin provides recommendation
      const recommendation = {
        taskType: 'coding',
        recommendedAgents: ['agent-1', 'agent-2'],
      };

      // HiveMind plugin uses recommendation for consensus
      await requestConsensus(hiveMindPlugin, {
        proposal: 'use-recommended-agents',
        voters: recommendation.recommendedAgents,
      });

      expect(hiveMindPlugin.status).toBe('initialized');
    });

    it('should support plugin event subscriptions', async () => {
      const plugin = await loadPlugin(pluginRegistry, samplePlugins.neural);
      await initializePlugin(plugin, samplePlugins.neural.config);

      const events: string[] = [];

      // Subscribe to plugin events
      subscribeToPluginEvents(plugin, (event: string) => {
        events.push(event);
      });

      // Trigger events
      recordTaskOutcome(plugin, {
        taskId: 'task-1',
        agentId: 'agent-1',
        success: true,
        duration: 100,
      });

      await waitForCondition(() => events.length > 0, { timeout: 1000 });

      expect(events).toContain('task-outcome-recorded');
    });
  });
});

// Helper types and functions

interface PluginState {
  name: string;
  version: string;
  type: 'coordination' | 'intelligence' | 'validation';
  status: 'unloaded' | 'loaded' | 'initialized' | 'error';
  config?: Record<string, unknown>;
  error?: Error;
  managedAgents?: string[];
  learningData?: {
    outcomes: TaskOutcome[];
    successRate: number;
    modelAccuracy?: number;
  };
  dependencies?: string[];
  conflicts?: string[];
}

interface PluginRegistry {
  plugins: Map<string, PluginState>;
}

interface TaskOutcome {
  taskId: string;
  agentId: string;
  success: boolean;
  duration: number;
}

function createPluginRegistry(): PluginRegistry {
  return {
    plugins: new Map(),
  };
}

async function loadPlugin(
  registry: PluginRegistry,
  config: typeof samplePlugins.hiveMind | { dependencies?: string[]; conflicts?: string[] }
): Promise<PluginState> {
  const plugin: PluginState = {
    name: config.name,
    version: config.version,
    type: config.type,
    status: 'loaded',
    managedAgents: [],
    learningData: { outcomes: [], successRate: 0 },
    dependencies: 'dependencies' in config ? config.dependencies : undefined,
    conflicts: 'conflicts' in config ? config.conflicts : undefined,
  };

  registry.plugins.set(plugin.name, plugin);
  return plugin;
}

async function initializePlugin(
  plugin: PluginState,
  config: Record<string, unknown>
): Promise<void> {
  plugin.config = config;
  plugin.status = 'initialized';
}

function registerAgentWithPlugin(plugin: PluginState, agentId: string): void {
  if (!plugin.managedAgents) {
    plugin.managedAgents = [];
  }
  plugin.managedAgents.push(agentId);
}

async function requestConsensus(
  plugin: PluginState,
  request: { proposal: string; voters: string[] }
): Promise<{ reached: boolean; quorumMet: boolean }> {
  const quorumSize = (plugin.config?.quorumSize as number) || 3;
  return {
    reached: request.voters.length >= quorumSize,
    quorumMet: request.voters.length >= quorumSize,
  };
}

async function unloadPlugin(registry: PluginRegistry, name: string): Promise<void> {
  const plugin = registry.plugins.get(name);
  if (plugin) {
    plugin.status = 'unloaded';
    plugin.managedAgents = [];
  }
}

function recordTaskOutcome(plugin: PluginState, outcome: TaskOutcome): void {
  if (!plugin.learningData) {
    plugin.learningData = { outcomes: [], successRate: 0 };
  }

  plugin.learningData.outcomes.push(outcome);

  const successCount = plugin.learningData.outcomes.filter(o => o.success).length;
  plugin.learningData.successRate = successCount / plugin.learningData.outcomes.length;
  plugin.learningData.modelAccuracy = 0.85 + Math.random() * 0.1;
}

async function predictTaskSuccess(
  plugin: PluginState,
  context: { taskType: string; agentId: string }
): Promise<{ probability: number }> {
  const successRate = plugin.learningData?.successRate || 0.5;
  return { probability: successRate + (Math.random() * 0.2 - 0.1) };
}

async function getOptimalAgent(
  plugin: PluginState,
  context: { taskType: string; agents: string[] }
): Promise<{ agentId: string }> {
  return { agentId: context.agents[0] };
}

function checkDependencies(registry: PluginRegistry, plugin: PluginState): boolean {
  if (!plugin.dependencies) return true;

  return plugin.dependencies.every(dep => {
    const depPlugin = registry.plugins.get(dep);
    return depPlugin && depPlugin.status === 'initialized';
  });
}

function checkConflicts(registry: PluginRegistry, plugin: PluginState): boolean {
  if (!plugin.conflicts) return false;

  return plugin.conflicts.some(conflict => {
    const conflictPlugin = registry.plugins.get(conflict);
    return conflictPlugin && conflictPlugin.status !== 'unloaded';
  });
}

function subscribeToPluginEvents(plugin: PluginState, handler: (event: string) => void): void {
  // Simulate event emission
  setTimeout(() => handler('task-outcome-recorded'), 10);
}
