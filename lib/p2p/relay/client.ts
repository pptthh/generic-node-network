import { multiaddr } from '@multiformats/multiaddr';
import type { Libp2p } from '@libp2p/interface';
import type { RelayConfig } from '../../types/config.js';
import { logger } from '../../utils/logger.js';

/**
 * Circuit Relay Client.
 * Manages registration with relay servers and keep-alive for nodes
 * that cannot be reached directly (behind restrictive NAT).
 */

interface RelayRegistration {
  relayAddr: string;
  connectedAt: number;
  lastRenewal: number;
  active: boolean;
}

export class RelayClient {
  private config: RelayConfig;
  private libp2p: Libp2p | null = null;
  private registrations: Map<string, RelayRegistration> = new Map();
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(config: RelayConfig) {
    this.config = config;
  }

  /**
   * Start the relay client. Connects to configured relay servers.
   */
  async start(libp2p: Libp2p): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('Circuit relay disabled in config');
      return;
    }

    this.libp2p = libp2p;

    if (this.config.autoRegister && this.config.relayServers.length > 0) {
      await this.registerWithRelays();
    }

    // Set up keep-alive interval
    if (this.config.registrationInterval > 0) {
      this.keepAliveInterval = setInterval(
        () => this.renewRegistrations(),
        this.config.registrationInterval
      );
    }

    this.started = true;
    logger.info('Relay client started', {
      relayServers: this.config.relayServers.length,
      autoRegister: this.config.autoRegister,
    });
  }

  /**
   * Register with all configured relay servers
   */
  private async registerWithRelays(): Promise<void> {
    for (const relayAddr of this.config.relayServers) {
      await this.registerWithRelay(relayAddr);
    }
  }

  /**
   * Register with a specific relay server
   */
  async registerWithRelay(relayAddr: string): Promise<boolean> {
    if (!this.libp2p) {
      logger.warn('Cannot register with relay: libp2p not initialized');
      return false;
    }

    try {
      const ma = multiaddr(relayAddr);
      await this.libp2p.dial(ma);

      this.registrations.set(relayAddr, {
        relayAddr,
        connectedAt: Date.now(),
        lastRenewal: Date.now(),
        active: true,
      });

      logger.info('Registered with relay server', { relay: relayAddr });
      return true;
    } catch (err) {
      logger.warn('Failed to register with relay', { relay: relayAddr, error: err });

      this.registrations.set(relayAddr, {
        relayAddr,
        connectedAt: 0,
        lastRenewal: 0,
        active: false,
      });

      return false;
    }
  }

  /**
   * Renew registrations with all active relay servers
   */
  private async renewRegistrations(): Promise<void> {
    for (const [addr, reg] of this.registrations) {
      if (!reg.active) {
        // Try to re-register with inactive relays
        await this.registerWithRelay(addr);
        continue;
      }

      try {
        if (this.libp2p) {
          const ma = multiaddr(addr);
          // Ping the relay to keep connection alive
          const connections = this.libp2p.getConnections(ma.getPeerId()!);
          if (connections.length === 0) {
            // Connection lost, re-register
            reg.active = false;
            await this.registerWithRelay(addr);
          } else {
            reg.lastRenewal = Date.now();
          }
        }
      } catch (err) {
        logger.debug('Relay renewal failed, will retry', { relay: addr, error: err });
        reg.active = false;
      }
    }
  }

  /**
   * Stop the relay client and clean up
   */
  async stop(): Promise<void> {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    this.registrations.clear();
    this.libp2p = null;
    this.started = false;
    logger.info('Relay client stopped');
  }

  /**
   * Get relay multiaddrs that can be used to reach this node
   */
  getRelayAddresses(): string[] {
    if (!this.libp2p) return [];

    const peerId = this.libp2p.peerId.toString();
    const addrs: string[] = [];

    for (const [addr, reg] of this.registrations) {
      if (reg.active) {
        // Circuit relay v2 address format
        addrs.push(`${addr}/p2p-circuit/p2p/${peerId}`);
      }
    }

    return addrs;
  }

  /**
   * Get status of all relay registrations
   */
  getRegistrations(): RelayRegistration[] {
    return [...this.registrations.values()];
  }

  /**
   * Check if at least one relay is active
   */
  hasActiveRelay(): boolean {
    for (const reg of this.registrations.values()) {
      if (reg.active) return true;
    }
    return false;
  }

  /**
   * Whether the relay client is running
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get count of active relay connections
   */
  getActiveRelayCount(): number {
    let count = 0;
    for (const reg of this.registrations.values()) {
      if (reg.active) count++;
    }
    return count;
  }
}
