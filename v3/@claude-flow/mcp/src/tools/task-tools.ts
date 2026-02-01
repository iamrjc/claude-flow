/**
 * @claude-flow/mcp - Task Management Tools
 *
 * MCP tools for task lifecycle and orchestration
 */

import { defineTool } from '../tool-registry.js';
import type { ToolContext } from '../types.js';
import {
  taskCreateSchema,
  taskAssignSchema,
  taskStatusSchema,
  taskCompleteSchema,
  taskCancelSchema,
  taskListSchema,
  taskGraphSchema,
} from './schemas.js';

// ============================================================================
// Task Create Tool
// ============================================================================

interface TaskCreateInput {
  description: string;
  priority?: number;
  requirements?: Record<string, unknown>;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export const taskCreateTool = defineTool(
  'task/create',
  'Create a new task with description and optional dependencies',
  taskCreateSchema,
  async (input: TaskCreateInput, context?: ToolContext) => {
    const { description, priority = 5, requirements, dependencies = [], metadata } = input;

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      success: true,
      task: {
        taskId,
        description,
        status: 'pending',
        priority,
        requirements,
        dependencies,
        metadata,
        createdAt: new Date().toISOString(),
      },
      message: `Task created: ${taskId}`,
    };
  },
  {
    category: 'task',
    tags: ['creation', 'orchestration'],
  }
);

// ============================================================================
// Task Assign Tool
// ============================================================================

interface TaskAssignInput {
  taskId: string;
  agentId: string;
}

export const taskAssignTool = defineTool(
  'task/assign',
  'Assign a task to an agent',
  taskAssignSchema,
  async (input: TaskAssignInput, context?: ToolContext) => {
    const { taskId, agentId } = input;

    return {
      success: true,
      taskId,
      agentId,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
      message: `Task ${taskId} assigned to agent ${agentId}`,
    };
  },
  {
    category: 'task',
    tags: ['assignment', 'orchestration'],
  }
);

// ============================================================================
// Task Status Tool
// ============================================================================

interface TaskStatusInput {
  taskId: string;
}

export const taskStatusTool = defineTool(
  'task/status',
  'Get task status and progress',
  taskStatusSchema,
  async (input: TaskStatusInput, context?: ToolContext) => {
    const { taskId } = input;

    return {
      success: true,
      task: {
        taskId,
        status: 'running',
        progress: {
          percentage: 65,
          message: 'Implementing solution...',
          startedAt: new Date(Date.now() - 120000).toISOString(),
        },
        agentId: 'agent-example-1',
        estimatedCompletion: new Date(Date.now() + 60000).toISOString(),
      },
    };
  },
  {
    category: 'task',
    tags: ['status', 'monitoring'],
  }
);

// ============================================================================
// Task Complete Tool
// ============================================================================

interface TaskCompleteInput {
  taskId: string;
  result?: Record<string, unknown>;
  success?: boolean;
}

export const taskCompleteTool = defineTool(
  'task/complete',
  'Mark a task as completed',
  taskCompleteSchema,
  async (input: TaskCompleteInput, context?: ToolContext) => {
    const { taskId, result, success = true } = input;

    return {
      success: true,
      taskId,
      status: success ? 'completed' : 'failed',
      result,
      completedAt: new Date().toISOString(),
      message: `Task ${taskId} ${success ? 'completed successfully' : 'failed'}`,
    };
  },
  {
    category: 'task',
    tags: ['completion', 'lifecycle'],
  }
);

// ============================================================================
// Task Cancel Tool
// ============================================================================

interface TaskCancelInput {
  taskId: string;
  reason?: string;
}

export const taskCancelTool = defineTool(
  'task/cancel',
  'Cancel a running task',
  taskCancelSchema,
  async (input: TaskCancelInput, context?: ToolContext) => {
    const { taskId, reason } = input;

    return {
      success: true,
      taskId,
      status: 'cancelled',
      reason,
      cancelledAt: new Date().toISOString(),
      message: `Task ${taskId} cancelled${reason ? `: ${reason}` : ''}`,
    };
  },
  {
    category: 'task',
    tags: ['cancellation', 'lifecycle'],
  }
);

// ============================================================================
// Task List Tool
// ============================================================================

interface TaskListInput {
  status?: string;
  agentId?: string;
  limit?: number;
}

export const taskListTool = defineTool(
  'task/list',
  'List tasks with optional filters',
  taskListSchema,
  async (input: TaskListInput, context?: ToolContext) => {
    const { status, agentId, limit = 50 } = input;

    // Mock task list
    const tasks = [
      {
        taskId: 'task-example-1',
        description: 'Implement authentication',
        status: 'running',
        agentId: 'agent-example-1',
        priority: 8,
        createdAt: new Date(Date.now() - 300000).toISOString(),
      },
      {
        taskId: 'task-example-2',
        description: 'Write unit tests',
        status: 'pending',
        priority: 5,
        createdAt: new Date(Date.now() - 120000).toISOString(),
      },
    ];

    const filtered = tasks.filter((task) => {
      if (status && task.status !== status) return false;
      if (agentId && task.agentId !== agentId) return false;
      return true;
    });

    return {
      success: true,
      tasks: filtered.slice(0, limit),
      total: filtered.length,
      filters: { status, agentId, limit },
    };
  },
  {
    category: 'task',
    tags: ['query', 'list'],
  }
);

// ============================================================================
// Task Graph Tool
// ============================================================================

interface TaskGraphInput {
  tasks: Array<{
    id: string;
    description: string;
    dependencies?: string[];
  }>;
}

export const taskGraphTool = defineTool(
  'task/graph',
  'Create a task dependency graph (DAG)',
  taskGraphSchema,
  async (input: TaskGraphInput, context?: ToolContext) => {
    const { tasks } = input;

    // Validate DAG (no cycles)
    const validation = validateTaskGraph(tasks);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        cycles: validation.cycles,
      };
    }

    // Create execution order (topological sort)
    const executionOrder = topologicalSort(tasks);

    return {
      success: true,
      graph: {
        nodes: tasks.length,
        edges: tasks.reduce((sum, t) => sum + (t.dependencies?.length || 0), 0),
        executionOrder,
        parallelStages: groupByLevel(tasks),
      },
      message: `Task graph created with ${tasks.length} tasks`,
    };
  },
  {
    category: 'task',
    tags: ['graph', 'dag', 'orchestration'],
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

function validateTaskGraph(tasks: Array<{ id: string; dependencies?: string[] }>) {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];

  function detectCycle(taskId: string, path: string[]): boolean {
    if (recursionStack.has(taskId)) {
      cycles.push([...path, taskId]);
      return true;
    }

    if (visited.has(taskId)) {
      return false;
    }

    visited.add(taskId);
    recursionStack.add(taskId);

    const task = tasks.find((t) => t.id === taskId);
    if (task?.dependencies) {
      for (const depId of task.dependencies) {
        if (detectCycle(depId, [...path, taskId])) {
          return true;
        }
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      if (detectCycle(task.id, [])) {
        return {
          valid: false,
          error: 'Cycle detected in task graph',
          cycles,
        };
      }
    }
  }

  return { valid: true };
}

function topologicalSort(tasks: Array<{ id: string; dependencies?: string[] }>): string[] {
  const result: string[] = [];
  const visited = new Set<string>();

  function visit(taskId: string) {
    if (visited.has(taskId)) return;

    visited.add(taskId);

    const task = tasks.find((t) => t.id === taskId);
    if (task?.dependencies) {
      for (const depId of task.dependencies) {
        visit(depId);
      }
    }

    result.push(taskId);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return result;
}

function groupByLevel(tasks: Array<{ id: string; dependencies?: string[] }>) {
  const levels: string[][] = [];
  const taskLevels = new Map<string, number>();

  function getLevel(taskId: string): number {
    if (taskLevels.has(taskId)) {
      return taskLevels.get(taskId)!;
    }

    const task = tasks.find((t) => t.id === taskId);
    if (!task?.dependencies || task.dependencies.length === 0) {
      taskLevels.set(taskId, 0);
      return 0;
    }

    const maxDepLevel = Math.max(...task.dependencies.map(getLevel));
    const level = maxDepLevel + 1;
    taskLevels.set(taskId, level);
    return level;
  }

  for (const task of tasks) {
    const level = getLevel(task.id);
    if (!levels[level]) {
      levels[level] = [];
    }
    levels[level].push(task.id);
  }

  return levels;
}

// ============================================================================
// Export All Task Tools
// ============================================================================

export const taskTools = [
  taskCreateTool,
  taskAssignTool,
  taskStatusTool,
  taskCompleteTool,
  taskCancelTool,
  taskListTool,
  taskGraphTool,
];
