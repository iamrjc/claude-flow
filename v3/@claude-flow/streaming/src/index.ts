/**
 * @claude-flow/streaming - Event Streaming (SSE) Module
 *
 * Provides Server-Sent Events (SSE) streaming infrastructure for real-time
 * task, agent, and LLM event streaming with HTTP/2 support.
 *
 * Features:
 * - HTTP/2 multiplexing for concurrent streams
 * - Automatic keep-alive and reconnection
 * - Client connection tracking
 * - Compression support (gzip, deflate, brotli)
 * - Event filtering and routing
 * - Token-by-token LLM streaming
 * - Task progress tracking
 * - Agent output streaming
 *
 * @module @claude-flow/streaming
 */

// Server
export { SSEServer } from './server/sse-server.js';
export type {
  SSEServerConfig,
  SSEClient as SSEClientConnection,
  SSEEvent,
} from './server/sse-server.js';

// Task Stream
export { TaskStream } from './streams/task-stream.js';
export { TaskStatus } from './streams/task-stream.js';
export type {
  TaskProgress,
  TaskEventData,
  TaskMetrics,
  IntermediateResult,
  TaskStreamConfig,
} from './streams/task-stream.js';

// Agent Stream
export { AgentStream } from './streams/agent-stream.js';
export { AgentStatus, LogLevel } from './streams/agent-stream.js';
export type {
  AgentEventData,
  AgentHealth,
  AgentMetrics,
  OutputData,
  LogMessage,
  AgentStreamConfig,
} from './streams/agent-stream.js';

// LLM Stream
export { LLMStream } from './streams/llm-stream.js';
export type {
  LLMProvider,
  LLMStreamEvent,
  TokenChunk,
  ToolCall,
  ToolResult,
  UsageStats,
  LLMRequestStarted,
  LLMRequestCompleted,
  LLMRequestError,
  LLMStreamConfig,
} from './streams/llm-stream.js';

// Client
export { SSEClient } from './client/sse-client.js';
export { ConnectionState } from './client/sse-client.js';
export type {
  SSEClientConfig,
} from './client/sse-client.js';
