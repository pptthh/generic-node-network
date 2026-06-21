export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file: string | null;
  maxSizeKB: number;
  retentionDays: number;
  // Phase 4: dual-format logging
  formats?: ('human' | 'json')[];
  levels?: {
    human?: 'debug' | 'info' | 'warn' | 'error';
    json?: 'debug' | 'info' | 'warn' | 'error';
  };
  files?: {
    human: string;
    json: string;
  };
  rotation?: {
    maxSizeKB: number;
    retentionDays: number;
  };
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

// --- Phase 2: NAT Traversal ---

export interface UPnPConfig {
  enabled: boolean;
  description: string;
  ttl: number;
}

export interface PMPConfig {
  enabled: boolean;
}

export interface STUNConfig {
  enabled: boolean;
  servers: string[];
  checkInterval: number;
  timeout: number;
}

export interface RelayConfig {
  enabled: boolean;
  relayServers: string[];
  autoRegister: boolean;
  registrationInterval: number;
}

export interface HolePunchingConfig {
  enabled: boolean;
  timeout: number;
}

export interface NatTraversalConfig {
  enabled: boolean;
  methods: ('upnp' | 'pmp' | 'stun' | 'holepunching' | 'relay')[];
  upnp: UPnPConfig;
  pmp: PMPConfig;
  stun: STUNConfig;
  relay: RelayConfig;
  holepunching: HolePunchingConfig;
}

// --- Phase 2: Transports ---

export interface TCPTransportConfig {
  enabled: boolean;
  port: number;
  maxConnections: number;
  connectionTimeout: number;
}

export interface WebSocketTransportConfig {
  enabled: boolean;
  port: number;
  path: string;
  timeout: number;
  tls: boolean;
  tlsCertPath: string;
  tlsKeyPath: string;
  generateSelfSigned: boolean;
}

export interface WebTransportConfig {
  enabled: boolean;
  port: number;
  tlsCertPath: string;
  tlsKeyPath: string;
  generateSelfSigned: boolean;
  timeout: number;
}

export interface TransportsConfig {
  tcp: TCPTransportConfig;
  webSocket: WebSocketTransportConfig;
  webTransport: WebTransportConfig;
}

// --- Phase 2: Discovery (enhanced) ---

export interface DHTConfig {
  mode: 'client' | 'server';
  announceInterval: number;
  queryTimeout: number;
}

export interface DNSConfig {
  enabled: boolean;
  servers: string[];
  cacheSize: number;
  cacheTTL: number;
}

export interface DiscoveryConfig {
  mdnsEnabled: boolean;
  dhtEnabled: boolean;
  dht: DHTConfig;
  dns: DNSConfig;
}

// --- Phase 2: Gossipsub (enhanced) ---

export interface GossipsubConfig {
  enabled: boolean;
  heartbeatInterval: number;
  messageCache: {
    size: number;
    validityMs: number;
  };
  topicScoring: {
    enabled: boolean;
    maxTrackedTopics: number;
  };
}

// --- Phase 2: Performance ---

export interface ConnectionPoolingConfig {
  enabled: boolean;
  maxPoolSize: number;
  reuseThreshold: number;
  idleTimeout: number;
  connectionTTL: number;
}

export interface MultiplexingConfig {
  maxStreamsPerConnection: number;
  streamTimeout: number;
}

export interface PerformanceConfig {
  connectionPooling: ConnectionPoolingConfig;
  multiplexing: MultiplexingConfig;
}

// --- Phase 2: Monitoring ---

export interface ReachabilityCheckConfig {
  enabled: boolean;
  interval: number;
  peerSamples: number;
}

export interface ConnectivityMetricsConfig {
  enabled: boolean;
  sampleInterval: number;
}

export interface MonitoringConfig {
  reachabilityCheck: ReachabilityCheckConfig;
  connectivityMetrics: ConnectivityMetricsConfig;
}

// --- Phase 2: Bootstrap Nodes ---

export interface BootstrapNodeEntry {
  address: string;
  peerId: string;
  multiaddr: string;
  healthCheck?: string;
  type: 'bootstrap' | 'relay';
}

// --- Phase 2: Connection Strategy ---

export interface TransportStrategy {
  name: string;
  timeout: number;
  priority: number;
}

export interface ConnectionStrategyConfig {
  maxConcurrentAttempts: number;
  timeout: number;
  transports: TransportStrategy[];
}

// --- Phase 3: Security & Cryptography ---

export interface KeyStorageConfig {
  type: 'encrypted-file';
  path: string;
  encryptionAlgorithm: 'aes-256-gcm';
  encryptionKeyDerivation: 'scrypt';
  backupEnabled: boolean;
  backupPath: string;
}

export interface KeyRotationConfig {
  enabled: boolean;
  rotationIntervalDays: number;
  rotationInterval: number;
  retainOldKeys: number;
  retentionDays: number;
  gracePeriodDays: number;
  gracePeriod: number;
}

export interface SigningConfig {
  algorithm: 'Ed25519';
  hashAlgorithm: 'SHA256';
}

export interface MTLSConfig {
  enabled: boolean;
  mode: 'optional' | 'required';
  trustStore: string;
}

export interface TLSSecurityConfig {
  minVersion: '1.3';
  cipherSuites: string[];
  mTLS: MTLSConfig;
}

export interface CryptographyConfig {
  keyStorage: KeyStorageConfig;
  keyRotation: KeyRotationConfig;
  signing: SigningConfig;
  tls: TLSSecurityConfig;
}

export interface SecurityConfig {
  mode: 'trusted' | 'adversarial';
  defaultTrust: boolean;
}

export interface ReputationFactorsConfig {
  validMessageBenefit: number;
  invalidMessagePenalty: number;
  signatureFailPenalty: number;
  spamPenalty: number;
  timeoutPenalty: number;
  uptimeBonus: number;
  latencyBonus: {
    under50ms: number;
    under100ms: number;
    over500ms: number;
  };
}

export interface ReputationConfig {
  enabled: boolean;
  initialScore: number;
  minScore: number;
  maxScore: number;
  decayInterval: number;
  decayRate: number;
  factors: ReputationFactorsConfig;
}

export interface BlocklistConfig {
  enabled: boolean;
  types: ('reputation-based' | 'manual' | 'community-fed')[];
  storage: {
    local: string;
  };
  updateInterval: number;
}

export interface ApiTokensConfig {
  rotationEnabled: boolean;
  tokenTTL: number;
  tokenTTLDays: number;
  rotationInterval: number;
  rotationIntervalDays: number;
  gracePeriod: number;
  gracePeriodDays: number;
  maxTokensKept: number;
  hashAlgorithm: 'sha256';
  tokenLength: number;
}

export interface PerPeerRateLimitConfig {
  messagesPerSecond: number;
  queriesPerSecond: number;
  connectionAttemptsPerMinute: number;
  windowSizeMs: number;
}

export interface GlobalRateLimitConfig {
  messagesPerSecond: number;
  windowSizeMs: number;
}

export interface SpamConfig {
  duplicateMessageThreshold: number;
  duplicateWindowMs: number;
  largePayloadThreshold: number;
  largePayloadPenalty: number;
  malformedMessagePenalty: number;
}

export interface RateLimitingConfig {
  enabled: boolean;
  perPeer: PerPeerRateLimitConfig;
  global: GlobalRateLimitConfig;
  spam: SpamConfig;
}

// --- Phase 4: Compression ---

export interface CompressionAlgorithmConfig {
  enabled: boolean;
  level: number;
  threshold: number;
}

export interface CompressionConfig {
  enabled: boolean;
  algorithm: 'auto' | 'gzip' | 'brotli' | 'zstd';
  algorithms: {
    gzip: CompressionAlgorithmConfig;
    brotli: CompressionAlgorithmConfig;
    zstd: CompressionAlgorithmConfig;
  };
  selectionStrategy: 'adaptive' | 'static';
  compressionThreshold: number;
  blacklist: string[];
}

// --- Phase 4: Retry Logic ---

export interface ExponentialBackoffConfig {
  enabled: boolean;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
  jitterFactor: number;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenRequests: number;
}

export interface AdaptiveRetryConfig {
  enabled: boolean;
  baseRetries: number;
  maxRetries: number;
  backoffMultiplier: number;
  timeoutMultiplier: number;
}

export interface PerMessageTypeRetryConfig {
  maxRetries: number;
  timeout: number;
}

export interface RetryLogicConfig {
  enabled: boolean;
  strategies: {
    exponentialBackoff: ExponentialBackoffConfig;
    circuitBreaker: CircuitBreakerConfig;
    adaptiveRetry: AdaptiveRetryConfig;
  };
  perMessageType: {
    publish: PerMessageTypeRetryConfig;
    query: PerMessageTypeRetryConfig;
    response: PerMessageTypeRetryConfig;
  };
}

// --- Phase 4: Metrics Export ---

export interface MetricsExportConfig {
  enabled: boolean;
  exportFormat: 'prometheus';
  exportInterval: number;
  metricsPort: number;
  pushgateway: string | null;
}

// --- Phase 4: Graceful Shutdown ---

export interface ShutdownConfig {
  gracefulTimeout: number;
  timeoutAction: 'force_kill' | 'log_only';
  signalHandlers: boolean;
  cleanupSteps: (
    | 'flush_in_memory_queues'
    | 'close_connections'
    | 'persist_state'
    | 'close_database'
  )[];
}

// --- Phase 4: Health Checks ---

export interface HealthCheckEndpointConfig {
  enabled: boolean;
  path: string;
}

export interface HealthChecksConfig {
  enabled: boolean;
  interval: number;
  liveness: HealthCheckEndpointConfig;
  readiness: HealthCheckEndpointConfig;
}

// --- Main NodeConfig ---

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

  // Phase 2 (optional for backward compat)
  natTraversal?: NatTraversalConfig;
  transports?: TransportsConfig;
  gossipsub?: GossipsubConfig;
  performance?: PerformanceConfig;
  monitoring?: MonitoringConfig;
  publicBootstrapNodes?: BootstrapNodeEntry[];
  connectionStrategy?: ConnectionStrategyConfig;

  // Phase 3 (optional for backward compat)
  security?: SecurityConfig;
  cryptography?: CryptographyConfig;
  reputation?: ReputationConfig;
  blocklist?: BlocklistConfig;
  apiTokens?: ApiTokensConfig;
  rateLimiting?: RateLimitingConfig;

  // Phase 4 (optional for backward compat)
  compression?: CompressionConfig;
  retryLogic?: RetryLogicConfig;
  metricsExport?: MetricsExportConfig;
  shutdown?: ShutdownConfig;
  healthChecks?: HealthChecksConfig;
}
