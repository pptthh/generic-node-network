export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file: string | null;
  maxSizeKB: number;
  retentionDays: number;
}

export interface MessageConfig {
  retentionDays: number;
  maxPayloadSize: number;
}

export interface PeerConfig {
  ttlDays: number;
  autoCleanupInterval: string;
}

export interface TimeoutsConfig {
  queryMs: number;
  broadcastMs: number;
  peerCheckIntervalSec: number;
}

export interface DiscoveryConfig {
  mdnsEnabled: boolean;
  dhtEnabled: boolean;
}

export interface NodeConfig {
  nodeId: string;
  apiToken: string;
  apiPort: number;
  p2pPort: number;
  bootstrapPeers: string[];
  configFile: string;
  dbPath: string;
  logging: LoggingConfig;
  message: MessageConfig;
  peer: PeerConfig;
  timeouts: TimeoutsConfig;
  discovery: DiscoveryConfig;
}
