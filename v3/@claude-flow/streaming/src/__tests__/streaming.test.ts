/**
 * Streaming Module Unit Tests
 *
 * Tests for WP30: Event Streaming (SSE)
 * Coverage target: >80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEServer, SSEClient, TaskStream, AgentStream, LLMStream } from '../index.js';
import { TaskStatus, AgentStatus, LogLevel, ConnectionState } from '../index.js';
import type { SSEEvent } from '../index.js';
import { EventEmitter } from 'events';

// Mock HTTP server
class MockResponse extends EventEmitter {
  statusCode = 0;
  headers: Record<string, string | string[]> = {};
  writtenData: string[] = [];
  ended = false;

  writeHead(statusCode: number, headers?: Record<string, string | string[]>): this {
    this.statusCode = statusCode;
    if (headers) {
      this.headers = { ...this.headers, ...headers };
    }
    return this;
  }

  setHeader(name: string, value: string | string[]): void {
    this.headers[name] = value;
  }

  write(data: string): boolean {
    this.writtenData.push(data);
    return true;
  }

  end(data?: string): void {
    if (data) {
      this.writtenData.push(data);
    }
    this.ended = true;
    this.emit('finish');
  }
}

class MockRequest extends EventEmitter {
  method = 'GET';
  url = '/';
  headers: Record<string, string> = { host: 'localhost:3000' };

  constructor(options: Partial<{ method: string; url: string; headers: Record<string, string> }> = {}) {
    super();
    Object.assign(this, options);
  }
}

describe('SSEServer', () => {
  let server: SSEServer;

  afterEach(async () => {
    if (server?.running) {
      await server.stop();
    }
  });

  it('should create server with default config', () => {
    server = new SSEServer();
    expect(server).toBeDefined();
    expect(server.running).toBe(false);
  });

  it('should create server with custom config', () => {
    server = new SSEServer({
      port: 4000,
      host: '0.0.0.0',
      keepAliveInterval: 30000,
      compression: false,
      maxClients: 500,
    });
    expect(server).toBeDefined();
  });

  it('should start and stop HTTP/1.1 server', async () => {
    server = new SSEServer({ port: 3001 });

    const startedPromise = new Promise((resolve) => {
      server.once('started', resolve);
    });

    await server.start();
    await startedPromise;

    expect(server.running).toBe(true);

    const stoppedPromise = new Promise((resolve) => {
      server.once('stopped', resolve);
    });

    await server.stop();
    await stoppedPromise;

    expect(server.running).toBe(false);
  });

  it('should not start server twice', async () => {
    server = new SSEServer({ port: 3002 });
    await server.start();

    await expect(server.start()).rejects.toThrow('SSE server is already running');

    await server.stop();
  });

  it('should broadcast event to all clients', async () => {
    server = new SSEServer({ port: 3003 });
    await server.start();

    // Simulate client connection via private method testing
    const mockRes1 = new MockResponse();
    const mockRes2 = new MockResponse();

    // Add clients directly to test broadcast
    (server as any).clients.set('client-1', {
      id: 'client-1',
      response: mockRes1,
      connectedAt: new Date(),
      lastActivity: new Date(),
    });

    (server as any).clients.set('client-2', {
      id: 'client-2',
      response: mockRes2,
      connectedAt: new Date(),
      lastActivity: new Date(),
    });

    const event: SSEEvent = {
      event: 'test',
      data: { message: 'Hello' },
    };

    const sentCount = server.broadcast(event);
    expect(sentCount).toBe(2);

    expect(mockRes1.writtenData.length).toBeGreaterThan(0);
    expect(mockRes2.writtenData.length).toBeGreaterThan(0);

    await server.stop();
  });

  it('should send event to specific client', async () => {
    server = new SSEServer({ port: 3004 });
    await server.start();

    const mockRes = new MockResponse();
    (server as any).clients.set('client-1', {
      id: 'client-1',
      response: mockRes,
      connectedAt: new Date(),
      lastActivity: new Date(),
    });

    const success = server.sendToClient('client-1', {
      event: 'test',
      data: { message: 'Hello' },
    });

    expect(success).toBe(true);
    expect(mockRes.writtenData.length).toBeGreaterThan(0);

    await server.stop();
  });

  it('should return false when sending to non-existent client', async () => {
    server = new SSEServer({ port: 3005 });
    await server.start();

    const success = server.sendToClient('non-existent', {
      event: 'test',
      data: { message: 'Hello' },
    });

    expect(success).toBe(false);

    await server.stop();
  });

  it('should filter events based on client filters', async () => {
    server = new SSEServer({ port: 3006 });
    await server.start();

    const mockRes = new MockResponse();
    (server as any).clients.set('client-1', {
      id: 'client-1',
      response: mockRes,
      connectedAt: new Date(),
      lastActivity: new Date(),
      filters: ['task:started', 'task:completed'],
    });

    // Should be sent (matches filter)
    server.sendToClient('client-1', {
      event: 'task:started',
      data: { taskId: '123' },
    });

    // Should be filtered out
    server.sendToClient('client-1', {
      event: 'agent:spawned',
      data: { agentId: '456' },
    });

    expect(mockRes.writtenData.length).toBe(1);

    await server.stop();
  });

  it('should get client statistics', async () => {
    server = new SSEServer({ port: 3007 });
    await server.start();

    const mockRes = new MockResponse();
    (server as any).clients.set('client-1', {
      id: 'client-1',
      response: mockRes,
      connectedAt: new Date(),
      lastActivity: new Date(),
    });

    const stats = server.getStats();
    expect(stats.isRunning).toBe(true);
    expect(stats.clientCount).toBe(1);

    await server.stop();
  });

  it('should get connected clients', async () => {
    server = new SSEServer({ port: 3008 });
    await server.start();

    const mockRes = new MockResponse();
    (server as any).clients.set('client-1', {
      id: 'client-1',
      response: mockRes,
      connectedAt: new Date(),
      lastActivity: new Date(),
    });

    const clients = server.getClients();
    expect(clients).toHaveLength(1);
    expect(clients[0].id).toBe('client-1');

    await server.stop();
  });

  it('should format SSE message correctly', () => {
    server = new SSEServer();

    const message = (server as any).formatSSEMessage({
      id: '123',
      event: 'test',
      data: { hello: 'world' },
      retry: 5000,
    });

    expect(message).toContain('id: 123');
    expect(message).toContain('event: test');
    expect(message).toContain('retry: 5000');
    expect(message).toContain('data: ');
    expect(message).toContain('"hello":"world"');
    expect(message).toMatch(/\n\n$/);
  });
});

describe('TaskStream', () => {
  let server: SSEServer;
  let taskStream: TaskStream;

  beforeEach(async () => {
    server = new SSEServer({ port: 3100 });
    await server.start();
    taskStream = new TaskStream(server);
    taskStream.start();
  });

  afterEach(async () => {
    taskStream.stop();
    await server.stop();
  });

  it('should emit task created event', async () => {
    const promise = new Promise<void>((resolve) => {
      taskStream.once('taskCreated', (data) => {
        expect(data.taskId).toBe('task-1');
        expect(data.status).toBe(TaskStatus.PENDING);
        expect(data.name).toBe('Test Task');
        resolve();
      });
    });

    taskStream.emitTaskCreated('task-1', { name: 'Test Task' });
    await promise;
  });

  it('should emit task queued event', async () => {
    taskStream.emitTaskCreated('task-2');

    const promise = new Promise<void>((resolve) => {
      taskStream.once('taskQueued', (data) => {
        expect(data.taskId).toBe('task-2');
        expect(data.status).toBe(TaskStatus.QUEUED);
        resolve();
      });
    });

    taskStream.emitTaskQueued('task-2');
    await promise;
  });

  it('should emit task assigned event', async () => {
    taskStream.emitTaskCreated('task-3');

    const promise = new Promise<void>((resolve) => {
      taskStream.once('taskAssigned', (data) => {
        expect(data.taskId).toBe('task-3');
        expect(data.status).toBe(TaskStatus.ASSIGNED);
        expect(data.agentId).toBe('agent-1');
        resolve();
      });
    });

    taskStream.emitTaskAssigned('task-3', 'agent-1');
    await promise;
  });

  it('should emit task started event', async () => {
    taskStream.emitTaskCreated('task-4');

    const promise = new Promise<void>((resolve) => {
      taskStream.once('taskStarted', (data) => {
        expect(data.taskId).toBe('task-4');
        expect(data.status).toBe(TaskStatus.RUNNING);
        resolve();
      });
    });

    taskStream.emitTaskStarted('task-4');
    await promise;
  });

  it('should emit task progress event', async () => {
    taskStream.emitTaskCreated('task-5');
    taskStream.emitTaskStarted('task-5');

    const promise = new Promise<void>((resolve) => {
      taskStream.once('taskProgress', (progress) => {
        expect(progress.taskId).toBe('task-5');
        expect(progress.percentage).toBe(50);
        expect(progress.currentStep).toBe('Processing');
        resolve();
      });
    });

    taskStream.emitProgress('task-5', {
      percentage: 50,
      currentStep: 'Processing',
      totalSteps: 10,
      currentStepNumber: 5,
    });
    await promise;
  });

  it('should throttle progress updates', () => {
    taskStream.emitTaskCreated('task-6');
    taskStream.emitTaskStarted('task-6');

    let progressCount = 0;
    taskStream.on('taskProgress', () => {
      progressCount++;
    });

    // Emit multiple progress updates quickly
    taskStream.emitProgress('task-6', { percentage: 10, currentStep: 'Step 1' });
    taskStream.emitProgress('task-6', { percentage: 20, currentStep: 'Step 2' });
    taskStream.emitProgress('task-6', { percentage: 30, currentStep: 'Step 3' });

    // Should only emit one due to throttling
    expect(progressCount).toBeLessThanOrEqual(1);
  });

  it('should emit intermediate result', async () => {
    const promise = new Promise<void>((resolve) => {
      taskStream.once('intermediateResult', (result) => {
        expect(result.taskId).toBe('task-7');
        expect(result.type).toBe('partial');
        expect(result.sequence).toBe(1);
        expect(result.data).toEqual({ partial: 'data' });
        resolve();
      });
    });

    taskStream.emitIntermediateResult({
      taskId: 'task-7',
      data: { partial: 'data' },
      type: 'partial',
      sequence: 1,
    });
    await promise;
  });

  it('should emit task completed event', async () => {
    taskStream.emitTaskCreated('task-8');
    taskStream.emitTaskStarted('task-8');

    const promise = new Promise<void>((resolve) => {
      taskStream.once('taskCompleted', (data) => {
        expect(data.taskId).toBe('task-8');
        expect(data.status).toBe(TaskStatus.COMPLETED);
        expect(data.result).toEqual({ output: 'success' });
        resolve();
      });
    });

    taskStream.emitTaskCompleted('task-8', { result: { output: 'success' } });
    await promise;
  });

  it('should emit task failed event', async () => {
    taskStream.emitTaskCreated('task-9');
    taskStream.emitTaskStarted('task-9');

    const promise = new Promise<void>((resolve) => {
      taskStream.once('taskFailed', (data) => {
        expect(data.taskId).toBe('task-9');
        expect(data.status).toBe(TaskStatus.FAILED);
        expect(data.error).toBe('Task execution failed');
        resolve();
      });
    });

    taskStream.emitTaskFailed('task-9', 'Task execution failed');
    await promise;
  });

  it('should emit task cancelled event', async () => {
    taskStream.emitTaskCreated('task-10');

    const promise = new Promise<void>((resolve) => {
      taskStream.once('taskCancelled', (data) => {
        expect(data.taskId).toBe('task-10');
        expect(data.status).toBe(TaskStatus.CANCELLED);
        resolve();
      });
    });

    taskStream.emitTaskCancelled('task-10');
    await promise;
  });

  it('should emit task metrics', async () => {
    taskStream.emitTaskCreated('task-11');

    const promise = new Promise<void>((resolve) => {
      taskStream.once('taskMetrics', ({ taskId, metrics }) => {
        expect(taskId).toBe('task-11');
        expect(metrics.executionTime).toBe(1500);
        expect(metrics.cpuUsage).toBe(45);
        resolve();
      });
    });

    taskStream.emitMetrics('task-11', {
      executionTime: 1500,
      cpuUsage: 45,
      memoryUsage: 1024000,
    });
    await promise;
  });

  it('should get task state', () => {
    taskStream.emitTaskCreated('task-12', { name: 'State Test' });

    const state = taskStream.getTaskState('task-12');
    expect(state).toBeDefined();
    expect(state?.taskId).toBe('task-12');
    expect(state?.name).toBe('State Test');
  });

  it('should get all task states', () => {
    taskStream.emitTaskCreated('task-13');
    taskStream.emitTaskCreated('task-14');

    const states = taskStream.getAllTaskStates();
    expect(states.length).toBeGreaterThanOrEqual(2);
  });

  it('should clear task state', () => {
    taskStream.emitTaskCreated('task-15');
    taskStream.clearTaskState('task-15');

    const state = taskStream.getTaskState('task-15');
    expect(state).toBeUndefined();
  });
});

describe('AgentStream', () => {
  let server: SSEServer;
  let agentStream: AgentStream;

  beforeEach(async () => {
    server = new SSEServer({ port: 3200 });
    await server.start();
    agentStream = new AgentStream(server);
    agentStream.start();
  });

  afterEach(async () => {
    agentStream.stop();
    await server.stop();
  });

  it('should emit agent spawned event', async () => {
    const promise = new Promise<void>((resolve) => {
      agentStream.once('agentSpawned', (data) => {
        expect(data.agentId).toBe('agent-1');
        expect(data.status).toBe(AgentStatus.IDLE);
        expect(data.name).toBe('coder-1');
        expect(data.type).toBe('coder');
        resolve();
      });
    });

    agentStream.emitAgentSpawned('agent-1', {
      name: 'coder-1',
      type: 'coder',
    });
    await promise;
  });

  it('should emit agent started event', async () => {
    agentStream.emitAgentSpawned('agent-2');

    const promise = new Promise<void>((resolve) => {
      agentStream.once('agentStarted', (data) => {
        expect(data.agentId).toBe('agent-2');
        expect(data.status).toBe(AgentStatus.BUSY);
        expect(data.currentTaskId).toBe('task-1');
        resolve();
      });
    });

    agentStream.emitAgentStarted('agent-2', 'task-1');
    await promise;
  });

  it('should emit agent stopped event', async () => {
    agentStream.emitAgentSpawned('agent-3');

    const promise = new Promise<void>((resolve) => {
      agentStream.once('agentStopped', (data) => {
        expect(data.agentId).toBe('agent-3');
        expect(data.status).toBe(AgentStatus.STOPPED);
        resolve();
      });
    });

    agentStream.emitAgentStopped('agent-3');
    await promise;
  });

  it('should emit agent error event', async () => {
    agentStream.emitAgentSpawned('agent-4');

    const promise = new Promise<void>((resolve) => {
      agentStream.once('agentError', (data) => {
        expect(data.agentId).toBe('agent-4');
        expect(data.status).toBe(AgentStatus.ERROR);
        expect(data.error).toBe('Agent crashed');
        resolve();
      });
    });

    agentStream.emitAgentError('agent-4', 'Agent crashed');
    await promise;
  });

  it('should emit stdout output', async () => {
    const promise = new Promise<void>((resolve) => {
      agentStream.once('agentOutput', (output) => {
        expect(output.agentId).toBe('agent-5');
        expect(output.stream).toBe('stdout');
        expect(output.data).toBe('Processing file...');
        resolve();
      });
    });

    agentStream.emitOutput('agent-5', 'stdout', 'Processing file...');
    await promise;
  });

  it('should emit stderr output', async () => {
    const promise = new Promise<void>((resolve) => {
      agentStream.once('agentOutput', (output) => {
        expect(output.agentId).toBe('agent-6');
        expect(output.stream).toBe('stderr');
        expect(output.data).toBe('Warning: deprecated API');
        resolve();
      });
    });

    agentStream.emitOutput('agent-6', 'stderr', 'Warning: deprecated API');
    await promise;
  });

  it('should buffer output', () => {
    agentStream.emitOutput('agent-7', 'stdout', 'Line 1');
    agentStream.emitOutput('agent-7', 'stdout', 'Line 2');
    agentStream.emitOutput('agent-7', 'stdout', 'Line 3');

    const buffer = agentStream.getOutputBuffer('agent-7');
    expect(buffer).toHaveLength(3);
    expect(buffer).toEqual(['Line 1', 'Line 2', 'Line 3']);
  });

  it('should emit log message', async () => {
    const promise = new Promise<void>((resolve) => {
      agentStream.once('agentLog', (log) => {
        expect(log.agentId).toBe('agent-8');
        expect(log.level).toBe(LogLevel.INFO);
        expect(log.message).toBe('Task completed');
        expect(log.context?.taskId).toBe('task-1');
        resolve();
      });
    });

    agentStream.emitLog('agent-8', LogLevel.INFO, 'Task completed', {
      taskId: 'task-1',
    });
    await promise;
  });

  it('should emit agent metrics', async () => {
    const promise = new Promise<void>((resolve) => {
      agentStream.once('agentMetrics', ({ agentId, metrics }) => {
        expect(agentId).toBe('agent-9');
        expect(metrics.cpuUsage).toBe(45);
        expect(metrics.memoryUsage).toBe(1024000);
        expect(metrics.tasksCompleted).toBe(5);
        resolve();
      });
    });

    agentStream.emitMetrics('agent-9', {
      cpuUsage: 45,
      memoryUsage: 1024000,
      tasksCompleted: 5,
    });
    await promise;
  });

  it('should throttle metrics updates', () => {
    let metricsCount = 0;
    agentStream.on('agentMetrics', () => {
      metricsCount++;
    });

    // Emit multiple metrics quickly
    agentStream.emitMetrics('agent-10', { cpuUsage: 10 });
    agentStream.emitMetrics('agent-10', { cpuUsage: 20 });
    agentStream.emitMetrics('agent-10', { cpuUsage: 30 });

    // Should only emit one due to throttling
    expect(metricsCount).toBeLessThanOrEqual(1);
  });

  it('should emit health status', async () => {
    const promise = new Promise<void>((resolve) => {
      agentStream.once('agentHealth', ({ agentId, health }) => {
        expect(agentId).toBe('agent-11');
        expect(health.healthy).toBe(true);
        expect(health.score).toBe(95);
        resolve();
      });
    });

    agentStream.emitHealth('agent-11', {
      healthy: true,
      score: 95,
      lastCheck: new Date(),
    });
    await promise;
  });

  it('should get agent state', () => {
    agentStream.emitAgentSpawned('agent-12', { name: 'test-agent' });

    const state = agentStream.getAgentState('agent-12');
    expect(state).toBeDefined();
    expect(state?.agentId).toBe('agent-12');
    expect(state?.name).toBe('test-agent');
  });

  it('should clear agent state', () => {
    agentStream.emitAgentSpawned('agent-13');
    agentStream.clearAgentState('agent-13');

    const state = agentStream.getAgentState('agent-13');
    expect(state).toBeUndefined();
  });
});

describe('LLMStream', () => {
  let server: SSEServer;
  let llmStream: LLMStream;

  beforeEach(async () => {
    server = new SSEServer({ port: 3300 });
    await server.start();
    llmStream = new LLMStream(server);
    llmStream.start();
  });

  afterEach(async () => {
    llmStream.stop();
    await server.stop();
  });

  it('should emit request started event', async () => {
    const promise = new Promise<void>((resolve) => {
      llmStream.once('requestStarted', (data) => {
        expect(data.requestId).toBe('req-1');
        expect(data.provider).toBe('anthropic');
        expect(data.model).toBe('claude-3-opus');
        resolve();
      });
    });

    llmStream.emitRequestStarted('req-1', {
      provider: 'anthropic',
      model: 'claude-3-opus',
      messages: [{ role: 'user', content: 'Hello!' }],
    });
    await promise;
  });

  it('should emit token chunks', async () => {
    llmStream.emitRequestStarted('req-2', {
      provider: 'anthropic',
      model: 'claude-3-opus',
      messages: [],
    });

    let tokenCount = 0;
    const promise = new Promise<void>((resolve) => {
      llmStream.on('token', (token) => {
        tokenCount++;
        expect(token.requestId).toBe('req-2');
        if (tokenCount === 2) {
          resolve();
        }
      });
    });

    llmStream.emitToken('req-2', { token: 'Hello', index: 0 });
    llmStream.emitToken('req-2', { token: ' world', index: 1 });
    await promise;
  });

  it('should buffer tokens', () => {
    llmStream.emitRequestStarted('req-3', {
      provider: 'anthropic',
      model: 'claude-3-opus',
      messages: [],
    });

    llmStream.emitToken('req-3', { token: 'Hello', index: 0 });
    llmStream.emitToken('req-3', { token: ' ', index: 1 });
    llmStream.emitToken('req-3', { token: 'world', index: 2 });

    const buffer = llmStream.getTokenBuffer('req-3');
    expect(buffer).toEqual(['Hello', ' ', 'world']);

    const fullResponse = llmStream.getFullResponse('req-3');
    expect(fullResponse).toBe('Hello world');
  });

  it('should emit tool call event', async () => {
    llmStream.emitRequestStarted('req-4', {
      provider: 'anthropic',
      model: 'claude-3-opus',
      messages: [],
    });

    const promise = new Promise<void>((resolve) => {
      llmStream.once('toolCall', (toolCall) => {
        expect(toolCall.requestId).toBe('req-4');
        expect(toolCall.toolName).toBe('get_weather');
        expect(toolCall.isComplete).toBe(true);
        resolve();
      });
    });

    llmStream.emitToolCall('req-4', {
      toolCallId: 'tool-1',
      toolName: 'get_weather',
      arguments: '{"city": "San Francisco"}',
      isComplete: true,
    });
    await promise;
  });

  it('should emit tool result event', async () => {
    llmStream.emitRequestStarted('req-5', {
      provider: 'anthropic',
      model: 'claude-3-opus',
      messages: [],
    });

    const promise = new Promise<void>((resolve) => {
      llmStream.once('toolResult', (result) => {
        expect(result.requestId).toBe('req-5');
        expect(result.toolName).toBe('get_weather');
        expect(result.result).toEqual({ temp: 72, conditions: 'sunny' });
        resolve();
      });
    });

    llmStream.emitToolResult('req-5', {
      toolCallId: 'tool-1',
      toolName: 'get_weather',
      result: { temp: 72, conditions: 'sunny' },
      executionTime: 150,
    });
    await promise;
  });

  it('should emit usage statistics', async () => {
    llmStream.emitRequestStarted('req-6', {
      provider: 'anthropic',
      model: 'claude-3-opus',
      messages: [],
    });

    const promise = new Promise<void>((resolve) => {
      llmStream.once('usage', ({ requestId, usage }) => {
        expect(requestId).toBe('req-6');
        expect(usage.promptTokens).toBe(100);
        expect(usage.completionTokens).toBe(50);
        expect(usage.totalTokens).toBe(150);
        expect(usage.cost).toBe(0.005);
        resolve();
      });
    });

    llmStream.emitUsage('req-6', {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cost: 0.005,
    });
    await promise;
  });

  it('should emit request completed event', async () => {
    llmStream.emitRequestStarted('req-7', {
      provider: 'anthropic',
      model: 'claude-3-opus',
      messages: [],
    });

    const promise = new Promise<void>((resolve) => {
      llmStream.once('requestCompleted', (data) => {
        expect(data.requestId).toBe('req-7');
        expect(data.response).toBe('Hello there!');
        expect(data.duration).toBe(1200);
        resolve();
      });
    });

    llmStream.emitRequestCompleted('req-7', {
      response: 'Hello there!',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      duration: 1200,
    });
    await promise;
  });

  it('should emit request error event', async () => {
    llmStream.emitRequestStarted('req-8', {
      provider: 'anthropic',
      model: 'claude-3-opus',
      messages: [],
    });

    const promise = new Promise<void>((resolve) => {
      llmStream.once('requestError', (error) => {
        expect(error.requestId).toBe('req-8');
        expect(error.error).toBe('Rate limit exceeded');
        expect(error.errorType).toBe('rate_limit');
        expect(error.willRetry).toBe(true);
        resolve();
      });
    });

    llmStream.emitRequestError('req-8', {
      error: 'Rate limit exceeded',
      errorType: 'rate_limit',
      willRetry: true,
      retryAttempt: 1,
    });
    await promise;
  });

  it('should clear request state after completion', () => {
    llmStream.emitRequestStarted('req-9', {
      provider: 'anthropic',
      model: 'claude-3-opus',
      messages: [],
    });

    llmStream.emitToken('req-9', { token: 'Hello', index: 0 });

    llmStream.emitRequestCompleted('req-9', {
      response: 'Hello',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      duration: 500,
    });

    const state = llmStream.getRequestState('req-9');
    expect(state).toBeUndefined();
  });
});

describe('SSEClient', () => {
  it('should create client with config', () => {
    const client = new SSEClient({
      url: 'http://localhost:3000',
      filters: ['task:*', 'agent:*'],
      autoReconnect: true,
    });

    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
    expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
  });

  it('should get client statistics', () => {
    const client = new SSEClient({
      url: 'http://localhost:3000',
    });

    const stats = client.getStats();
    expect(stats.state).toBe(ConnectionState.DISCONNECTED);
    expect(stats.reconnectAttempts).toBe(0);
    expect(stats.isConnected).toBe(false);
  });

  it('should update configuration', () => {
    const client = new SSEClient({
      url: 'http://localhost:3000',
    });

    client.updateConfig({ autoReconnect: false });

    const stats = client.getStats();
    expect(stats.state).toBe(ConnectionState.DISCONNECTED);
  });

  it('should handle disconnect', () => {
    const client = new SSEClient({
      url: 'http://localhost:3000',
      autoReconnect: false,
    });

    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });
});
