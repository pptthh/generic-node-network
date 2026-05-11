import type { NodeConfig } from '../types/config.js';

function nodeIdToPortOffset(nodeId: string): number {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) {
    hash = ((hash << 5) - hash + nodeId.charCodeAt(i)) & 0x7fffffff;
  }
  return hash % 900;
}

export function getDefaults(nodeId?: string): Omit<NodeConfig, 'nodeId' | 'apiToken' | 'configFile' | 'dbPath'> {
  const offset = nodeId ? nodeIdToPortOffset(nodeId) : 0;
  return {
    apiPort: 25111 + offset,
    p2pPort: 28111 + offset,
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
