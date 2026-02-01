/**
 * Task Graph - Domain Model
 *
 * Directed Acyclic Graph (DAG) for complex task workflows.
 * Supports topological sorting and parallel execution detection.
 *
 * @module v3/agents/domain/models
 */

import { Task, TaskStatus } from './task.js';

/**
 * Graph node representing a task and its dependencies
 */
interface GraphNode {
  task: Task;
  incoming: Set<string>; // Tasks that must complete before this one
  outgoing: Set<string>; // Tasks that depend on this one
}

/**
 * Execution level - tasks that can run in parallel
 */
export interface ExecutionLevel {
  level: number;
  tasks: Task[];
}

/**
 * Task Graph - DAG
 *
 * Manages complex task workflows with dependency tracking.
 * Provides topological sorting and parallel execution planning.
 */
export class TaskGraph {
  private _nodes: Map<string, GraphNode>;

  constructor() {
    this._nodes = new Map();
  }

  /**
   * Add a task to the graph
   */
  addTask(task: Task): void {
    if (this._nodes.has(task.id.value)) {
      throw new Error(`Task ${task.id.value} already exists in graph`);
    }

    const node: GraphNode = {
      task,
      incoming: new Set(task.blockedBy),
      outgoing: new Set(task.blocks),
    };

    this._nodes.set(task.id.value, node);

    // Update outgoing edges of dependencies
    for (const depId of task.blockedBy) {
      const depNode = this._nodes.get(depId);
      if (depNode) {
        depNode.outgoing.add(task.id.value);
      }
    }

    // Update incoming edges of dependents
    for (const depId of task.blocks) {
      const depNode = this._nodes.get(depId);
      if (depNode) {
        depNode.incoming.add(task.id.value);
      }
    }
  }

  /**
   * Remove a task from the graph
   */
  removeTask(taskId: string): boolean {
    const node = this._nodes.get(taskId);
    if (!node) {
      return false;
    }

    // Remove from incoming edges of dependents
    for (const outId of node.outgoing) {
      const outNode = this._nodes.get(outId);
      if (outNode) {
        outNode.incoming.delete(taskId);
      }
    }

    // Remove from outgoing edges of dependencies
    for (const inId of node.incoming) {
      const inNode = this._nodes.get(inId);
      if (inNode) {
        inNode.outgoing.delete(taskId);
      }
    }

    return this._nodes.delete(taskId);
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this._nodes.get(taskId)?.task;
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this._nodes.values()).map(node => node.task);
  }

  /**
   * Check if graph contains a task
   */
  hasTask(taskId: string): boolean {
    return this._nodes.has(taskId);
  }

  /**
   * Get dependencies of a task
   */
  getDependencies(taskId: string): Task[] {
    const node = this._nodes.get(taskId);
    if (!node) {
      return [];
    }

    const deps: Task[] = [];
    for (const depId of node.incoming) {
      const depNode = this._nodes.get(depId);
      if (depNode) {
        deps.push(depNode.task);
      }
    }
    return deps;
  }

  /**
   * Get dependents of a task (tasks that depend on this one)
   */
  getDependents(taskId: string): Task[] {
    const node = this._nodes.get(taskId);
    if (!node) {
      return [];
    }

    const deps: Task[] = [];
    for (const depId of node.outgoing) {
      const depNode = this._nodes.get(depId);
      if (depNode) {
        deps.push(depNode.task);
      }
    }
    return deps;
  }

  /**
   * Check if graph has cycles (invalid DAG)
   */
  hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = this._nodes.get(nodeId);
      if (!node) return false;

      for (const outId of node.outgoing) {
        if (!visited.has(outId)) {
          if (dfs(outId)) return true;
        } else if (recursionStack.has(outId)) {
          return true; // Cycle detected
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this._nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) return true;
      }
    }

    return false;
  }

  /**
   * Topological sort - Get execution order
   *
   * Returns tasks in order of execution (dependencies first)
   * Throws error if graph has cycles
   */
  topologicalSort(): Task[] {
    if (this.hasCycle()) {
      throw new Error('Cannot perform topological sort: graph contains cycles');
    }

    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: Task[] = [];

    // Calculate in-degree for each node
    for (const [nodeId, node] of this._nodes) {
      inDegree.set(nodeId, node.incoming.size);
      if (node.incoming.size === 0) {
        queue.push(nodeId);
      }
    }

    // Process nodes with no incoming edges
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = this._nodes.get(nodeId);
      if (!node) continue;

      result.push(node.task);

      // Reduce in-degree of dependents
      for (const outId of node.outgoing) {
        const currentDegree = inDegree.get(outId) ?? 0;
        const newDegree = currentDegree - 1;
        inDegree.set(outId, newDegree);

        if (newDegree === 0) {
          queue.push(outId);
        }
      }
    }

    if (result.length !== this._nodes.size) {
      throw new Error('Topological sort failed: graph may contain cycles');
    }

    return result;
  }

  /**
   * Get execution levels for parallel execution
   *
   * Groups tasks into levels where tasks in the same level
   * can be executed in parallel
   */
  getExecutionLevels(): ExecutionLevel[] {
    if (this.hasCycle()) {
      throw new Error('Cannot determine execution levels: graph contains cycles');
    }

    const levels: ExecutionLevel[] = [];
    const inDegree = new Map<string, number>();
    const levelMap = new Map<string, number>();

    // Calculate in-degree for each node
    for (const [nodeId, node] of this._nodes) {
      inDegree.set(nodeId, node.incoming.size);
    }

    // Assign levels using BFS
    let currentLevel = 0;
    let queue: string[] = [];

    // Find all nodes with no dependencies (level 0)
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
        levelMap.set(nodeId, 0);
      }
    }

    while (queue.length > 0) {
      const nextQueue: string[] = [];

      for (const nodeId of queue) {
        const node = this._nodes.get(nodeId);
        if (!node) continue;

        // Process all outgoing edges
        for (const outId of node.outgoing) {
          const currentDegree = inDegree.get(outId) ?? 0;
          const newDegree = currentDegree - 1;
          inDegree.set(outId, newDegree);

          if (newDegree === 0) {
            nextQueue.push(outId);
            levelMap.set(outId, currentLevel + 1);
          }
        }
      }

      // Add current level to results
      const tasksAtLevel = queue
        .map(id => this._nodes.get(id)?.task)
        .filter((task): task is Task => task !== undefined);

      if (tasksAtLevel.length > 0) {
        levels.push({
          level: currentLevel,
          tasks: tasksAtLevel,
        });
      }

      queue = nextQueue;
      currentLevel++;
    }

    return levels;
  }

  /**
   * Get ready tasks (no pending dependencies)
   */
  getReadyTasks(): Task[] {
    const completedIds = new Set<string>();

    for (const [nodeId, node] of this._nodes) {
      if (node.task.status === TaskStatus.COMPLETED) {
        completedIds.add(nodeId);
      }
    }

    const ready: Task[] = [];

    for (const node of this._nodes.values()) {
      if (
        node.task.status === TaskStatus.QUEUED &&
        node.task.areDependenciesSatisfied(completedIds)
      ) {
        ready.push(node.task);
      }
    }

    return ready;
  }

  /**
   * Get blocked tasks (have pending dependencies)
   */
  getBlockedTasks(): Task[] {
    const completedIds = new Set<string>();

    for (const [nodeId, node] of this._nodes) {
      if (node.task.status === TaskStatus.COMPLETED) {
        completedIds.add(nodeId);
      }
    }

    const blocked: Task[] = [];

    for (const node of this._nodes.values()) {
      if (
        node.task.status === TaskStatus.QUEUED &&
        !node.task.areDependenciesSatisfied(completedIds)
      ) {
        blocked.push(node.task);
      }
    }

    return blocked;
  }

  /**
   * Get graph statistics
   */
  getStatistics(): {
    totalTasks: number;
    maxLevel: number;
    maxParallelism: number;
    averageParallelism: number;
  } {
    const levels = this.getExecutionLevels();
    const maxLevel = levels.length;
    const maxParallelism = Math.max(...levels.map(l => l.tasks.length), 0);
    const averageParallelism = levels.length > 0
      ? levels.reduce((sum, l) => sum + l.tasks.length, 0) / levels.length
      : 0;

    return {
      totalTasks: this._nodes.size,
      maxLevel,
      maxParallelism,
      averageParallelism,
    };
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this._nodes.clear();
  }

  /**
   * Get size
   */
  get size(): number {
    return this._nodes.size;
  }

  /**
   * Convert to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      nodes: this._nodes.size,
      tasks: Array.from(this._nodes.values()).map(node => ({
        id: node.task.id.value,
        incoming: Array.from(node.incoming),
        outgoing: Array.from(node.outgoing),
      })),
      statistics: this.getStatistics(),
    };
  }
}
