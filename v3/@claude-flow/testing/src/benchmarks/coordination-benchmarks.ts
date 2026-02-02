/**
 * Coordination Performance Benchmarks
 *
 * Benchmarks for multi-agent coordination:
 * - Session management latency
 * - Message passing latency
 * - Consensus protocols (4/8/16 nodes)
 * - Swarm coordination overhead
 *
 * @module @claude-flow/testing/benchmarks/coordination-benchmarks
 */

import { describe, bench } from 'vitest';
import { EventEmitter } from 'events';
import { runBenchmarkSuite } from './utils/benchmark-runner.js';

/**
 * Simple session manager mock
 */
class SessionManager extends EventEmitter {
  private sessions: Map<string, any> = new Map();

  createSession(id: string, data: any): void {
    this.sessions.set(id, {
      id,
      data,
      createdAt: Date.now(),
    });
    this.emit('session:created', id);
  }

  getSession(id: string): any {
    return this.sessions.get(id);
  }

  updateSession(id: string, data: any): void {
    const session = this.sessions.get(id);
    if (session) {
      session.data = { ...session.data, ...data };
      session.updatedAt = Date.now();
      this.emit('session:updated', id);
    }
  }

  deleteSession(id: string): void {
    this.sessions.delete(id);
    this.emit('session:deleted', id);
  }
}

/**
 * Simple message queue mock
 */
class MessageQueue extends EventEmitter {
  private messages: Array<{ id: string; from: string; to: string; data: any }> = [];

  send(from: string, to: string, data: any): void {
    const message = {
      id: `msg-${Date.now()}-${Math.random()}`,
      from,
      to,
      data,
    };
    this.messages.push(message);
    this.emit('message', message);
  }

  getMessages(recipient: string): Array<any> {
    return this.messages.filter(m => m.to === recipient);
  }

  clear(): void {
    this.messages = [];
  }
}

/**
 * Simple consensus protocol mock (Raft-like)
 */
class ConsensusProtocol extends EventEmitter {
  private nodes: Map<string, { id: string; isLeader: boolean }> = new Map();
  private log: Array<any> = [];

  addNode(id: string): void {
    this.nodes.set(id, { id, isLeader: false });

    // First node becomes leader
    if (this.nodes.size === 1) {
      this.nodes.get(id)!.isLeader = true;
      this.emit('leader:elected', id);
    }
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
  }

  propose(value: any): void {
    const leader = Array.from(this.nodes.values()).find(n => n.isLeader);
    if (!leader) {
      throw new Error('No leader elected');
    }

    // Simulate consensus
    const entry = {
      value,
      timestamp: Date.now(),
      term: 1,
    };

    this.log.push(entry);
    this.emit('consensus:reached', entry);
  }

  getQuorum(): number {
    return Math.floor(this.nodes.size / 2) + 1;
  }
}

/**
 * Session creation benchmark
 */
export async function benchSessionCreation(): Promise<void> {
  const manager = new SessionManager();
  manager.createSession('session-123', { user: 'test', role: 'agent' });
}

/**
 * Session update benchmark
 */
export async function benchSessionUpdate(): Promise<void> {
  const manager = new SessionManager();
  manager.createSession('session-123', { user: 'test' });
  manager.updateSession('session-123', { status: 'active' });
}

/**
 * Concurrent session operations benchmark
 */
export async function benchConcurrentSessions(count: number = 100): Promise<void> {
  const manager = new SessionManager();

  const promises = Array.from({ length: count }, (_, i) => {
    return Promise.resolve().then(() => {
      manager.createSession(`session-${i}`, { id: i });
      manager.updateSession(`session-${i}`, { updated: true });
    });
  });

  await Promise.all(promises);
}

/**
 * Message passing latency benchmark
 */
export async function benchMessagePassing(): Promise<void> {
  const queue = new MessageQueue();

  return new Promise<void>((resolve) => {
    queue.once('message', () => {
      resolve();
    });

    queue.send('agent-1', 'agent-2', { type: 'task', data: 'test' });
  });
}

/**
 * Broadcast message benchmark
 */
export async function benchBroadcastMessage(recipients: number = 10): Promise<void> {
  const queue = new MessageQueue();

  for (let i = 0; i < recipients; i++) {
    queue.send('coordinator', `agent-${i}`, { type: 'broadcast', data: 'test' });
  }
}

/**
 * Consensus with 4 nodes benchmark
 */
export async function benchConsensus4Nodes(): Promise<void> {
  const protocol = new ConsensusProtocol();

  for (let i = 0; i < 4; i++) {
    protocol.addNode(`node-${i}`);
  }

  return new Promise<void>((resolve) => {
    protocol.once('consensus:reached', () => {
      resolve();
    });

    protocol.propose({ operation: 'write', value: 'test' });
  });
}

/**
 * Consensus with 8 nodes benchmark
 */
export async function benchConsensus8Nodes(): Promise<void> {
  const protocol = new ConsensusProtocol();

  for (let i = 0; i < 8; i++) {
    protocol.addNode(`node-${i}`);
  }

  return new Promise<void>((resolve) => {
    protocol.once('consensus:reached', () => {
      resolve();
    });

    protocol.propose({ operation: 'write', value: 'test' });
  });
}

/**
 * Consensus with 16 nodes benchmark
 */
export async function benchConsensus16Nodes(): Promise<void> {
  const protocol = new ConsensusProtocol();

  for (let i = 0; i < 16; i++) {
    protocol.addNode(`node-${i}`);
  }

  return new Promise<void>((resolve) => {
    protocol.once('consensus:reached', () => {
      resolve();
    });

    protocol.propose({ operation: 'write', value: 'test' });
  });
}

/**
 * Swarm coordination overhead benchmark
 * Simulates coordinator managing multiple agents
 */
export async function benchSwarmCoordination(agentCount: number = 10): Promise<void> {
  const manager = new SessionManager();
  const queue = new MessageQueue();

  // Create swarm session
  manager.createSession('swarm-1', { type: 'hierarchical', agents: [] });

  // Add agents
  for (let i = 0; i < agentCount; i++) {
    manager.createSession(`agent-${i}`, { role: 'worker', swarmId: 'swarm-1' });
    queue.send('coordinator', `agent-${i}`, { type: 'task-assignment' });
  }

  // Collect responses
  for (let i = 0; i < agentCount; i++) {
    queue.send(`agent-${i}`, 'coordinator', { type: 'task-complete' });
  }
}

/**
 * Leader election benchmark
 */
export async function benchLeaderElection(): Promise<void> {
  const protocol = new ConsensusProtocol();

  return new Promise<void>((resolve) => {
    protocol.once('leader:elected', () => {
      resolve();
    });

    protocol.addNode('node-0');
  });
}

/**
 * Event propagation benchmark
 */
export async function benchEventPropagation(listeners: number = 50): Promise<void> {
  const emitter = new EventEmitter();

  // Add listeners
  const promises: Promise<void>[] = [];
  for (let i = 0; i < listeners; i++) {
    promises.push(
      new Promise<void>((resolve) => {
        emitter.once('event', () => resolve());
      })
    );
  }

  // Emit event
  emitter.emit('event');

  await Promise.all(promises);
}

/**
 * Run all coordination benchmarks
 */
export async function runCoordinationBenchmarks() {
  return runBenchmarkSuite('Coordination Performance', [
    {
      name: 'Session Creation',
      fn: benchSessionCreation,
      options: { iterations: 1000 },
    },
    {
      name: 'Session Update',
      fn: benchSessionUpdate,
      options: { iterations: 1000 },
    },
    {
      name: 'Concurrent Sessions (100)',
      fn: () => benchConcurrentSessions(100),
      options: { iterations: 50 },
    },
    {
      name: 'Message Passing Latency',
      fn: benchMessagePassing,
      options: { iterations: 1000 },
    },
    {
      name: 'Broadcast Message (10 recipients)',
      fn: () => benchBroadcastMessage(10),
      options: { iterations: 500 },
    },
    {
      name: 'Broadcast Message (100 recipients)',
      fn: () => benchBroadcastMessage(100),
      options: { iterations: 100 },
    },
    {
      name: 'Consensus (4 nodes)',
      fn: benchConsensus4Nodes,
      options: { iterations: 500 },
    },
    {
      name: 'Consensus (8 nodes)',
      fn: benchConsensus8Nodes,
      options: { iterations: 500 },
    },
    {
      name: 'Consensus (16 nodes)',
      fn: benchConsensus16Nodes,
      options: { iterations: 500 },
    },
    {
      name: 'Swarm Coordination (10 agents)',
      fn: () => benchSwarmCoordination(10),
      options: { iterations: 100 },
    },
    {
      name: 'Swarm Coordination (50 agents)',
      fn: () => benchSwarmCoordination(50),
      options: { iterations: 50 },
    },
    {
      name: 'Leader Election',
      fn: benchLeaderElection,
      options: { iterations: 1000 },
    },
    {
      name: 'Event Propagation (50 listeners)',
      fn: () => benchEventPropagation(50),
      options: { iterations: 500 },
    },
  ]);
}

// Vitest benchmarks
describe('Coordination Benchmarks', () => {
  bench('session creation', async () => {
    await benchSessionCreation();
  });

  bench('session update', async () => {
    await benchSessionUpdate();
  });

  bench('message passing', async () => {
    await benchMessagePassing();
  });

  bench('broadcast (10)', async () => {
    await benchBroadcastMessage(10);
  });

  bench('consensus (4 nodes)', async () => {
    await benchConsensus4Nodes();
  });

  bench('consensus (8 nodes)', async () => {
    await benchConsensus8Nodes();
  });

  bench('consensus (16 nodes)', async () => {
    await benchConsensus16Nodes();
  });

  bench('swarm coordination (10)', async () => {
    await benchSwarmCoordination(10);
  });

  bench('leader election', async () => {
    await benchLeaderElection();
  });

  bench('event propagation (50)', async () => {
    await benchEventPropagation(50);
  });
});
