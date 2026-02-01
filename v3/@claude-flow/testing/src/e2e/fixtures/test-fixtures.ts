/**
 * E2E Test Fixtures
 *
 * Shared test data for end-to-end integration tests including:
 * - Sample agents, tasks, memories
 * - Mock configurations
 * - Test helpers
 */

/**
 * Agent Type - Extended set for E2E testing
 */
export type AgentType =
  | 'coder'
  | 'researcher'
  | 'reviewer'
  | 'tester'
  | 'architect'
  | 'planner'
  | 'coordinator'
  | 'security-architect'
  | 'security-auditor'
  | 'memory-specialist'
  | 'performance-engineer';

/**
 * Agent Capabilities for E2E testing
 */
export interface AgentCapabilities {
  canCode: boolean;
  canReview: boolean;
  canTest: boolean;
  canResearch: boolean;
  canArchitect: boolean;
  canCoordinate: boolean;
  specializations: string[];
}

/**
 * Sample Agent Templates
 */
export const sampleAgents = {
  coder: {
    type: 'coder' as AgentType,
    name: 'test-coder',
    capabilities: {
      canCode: true,
      canReview: false,
      canTest: false,
      canResearch: false,
      canArchitect: false,
      canCoordinate: false,
      specializations: ['typescript', 'javascript'],
    },
  },
  reviewer: {
    type: 'reviewer' as AgentType,
    name: 'test-reviewer',
    capabilities: {
      canCode: false,
      canReview: true,
      canTest: false,
      canResearch: false,
      canArchitect: false,
      canCoordinate: false,
      specializations: ['code-quality', 'security'],
    },
  },
  tester: {
    type: 'tester' as AgentType,
    name: 'test-tester',
    capabilities: {
      canCode: false,
      canReview: false,
      canTest: true,
      canResearch: false,
      canArchitect: false,
      canCoordinate: false,
      specializations: ['unit-testing', 'e2e-testing'],
    },
  },
  coordinator: {
    type: 'coordinator' as AgentType,
    name: 'test-coordinator',
    capabilities: {
      canCode: false,
      canReview: false,
      canTest: false,
      canResearch: false,
      canArchitect: false,
      canCoordinate: true,
      specializations: ['orchestration', 'planning'],
    },
  },
  researcher: {
    type: 'researcher' as AgentType,
    name: 'test-researcher',
    capabilities: {
      canCode: false,
      canReview: false,
      canTest: false,
      canResearch: true,
      canArchitect: false,
      canCoordinate: false,
      specializations: ['analysis', 'documentation'],
    },
  },
  architect: {
    type: 'architect' as AgentType,
    name: 'test-architect',
    capabilities: {
      canCode: true,
      canReview: true,
      canTest: false,
      canResearch: true,
      canArchitect: true,
      canCoordinate: false,
      specializations: ['system-design', 'patterns'],
    },
  },
  securityArchitect: {
    type: 'security-architect' as AgentType,
    name: 'test-security-architect',
    capabilities: {
      canCode: true,
      canReview: true,
      canTest: false,
      canResearch: true,
      canArchitect: true,
      canCoordinate: false,
      specializations: ['security', 'cryptography'],
    },
  },
  memorySpecialist: {
    type: 'memory-specialist' as AgentType,
    name: 'test-memory-specialist',
    capabilities: {
      canCode: true,
      canReview: false,
      canTest: false,
      canResearch: true,
      canArchitect: true,
      canCoordinate: false,
      specializations: ['memory-management', 'optimization'],
    },
  },
};

/**
 * Sample Task Definitions
 */
export const sampleTasks = {
  simple: {
    type: 'coding' as const,
    name: 'Simple Task',
    description: 'A simple coding task',
    priority: 'normal' as const,
    dependencies: [],
    input: { code: 'console.log("hello")' },
    timeoutMs: 5000,
    retries: 0,
    maxRetries: 3,
    metadata: {},
  },
  complex: {
    type: 'architecture' as const,
    name: 'Complex Task',
    description: 'A complex architecture design task',
    priority: 'high' as const,
    dependencies: [],
    input: { requirements: 'Design microservices architecture' },
    timeoutMs: 30000,
    retries: 0,
    maxRetries: 2,
    metadata: { complexity: 'high' },
  },
  testing: {
    type: 'testing' as const,
    name: 'Test Task',
    description: 'Write comprehensive tests',
    priority: 'normal' as const,
    dependencies: [],
    input: { testSuite: 'unit-tests' },
    timeoutMs: 15000,
    retries: 0,
    maxRetries: 3,
    metadata: {},
  },
  review: {
    type: 'review' as const,
    name: 'Code Review',
    description: 'Review code for quality and security',
    priority: 'high' as const,
    dependencies: [],
    input: { files: ['src/index.ts'] },
    timeoutMs: 10000,
    retries: 0,
    maxRetries: 2,
    metadata: {},
  },
};

/**
 * Sample Memory Entries
 */
export const sampleMemories = {
  pattern: {
    namespace: 'patterns',
    key: 'singleton-pattern',
    value: {
      name: 'Singleton',
      description: 'Ensure a class has only one instance',
      useCase: 'Database connections, configuration',
      code: 'class Singleton { private static instance: Singleton; }',
    },
    metadata: {
      category: 'design-pattern',
      language: 'typescript',
    },
  },
  decision: {
    namespace: 'decisions',
    key: 'architecture-choice',
    value: {
      decision: 'Use microservices architecture',
      rationale: 'Better scalability and independent deployment',
      alternatives: ['monolith', 'modular-monolith'],
      timestamp: new Date().toISOString(),
    },
    metadata: {
      category: 'architecture',
    },
  },
  learning: {
    namespace: 'learnings',
    key: 'optimization-tip',
    value: {
      tip: 'Use HNSW index for fast vector search',
      impact: '150x-12,500x faster than linear search',
      context: 'Large-scale semantic search',
    },
    metadata: {
      category: 'performance',
    },
  },
};

/**
 * Sample Swarm Configurations
 */
export const sampleSwarmConfigs = {
  hierarchical: {
    topology: 'hierarchical' as const,
    maxAgents: 15,
    strategy: 'specialized' as const,
    consensus: {
      algorithm: 'raft' as const,
      threshold: 0.66,
      timeoutMs: 5000,
      maxRounds: 5,
      requireQuorum: true,
    },
  },
  mesh: {
    topology: 'mesh' as const,
    maxAgents: 10,
    strategy: 'balanced' as const,
    consensus: {
      algorithm: 'gossip' as const,
      threshold: 0.75,
      timeoutMs: 3000,
      maxRounds: 3,
      requireQuorum: false,
    },
  },
  adaptive: {
    topology: 'adaptive' as const,
    maxAgents: 20,
    strategy: 'adaptive' as const,
    consensus: {
      algorithm: 'byzantine' as const,
      threshold: 0.66,
      timeoutMs: 10000,
      maxRounds: 7,
      requireQuorum: true,
    },
  },
};

/**
 * Mock Plugin Configurations
 */
export const samplePlugins = {
  hiveMind: {
    name: '@claude-flow/hive-mind',
    version: '3.0.0-alpha.1',
    type: 'coordination' as const,
    config: {
      consensusStrategy: 'raft',
      quorumSize: 3,
      heartbeatMs: 1000,
    },
  },
  neural: {
    name: '@claude-flow/neural',
    version: '3.0.0-alpha.1',
    type: 'intelligence' as const,
    config: {
      modelType: 'SONA',
      enableLearning: true,
      epochs: 10,
    },
  },
  security: {
    name: '@claude-flow/security',
    version: '3.0.0-alpha.1',
    type: 'validation' as const,
    config: {
      enableInputValidation: true,
      enablePathValidation: true,
      scanDepth: 'full',
    },
  },
};

/**
 * Test Helper: Create Agent Template
 */
export function createAgentTemplate(
  type: AgentType,
  overrides?: Partial<typeof sampleAgents.coder>
) {
  const base = sampleAgents[type as keyof typeof sampleAgents] || sampleAgents.coder;
  return {
    ...base,
    ...overrides,
    name: overrides?.name || `${type}-${Date.now()}`,
  };
}

/**
 * Test Helper: Create Task Definition
 */
export function createTaskDefinition(
  type: keyof typeof sampleTasks,
  overrides?: Partial<typeof sampleTasks.simple>
) {
  return {
    ...sampleTasks[type],
    ...overrides,
  };
}

/**
 * Test Helper: Create Memory Entry
 */
export function createMemoryEntry(
  type: keyof typeof sampleMemories,
  overrides?: Partial<typeof sampleMemories.pattern>
) {
  return {
    ...sampleMemories[type],
    ...overrides,
    key: overrides?.key || `${type}-${Date.now()}`,
  };
}

/**
 * Test Helper: Create Swarm Config
 */
export function createSwarmConfig(
  topology: keyof typeof sampleSwarmConfigs,
  overrides?: Partial<typeof sampleSwarmConfigs.hierarchical>
) {
  return {
    ...sampleSwarmConfigs[topology],
    ...overrides,
  };
}

/**
 * Test Data Generator
 */
export class TestDataGenerator {
  private agentCounter = 0;
  private taskCounter = 0;
  private memoryCounter = 0;

  generateAgents(count: number, type: AgentType = 'coder') {
    return Array.from({ length: count }, () => ({
      ...createAgentTemplate(type),
      name: `agent-${this.agentCounter++}`,
    }));
  }

  generateTasks(count: number, taskType: keyof typeof sampleTasks = 'simple') {
    return Array.from({ length: count }, () => ({
      ...createTaskDefinition(taskType),
      name: `task-${this.taskCounter++}`,
    }));
  }

  generateMemories(count: number, memoryType: keyof typeof sampleMemories = 'pattern') {
    return Array.from({ length: count }, () => ({
      ...createMemoryEntry(memoryType),
      key: `memory-${this.memoryCounter++}`,
    }));
  }

  reset() {
    this.agentCounter = 0;
    this.taskCounter = 0;
    this.memoryCounter = 0;
  }
}

/**
 * Create a test data generator instance
 */
export function createTestDataGenerator(): TestDataGenerator {
  return new TestDataGenerator();
}
