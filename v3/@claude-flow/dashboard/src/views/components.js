/**
 * Dashboard Components - Vanilla JavaScript (No external dependencies)
 *
 * Handles real-time updates, rendering, and interactions
 */

// =============================================================================
// State Management
// =============================================================================

const state = {
  connected: false,
  status: null,
  agents: [],
  tasks: [],
  metrics: null,
  logs: [],
  theme: localStorage.getItem('theme') || 'light',
};

// =============================================================================
// API Client
// =============================================================================

class APIClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
    this.eventSource = null;
  }

  async get(endpoint) {
    const response = await fetch(`${this.baseURL}${endpoint}`);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return response.json();
  }

  async post(endpoint, data) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return response.json();
  }

  async put(endpoint, data) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return response.json();
  }

  connectSSE(onMessage) {
    this.eventSource = new EventSource('/events');

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('SSE parse error:', error);
      }
    };

    this.eventSource.onerror = () => {
      state.connected = false;
      updateConnectionStatus();
    };

    this.eventSource.onopen = () => {
      state.connected = true;
      updateConnectionStatus();
    };
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

const api = new APIClient();

// =============================================================================
// Rendering Functions
// =============================================================================

function updateConnectionStatus() {
  const statusEl = document.getElementById('connection-status');
  if (state.connected) {
    statusEl.textContent = 'Connected';
    statusEl.className = 'status-badge status-connected';
  } else {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'status-badge status-disconnected';
  }
}

function updateSystemStatus(status) {
  if (!status) return;

  document.getElementById('uptime').textContent = formatDuration(status.uptime);
  document.getElementById('topology').textContent = status.topology;
  document.getElementById('version').textContent = status.version;
  document.getElementById('agent-count').textContent = status.agentCount;

  const badge = document.getElementById('system-status-badge');
  badge.textContent = status.status;
  badge.className = `status-badge status-${status.status}`;
}

function updateAgentsTable(agents) {
  if (!agents) return;

  const tbody = document.getElementById('agents-tbody');
  tbody.innerHTML = agents.map(agent => `
    <tr>
      <td><code>${agent.id}</code></td>
      <td><span class="type-badge">${agent.type}</span></td>
      <td><span class="status-badge status-${agent.status}">${agent.status}</span></td>
      <td>${agent.tasksCompleted}/${agent.tasksCompleted + agent.tasksFailed}</td>
      <td>${(agent.successRate * 100).toFixed(1)}%</td>
      <td>
        <div class="health-bar">
          <div class="health-fill" style="width: ${agent.healthScore * 100}%; background-color: ${getHealthColor(agent.healthScore)}"></div>
        </div>
        <span class="health-value">${(agent.healthScore * 100).toFixed(0)}%</span>
      </td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="terminateAgent('${agent.id}')">Terminate</button>
      </td>
    </tr>
  `).join('');
}

function updateTasksTable(tasks) {
  if (!tasks) return;

  const tbody = document.getElementById('tasks-tbody');
  tbody.innerHTML = tasks.map(task => `
    <tr>
      <td><code>${task.id}</code></td>
      <td>${task.title}</td>
      <td><span class="type-badge">${task.type}</span></td>
      <td><span class="status-badge status-${task.status}">${task.status}</span></td>
      <td><span class="priority-badge priority-${task.priority}">${task.priority}</span></td>
      <td>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${task.progress}%"></div>
        </div>
        <span>${task.progress}%</span>
      </td>
      <td>${task.assignedAgent ? `<code>${task.assignedAgent}</code>` : '-'}</td>
      <td>
        ${task.status === 'running' || task.status === 'pending'
          ? `<button class="btn btn-sm btn-danger" onclick="cancelTask('${task.id}')">Cancel</button>`
          : '-'
        }
      </td>
    </tr>
  `).join('');
}

function updateMetrics(metrics) {
  if (!metrics) return;

  // Agent metrics
  document.getElementById('active-agents').textContent = metrics.agents.active;
  document.getElementById('idle-agents').textContent = metrics.agents.idle;
  document.getElementById('agent-utilization').textContent =
    (metrics.agents.utilization * 100).toFixed(1) + '%';

  // Task metrics
  document.getElementById('completed-tasks').textContent = metrics.tasks.completed;
  document.getElementById('running-tasks').textContent = metrics.tasks.running;
  document.getElementById('task-throughput').textContent =
    metrics.tasks.throughput.toFixed(2) + '/min';

  // Performance metrics
  const cpuPercent = Math.min(100, (metrics.performance.cpuUsage / 100) * 100);
  const memoryPercent = (metrics.performance.memoryUsage / metrics.performance.memoryLimit) * 100;
  const responseTime = metrics.performance.averageResponseTime;

  updateProgressBar('cpu', cpuPercent, cpuPercent.toFixed(1) + '%');
  updateProgressBar('memory', memoryPercent, formatBytes(metrics.performance.memoryUsage));
  updateProgressBar('response', Math.min(100, responseTime / 2), responseTime.toFixed(1) + ' ms');

  // Update charts
  updateAgentChart(metrics.agents);
  updateTaskChart(metrics.tasks);
}

function updateProgressBar(id, percent, text) {
  const bar = document.getElementById(`${id}-bar`);
  const value = document.getElementById(`${id}-value`);

  bar.style.width = percent + '%';
  value.textContent = text;

  // Color based on threshold
  if (percent > 80) {
    bar.style.backgroundColor = '#ef4444';
  } else if (percent > 60) {
    bar.style.backgroundColor = '#f59e0b';
  } else {
    bar.style.backgroundColor = '#10b981';
  }
}

function updateAgentChart(agentMetrics) {
  const canvas = document.getElementById('agent-chart');
  const ctx = canvas.getContext('2d');

  // Simple pie chart
  const total = agentMetrics.total || 1;
  const active = agentMetrics.active;
  const idle = agentMetrics.idle;
  const blocked = agentMetrics.blocked;

  drawPieChart(ctx, canvas.width, canvas.height, [
    { value: active, color: '#10b981', label: 'Active' },
    { value: idle, color: '#3b82f6', label: 'Idle' },
    { value: blocked, color: '#ef4444', label: 'Blocked' },
  ]);
}

function updateTaskChart(taskMetrics) {
  const canvas = document.getElementById('task-chart');
  const ctx = canvas.getContext('2d');

  const total = taskMetrics.total || 1;

  drawPieChart(ctx, canvas.width, canvas.height, [
    { value: taskMetrics.completed, color: '#10b981', label: 'Completed' },
    { value: taskMetrics.running, color: '#3b82f6', label: 'Running' },
    { value: taskMetrics.pending, color: '#f59e0b', label: 'Pending' },
    { value: taskMetrics.failed, color: '#ef4444', label: 'Failed' },
  ]);
}

function drawPieChart(ctx, width, height, segments) {
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 10;

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return;

  let currentAngle = -Math.PI / 2;

  segments.forEach(segment => {
    const sliceAngle = (segment.value / total) * 2 * Math.PI;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
    ctx.closePath();

    ctx.fillStyle = segment.color;
    ctx.fill();

    currentAngle += sliceAngle;
  });
}

function addLog(level, message) {
  const container = document.getElementById('logs-container');
  const timestamp = new Date().toISOString();

  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${level}`;
  logEntry.innerHTML = `
    <span class="log-timestamp">${timestamp}</span>
    <span class="log-level">[${level.toUpperCase()}]</span>
    <span class="log-message">${message}</span>
  `;

  container.appendChild(logEntry);

  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;

  // Keep only last 100 logs
  while (container.children.length > 100) {
    container.removeChild(container.firstChild);
  }
}

// =============================================================================
// Control Functions
// =============================================================================

async function terminateAgent(agentId) {
  if (!confirm(`Are you sure you want to terminate agent ${agentId}?`)) {
    return;
  }

  try {
    const result = await api.post(`/api/agents/${agentId}/terminate`);
    addLog('info', `Agent ${agentId} terminated: ${result.message}`);
    await refreshAgents();
  } catch (error) {
    addLog('error', `Failed to terminate agent: ${error.message}`);
  }
}

async function cancelTask(taskId) {
  if (!confirm(`Are you sure you want to cancel task ${taskId}?`)) {
    return;
  }

  try {
    const result = await api.post(`/api/tasks/${taskId}/cancel`);
    addLog('info', `Task ${taskId} cancelled: ${result.message}`);
    await refreshTasks();
  } catch (error) {
    addLog('error', `Failed to cancel task: ${error.message}`);
  }
}

async function refreshAgents() {
  try {
    const agents = await api.get('/api/agents');
    state.agents = agents;
    updateAgentsTable(agents);
  } catch (error) {
    addLog('error', `Failed to refresh agents: ${error.message}`);
  }
}

async function refreshTasks() {
  try {
    const tasks = await api.get('/api/tasks');
    state.tasks = tasks;
    updateTasksTable(tasks);
  } catch (error) {
    addLog('error', `Failed to refresh tasks: ${error.message}`);
  }
}

function clearLogs() {
  const container = document.getElementById('logs-container');
  container.innerHTML = '';
  addLog('info', 'Logs cleared');
}

function exportLogs() {
  const container = document.getElementById('logs-container');
  const logs = Array.from(container.children).map(el => el.textContent).join('\n');

  const blob = new Blob([logs], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `claude-flow-logs-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  addLog('info', 'Logs exported');
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.body.className = state.theme;
  localStorage.setItem('theme', state.theme);

  const icon = document.querySelector('#theme-toggle .icon');
  icon.textContent = state.theme === 'light' ? '🌙' : '☀️';
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function getHealthColor(score) {
  if (score >= 0.8) return '#10b981';
  if (score >= 0.5) return '#f59e0b';
  return '#ef4444';
}

// =============================================================================
// Initialization
// =============================================================================

function handleSSEMessage(data) {
  switch (data.type) {
    case 'connected':
      addLog('info', 'Connected to dashboard server');
      break;
    case 'status':
      state.status = data.data;
      updateSystemStatus(data.data);
      break;
    case 'agents':
      state.agents = data.data;
      updateAgentsTable(data.data);
      break;
    case 'tasks':
      state.tasks = data.data;
      updateTasksTable(data.data);
      break;
    case 'metrics':
      state.metrics = data.data;
      updateMetrics(data.data);
      break;
  }
}

async function initialize() {
  // Apply saved theme
  document.body.className = state.theme;
  const themeIcon = document.querySelector('#theme-toggle .icon');
  themeIcon.textContent = state.theme === 'light' ? '🌙' : '☀️';

  // Setup event listeners
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('refresh-agents').addEventListener('click', refreshAgents);
  document.getElementById('refresh-tasks').addEventListener('click', refreshTasks);
  document.getElementById('clear-logs').addEventListener('click', clearLogs);
  document.getElementById('export-logs').addEventListener('click', exportLogs);

  // Initial data load
  try {
    const [status, agents, tasks, metrics] = await Promise.all([
      api.get('/api/status'),
      api.get('/api/agents'),
      api.get('/api/tasks'),
      api.get('/api/metrics'),
    ]);

    state.status = status;
    state.agents = agents;
    state.tasks = tasks;
    state.metrics = metrics;

    updateSystemStatus(status);
    updateAgentsTable(agents);
    updateTasksTable(tasks);
    updateMetrics(metrics);

    addLog('info', 'Dashboard initialized successfully');
  } catch (error) {
    addLog('error', `Failed to initialize: ${error.message}`);
  }

  // Connect to SSE for real-time updates
  api.connectSSE(handleSSEMessage);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  api.disconnect();
});
