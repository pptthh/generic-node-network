import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import type { NodeConfig, TransportsConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

/**
 * Transport configuration for Phase 2.
 * Supports TCP, WebSocket (with optional TLS), and Circuit Relay.
 */

export interface TransportConfig {
  tcp: { port: number };
  websocket?: { port: number; tls?: boolean };
}

/**
 * Build the array of libp2p transport instances based on config.
 */
export function buildTransports(config: NodeConfig) {
  const transports: unknown[] = [];
  const transportConfig = config.transports;

  // TCP transport (always enabled unless explicitly disabled)
  if (!transportConfig || transportConfig.tcp.enabled !== false) {
    transports.push(tcp());
  }

  // WebSocket transport
  if (!transportConfig || transportConfig.webSocket?.enabled !== false) {
    transports.push(webSockets());
  }

  // Circuit relay transport is added separately in node.ts
  // as it requires circuitRelayTransport() from @libp2p/circuit-relay-v2

  return transports;
}

/**
 * Build listen addresses for all enabled transports.
 */
export function buildListenAddresses(config: NodeConfig): string[] {
  const addrs: string[] = [];
  const transportConfig = config.transports;
  const p2pPort = config.p2pPort;

  // TCP listen address
  if (!transportConfig || transportConfig.tcp.enabled !== false) {
    const tcpPort = transportConfig?.tcp?.port ?? p2pPort;
    addrs.push(`/ip4/0.0.0.0/tcp/${tcpPort}`);
  }

  // WebSocket listen address
  if (!transportConfig || transportConfig.webSocket?.enabled !== false) {
    const wsPort = transportConfig?.webSocket?.port ?? p2pPort + 1;
    if (transportConfig?.webSocket?.tls) {
      addrs.push(`/ip4/0.0.0.0/tcp/${wsPort}/wss`);
    } else {
      addrs.push(`/ip4/0.0.0.0/tcp/${wsPort}/ws`);
    }
  }

  return addrs;
}

/**
 * Build announce addresses for DHT advertisement.
 * These are the addresses other nodes will use to connect to us.
 */
export function buildAnnounceAddresses(
  config: NodeConfig,
  publicIP: string | null,
  peerId?: string
): string[] {
  const addrs: string[] = [];
  const transportConfig = config.transports;
  const p2pPort = config.p2pPort;

  if (!publicIP) return addrs;

  // TCP announce
  if (!transportConfig || transportConfig.tcp.enabled !== false) {
    const tcpPort = transportConfig?.tcp?.port ?? p2pPort;
    const addr = `/ip4/${publicIP}/tcp/${tcpPort}`;
    addrs.push(peerId ? `${addr}/p2p/${peerId}` : addr);
  }

  // WebSocket announce
  if (transportConfig?.webSocket?.enabled) {
    const wsPort = transportConfig.webSocket.port ?? p2pPort + 1;
    const proto = transportConfig.webSocket.tls ? 'wss' : 'ws';
    const addr = `/ip4/${publicIP}/tcp/${wsPort}/${proto}`;
    addrs.push(peerId ? `${addr}/p2p/${peerId}` : addr);
  }

  return addrs;
}

/**
 * Get transport name from a multiaddr string.
 */
export function getTransportFromMultiaddr(addr: string): string {
  if (addr.includes('/p2p-circuit')) return 'relay';
  if (addr.includes('/wss')) return 'wss';
  if (addr.includes('/ws/') || addr.endsWith('/ws')) return 'ws';
  if (addr.includes('/tcp')) return 'tcp';
  return 'unknown';
}

/**
 * Log the transport configuration summary.
 */
export function logTransportConfig(config: NodeConfig): void {
  const tc = config.transports;
  const p2pPort = config.p2pPort;

  logger.info('Transport configuration:', {
    tcp: {
      enabled: !tc || tc.tcp.enabled !== false,
      port: tc?.tcp?.port ?? p2pPort,
    },
    webSocket: {
      enabled: tc?.webSocket?.enabled ?? true,
      port: tc?.webSocket?.port ?? p2pPort + 1,
      tls: tc?.webSocket?.tls ?? false,
    },
  });
}
