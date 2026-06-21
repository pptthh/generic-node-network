import { EventEmitter } from 'events';
import type { NatTraversalConfig } from '../../types/config.js';
import { logger } from '../../utils/logger.js';
import { detectPublicIP, detectNatType, clearSTUNCache } from './stun.js';
import type { NatTraversalResult, NatType, PublicAddressInfo } from './types.js';
import { setupPortMapping, removePortMapping, getActiveMapping } from './upnp.js';

/**
 * NatManager orchestrates the NAT traversal decision tree:
 * 1. Attempt UPnP/PMP port mapping
 * 2. If UPnP fails, try STUN to detect public IP
 * 3. Detect NAT type
 * 4. Determine if relay is required
 *
 * Emits events as traversal progresses.
 */
export class NatManager extends EventEmitter {
  private config: NatTraversalConfig;
  private result: NatTraversalResult | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(config: NatTraversalConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the NAT traversal process.
   * Attempts methods in order: UPnP/PMP → STUN → relay determination
   */
  async start(p2pPort: number): Promise<NatTraversalResult> {
    if (!this.config.enabled) {
      this.result = {
        publicAddress: null,
        portMapping: null,
        natType: 'Unknown',
        reachable: false,
        method: 'none',
        relayRequired: true,
      };
      return this.result;
    }

    logger.info('Starting NAT traversal...');

    let publicAddress: PublicAddressInfo | null = null;
    let method: NatTraversalResult['method'] = 'none';

    // Step 1: Try UPnP/PMP
    if (this.config.methods.includes('upnp') && this.config.upnp.enabled) {
      logger.debug('Attempting UPnP port mapping...');
      publicAddress = await setupPortMapping(
        p2pPort,
        this.config.upnp.description,
        this.config.upnp.ttl
      );
      if (publicAddress) {
        method = 'upnp';
        this.emit('nat:mapped', getActiveMapping());
        this.emit('nat:public-ip-detected', publicAddress);
      }
    }

    // Step 1b: Try PMP if UPnP failed (nat-api handles both, but try again explicitly)
    if (!publicAddress && this.config.methods.includes('pmp') && this.config.pmp.enabled) {
      logger.debug('Attempting PMP port mapping...');
      publicAddress = await setupPortMapping(
        p2pPort,
        this.config.upnp.description,
        this.config.upnp.ttl
      );
      if (publicAddress) {
        method = 'pmp';
        this.emit('nat:mapped', getActiveMapping());
        this.emit('nat:public-ip-detected', publicAddress);
      }
    }

    // Step 2: Try STUN for public IP detection
    if (!publicAddress && this.config.methods.includes('stun') && this.config.stun.enabled) {
      logger.debug('Attempting STUN public IP detection...');
      publicAddress = await detectPublicIP(
        this.config.stun.servers,
        this.config.stun.timeout
      );
      if (publicAddress) {
        method = 'stun';
        this.emit('nat:public-ip-detected', publicAddress);
      }
    }

    // Step 3: Detect NAT type
    let natType: NatType = 'Unknown';
    if (this.config.stun.enabled && this.config.stun.servers.length >= 2) {
      natType = await detectNatType(this.config.stun.servers, this.config.stun.timeout);
      if (publicAddress) {
        publicAddress.natType = natType;
      }
      this.emit('nat:type-detected', natType);
      logger.info(`NAT type detected: ${natType}`);
    }

    // Step 4: Determine reachability
    const reachable = publicAddress !== null && natType !== 'Symmetric';
    const relayRequired = !reachable && this.config.methods.includes('relay');

    if (!reachable) {
      this.emit('nat:unreachable');
      logger.info('Node is not directly reachable, relay required');
    }

    this.result = {
      publicAddress,
      portMapping: getActiveMapping(),
      natType,
      reachable,
      method,
      relayRequired,
    };

    // Set up periodic re-check
    if (this.config.stun.checkInterval > 0) {
      this.checkInterval = setInterval(
        () => this.refreshPublicAddress(),
        this.config.stun.checkInterval
      );
    }

    this.started = true;
    logger.info('NAT traversal complete', {
      publicIP: publicAddress?.address ?? 'none',
      natType,
      method,
      reachable,
      relayRequired,
    });

    return this.result;
  }

  /**
   * Periodically refresh public address detection
   */
  private async refreshPublicAddress(): Promise<void> {
    if (!this.config.stun.enabled) return;

    clearSTUNCache();
    const newAddress = await detectPublicIP(
      this.config.stun.servers,
      this.config.stun.timeout
    );

    if (newAddress && this.result) {
      const oldIP = this.result.publicAddress?.address;
      if (oldIP !== newAddress.address) {
        logger.info('Public IP changed', { old: oldIP, new: newAddress.address });
        this.result.publicAddress = newAddress;
        this.emit('nat:public-ip-detected', newAddress);
      }
    }
  }

  /**
   * Stop the NAT manager and clean up resources
   */
  async stop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    await removePortMapping();
    clearSTUNCache();
    this.started = false;
    logger.info('NAT manager stopped');
  }

  /**
   * Get the current NAT traversal result
   */
  getResult(): NatTraversalResult | null {
    return this.result;
  }

  /**
   * Get the public multiaddr string for DHT announcement
   */
  getPublicMultiaddr(p2pPort: number, peerId: string): string | null {
    if (!this.result?.publicAddress) return null;
    const { address, port } = this.result.publicAddress;
    return `/ip4/${address}/tcp/${port || p2pPort}/p2p/${peerId}`;
  }

  /**
   * Whether the NAT manager has been started
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Whether this node requires relay for connectivity
   */
  isRelayRequired(): boolean {
    return this.result?.relayRequired ?? true;
  }
}
