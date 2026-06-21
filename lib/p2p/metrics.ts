import type { Libp2p } from '@libp2p/interface';
import type { ConnectivityMetricsConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { getTransportFromMultiaddr } from './transports.js';

/**
 * Per-connection metrics
 */
export interface ConnectionMetrics {
  peerId: string;
  transportType: string;
  latency: number;
  bandwidth: { inRate: number; outRate: number };
  errorCount: number;
  lastUsedAt: number;
  connectedAt: number;
}

/**
 * Per-node metrics
 */
export interface NodeMetrics {
  publicIP: string | null;
  natType: string;
  reachabilityStatus: 'direct' | 'relay' | 'unreachable' | 'unknown';
  uptime: number;
  avgLatency: number;
  connectionSuccessRate: number;
  failoverEventsCount: number;
  relayUsagePercentage: number;
}

/**
 * DHT metrics
 */
export interface DHTMetrics {
  peersKnown: number;
  peersReachable: number;
  discoveryLatency: number;
}

/**
 * Full metrics snapshot
 */
export interface MetricsSnapshot {
  node: NodeMetrics;
  connections: ConnectionMetrics[];
  dht: DHTMetrics;
}

/**
 * Connectivity summary
 */
export interface ConnectivitySummary {
  connected: boolean;
  peerCount: number;
  directConnections: number;
  relayConnections: number;
  relayUsagePercentage: number;
  bandwidth: { inRate: number; outRate: number };
}

/**
 * MetricsCollector tracks P2P connectivity metrics for monitoring and API exposure.
 */
export class MetricsCollector {
  private config: ConnectivityMetricsConfig;
  private libp2p: Libp2p | null = null;
  private sampleInterval: ReturnType<typeof setInterval> | null = null;
  private startedAt: number = 0;

  // Counters
  private connectionAttempts = 0;
  private connectionSuccesses = 0;
  private failoverEvents = 0;

  // Current state
  private publicIP: string | null = null;
  private natType: string = 'unknown';
  private reachabilityStatus: 'direct' | 'relay' | 'unreachable' | 'unknown' = 'unknown';

  // Connection tracking
  private connectionMetrics: Map<string, ConnectionMetrics> = new Map();

  // Bandwidth estimation (simple byte counters)
  private bytesIn = 0;
  private bytesOut = 0;
  private lastSampleTime = 0;
  private inRate = 0;
  private outRate = 0;

  constructor(config: ConnectivityMetricsConfig) {
    this.config = config;
  }

  /**
   * Start collecting metrics
   */
  start(libp2p: Libp2p): void {
    if (!this.config.enabled) return;

    this.libp2p = libp2p;
    this.startedAt = Date.now();
    this.lastSampleTime = Date.now();

    // Sample metrics periodically
    this.sampleInterval = setInterval(
      () => this.sample(),
      this.config.sampleInterval
    );

    logger.debug('Metrics collector started', { sampleInterval: this.config.sampleInterval });
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
    }
    this.libp2p = null;
    logger.debug('Metrics collector stopped');
  }

  /**
   * Periodic sampling of metrics from libp2p
   */
  private sample(): void {
    if (!this.libp2p) return;

    const now = Date.now();
    const elapsed = (now - this.lastSampleTime) / 1000;

    // Update bandwidth rates
    if (elapsed > 0) {
      this.inRate = Math.round(this.bytesIn / elapsed);
      this.outRate = Math.round(this.bytesOut / elapsed);
      this.bytesIn = 0;
      this.bytesOut = 0;
    }
    this.lastSampleTime = now;

    // Update connection metrics
    this.updateConnectionMetrics();
  }

  /**
   * Update connection metrics from current libp2p state
   */
  private updateConnectionMetrics(): void {
    if (!this.libp2p) return;

    const connections = this.libp2p.getConnections();
    const activePeers = new Set<string>();

    for (const conn of connections) {
      const peerId = conn.remotePeer.toString();
      activePeers.add(peerId);

      const addr = conn.remoteAddr.toString();
      const transport = getTransportFromMultiaddr(addr);

      if (!this.connectionMetrics.has(peerId)) {
        this.connectionMetrics.set(peerId, {
          peerId,
          transportType: transport,
          latency: 0,
          bandwidth: { inRate: 0, outRate: 0 },
          errorCount: 0,
          lastUsedAt: Date.now(),
          connectedAt: Date.now(),
        });
      } else {
        const metrics = this.connectionMetrics.get(peerId)!;
        metrics.lastUsedAt = Date.now();
        metrics.transportType = transport;
      }
    }

    // Remove disconnected peers
    for (const peerId of this.connectionMetrics.keys()) {
      if (!activePeers.has(peerId)) {
        this.connectionMetrics.delete(peerId);
      }
    }
  }

  // --- Recording Events ---

  /**
   * Record a connection attempt
   */
  recordConnectionAttempt(success: boolean): void {
    this.connectionAttempts++;
    if (success) this.connectionSuccesses++;
  }

  /**
   * Record a failover event
   */
  recordFailover(): void {
    this.failoverEvents++;
  }

  /**
   * Record incoming bytes
   */
  recordBytesIn(bytes: number): void {
    this.bytesIn += bytes;
  }

  /**
   * Record outgoing bytes
   */
  recordBytesOut(bytes: number): void {
    this.bytesOut += bytes;
  }

  /**
   * Update the node's public IP
   */
  setPublicIP(ip: string | null): void {
    this.publicIP = ip;
  }

  /**
   * Update the detected NAT type
   */
  setNatType(natType: string): void {
    this.natType = natType;
  }

  /**
   * Update reachability status
   */
  setReachabilityStatus(status: 'direct' | 'relay' | 'unreachable' | 'unknown'): void {
    this.reachabilityStatus = status;
  }

  /**
   * Record latency for a specific peer
   */
  recordLatency(peerId: string, latencyMs: number): void {
    const metrics = this.connectionMetrics.get(peerId);
    if (metrics) {
      metrics.latency = latencyMs;
    }
  }

  // --- Querying Metrics ---

  /**
   * Get a full metrics snapshot
   */
  getMetrics(): MetricsSnapshot {
    const connections = [...this.connectionMetrics.values()];

    let totalLatency = 0;
    let latencyCount = 0;
    let relayCount = 0;

    for (const conn of connections) {
      if (conn.latency > 0) {
        totalLatency += conn.latency;
        latencyCount++;
      }
      if (conn.transportType === 'relay') {
        relayCount++;
      }
    }

    const peerCount = connections.length;
    const relayPercentage = peerCount > 0 ? (relayCount / peerCount) * 100 : 0;

    return {
      node: {
        publicIP: this.publicIP,
        natType: this.natType,
        reachabilityStatus: this.reachabilityStatus,
        uptime: (Date.now() - this.startedAt) / 1000,
        avgLatency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
        connectionSuccessRate: this.connectionAttempts > 0
          ? this.connectionSuccesses / this.connectionAttempts
          : 1,
        failoverEventsCount: this.failoverEvents,
        relayUsagePercentage: Math.round(relayPercentage * 10) / 10,
      },
      connections,
      dht: this.getDHTMetrics(),
    };
  }

  /**
   * Get connectivity summary
   */
  getConnectivity(): ConnectivitySummary {
    const connections = [...this.connectionMetrics.values()];
    let directCount = 0;
    let relayCount = 0;

    for (const conn of connections) {
      if (conn.transportType === 'relay') {
        relayCount++;
      } else {
        directCount++;
      }
    }

    const total = connections.length;
    const relayPercentage = total > 0 ? (relayCount / total) * 100 : 0;

    return {
      connected: total > 0,
      peerCount: total,
      directConnections: directCount,
      relayConnections: relayCount,
      relayUsagePercentage: Math.round(relayPercentage * 10) / 10,
      bandwidth: { inRate: this.inRate, outRate: this.outRate },
    };
  }

  /**
   * Get DHT-related metrics
   */
  private getDHTMetrics(): DHTMetrics {
    if (!this.libp2p) {
      return { peersKnown: 0, peersReachable: 0, discoveryLatency: 0 };
    }

    const peers = this.libp2p.getPeers();
    const connections = this.libp2p.getConnections();

    return {
      peersKnown: peers.length,
      peersReachable: connections.length,
      discoveryLatency: 0, // Would require DHT query timing
    };
  }
}
