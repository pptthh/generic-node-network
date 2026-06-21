import type { Libp2p } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';
import type { ConnectionStrategyConfig, TransportStrategy } from '../../types/config.js';
import { logger } from '../../utils/logger.js';
import { getTransportFromMultiaddr } from '../transports.js';

/**
 * Result of a connection attempt.
 */
export interface ConnectionAttemptResult {
  success: boolean;
  transport: string;
  latency: number;
  address: string;
  error?: string;
}

/**
 * Default connection strategy if none configured.
 */
const DEFAULT_STRATEGY: ConnectionStrategyConfig = {
  maxConcurrentAttempts: 3,
  timeout: 10000,
  transports: [
    { name: 'tcp', timeout: 3000, priority: 1 },
    { name: 'ws', timeout: 3000, priority: 2 },
    { name: 'wss', timeout: 3000, priority: 3 },
    { name: 'relay', timeout: 10000, priority: 4 },
  ],
};

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise that rejects after specified ms.
 */
function timeoutPromise<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
  });
}

/**
 * Connect to a peer using multi-protocol failover.
 *
 * Strategy:
 * 1. Sort available addresses by transport priority
 * 2. Attempt connections in priority order with staggering
 * 3. First successful connection wins, others are cancelled
 * 4. Falls back to relay as last resort
 */
export async function connectWithFailover(
  libp2p: Libp2p,
  addresses: string[],
  config?: ConnectionStrategyConfig
): Promise<ConnectionAttemptResult> {
  const strategy = config ?? DEFAULT_STRATEGY;

  if (addresses.length === 0) {
    return {
      success: false,
      transport: 'none',
      latency: 0,
      address: '',
      error: 'No addresses provided',
    };
  }

  // Sort addresses by transport priority
  const sortedAddresses = sortByPriority(addresses, strategy.transports);

  // Attempt connections with staggering
  let completed = false;
  const results: Promise<ConnectionAttemptResult>[] = [];
  const abortControllers: AbortController[] = [];

  for (let i = 0; i < Math.min(sortedAddresses.length, strategy.maxConcurrentAttempts); i++) {
    const { address, transport } = sortedAddresses[i];
    const transportConfig = strategy.transports.find(t => t.name === transport);
    const timeout = transportConfig?.timeout ?? strategy.timeout;

    const controller = new AbortController();
    abortControllers.push(controller);

    const attemptPromise = (async (): Promise<ConnectionAttemptResult> => {
      // Stagger attempts by 500ms
      if (i > 0) await delay(500 * i);

      if (completed || controller.signal.aborted) {
        return { success: false, transport, latency: 0, address, error: 'Cancelled' };
      }

      const startTime = Date.now();

      try {
        const connection = await Promise.race([
          libp2p.dial(multiaddr(address)),
          timeoutPromise<never>(timeout, `${transport} to ${address}`),
        ]);

        if (completed) {
          // Another attempt succeeded first
          return { success: false, transport, latency: 0, address, error: 'Superseded' };
        }

        completed = true;
        const latency = Date.now() - startTime;

        logger.info(`Connected via ${transport}`, { address, latency });
        return { success: true, transport, latency, address };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.debug(`${transport} connection failed`, { address, error: errMsg });
        return { success: false, transport, latency: Date.now() - startTime, address, error: errMsg };
      }
    })();

    results.push(attemptPromise);
  }

  // Wait for all attempts and return first success
  const allResults = await Promise.all(results);
  const successResult = allResults.find(r => r.success);

  if (successResult) {
    return successResult;
  }

  // All attempts failed
  return {
    success: false,
    transport: 'none',
    latency: 0,
    address: addresses[0] || '',
    error: 'All connection attempts failed',
  };
}

/**
 * Sort addresses by transport priority from the strategy config.
 */
function sortByPriority(
  addresses: string[],
  transports: TransportStrategy[]
): { address: string; transport: string; priority: number }[] {
  return addresses
    .map(address => {
      const transport = getTransportFromMultiaddr(address);
      const config = transports.find(t => t.name === transport);
      const priority = config?.priority ?? 99;
      return { address, transport, priority };
    })
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Attempt a direct dial to a specific address with timeout.
 */
export async function attemptDirectConnection(
  libp2p: Libp2p,
  address: string,
  timeout: number = 5000
): Promise<ConnectionAttemptResult> {
  const transport = getTransportFromMultiaddr(address);
  const startTime = Date.now();

  try {
    await Promise.race([
      libp2p.dial(multiaddr(address)),
      timeoutPromise<never>(timeout, `direct to ${address}`),
    ]);

    return {
      success: true,
      transport,
      latency: Date.now() - startTime,
      address,
    };
  } catch (err) {
    return {
      success: false,
      transport,
      latency: Date.now() - startTime,
      address,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
