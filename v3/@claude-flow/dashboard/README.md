# @claude-flow/dashboard

Admin Dashboard for Claude Flow V3 - Real-time monitoring and control interface.

## Features

- **Real-time Monitoring**: Live updates via Server-Sent Events (SSE)
- **Zero External Dependencies**: Vanilla Node.js and JavaScript
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark/Light Mode**: User preference with localStorage persistence
- **Authentication**: Optional token-based authentication
- **REST API**: Complete control over agents, tasks, and configuration

## Installation

```bash
npm install @claude-flow/dashboard
```

## Quick Start

```typescript
import { startDashboard } from '@claude-flow/dashboard';

// Start with default configuration
const dashboard = await startDashboard({
  port: 3000,
  host: 'localhost',
  authEnabled: false,
  corsEnabled: true,
});

console.log('Dashboard running at http://localhost:3000');

// Stop when done
await dashboard.stop();
```

## API Endpoints

### Status API

- `GET /api/status` - System status overview
- `GET /api/agents` - List of all agents
- `GET /api/tasks` - List of all tasks
- `GET /api/metrics` - Performance metrics

### Config API

- `GET /api/config` - Current configuration
- `PUT /api/config` - Update configuration
- `POST /api/config/reload` - Reload from disk

### Control API

- `POST /api/agents/:id/terminate` - Terminate an agent
- `POST /api/tasks/:id/cancel` - Cancel a task
- `POST /api/swarm/scale` - Scale swarm up/down

### Real-time Updates

- `GET /events` - Server-Sent Events stream

## Configuration

```typescript
interface DashboardConfig {
  port?: number;              // Default: 3000
  host?: string;              // Default: 'localhost'
  authEnabled?: boolean;      // Default: false
  authToken?: string;         // Required if authEnabled: true
  corsEnabled?: boolean;      // Default: true
  staticPath?: string;        // Path to static files
}
```

## Authentication

Enable authentication with a bearer token:

```typescript
const dashboard = await startDashboard({
  port: 3000,
  authEnabled: true,
  authToken: 'your-secret-token',
});
```

Then include the token in requests:

```bash
curl -H "Authorization: Bearer your-secret-token" \
  http://localhost:3000/api/status
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Watch mode
npm run test:watch

# Build
npm run build

# Type check
npm run typecheck
```

## Testing

The package includes 25+ comprehensive tests covering:

- Server lifecycle
- All API endpoints
- Authentication
- Real-time updates
- Error handling
- Concurrent requests

Run tests:

```bash
npm test
```

## Architecture

```
dashboard/
├── server/
│   └── dashboard-server.ts   # HTTP server, SSE, auth
├── api/
│   ├── status-api.ts         # Status endpoints
│   ├── config-api.ts         # Config endpoints
│   └── control-api.ts        # Control endpoints
├── views/
│   ├── index.html            # Single-page app
│   ├── components.js         # Vanilla JS components
│   └── styles.css            # Responsive styles
└── __tests__/
    └── dashboard.test.ts     # Comprehensive tests
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## License

MIT

## Contributing

See the main [claude-flow](https://github.com/ruvnet/claude-flow) repository.
