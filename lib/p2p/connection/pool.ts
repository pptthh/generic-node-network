import type { ConnectionPoolingConfig } from '../../types/config.js';
import { logger } from '../../utils/logger.js';

/**
 * Connection pool entry tracking a peer's connections.
 */
interface PoolEntry {
  peerId: string;
  transportType: string;
  createdAt: number;
  lastUsedAt: number;
  streamCount: number;
  healthy: boolean;
  latency: number;
}

/**
 * ConnectionPool manages active P2P connections to avoid
 * redundant connection establishment. Tracks connection health,
 * idle timeouts, and TTL expiration.
 */
export class ConnectionPool {
  private pool: Map<string, PoolEntry[]> = new Map();
  private config: ConnectionPoolingConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: ConnectionPoolingConfig) {
    this.config = config;
  }

  /**
   * Start the connection pool (periodic cleanup)
   */
  start(): void {
    if (!this.config.enabled) return;

    // Cleanup every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
    logger.debug('Connection pool started', { maxSize: this.config.maxPoolSize });
  }

  /**
   * Stop the connection pool
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.pool.clear();
    logger.debug('Connection pool stopped');
  }

  /**
   * Get a healthy connection for a peer, or null if none available.
   */
  getConnection(peerId: string): PoolEntry | null {
    if (!this.config.enabled) return null;

    const entries = this.pool.get(peerId);
    if (!entries || entries.length === 0) return null;

    // Find a healthy connection under the reuse threshold
    for (const entry of entries) {
      if (entry.healthy && entry.streamCount < this.config.reuseThreshold) {
        entry.lastUsedAt = Date.now();
        return entry;
      }
    }

    return null;
  }

  /**
   * Add a connection to the pool.
   */
  addConnection(
    peerId: string,
    transportType: string,
    latency: number = 0
  ): PoolEntry {
    const entry: PoolEntry = {
      peerId,
      transportType,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      streamCount: 0,
      healthy: true,
      latency,
    };

    let entries = this.pool.get(peerId);
    if (!entries) {
      entries = [];
      this.pool.set(peerId, entries);
    }

    // Check total pool size
    if (this.getTotalConnections() >= this.config.maxPoolSize) {
      this.evictOldest();
    }

    entries.push(entry);
    return entry;
  }

  /**
   * Mark a connection as unhealthy (will be cleaned up)
   */
  markUnhealthy(peerId: string): void {
    const entries = this.pool.get(peerId);
    if (!entries) return;

    for (const entry of entries) {
      entry.healthy = false;
    }
  }

  /**
   * Increment stream count for a peer's connection
   */
  incrementStreams(peerId: string): void {
    const entry = this.getConnection(peerId);
    if (entry) {
      entry.streamCount++;
    }
  }

  /**
   * Decrement stream count for a peer's connection
   */
  decrementStreams(peerId: string): void {
    const entries = this.pool.get(peerId);
    if (!entries) return;

    for (const entry of entries) {
      if (entry.streamCount > 0) {
        entry.streamCount--;
        break;
      }
    }
  }

  /**
   * Remove all connections for a peer
   */
  removePeer(peerId: string): void {
    this.pool.delete(peerId);
  }

  /**
   * Clean up stale, idle, and unhealthy connections
   */
  cleanup(): void {
    const now = Date.now();

    for (const [peerId, entries] of this.pool) {
      const active = entries.filter(entry => {
        // Remove unhealthy
        if (!entry.healthy) return false;
        // Remove expired (TTL)
        if (now - entry.createdAt > this.config.connectionTTL) return false;
        // Remove idle
        if (now - entry.lastUsedAt > this.config.idleTimeout) return false;
        return true;
      });

      if (active.length === 0) {
        this.pool.delete(peerId);
      } else {
        this.pool.set(peerId, active);
      }
    }
  }

  /**
   * Evict the oldest connection from the pool
   */
  private evictOldest(): void {
    let oldestPeer: string | null = null;
    let oldestTime = Infinity;

    for (const [peerId, entries] of this.pool) {
      for (const entry of entries) {
        if (entry.lastUsedAt < oldestTime) {
          oldestTime = entry.lastUsedAt;
          oldestPeer = peerId;
        }
      }
    }

    if (oldestPeer) {
      const entries = this.pool.get(oldestPeer);
      if (entries && entries.length > 0) {
        entries.shift(); // Remove oldest
        if (entries.length === 0) {
          this.pool.delete(oldestPeer);
        }
      }
    }
  }

  /**
   * Get total number of connections in the pool
   */
  getTotalConnections(): number {
    let total = 0;
    for (const entries of this.pool.values()) {
      total += entries.length;
    }
    return total;
  }

  /**
   * Get the number of unique peers in the pool
   */
  getPeerCount(): number {
    return this.pool.size;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    peerCount: number;
    healthyConnections: number;
    avgLatency: number;
  } {
    let healthy = 0;
    let totalLatency = 0;
    let count = 0;

    for (const entries of this.pool.values()) {
      for (const entry of entries) {
        count++;
        if (entry.healthy) healthy++;
        totalLatency += entry.latency;
      }
    }

    return {
      totalConnections: count,
      peerCount: this.pool.size,
      healthyConnections: healthy,
      avgLatency: count > 0 ? Math.round(totalLatency / count) : 0,
    };
  }
}
