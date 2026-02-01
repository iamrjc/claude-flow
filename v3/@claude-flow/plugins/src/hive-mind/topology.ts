/**
 * Swarm Topology Manager
 * Manages network structure: hierarchical, mesh, hierarchical-mesh, adaptive
 */

import { EventEmitter } from 'events';
import type { SwarmTopology, TopologyConfig } from './types.js';

export interface NodeConnection {
  nodeId: string;
  connections: Set<string>;
  role: 'queen' | 'worker' | 'coordinator';
  level?: number; // For hierarchical topology
}

export class TopologyManager extends EventEmitter {
  private topology: SwarmTopology;
  private config: TopologyConfig;
  private nodes: Map<string, NodeConnection> = new Map();
  private queenId?: string;
  private lastAdaptation: Date = new Date();

  constructor(config: TopologyConfig) {
    super();
    this.topology = config.type;
    this.config = config;
  }

  // ===== INITIALIZATION =====

  async initialize(): Promise<void> {
    this.emit('initializing', { topology: this.topology });

    if (this.topology === 'adaptive') {
      this.startAdaptiveMonitoring();
    }

    this.emit('initialized', { topology: this.topology });
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown', { topology: this.topology });
  }

  // ===== NODE MANAGEMENT =====

  async addNode(nodeId: string, role: NodeConnection['role']): Promise<void> {
    if (this.nodes.has(nodeId)) {
      throw new Error(`Node ${nodeId} already exists`);
    }

    const node: NodeConnection = {
      nodeId,
      connections: new Set(),
      role,
    };

    // Set queen
    if (role === 'queen') {
      if (this.queenId) {
        throw new Error('Queen already exists');
      }
      this.queenId = nodeId;
      node.level = 0;
    }

    this.nodes.set(nodeId, node);

    // Create connections based on topology
    await this.establishConnections(node);

    this.emit('node.added', { nodeId, role, topology: this.topology });
  }

  async removeNode(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return;
    }

    // Remove all connections to this node
    for (const otherId of node.connections) {
      const otherNode = this.nodes.get(otherId);
      if (otherNode) {
        otherNode.connections.delete(nodeId);
      }
    }

    this.nodes.delete(nodeId);

    // If queen was removed, trigger reconfiguration
    if (nodeId === this.queenId) {
      this.queenId = undefined;
      this.emit('queen.removed', { nodeId });
    }

    this.emit('node.removed', { nodeId });

    // Reconnect orphaned nodes
    await this.reconnectOrphans();
  }

  private async establishConnections(node: NodeConnection): Promise<void> {
    switch (this.topology) {
      case 'hierarchical':
        await this.establishHierarchicalConnections(node);
        break;
      case 'mesh':
        await this.establishMeshConnections(node);
        break;
      case 'hierarchical-mesh':
        await this.establishHierarchicalMeshConnections(node);
        break;
      case 'adaptive':
        // Start with hierarchical, adapt later
        await this.establishHierarchicalConnections(node);
        break;
    }
  }

  // ===== HIERARCHICAL TOPOLOGY =====

  private async establishHierarchicalConnections(node: NodeConnection): Promise<void> {
    if (node.role === 'queen') {
      // Queen connects to all workers
      for (const [otherId, otherNode] of this.nodes) {
        if (otherNode.role === 'worker') {
          node.connections.add(otherId);
          otherNode.connections.add(node.nodeId);
          otherNode.level = 1;
        }
      }
    } else if (node.role === 'worker' && this.queenId) {
      // Worker connects only to queen
      const queen = this.nodes.get(this.queenId);
      if (queen) {
        node.connections.add(this.queenId);
        queen.connections.add(node.nodeId);
        node.level = 1;
      }
    }
  }

  // ===== MESH TOPOLOGY =====

  private async establishMeshConnections(node: NodeConnection): Promise<void> {
    const maxConnections = this.config.maxConnectionsPerWorker || 5;

    // Connect to random nodes (up to maxConnections)
    const availableNodes = Array.from(this.nodes.keys())
      .filter(id => id !== node.nodeId);

    const shuffle = (arr: string[]) => {
      const shuffled = [...arr];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const targetsToConnect = shuffle(availableNodes).slice(0, maxConnections);

    for (const targetId of targetsToConnect) {
      const targetNode = this.nodes.get(targetId);
      if (targetNode && targetNode.connections.size < maxConnections) {
        node.connections.add(targetId);
        targetNode.connections.add(node.nodeId);
      }
    }
  }

  // ===== HIERARCHICAL-MESH TOPOLOGY =====

  private async establishHierarchicalMeshConnections(node: NodeConnection): Promise<void> {
    // First establish hierarchical connections
    await this.establishHierarchicalConnections(node);

    // Then add mesh connections between workers
    if (node.role === 'worker') {
      const maxPeerConnections = Math.floor((this.config.maxConnectionsPerWorker || 5) / 2);
      const workers = Array.from(this.nodes.values())
        .filter(n => n.role === 'worker' && n.nodeId !== node.nodeId);

      const shuffle = (arr: NodeConnection[]) => {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      };

      const peersToConnect = shuffle(workers).slice(0, maxPeerConnections);

      for (const peer of peersToConnect) {
        node.connections.add(peer.nodeId);
        peer.connections.add(node.nodeId);
      }
    }
  }

  // ===== ADAPTIVE TOPOLOGY =====

  private startAdaptiveMonitoring(): void {
    const adaptInterval = this.config.adaptIntervalMs || 60000;

    setInterval(() => {
      void this.adaptTopology();
    }, adaptInterval);
  }

  private async adaptTopology(): Promise<void> {
    const metrics = this.calculateTopologyMetrics();

    this.emit('topology.metrics', metrics);

    // Decide if we should switch topology
    if (metrics.avgPathLength > 2.5 && this.topology !== 'mesh') {
      // High path length -> switch to mesh for better connectivity
      await this.reconfigureTopology('mesh');
    } else if (metrics.networkDensity > 0.7 && this.topology !== 'hierarchical') {
      // Too dense -> switch to hierarchical for efficiency
      await this.reconfigureTopology('hierarchical');
    } else if (metrics.loadImbalance > 0.5 && this.topology !== 'hierarchical-mesh') {
      // Load imbalance -> switch to hybrid for better distribution
      await this.reconfigureTopology('hierarchical-mesh');
    }

    this.lastAdaptation = new Date();
  }

  private calculateTopologyMetrics(): {
    avgPathLength: number;
    networkDensity: number;
    loadImbalance: number;
    clusteringCoefficient: number;
  } {
    const n = this.nodes.size;
    if (n === 0) {
      return {
        avgPathLength: 0,
        networkDensity: 0,
        loadImbalance: 0,
        clusteringCoefficient: 0,
      };
    }

    // Calculate average path length (simplified BFS)
    let totalPathLength = 0;
    let pathCount = 0;

    for (const sourceId of this.nodes.keys()) {
      const distances = this.bfsDistances(sourceId);
      for (const dist of distances.values()) {
        if (dist > 0 && dist < Infinity) {
          totalPathLength += dist;
          pathCount++;
        }
      }
    }

    const avgPathLength = pathCount > 0 ? totalPathLength / pathCount : 0;

    // Calculate network density
    const maxEdges = (n * (n - 1)) / 2;
    let actualEdges = 0;
    for (const node of this.nodes.values()) {
      actualEdges += node.connections.size;
    }
    actualEdges /= 2; // Each edge counted twice

    const networkDensity = maxEdges > 0 ? actualEdges / maxEdges : 0;

    // Calculate load imbalance (variance in connection count)
    const connectionCounts = Array.from(this.nodes.values()).map(n => n.connections.size);
    const avgConnections = connectionCounts.reduce((sum, c) => sum + c, 0) / n;
    const variance = connectionCounts.reduce((sum, c) => sum + Math.pow(c - avgConnections, 2), 0) / n;
    const loadImbalance = avgConnections > 0 ? Math.sqrt(variance) / avgConnections : 0;

    // Calculate clustering coefficient
    let clusteringSum = 0;
    for (const node of this.nodes.values()) {
      clusteringSum += this.localClusteringCoefficient(node);
    }
    const clusteringCoefficient = clusteringSum / n;

    return {
      avgPathLength,
      networkDensity,
      loadImbalance,
      clusteringCoefficient,
    };
  }

  private bfsDistances(sourceId: string): Map<string, number> {
    const distances = new Map<string, number>();
    const queue: string[] = [sourceId];
    distances.set(sourceId, 0);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentDist = distances.get(currentId)!;
      const currentNode = this.nodes.get(currentId);

      if (!currentNode) continue;

      for (const neighborId of currentNode.connections) {
        if (!distances.has(neighborId)) {
          distances.set(neighborId, currentDist + 1);
          queue.push(neighborId);
        }
      }
    }

    return distances;
  }

  private localClusteringCoefficient(node: NodeConnection): number {
    const neighbors = Array.from(node.connections);
    const k = neighbors.length;

    if (k < 2) {
      return 0;
    }

    let edgeCount = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const node1 = this.nodes.get(neighbors[i]);
        const node2 = this.nodes.get(neighbors[j]);

        if (node1?.connections.has(neighbors[j]) || node2?.connections.has(neighbors[i])) {
          edgeCount++;
        }
      }
    }

    const maxEdges = (k * (k - 1)) / 2;
    return maxEdges > 0 ? edgeCount / maxEdges : 0;
  }

  // ===== RECONFIGURATION =====

  async reconfigureTopology(newTopology: SwarmTopology): Promise<void> {
    if (this.topology === newTopology) {
      return;
    }

    this.emit('topology.reconfiguring', { from: this.topology, to: newTopology });

    // Clear all connections
    for (const node of this.nodes.values()) {
      node.connections.clear();
    }

    // Update topology type
    this.topology = newTopology;

    // Re-establish connections with new topology
    for (const node of this.nodes.values()) {
      await this.establishConnections(node);
    }

    this.emit('topology.reconfigured', { topology: newTopology });
  }

  // ===== PARTITION HANDLING =====

  async detectPartitions(): Promise<string[][]> {
    const visited = new Set<string>();
    const partitions: string[][] = [];

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const partition = this.findConnectedComponent(nodeId, visited);
        partitions.push(partition);
      }
    }

    if (partitions.length > 1) {
      this.emit('partition.detected', { count: partitions.length, partitions });
    }

    return partitions;
  }

  private findConnectedComponent(startId: string, visited: Set<string>): string[] {
    const component: string[] = [];
    const queue: string[] = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      component.push(currentId);

      const currentNode = this.nodes.get(currentId);
      if (!currentNode) continue;

      for (const neighborId of currentNode.connections) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    return component;
  }

  async healPartitions(): Promise<void> {
    const partitions = await this.detectPartitions();

    if (partitions.length <= 1) {
      return; // No partitions to heal
    }

    this.emit('partition.healing', { count: partitions.length });

    // Connect largest partitions together
    partitions.sort((a, b) => b.length - a.length);

    for (let i = 1; i < partitions.length; i++) {
      const source = partitions[i][0];
      const target = partitions[0][0];

      const sourceNode = this.nodes.get(source);
      const targetNode = this.nodes.get(target);

      if (sourceNode && targetNode) {
        sourceNode.connections.add(target);
        targetNode.connections.add(source);

        this.emit('partition.healed', { source, target });
      }
    }
  }

  private async reconnectOrphans(): Promise<void> {
    const partitions = await this.detectPartitions();

    if (partitions.length > 1) {
      await this.healPartitions();
    }
  }

  // ===== QUERIES =====

  getTopologyType(): SwarmTopology {
    return this.topology;
  }

  getNodeConnections(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    return node ? Array.from(node.connections) : [];
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getQueenId(): string | undefined {
    return this.queenId;
  }

  isConnected(nodeId1: string, nodeId2: string): boolean {
    const node = this.nodes.get(nodeId1);
    return node?.connections.has(nodeId2) || false;
  }

  getShortestPath(sourceId: string, targetId: string): string[] | null {
    const distances = this.bfsDistances(sourceId);

    if (!distances.has(targetId)) {
      return null; // Not reachable
    }

    // Reconstruct path (simplified)
    const path: string[] = [targetId];
    let current = targetId;

    while (current !== sourceId) {
      const currentNode = this.nodes.get(current);
      if (!currentNode) break;

      for (const neighborId of currentNode.connections) {
        const neighborDist = distances.get(neighborId);
        const currentDist = distances.get(current);

        if (neighborDist !== undefined && currentDist !== undefined && neighborDist === currentDist - 1) {
          path.unshift(neighborId);
          current = neighborId;
          break;
        }
      }
    }

    return path;
  }
}

export function createTopologyManager(config: TopologyConfig): TopologyManager {
  return new TopologyManager(config);
}
