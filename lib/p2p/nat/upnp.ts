import { logger } from '../../utils/logger.js';
import type { PortMapping, PublicAddressInfo } from './types.js';

/**
 * UPnP/PMP port mapping using nat-api.
 * Handles both UPnP and NAT-PMP protocols via the unified nat-api library.
 */

interface NatAPIClient {
  externalIp: (callback: (err: Error | null, ip?: string) => void) => void;
  map: (options: {
    publicPort: number;
    privatePort: number;
    protocol: string;
    ttl: number;
    description?: string;
  }, callback: (err: Error | null) => void) => void;
  unmap: (options: {
    publicPort: number;
    privatePort: number;
    protocol: string;
  }, callback: (err: Error | null) => void) => void;
  destroy: () => void;
}

let natClient: NatAPIClient | null = null;
let renewalInterval: ReturnType<typeof setInterval> | null = null;
let activeMapping: PortMapping | null = null;

/**
 * Initialize the NAT-API client
 */
async function getClient(): Promise<NatAPIClient> {
  if (natClient) return natClient;

  try {
    const natApi = await import('nat-api');
    const NatAPI = natApi.default || natApi;
    natClient = new NatAPI() as NatAPIClient;
    return natClient;
  } catch (err) {
    throw new Error(`Failed to initialize nat-api: ${err}`);
  }
}

/**
 * Promisified wrapper for externalIp
 */
async function getExternalIPFromGateway(client: NatAPIClient): Promise<string> {
  return new Promise((resolve, reject) => {
    client.externalIp((err, ip) => {
      if (err) reject(err);
      else resolve(ip!);
    });
  });
}

/**
 * Promisified wrapper for map
 */
async function mapPort(
  client: NatAPIClient,
  publicPort: number,
  privatePort: number,
  protocol: string,
  ttl: number,
  description: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.map({ publicPort, privatePort, protocol, ttl, description }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Promisified wrapper for unmap
 */
async function unmapPort(
  client: NatAPIClient,
  publicPort: number,
  privatePort: number,
  protocol: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.unmap({ publicPort, privatePort, protocol }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Set up UPnP/PMP port mapping.
 * Returns the external IP address if successful.
 */
export async function setupPortMapping(
  internalPort: number,
  description: string = 'GenericNodeNet',
  ttl: number = 3600
): Promise<PublicAddressInfo | null> {
  try {
    const client = await getClient();

    // Get external IP from gateway
    const externalIP = await getExternalIPFromGateway(client);

    // Map the port
    await mapPort(client, internalPort, internalPort, 'TCP', ttl, description);

    activeMapping = {
      internalPort,
      externalPort: internalPort,
      externalAddress: externalIP,
      protocol: 'TCP',
      ttl,
      createdAt: Date.now(),
      description,
    };

    logger.info('UPnP/PMP port mapping successful', {
      externalIP,
      port: internalPort,
      ttl,
    });

    // Set up renewal at half the TTL
    if (renewalInterval) clearInterval(renewalInterval);
    renewalInterval = setInterval(async () => {
      try {
        const c = await getClient();
        await mapPort(c, internalPort, internalPort, 'TCP', ttl, description);
        logger.debug('UPnP/PMP mapping renewed', { port: internalPort });
      } catch (err) {
        logger.warn('UPnP/PMP renewal failed', err);
      }
    }, (ttl * 1000) / 2);

    return {
      address: externalIP,
      port: internalPort,
      natType: 'FullCone', // UPnP implies full cone behavior
      reachable: true,
      detectedAt: Date.now(),
      source: 'upnp',
    };
  } catch (err) {
    logger.warn('UPnP/PMP port mapping failed', err);
    return null;
  }
}

/**
 * Remove the active port mapping and clean up
 */
export async function removePortMapping(): Promise<void> {
  if (renewalInterval) {
    clearInterval(renewalInterval);
    renewalInterval = null;
  }

  if (activeMapping && natClient) {
    try {
      await unmapPort(
        natClient,
        activeMapping.externalPort,
        activeMapping.internalPort,
        activeMapping.protocol
      );
      logger.info('UPnP/PMP port mapping removed', {
        port: activeMapping.internalPort,
      });
    } catch (err) {
      logger.warn('Failed to remove UPnP/PMP mapping', err);
    }
  }

  activeMapping = null;

  if (natClient) {
    natClient.destroy();
    natClient = null;
  }
}

/**
 * Get the currently active port mapping info
 */
export function getActiveMapping(): PortMapping | null {
  return activeMapping;
}

/**
 * Get external IP from the gateway without creating a port mapping
 */
export async function getExternalIP(): Promise<string | null> {
  try {
    const client = await getClient();
    return await getExternalIPFromGateway(client);
  } catch (err) {
    logger.debug('Failed to get external IP from gateway', err);
    return null;
  }
}
