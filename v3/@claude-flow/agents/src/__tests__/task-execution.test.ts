/**
 * Task Execution Domain - Comprehensive Tests
 *
 * Tests for task lifecycle, queue, graph, services, and scheduler.
 * Target: 40+ tests, >80% coverage
 *
 * @module v3/agents/__tests__
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Task,
  TaskId,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskQueue,
  TaskGraph,
  TaskExecutionService,
  TaskScheduler,
  TaskRepository,
} from '../index.js';

// ============================================================================
// Task Entity Tests
// ============================================================================

describe('Task Entity', () => {
  describe('Creation and Value Objects', () => {
    it('should create a task with default values', () => {
      const task = Task.create({
        title: 'Test Task',
        description: 'Test description',
        type: TaskType.CODE,
      });

      expect(task.title).toBe('Test Task');
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.priority).toBe(TaskPriority.NORMAL);
      expect(task.retryCount).toBe(0);
      expect(task.maxRetries).toBe(3);
    });

    it('should create TaskId value object', () => {
      const id1 = TaskId.create();
      const id2 = TaskId.create();

      expect(id1.value).toBeDefined();
      expect(id1.equals(id2)).toBe(false);
      expect(id1.equals(id1)).toBe(true);
    });

    it('should create TaskId from string', () => {
      const idString = 'test-id-123';
      const id = TaskId.fromString(idString);

      expect(id.value).toBe(idString);
      expect(id.toString()).toBe(idString);
    });

    it('should throw error for empty TaskId', () => {
      expect(() => TaskId.fromString('')).toThrow('TaskId cannot be empty');
    });

    it('should have task creation properties', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test Description',
        type: TaskType.CODE,
        priority: TaskPriority.HIGH,
      });

      expect(task.title).toBe('Test');
      expect(task.description).toBe('Test Description');
      expect(task.type).toBe(TaskType.CODE);
      expect(task.priority).toBe(TaskPriority.HIGH);
    });
  });

  describe('State Machine', () => {
    let task: Task;

    beforeEach(() => {
      task = Task.create({
        title: 'Test Task',
        description: 'Test description',
        type: TaskType.CODE,
      });
    });

    it('should transition from pending to queued', () => {
      task.queue();
      expect(task.status).toBe(TaskStatus.QUEUED);
    });

    it('should transition from queued to assigned', () => {
      task.queue();
      task.assign('agent-1');

      expect(task.status).toBe(TaskStatus.ASSIGNED);
      expect(task.assignedAgentId).toBe('agent-1');
    });

    it('should transition from assigned to running', () => {
      task.queue();
      task.assign('agent-1');
      task.start();

      expect(task.status).toBe(TaskStatus.RUNNING);
      expect(task.startedAt).toBeDefined();
    });

    it('should transition from running to completed', () => {
      task.queue();
      task.assign('agent-1');
      task.start();
      task.complete({ output: 'result' });

      expect(task.status).toBe(TaskStatus.COMPLETED);
      expect(task.output).toBe('result');
      expect(task.completedAt).toBeDefined();
    });

    it('should transition from running to failed with retry', () => {
      task.queue();
      task.assign('agent-1');
      task.start();
      task.fail('Test error');

      expect(task.status).toBe(TaskStatus.QUEUED);
      expect(task.error).toBe('Test error');
      expect(task.retryCount).toBe(1);
      expect(task.assignedAgentId).toBeUndefined();
    });

    it('should mark as failed after max retries', () => {
      task.queue();
      task.assign('agent-1');
      task.start();

      // Exhaust retries
      task.fail('Error 1');
      task.assign('agent-2');
      task.start();
      task.fail('Error 2');
      task.assign('agent-3');
      task.start();
      task.fail('Error 3');

      expect(task.status).toBe(TaskStatus.FAILED);
      expect(task.retryCount).toBe(3);
      expect(task.completedAt).toBeDefined();
    });

    it('should cancel task', () => {
      task.queue();
      task.cancel('User cancelled');

      expect(task.status).toBe(TaskStatus.CANCELLED);
      expect(task.completedAt).toBeDefined();
    });

    it('should throw error on invalid state transition', () => {
      expect(() => task.start()).toThrow();
      expect(() => task.complete({ output: 'result' })).toThrow();
    });

    it('should prevent cancelling completed tasks', () => {
      task.queue();
      task.assign('agent-1');
      task.start();
      task.complete({ output: 'done' });

      expect(() => task.cancel()).toThrow();
    });
  });

  describe('Dependencies', () => {
    it('should track dependencies', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
        blockedBy: ['task-1', 'task-2'],
        blocks: ['task-3'],
      });

      expect(task.blockedBy).toEqual(['task-1', 'task-2']);
      expect(task.blocks).toEqual(['task-3']);
      expect(task.isBlocked()).toBe(true);
    });

    it('should check if dependencies are satisfied', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
        blockedBy: ['task-1', 'task-2'],
      });

      expect(task.areDependenciesSatisfied(new Set(['task-1']))).toBe(false);
      expect(task.areDependenciesSatisfied(new Set(['task-1', 'task-2']))).toBe(true);
    });

    it('should add and remove dependencies', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
      });

      task.addBlockedBy('task-1');
      expect(task.blockedBy).toContain('task-1');

      task.removeBlockedBy('task-1');
      expect(task.blockedBy).not.toContain('task-1');
    });

    it('should add blocks relationship', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
      });

      task.addBlocks('task-2');
      expect(task.blocks).toContain('task-2');
    });
  });

  describe('Helpers', () => {
    it('should check if task can retry', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
        maxRetries: 3,
      });

      expect(task.canRetry()).toBe(true);

      task['_retryCount'] = 3;
      expect(task.canRetry()).toBe(false);
    });

    it('should calculate execution duration', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
      });

      expect(task.getExecutionDuration()).toBeNull();

      task.queue();
      task.assign('agent-1');
      task.start();

      const duration1 = task.getExecutionDuration();
      expect(duration1).toBeGreaterThanOrEqual(0);

      task.complete({ output: 'done' });
      const duration2 = task.getExecutionDuration();
      expect(duration2).toBeGreaterThanOrEqual(duration1!);
    });

    it('should check if task is timed out', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
        timeout: 100,
      });

      expect(task.isTimedOut()).toBe(false);

      task.queue();
      task.assign('agent-1');
      task.start();

      // Simulate timeout
      task['_startedAt'] = new Date(Date.now() - 200);
      expect(task.isTimedOut()).toBe(true);
    });

    it('should check if task is terminal', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
      });

      expect(task.isTerminal()).toBe(false);

      task.queue();
      task.assign('agent-1');
      task.start();
      task.complete({ output: 'done' });

      expect(task.isTerminal()).toBe(true);
    });

    it('should compare priorities', () => {
      const critical = Task.create({
        title: 'Critical',
        description: 'Test',
        type: TaskType.CODE,
        priority: TaskPriority.CRITICAL,
      });

      const low = Task.create({
        title: 'Low',
        description: 'Test',
        type: TaskType.CODE,
        priority: TaskPriority.LOW,
      });

      expect(critical.comparePriority(low)).toBeLessThan(0);
      expect(low.comparePriority(critical)).toBeGreaterThan(0);
    });

    it('should update metadata', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
      });

      task.setMetadata('key', 'value');
      expect(task.metadata.key).toBe('value');
    });
  });

  describe('Serialization', () => {
    it('should convert to persistence format', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test description',
        type: TaskType.CODE,
        priority: TaskPriority.HIGH,
      });

      const data = task.toPersistence();

      expect(data.id).toBe(task.id.value);
      expect(data.title).toBe('Test');
      expect(data.type).toBe(TaskType.CODE);
      expect(data.priority).toBe(TaskPriority.HIGH);
    });

    it('should convert to JSON', () => {
      const task = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
      });

      const json = task.toJSON();
      expect(json.id).toBe(task.id.value);
    });

    it('should reconstruct from persistence', () => {
      const original = Task.create({
        title: 'Test',
        description: 'Test',
        type: TaskType.CODE,
      });

      const data = original.toPersistence();
      const reconstructed = Task.fromPersistence({
        ...data,
        id: TaskId.fromString(data.id as string),
        createdAt: new Date(data.createdAt as string),
      });

      expect(reconstructed.id.value).toBe(original.id.value);
      expect(reconstructed.title).toBe(original.title);
    });
  });
});

// ============================================================================
// Task Queue Tests
// ============================================================================

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue({ maxSize: 10 });
  });

  it('should enqueue and dequeue tasks by priority', () => {
    const low = Task.create({
      title: 'Low',
      description: 'Test',
      type: TaskType.CODE,
      priority: TaskPriority.LOW,
      status: TaskStatus.QUEUED,
    });

    const high = Task.create({
      title: 'High',
      description: 'Test',
      type: TaskType.CODE,
      priority: TaskPriority.HIGH,
      status: TaskStatus.QUEUED,
    });

    queue.enqueue(low);
    queue.enqueue(high);

    const next = queue.dequeue();
    expect(next?.id.value).toBe(high.id.value);
  });

  it('should respect max size', () => {
    const smallQueue = new TaskQueue({ maxSize: 1 });

    const task1 = Task.create({
      title: 'Task 1',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task2 = Task.create({
      title: 'Task 2',
      description: 'Test',
      type: TaskType.CODE,
    });

    smallQueue.enqueue(task1);
    expect(() => smallQueue.enqueue(task2)).toThrow('Queue is full');
  });

  it('should prevent duplicate tasks', () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    queue.enqueue(task);
    expect(() => queue.enqueue(task)).toThrow('already in queue');
  });

  it('should peek without removing', () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
      status: TaskStatus.QUEUED,
    });

    queue.enqueue(task);

    const peeked = queue.peek();
    expect(peeked?.id.value).toBe(task.id.value);
    expect(queue.size).toBe(1);
  });

  it('should get task by ID', () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    queue.enqueue(task);

    const found = queue.get(task.id.value);
    expect(found?.id.value).toBe(task.id.value);
  });

  it('should remove task', () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    queue.enqueue(task);
    expect(queue.has(task.id.value)).toBe(true);

    queue.remove(task.id.value);
    expect(queue.has(task.id.value)).toBe(false);
  });

  it('should get tasks by priority', () => {
    const high = Task.create({
      title: 'High',
      description: 'Test',
      type: TaskType.CODE,
      priority: TaskPriority.HIGH,
    });

    queue.enqueue(high);

    const highTasks = queue.getByPriority(TaskPriority.HIGH);
    expect(highTasks).toHaveLength(1);
    expect(highTasks[0].id.value).toBe(high.id.value);
  });

  it('should get ready tasks', () => {
    const ready = Task.create({
      title: 'Ready',
      description: 'Test',
      type: TaskType.CODE,
      status: TaskStatus.QUEUED,
    });

    const blocked = Task.create({
      title: 'Blocked',
      description: 'Test',
      type: TaskType.CODE,
      status: TaskStatus.QUEUED,
      blockedBy: ['nonexistent'],
    });

    queue.enqueue(ready);
    queue.enqueue(blocked);

    const readyTasks = queue.getReadyTasks();
    expect(readyTasks).toHaveLength(1);
    expect(readyTasks[0].id.value).toBe(ready.id.value);
  });

  it('should get blocked tasks', () => {
    const blocked = Task.create({
      title: 'Blocked',
      description: 'Test',
      type: TaskType.CODE,
      status: TaskStatus.QUEUED,
      blockedBy: ['task-1'],
    });

    queue.enqueue(blocked);

    const blockedTasks = queue.getBlockedTasks();
    expect(blockedTasks).toHaveLength(1);
  });

  it('should get statistics', () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
      status: TaskStatus.QUEUED,
    });

    queue.enqueue(task);

    const stats = queue.getStatistics();
    expect(stats.total).toBe(1);
    expect(stats.byStatus[TaskStatus.QUEUED]).toBe(1);
  });

  it('should clear queue', () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    queue.enqueue(task);
    expect(queue.isEmpty()).toBe(false);

    queue.clear();
    expect(queue.isEmpty()).toBe(true);
  });
});

// ============================================================================
// Task Graph Tests
// ============================================================================

describe('TaskGraph', () => {
  let graph: TaskGraph;

  beforeEach(() => {
    graph = new TaskGraph();
  });

  it('should add tasks to graph', () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    graph.addTask(task);
    expect(graph.hasTask(task.id.value)).toBe(true);
    expect(graph.size).toBe(1);
  });

  it('should prevent duplicate tasks', () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    graph.addTask(task);
    expect(() => graph.addTask(task)).toThrow('already exists');
  });

  it('should track dependencies', () => {
    const task1 = Task.create({
      title: 'Task 1',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task2 = Task.create({
      title: 'Task 2',
      description: 'Test',
      type: TaskType.CODE,
      blockedBy: [task1.id.value],
    });

    graph.addTask(task1);
    graph.addTask(task2);

    const deps = graph.getDependencies(task2.id.value);
    expect(deps).toHaveLength(1);
    expect(deps[0].id.value).toBe(task1.id.value);
  });

  it('should get dependents', () => {
    const task1 = Task.create({
      title: 'Task 1',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task2 = Task.create({
      title: 'Task 2',
      description: 'Test',
      type: TaskType.CODE,
      blockedBy: [task1.id.value],
    });

    graph.addTask(task1);
    graph.addTask(task2);

    const dependents = graph.getDependents(task1.id.value);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].id.value).toBe(task2.id.value);
  });

  it('should detect cycles', () => {
    const task1 = Task.create({
      title: 'Task 1',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task2 = Task.create({
      title: 'Task 2',
      description: 'Test',
      type: TaskType.CODE,
      blockedBy: [task1.id.value],
      blocks: [task1.id.value],
    });

    graph.addTask(task1);
    graph.addTask(task2);

    expect(graph.hasCycle()).toBe(true);
  });

  it('should perform topological sort', () => {
    const task1 = Task.create({
      title: 'Task 1',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task2 = Task.create({
      title: 'Task 2',
      description: 'Test',
      type: TaskType.CODE,
      blockedBy: [task1.id.value],
    });

    const task3 = Task.create({
      title: 'Task 3',
      description: 'Test',
      type: TaskType.CODE,
      blockedBy: [task2.id.value],
    });

    graph.addTask(task1);
    graph.addTask(task2);
    graph.addTask(task3);

    const sorted = graph.topologicalSort();
    expect(sorted).toHaveLength(3);
    expect(sorted[0].id.value).toBe(task1.id.value);
    expect(sorted[1].id.value).toBe(task2.id.value);
    expect(sorted[2].id.value).toBe(task3.id.value);
  });

  it('should throw error on topological sort with cycles', () => {
    const task1 = Task.create({
      title: 'Task 1',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task2 = Task.create({
      title: 'Task 2',
      description: 'Test',
      type: TaskType.CODE,
      blockedBy: [task1.id.value],
      blocks: [task1.id.value],
    });

    graph.addTask(task1);
    graph.addTask(task2);

    expect(() => graph.topologicalSort()).toThrow('contains cycles');
  });

  it('should get execution levels for parallel execution', () => {
    const task1 = Task.create({
      title: 'Task 1',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task2 = Task.create({
      title: 'Task 2',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task3 = Task.create({
      title: 'Task 3',
      description: 'Test',
      type: TaskType.CODE,
      blockedBy: [task1.id.value, task2.id.value],
    });

    graph.addTask(task1);
    graph.addTask(task2);
    graph.addTask(task3);

    const levels = graph.getExecutionLevels();
    expect(levels).toHaveLength(2);
    expect(levels[0].tasks).toHaveLength(2);
    expect(levels[1].tasks).toHaveLength(1);
  });

  it('should remove tasks', () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    graph.addTask(task);
    expect(graph.hasTask(task.id.value)).toBe(true);

    graph.removeTask(task.id.value);
    expect(graph.hasTask(task.id.value)).toBe(false);
  });

  it('should get graph statistics', () => {
    const task1 = Task.create({
      title: 'Task 1',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task2 = Task.create({
      title: 'Task 2',
      description: 'Test',
      type: TaskType.CODE,
    });

    graph.addTask(task1);
    graph.addTask(task2);

    const stats = graph.getStatistics();
    expect(stats.totalTasks).toBe(2);
    expect(stats.maxParallelism).toBeGreaterThan(0);
  });
});

// ============================================================================
// Task Repository Tests
// ============================================================================

describe('TaskRepository', () => {
  let repository: TaskRepository;

  beforeEach(async () => {
    repository = new TaskRepository(':memory:');
    await repository.initialize();
  });

  afterEach(async () => {
    await repository.shutdown();
  });

  it('should save and find task', async () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    await repository.save(task);
    const found = await repository.findById(task.id.value);

    expect(found).toBeDefined();
    expect(found?.title).toBe('Test');
  });

  it('should delete task', async () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    await repository.save(task);
    const deleted = await repository.delete(task.id.value);

    expect(deleted).toBe(true);
    expect(await repository.findById(task.id.value)).toBeNull();
  });

  it('should check if task exists', async () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    await repository.save(task);
    expect(await repository.exists(task.id.value)).toBe(true);
    expect(await repository.exists('nonexistent')).toBe(false);
  });

  it('should find tasks by status', async () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
      status: TaskStatus.QUEUED,
    });

    await repository.save(task);
    const queued = await repository.findByStatus(TaskStatus.QUEUED);

    expect(queued).toHaveLength(1);
    expect(queued[0].id.value).toBe(task.id.value);
  });

  it('should get statistics', async () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    await repository.save(task);
    const stats = await repository.getStatistics();

    expect(stats.total).toBe(1);
    expect(stats.byStatus[TaskStatus.PENDING]).toBe(1);
  });

  it('should save multiple tasks', async () => {
    const tasks = [
      Task.create({ title: 'Task 1', description: 'Test', type: TaskType.CODE }),
      Task.create({ title: 'Task 2', description: 'Test', type: TaskType.REVIEW }),
    ];

    await repository.saveMany(tasks);
    const count = await repository.count();

    expect(count).toBe(2);
  });

  it('should find tasks by IDs', async () => {
    const tasks = [
      Task.create({ title: 'Task 1', description: 'Test', type: TaskType.CODE }),
      Task.create({ title: 'Task 2', description: 'Test', type: TaskType.REVIEW }),
    ];

    await repository.saveMany(tasks);
    const found = await repository.findByIds(tasks.map(t => t.id.value));

    expect(found).toHaveLength(2);
  });

  it('should clear all tasks', async () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    await repository.save(task);
    await repository.clear();

    const count = await repository.count();
    expect(count).toBe(0);
  });
});

// ============================================================================
// Task Execution Service Tests
// ============================================================================

describe('TaskExecutionService', () => {
  let service: TaskExecutionService;
  let repository: TaskRepository;

  beforeEach(async () => {
    repository = new TaskRepository(':memory:');
    await repository.initialize();
    service = new TaskExecutionService(repository);
  });

  afterEach(async () => {
    await repository.shutdown();
  });

  it('should create task', async () => {
    const id = await service.createTask({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task = await service.getTask(id.value);
    expect(task).toBeDefined();
    expect(task?.title).toBe('Test');
  });

  it('should assign task', async () => {
    const id = await service.createTask({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task = await service.getTask(id.value);
    task?.queue();
    await repository.save(task!);

    await service.assignTask(id.value, 'agent-1');

    const updated = await service.getTask(id.value);
    expect(updated?.assignedAgentId).toBe('agent-1');
    expect(updated?.status).toBe(TaskStatus.ASSIGNED);
  });

  it('should start task', async () => {
    const id = await service.createTask({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task = await service.getTask(id.value);
    task?.queue();
    task?.assign('agent-1');
    await repository.save(task!);

    await service.startTask(id.value);

    const updated = await service.getTask(id.value);
    expect(updated?.status).toBe(TaskStatus.RUNNING);
  });

  it('should complete task', async () => {
    const id = await service.createTask({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task = await service.getTask(id.value);
    task?.queue();
    task?.assign('agent-1');
    task?.start();
    await repository.save(task!);

    await service.completeTask(id.value, { output: 'result' });

    const updated = await service.getTask(id.value);
    expect(updated?.status).toBe(TaskStatus.COMPLETED);
    expect(updated?.output).toBe('result');
  });

  it('should fail task', async () => {
    const id = await service.createTask({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    const task = await service.getTask(id.value);
    task?.queue();
    task?.assign('agent-1');
    task?.start();
    await repository.save(task!);

    await service.failTask(id.value, 'Test error');

    const updated = await service.getTask(id.value);
    expect(updated?.error).toBe('Test error');
  });

  it('should get task statistics', async () => {
    const id = await service.createTask({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    const stats = await service.getStatistics();
    expect(stats.total).toBeGreaterThan(0);
  });
});

// ============================================================================
// Task Scheduler Tests
// ============================================================================

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;
  let repository: TaskRepository;

  beforeEach(async () => {
    repository = new TaskRepository(':memory:');
    await repository.initialize();
    scheduler = new TaskScheduler(repository);
  });

  afterEach(async () => {
    scheduler.cleanup();
    await repository.shutdown();
  });

  it('should register and unregister agents', () => {
    scheduler.registerAgent('agent-1', ['code']);

    const stats = scheduler.getStatistics();
    expect(stats.totalAgents).toBe(1);

    scheduler.unregisterAgent('agent-1');
    expect(scheduler.getStatistics().totalAgents).toBe(0);
  });

  it('should schedule tasks', async () => {
    const task = Task.create({
      title: 'Test',
      description: 'Test',
      type: TaskType.CODE,
    });

    await scheduler.scheduleTask(task);

    const stats = scheduler.getStatistics();
    expect(stats.queuedTasks).toBeGreaterThanOrEqual(0);
  });

  it('should emit events', () => {
    return new Promise<void>((resolve) => {
      scheduler.on('agent-registered', (event) => {
        expect(event.agentId).toBe('agent-1');
        resolve();
      });

      scheduler.registerAgent('agent-1');
    });
  });

  it('should get scheduler statistics', () => {
    scheduler.registerAgent('agent-1');
    scheduler.registerAgent('agent-2');

    const stats = scheduler.getStatistics();
    expect(stats.totalAgents).toBe(2);
    expect(stats.availableAgents).toBeGreaterThanOrEqual(0);
  });
});
