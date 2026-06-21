import type { Libp2p } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';
import type { BootstrapNodeEntry } from '../types/config.js';
import { logger } from '../utils/logger.js';

/**
 * Bootstrap node status tracking
 */
interface BootstrapNodeStatus {
  entry: BootstrapNodeEntry;
  connected: boolean;
  lastAttempt: number;
  lastSuccess: number;
  failCount: number;
}

/**
 * BootstrapManager handles connecting to public bootstrap/seed nodes
 * to join the network and discover other peers.
 */
export class BootstrapManager {
  private nodes: Map<string, BootstrapNodeStatus> = new Map();
  private libp2p: Libp2p | null = null;
  private retryInterval: ReturnType<typeof setInterval> | null = null;

  constructor(bootstrapNodes: BootstrapNodeEntry[] = []) {
    for (const entry of bootstrapNodes) {
      this.nodes.set(entry.address, {
        entry,
        connected: false,
        lastAttempt: 0,
        lastSuccess: 0,
        failCount: 0,
      });
    }
  }

  /**
   * Start the bootstrap manager - connects to bootstrap nodes
   */
  async start(libp2p: Libp2p): Promise<void> {
    this.libp2p = libp2p;

    if (this.nodes.size === 0) {
      logger.debug('No bootstrap nodes configured');
      return;
    }

    logger.info('Connecting to bootstrap nodes...', { count: this.nodes.size });

    await this.connectToBootstrapNodes();

    // Retry failed connections every 60 seconds
    this.retryInterval = setInterval(() => this.retryFailed(), 60000);
  }

  /**
   * Stop the bootstrap manager
   */
  stop(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    this.libp2p = null;
    logger.debug('Bootstrap manager stopped');
  }

  /**
   * Connect to all configured bootstrap nodes
   */
  private async connectToBootstrapNodes(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.nodes.values()].map(status => this.connectToNode(status))
    );

    const connected = results.filter(r => r.status === 'fulfilled' && r.value).length;
    logger.info(`Bootstrap connection results: ${connected}/${this.nodes.size} connected`);
  }

  /**
   * Connect to a single bootstrap node
   */
  private async connectToNode(status: BootstrapNodeStatus): Promise<boolean> {
    if (!this.libp2p) return false;

    status.lastAttempt = Date.now();

    // Optional health check
    if (status.entry.healthCheck) {
      try {
        const response = await fetch(status.entry.healthCheck, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          logger.debug(`Bootstrap node unhealthy: ${status.entry.address}`);
          status.failCount++;
          return false;
        }
      } catch {
        logger.debug(`Bootstrap health check failed: ${status.entry.address}`);
        // Continue anyway - health endpoint might be down but P2P works
      }
    }

    try {
      const ma = multiaddr(status.entry.multiaddr);
      await this.libp2p.dial(ma);

      status.connected = true;
      status.lastSuccess = Date.now();
      status.failCount = 0;

      logger.info(`Connected to bootstrap node: ${status.entry.address}`);
      return true;
    } catch (err) {
      status.connected = false;
      status.failCount++;

      logger.debug(`Failed to connect to bootstrap node: ${status.entry.address}`, err);
      return false;
    }
  }

  /**
   * Retry connecting to failed bootstrap nodes
   */
  private async retryFailed(): Promise<void> {
    for (const status of this.nodes.values()) {
      if (!status.connected && status.failCount < 10) {
        await this.connectToNode(status);
      }
    }
  }

  /**
   * Add a bootstrap node dynamically
   */
  addNode(entry: BootstrapNodeEntry): void {
    this.nodes.set(entry.address, {
      entry,
      connected: false,
      lastAttempt: 0,
      lastSuccess: 0,
      failCount: 0,
    });
  }

  /**
   * Get status of all bootstrap nodes
   */
  getStatus(): BootstrapNodeStatus[] {
    return [...this.nodes.values()];
  }

  /**
   * Get connected bootstrap node count
   */
  getConnectedCount(): number {
    let count = 0;
    for (const status of this.nodes.values()) {
      if (status.connected) count++;
    }
    return count;
  }

  /**
   * Get relay-type bootstrap nodes for circuit relay
   */
  getRelayNodes(): BootstrapNodeEntry[] {
    return [...this.nodes.values()]
      .filter(s => s.entry.type === 'relay' && s.connected)
      .map(s => s.entry);
  }

  /**
   * Whether any bootstrap node is connected
   */
  isConnected(): boolean {
    for (const status of this.nodes.values()) {
      if (status.connected) return true;
    }
    return false;
  }
}
