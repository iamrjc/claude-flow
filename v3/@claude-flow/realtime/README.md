# @claude-flow/realtime

WebSocket support for real-time agent/task/swarm events in claude-flow v3.

## Features

- **Auto-reconnect** - Automatic reconnection with exponential backoff
- **Message ordering** - Guaranteed in-order delivery with sequence numbers
- **Backpressure handling** - Queue management with configurable limits
- **Pattern matching** - Wildcard subscriptions (`agent.*.status`, `agent.#`)
- **Type-safe** - Full TypeScript support with type definitions
- **Channels** - Pre-built channels for agents, tasks, and swarms
- **Version negotiation** - Protocol version compatibility checking

## Installation

```bash
npm install @claude-flow/realtime
```

## Quick Start

### Server Setup

```typescript
import { WSServer, WSRouter } from '@claude-flow/realtime';

// Create server
const server = new WSServer({
  port: 8080,
  authenticate: async (token) => {
    // Validate token
    return token === 'valid-token';
  },
});

// Create router
const router = new WSRouter(server);

// Start server
await server.start();
```

### Client Setup

```typescript
import { WSClient } from '@claude-flow/realtime';

// Create client
const client = new WSClient({
  url: 'ws://localhost:8080',
  token: 'valid-token',
  reconnect: true,
  reconnectInterval: 5000,
});

// Connect
await client.connect();

// Subscribe to topics
await client.subscribe(['agent.*.status', 'task.#']);

// Listen for events
client.on('event', (event) => {
  console.log('Received:', event);
});
```

## Channels

### Agent Channel

```typescript
import { AgentChannelServer, AgentChannelClient } from '@claude-flow/realtime';

// Server side
const agentServer = new AgentChannelServer(router);

await agentServer.publishStatusChange({
  agentId: 'agent-1',
  status: 'busy',
  timestamp: Date.now(),
});

await agentServer.publishHealthUpdate({
  agentId: 'agent-1',
  healthy: true,
  metrics: { cpu: 50, memory: 60 },
  timestamp: Date.now(),
});

// Client side
const agentClient = new AgentChannelClient(client);

await agentClient.subscribeAll();

agentClient.on('status-change', (event) => {
  console.log('Agent status:', event);
});

agentClient.on('health-update', (event) => {
  console.log('Agent health:', event);
});
```

### Task Channel

```typescript
import { TaskChannelServer, TaskChannelClient } from '@claude-flow/realtime';

// Server side
const taskServer = new TaskChannelServer(router);

await taskServer.publishProgress({
  taskId: 'task-1',
  progress: 50,
  status: 'in-progress',
  timestamp: Date.now(),
});

await taskServer.publishCompleted({
  taskId: 'task-1',
  status: 'completed',
  result: { success: true },
  timestamp: Date.now(),
});

// Client side
const taskClient = new TaskChannelClient(client);

await taskClient.subscribeToTask('task-1');

// Wait for task completion
const result = await taskClient.waitForCompletion('task-1', 30000);
console.log('Task completed:', result);
```

### Swarm Channel

```typescript
import { SwarmChannelServer, SwarmChannelClient } from '@claude-flow/realtime';

// Server side
const swarmServer = new SwarmChannelServer(router);

await swarmServer.publishTopologyChange({
  swarmId: 'swarm-1',
  oldTopology: 'mesh',
  newTopology: 'hierarchical',
  timestamp: Date.now(),
});

await swarmServer.publishConsensus({
  swarmId: 'swarm-1',
  proposalId: 'prop-1',
  type: 'proposed',
  proposal: { action: 'scale-up' },
  timestamp: Date.now(),
});

// Client side
const swarmClient = new SwarmChannelClient(client);

await swarmClient.subscribeToSwarm('swarm-1');

// Wait for consensus
const result = await swarmClient.waitForConsensus('swarm-1', 'prop-1', 30000);
console.log('Consensus result:', result);

// Submit vote
await swarmClient.submitVote('swarm-1', 'prop-1', 'yes', 'agent-1');
```

## Pattern Matching

The router supports two types of wildcards:

- `*` - Matches exactly one segment
- `#` - Matches zero or more segments

### Examples

```typescript
// Match any agent's status
await client.subscribe(['agent.*.status']);

// Match all agent events
await client.subscribe(['agent.#']);

// Match specific pattern
await client.subscribe(['task.*.progress']);
```

## Message Ordering

Messages are delivered in order with sequence numbers:

```typescript
client.on('event', (event) => {
  console.log('Sequence:', event.sequenceNumber);
  console.log('Data:', event.data);
});
```

## Backpressure

The system handles backpressure automatically:

```typescript
const router = new WSRouter(server, {
  queueSize: 1000, // Max queued messages per client
});

router.on('message-dropped', ({ clientId, topic }) => {
  console.log('Dropped message for:', clientId, topic);
});
```

## Authentication

```typescript
const server = new WSServer({
  port: 8080,
  authenticate: async (token, metadata) => {
    // Custom auth logic
    const user = await validateToken(token);
    return user !== null;
  },
  authTimeout: 10000,
});
```

## Rate Limiting

Prevent clients from overwhelming the server with too many messages:

```typescript
const server = new WSServer({
  port: 8080,
  rateLimit: {
    maxMessages: 100,     // Max messages per window
    windowMs: 60000,      // Window duration in milliseconds (1 minute)
  },
});

// Server will automatically reject messages exceeding the limit
// and send RATE_LIMIT_EXCEEDED error to the client
```

## Graceful Shutdown

```typescript
// Server
await server.shutdown();

// Client
client.disconnect();
```

## API Reference

### WSServer

- `start()` - Start the server
- `shutdown()` - Gracefully shutdown
- `sendMessage(clientId, message)` - Send to specific client
- `broadcast(message)` - Broadcast to all clients
- `disconnectClient(clientId, reason)` - Disconnect client
- `getConnectedClients()` - Get connected client IDs
- `getClient(clientId)` - Get client connection info

### WSClient

- `connect()` - Connect to server
- `disconnect()` - Disconnect from server
- `subscribe(topics)` - Subscribe to topics
- `unsubscribe(topics)` - Unsubscribe from topics
- `publish(topic, data, broadcast)` - Publish message
- `send(message)` - Send raw message
- `sendAndWait(message)` - Send and wait for response

### WSRouter

- `route(config)` - Register route handler
- `unroute(topic)` - Unregister route
- `publish(topic, data)` - Publish to topic
- `getTopicSubscribers(topic)` - Get subscribers for topic
- `getAllSubscriptions()` - Get all subscriptions

## Events

### Server Events

- `started` - Server started
- `connection` - New connection
- `authenticated` - Client authenticated
- `disconnect` - Client disconnected
- `subscribe` - Client subscribed
- `unsubscribe` - Client unsubscribed
- `publish` - Message published
- `error` - Server error

### Client Events

- `connected` - Connected to server
- `disconnected` - Disconnected from server
- `authenticated` - Successfully authenticated
- `reconnecting` - Attempting reconnect
- `event` - Received event
- `event:{topic}` - Received event for topic
- `pong` - Received pong response
- `error` - Client error

## Testing

```bash
npm test
```

The package includes 30+ tests covering:
- Protocol layer (serialization, validation, versioning)
- Server (connection management, auth, heartbeat)
- Router (message routing, pattern matching, backpressure)
- Client (auto-reconnect, message queuing, timeout)
- Channels (agent, task, swarm events)
- Edge cases (rapid reconnect, large messages, concurrent operations)

## License

MIT

## Support

- Documentation: https://github.com/ruvnet/claude-flow
- Issues: https://github.com/ruvnet/claude-flow/issues
