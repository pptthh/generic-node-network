export * from './config.js';
export * from './messages.js';
export * from './peers.js';

// Re-export Phase 3 security types
export type {
  SecurityConfig,
  CryptographyConfig,
  KeyStorageConfig,
  KeyRotationConfig,
  SigningConfig,
  MTLSConfig,
  TLSSecurityConfig,
  ReputationConfig,
  ReputationFactorsConfig,
  BlocklistConfig,
  ApiTokensConfig,
  RateLimitingConfig,
  PerPeerRateLimitConfig,
  GlobalRateLimitConfig,
  SpamConfig,
} from './config.js';

export type {
  SignedMessageFields,
  SignedPublishedMessage,
  SignedQueryMessage,
  SignedResponseMessage,
  SignedGNNMessage,
} from './messages.js';

export type { PeerReputationInfo } from './peers.js';

export interface NodeInfo {
  nodeId: string;
  apiVersion: string;
  uptime: number;
  peerCount: number;
  subscriptionCount: number;
  messageCount: number;
  dbSize: number;
  diskFull: boolean;
  state: 'ONLINE' | 'DISK_FULL' | 'STARTING' | 'STOPPING';
  startedAt: string;
  timestamp: string;
}

export interface ApiError {
  error: string;
  message?: string;
  [key: string]: unknown;
}

export type WebSocketEvent =
  | { type: 'message_published'; message: import('./messages.js').PublishedMessage & { timestamp: string } }
  | { type: 'peer_online'; peerId: string; multiaddr: string; timestamp: string }
  | { type: 'peer_offline'; peerId: string; timestamp: string }
  | { type: 'query_response'; queryId: string; response: unknown; from: string; timestamp: string }
  | { type: 'broadcast_complete'; broadcastId: string; responses: import('./messages.js').PeerResponse[] }
  | { type: 'disk_full_warning'; freeSpace: number; timestamp: string }
  | { type: 'node_restarted'; uptime: number };
