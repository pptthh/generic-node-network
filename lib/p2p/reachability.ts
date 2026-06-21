import type { Libp2p } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';
import type { ReachabilityCheckConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

/**
 * Reachability status for a peer.
 */
export interface ReachabilityInfo {
  peerId: string;
  directReachable: boolean;
  relayReachable: boolean;
  avgLatency: number | null;
  natType: string;
  lastCheck: number;
}

/**
 * Self-reachability status.
 */
export interface SelfReachability {
  status: 'public' | 'private' | 'unknown';
  publicAddresses: string[];
  relayAddresses: string[];
  lastCheck: number;
}

/**
 * ReachabilityChecker periodically verifies whether
 * this node and its peers are directly reachable from the internet.
 */
export class ReachabilityChecker {
  private config: ReachabilityCheckConfig;
  private libp2p: Libp2p | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private selfStatus: SelfReachability = {
    status: 'unknown',
    publicAddresses: [],
    relayAddresses: [],
    lastCheck: 0,
  };
  private peerReachability: Map<string, ReachabilityInfo> = new Map();

  constructor(config: ReachabilityCheckConfig) {
    this.config = config;
  }

  /**
   * Start periodic reachability checks
   */
  start(libp2p: Libp2p): void {
    if (!this.config.enabled) return;

    this.libp2p = libp2p;

    // Initial check after a short delay (let connections establish)
    setTimeout(() => this.checkSelf(), 5000);

    // Periodic checks
    this.checkInterval = setInterval(
      () => this.performChecks(),
      this.config.interval
    );

    logger.debug('Reachability checker started', {
      interval: this.config.interval,
      peerSamples: this.config.peerSamples,
    });
  }

  /**
   * Stop reachability checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.libp2p = null;
    logger.debug('Reachability checker stopped');
  }

  /**
   * Perform all scheduled checks
   */
  private async performChecks(): Promise<void> {
    await this.checkSelf();
    await this.checkPeerSample();
  }

  /**
   * Check self reachability using libp2p's observed addresses and autoNAT.
   */
  async checkSelf(): Promise<SelfReachability> {
    if (!this.libp2p) return this.selfStatus;

    try {
      const multiaddrs = this.libp2p.getMultiaddrs();
      const publicAddrs: string[] = [];
      const relayAddrs: string[] = [];

      for (const ma of multiaddrs) {
        const addr = ma.toString();
        if (addr.includes('/p2p-circuit')) {
          relayAddrs.push(addr);
        } else if (!isPrivateAddress(addr)) {
          publicAddrs.push(addr);
        }
      }

      let status: 'public' | 'private' | 'unknown' = 'unknown';
      if (publicAddrs.length > 0) {
        status = 'public';
      } else if (relayAddrs.length > 0) {
        status = 'private';
      }

      this.selfStatus = {
        status,
        publicAddresses: publicAddrs,
        relayAddresses: relayAddrs,
        lastCheck: Date.now(),
      };
    } catch (err) {
      logger.debug('Self reachability check failed', err);
    }

    return this.selfStatus;
  }

  /**
   * Check a sample of connected peers for reachability
   */
  private async checkPeerSample(): Promise<void> {
    if (!this.libp2p) return;

    const connections = this.libp2p.getConnections();
    const peerIds = [...new Set(connections.map(c => c.remotePeer.toString()))];

    // Sample random peers
    const sampleSize = Math.min(this.config.peerSamples, peerIds.length);
    const sampled = shuffleArray(peerIds).slice(0, sampleSize);

    for (const peerId of sampled) {
      await this.checkPeer(peerId);
    }
  }

  /**
   * Check reachability of a specific peer
   */
  async checkPeer(peerId: string): Promise<ReachabilityInfo> {
    if (!this.libp2p) {
      return {
        peerId,
        directReachable: false,
        relayReachable: false,
        avgLatency: null,
        natType: 'unknown',
        lastCheck: Date.now(),
      };
    }

    const info: ReachabilityInfo = {
      peerId,
      directReachable: false,
      relayReachable: false,
      avgLatency: null,
      natType: 'unknown',
      lastCheck: Date.now(),
    };

    try {
      // Check existing connections
      const connections = this.libp2p.getConnections(peerId as any);
      if (connections.length > 0) {
        const conn = connections[0];
        const addr = conn.remoteAddr.toString();

        if (addr.includes('/p2p-circuit')) {
          info.relayReachable = true;
        } else {
          info.directReachable = true;
        }

        // Measure latency via ping
        try {
          const services = this.libp2p.services as Record<string, any>;
          if (services.ping) {
            const startTime = Date.now();
            await services.ping.ping(conn.remotePeer);
            info.avgLatency = Date.now() - startTime;
          }
        } catch {
          // Ping failed, latency unknown
        }
      }
    } catch (err) {
      logger.debug(`Reachability check failed for ${peerId}`, err);
    }

    this.peerReachability.set(peerId, info);
    return info;
  }

  /**
   * Get self reachability status
   */
  getSelfStatus(): SelfReachability {
    return this.selfStatus;
  }

  /**
   * Get reachability info for a specific peer
   */
  getPeerReachability(peerId: string): ReachabilityInfo | null {
    return this.peerReachability.get(peerId) ?? null;
  }

  /**
   * Get all peer reachability data
   */
  getAllPeerReachability(): ReachabilityInfo[] {
    return [...this.peerReachability.values()];
  }

  /**
   * Get reachability summary statistics
   */
  getStats(): {
    selfStatus: string;
    directlyReachablePeers: number;
    relayOnlyPeers: number;
    unreachablePeers: number;
    averageLatency: number;
  } {
    let direct = 0;
    let relayOnly = 0;
    let unreachable = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const info of this.peerReachability.values()) {
      if (info.directReachable) {
        direct++;
      } else if (info.relayReachable) {
        relayOnly++;
      } else {
        unreachable++;
      }
      if (info.avgLatency !== null) {
        totalLatency += info.avgLatency;
        latencyCount++;
      }
    }

    return {
      selfStatus: this.selfStatus.status,
      directlyReachablePeers: direct,
      relayOnlyPeers: relayOnly,
      unreachablePeers: unreachable,
      averageLatency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
    };
  }
}

/**
 * Check if a multiaddr contains a private/local IP address
 */
function isPrivateAddress(addr: string): boolean {
  const ipMatch = addr.match(/\/ip4\/(\d+\.\d+\.\d+\.\d+)/);
  if (!ipMatch) return true; // Non-IP addresses treated as private

  const ip = ipMatch[1];
  const parts = ip.split('.').map(Number);

  // RFC 1918 private ranges
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  // Loopback
  if (parts[0] === 127) return true;
  // Link-local
  if (parts[0] === 169 && parts[1] === 254) return true;

  return false;
}

/**
 * Shuffle an array (Fisher-Yates)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
