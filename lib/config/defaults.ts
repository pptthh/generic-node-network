import type { NodeConfig } from '../types/config.js';

export function getDefaults(): Omit<NodeConfig, 'nodeId' | 'apiToken' | 'configFile' | 'dbPath'> {
  return {
    apiPort: 25111,
    p2pPort: 28111,
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
