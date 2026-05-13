import { createServer } from 'net';
import type { NodeConfig } from '../types/config.js';

function nodeIdToPortOffset(nodeId: string): number {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) {
    hash = ((hash << 5) - hash + nodeId.charCodeAt(i)) & 0x7fffffff;
  }
  return hash % 900;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let i = 0; i < 100; i++) {
    if (await isPortAvailable(startPort + i)) return startPort + i;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function getDefaults(nodeId?: string): Promise<Omit<NodeConfig, 'nodeId' | 'apiToken' | 'configFile' | 'dbPath'>> {
  const offset = nodeId ? nodeIdToPortOffset(nodeId) : 0;
  const [apiPort, p2pPort] = await Promise.all([
    findAvailablePort(25111 + offset),
    findAvailablePort(28111 + offset),
  ]);
  return {
    apiPort,
    p2pPort,
    bootstrapPeers: [],
    logging: {
      level: 'error',
      file: null,
      maxSizeKB: 100,
      retentionDays: 1,
    },
    message: {
      retentionDays: 28,
      maxPayloadSize: 31744,
    },
    peer: {
      ttlDays: 14,
      autoCleanupInterval: '24h',
    },
    timeouts: {
      queryMs: 100,
      broadcastMs: 1000,
      peerCheckIntervalSec: 30,
    },
    discovery: {
      mdnsEnabled: true,
      dhtEnabled: true,
    },
  };
}
