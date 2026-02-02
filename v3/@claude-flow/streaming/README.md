# @claude-flow/streaming

Event Streaming (SSE) infrastructure for Claude Flow V3 with HTTP/2 support, real-time task/agent/LLM event streaming, and automatic reconnection.

## Features

- **SSE Server**: HTTP/2 multiplexing, keep-alive, client tracking, compression
- **Task Stream**: Task lifecycle events, progress updates, intermediate results
- **Agent Stream**: Agent output (stdout/stderr), logs, metrics, health status
- **LLM Stream**: Token-by-token streaming, tool calls, usage statistics
- **SSE Client**: Auto-reconnection with exponential backoff, event filtering

## Installation

```bash
npm install @claude-flow/streaming
```

## Usage

### SSE Server

```typescript
import { SSEServer } from '@claude-flow/streaming';

const server = new SSEServer({
  port: 3000,
  http2: true,
  certPath: './cert.pem',
  keyPath: './key.pem',
  keepAliveInterval: 15000,
  compression: true,
  maxClients: 1000,
});

await server.start();

// Broadcast to all clients
server.broadcast({
  event: 'notification',
  data: { message: 'Hello, world!' },
});

// Send to specific client
server.sendToClient('client-123', {
  event: 'message',
  data: { content: 'Private message' },
});

await server.stop();
```

### Task Stream

```typescript
import { SSEServer, TaskStream } from '@claude-flow/streaming';

const server = new SSEServer({ port: 3000 });
await server.start();

const taskStream = new TaskStream(server, {
  includeProgress: true,
  includeIntermediateResults: true,
  includeMetrics: true,
});

taskStream.start();

// Task lifecycle
taskStream.emitTaskCreated('task-123', {
  name: 'Generate code',
  type: 'code',
  priority: 'high',
});

taskStream.emitTaskStarted('task-123');

taskStream.emitProgress('task-123', {
  percentage: 50,
  currentStep: 'Analyzing requirements',
  totalSteps: 10,
  currentStepNumber: 5,
});

taskStream.emitTaskCompleted('task-123', {
  result: { output: 'Generated successfully' },
  metrics: {
    executionTime: 5000,
    cpuUsage: 45,
    memoryUsage: 1024000,
  },
});
```

### Agent Stream

```typescript
import { SSEServer, AgentStream, LogLevel } from '@claude-flow/streaming';

const server = new SSEServer({ port: 3000 });
await server.start();

const agentStream = new AgentStream(server, {
  includeOutput: true,
  includeLogs: true,
  includeMetrics: true,
});

agentStream.start();

// Agent lifecycle
agentStream.emitAgentSpawned('agent-1', {
  name: 'coder-1',
  type: 'coder',
});

agentStream.emitAgentStarted('agent-1', 'task-123');

// Output streaming
agentStream.emitOutput('agent-1', 'stdout', 'Processing file: main.ts');
agentStream.emitOutput('agent-1', 'stderr', 'Warning: deprecated API');

// Logs
agentStream.emitLog('agent-1', LogLevel.INFO, 'Task completed', {
  taskId: 'task-123',
  duration: 5000,
});

// Metrics
agentStream.emitMetrics('agent-1', {
  tasksCompleted: 10,
  tasksFailed: 1,
  avgExecutionTime: 4500,
  cpuUsage: 45,
  memoryUsage: 1024000,
  totalTokens: 15000,
  totalCost: 0.05,
  uptime: 3600000,
});
```

### LLM Stream

```typescript
import { SSEServer, LLMStream } from '@claude-flow/streaming';

const server = new SSEServer({ port: 3000 });
await server.start();

const llmStream = new LLMStream(server, {
  includeTokens: true,
  includeToolCalls: true,
  includeUsage: true,
});

llmStream.start();

// Request started
llmStream.emitRequestStarted('req-123', {
  provider: 'anthropic',
  model: 'claude-3-opus',
  agentId: 'agent-1',
  taskId: 'task-123',
  messages: [{ role: 'user', content: 'Write a function' }],
  parameters: {
    temperature: 0.7,
    maxTokens: 2000,
  },
});

// Token streaming
llmStream.emitToken('req-123', { token: 'Here', index: 0 });
llmStream.emitToken('req-123', { token: ' is', index: 1 });
llmStream.emitToken('req-123', { token: ' the', index: 2 });

// Tool calls
llmStream.emitToolCall('req-123', {
  toolCallId: 'tool-1',
  toolName: 'write_file',
  arguments: '{"path": "main.ts", "content": "..."}',
  isComplete: true,
});

llmStream.emitToolResult('req-123', {
  toolCallId: 'tool-1',
  toolName: 'write_file',
  result: { success: true },
  executionTime: 150,
});

// Request completed
llmStream.emitRequestCompleted('req-123', {
  response: 'Here is the function: ...',
  usage: {
    promptTokens: 100,
    completionTokens: 200,
    totalTokens: 300,
    cost: 0.0045,
  },
  duration: 2500,
});
```

### SSE Client

```typescript
import { SSEClient, ConnectionState } from '@claude-flow/streaming';

const client = new SSEClient({
  url: 'http://localhost:3000',
  filters: ['task:*', 'agent:*'],
  autoReconnect: true,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  reconnectBackoff: 2,
});

// Connection events
client.on('connected', () => {
  console.log('Connected to SSE server');
});

client.on('disconnected', ({ willReconnect, reconnectDelay }) => {
  console.log(`Disconnected. Will reconnect: ${willReconnect}`);
});

client.on('reconnecting', ({ attempt, delay }) => {
  console.log(`Reconnecting... Attempt ${attempt}, delay: ${delay}ms`);
});

// Task events
client.on('task:started', (data) => {
  console.log('Task started:', data);
});

client.on('task:progress', (data) => {
  console.log(`Task ${data.taskId}: ${data.progress.percentage}%`);
});

// Agent events
client.on('agent:output:stdout', (output) => {
  console.log(`[${output.agentId}] ${output.data}`);
});

client.on('agent:log:info', (log) => {
  console.log(`[${log.agentId}] INFO: ${log.message}`);
});

// LLM events
client.on('llm:token', (token) => {
  process.stdout.write(token.token);
});

client.on('llm:usage', ({ usage }) => {
  console.log(`Tokens: ${usage.totalTokens}, Cost: $${usage.cost}`);
});

await client.connect();
```

## Event Types

### Task Events
- `task:created` - Task created
- `task:queued` - Task queued
- `task:assigned` - Task assigned to agent
- `task:started` - Task execution started
- `task:progress` - Task progress update
- `task:intermediate` - Intermediate result
- `task:completed` - Task completed successfully
- `task:failed` - Task failed
- `task:cancelled` - Task cancelled
- `task:metrics` - Task metrics update

### Agent Events
- `agent:spawned` - Agent spawned
- `agent:started` - Agent started task
- `agent:stopped` - Agent stopped
- `agent:paused` - Agent paused
- `agent:error` - Agent error
- `agent:output:stdout` - stdout output
- `agent:output:stderr` - stderr output
- `agent:log:debug` - Debug log
- `agent:log:info` - Info log
- `agent:log:warn` - Warning log
- `agent:log:error` - Error log
- `agent:log:fatal` - Fatal log
- `agent:metrics` - Agent metrics
- `agent:health` - Health status

### LLM Events
- `llm:request:started` - LLM request started
- `llm:token` - Token chunk
- `llm:tool:call` - Tool call
- `llm:tool:result` - Tool result
- `llm:usage` - Usage statistics
- `llm:request:completed` - Request completed
- `llm:request:error` - Request error

## Configuration

### SSEServerConfig
- `port` - Server port (default: 3000)
- `host` - Server host (default: 'localhost')
- `http2` - Enable HTTP/2 (default: false)
- `certPath` - TLS certificate path (required for HTTP/2)
- `keyPath` - TLS key path (required for HTTP/2)
- `keepAliveInterval` - Keep-alive interval in ms (default: 15000)
- `compression` - Enable compression (default: true)
- `compressionLevel` - Compression level 0-9 (default: 6)
- `maxClients` - Maximum clients (default: 1000)
- `corsOrigins` - CORS origins (default: ['*'])
- `headers` - Custom headers

### TaskStreamConfig
- `includeProgress` - Include progress updates (default: true)
- `includeIntermediateResults` - Include intermediate results (default: true)
- `includeMetrics` - Include metrics (default: true)
- `progressUpdateInterval` - Progress update throttle in ms (default: 1000)

### AgentStreamConfig
- `includeOutput` - Include stdout/stderr (default: true)
- `includeLogs` - Include log messages (default: true)
- `includeMetrics` - Include metrics (default: true)
- `metricsUpdateInterval` - Metrics throttle in ms (default: 2000)
- `outputBufferSize` - Output buffer size (default: 100)

### LLMStreamConfig
- `includeTokens` - Include token streaming (default: true)
- `includeToolCalls` - Include tool calls (default: true)
- `includeUsage` - Include usage statistics (default: true)
- `tokenBufferSize` - Token buffer size (default: 1000)

### SSEClientConfig
- `url` - Server URL (required)
- `filters` - Event filters (e.g., ['task:*', 'agent:spawned'])
- `autoReconnect` - Enable auto-reconnect (default: true)
- `reconnectDelay` - Initial reconnect delay in ms (default: 1000)
- `maxReconnectDelay` - Max reconnect delay in ms (default: 30000)
- `reconnectBackoff` - Reconnect backoff multiplier (default: 2)
- `maxReconnectAttempts` - Max reconnect attempts, 0=infinite (default: 0)
- `headers` - Custom headers
- `withCredentials` - Send credentials (default: false)

## HTTP/2 Support

HTTP/2 provides:
- **Multiplexing**: Multiple streams over single connection
- **Header compression**: Reduced bandwidth
- **Server push**: Proactive data sending
- **Binary protocol**: More efficient parsing

To enable HTTP/2, provide TLS certificate and key:

```typescript
const server = new SSEServer({
  port: 3000,
  http2: true,
  certPath: './cert.pem',
  keyPath: './key.pem',
});
```

## Compression

Compression is enabled by default and supports:
- gzip
- deflate
- brotli (if available)

Configure compression level (0-9):

```typescript
const server = new SSEServer({
  compression: true,
  compressionLevel: 6, // Default
});
```

## Client Filtering

Clients can subscribe to specific event types:

```typescript
// URL: http://localhost:3000?filters=task:started,task:completed,agent:*

const client = new SSEClient({
  url: 'http://localhost:3000',
  filters: ['task:started', 'task:completed', 'agent:*'],
});
```

## Testing

```bash
npm test
npm run test:watch
npm run test:coverage
```

## License

MIT
