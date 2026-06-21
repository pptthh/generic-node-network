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
}
