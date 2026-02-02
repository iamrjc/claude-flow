/**
 * @claude-flow/realtime
 * WebSocket support for real-time agent/task/swarm events
 */

// Protocol
export {
  PROTOCOL_VERSION,
  MessageType,
  BaseMessage,
  PingMessage,
  PongMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  PublishMessage,
  EventMessage,
  AckMessage,
  ErrorMessage,
  AuthMessage,
  VersionNegotiationMessage,
  Message,
  MessageSerializer,
  VersionNegotiator,
  MessageValidator,
  ErrorCodes,
  ErrorCode,
} from './protocol/message-types.js';

// Server
export {
  WSServer,
  WSServerOptions,
  ClientConnection,
} from './server/ws-server.js';

export {
  WSRouter,
  RouterOptions,
  TopicSubscription,
  RouteConfig,
} from './server/ws-router.js';

// Client
export {
  WSClient,
  WSClientOptions,
  PendingMessage,
} from './client/ws-client.js';

// Channels
export {
  AgentChannelServer,
  AgentChannelClient,
  AgentStatus,
  AgentStatusEvent,
  AgentHealthEvent,
  AgentMetricsEvent,
  AgentLogEvent,
} from './channels/agent-channel.js';

export {
  TaskChannelServer,
  TaskChannelClient,
  TaskStatus,
  TaskProgressEvent,
  TaskCompletedEvent,
  TaskCreatedEvent,
  TaskAssignedEvent,
  TaskErrorEvent,
} from './channels/task-channel.js';

export {
  SwarmChannelServer,
  SwarmChannelClient,
  SwarmTopology,
  TopologyChangeEvent,
  AgentJoinedEvent,
  AgentLeftEvent,
  ConsensusEvent,
  CollectiveDecisionEvent,
  SwarmStateEvent,
  CoordinationEvent,
} from './channels/swarm-channel.js';
