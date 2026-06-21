import { z } from 'zod';
import type { NodeConfig } from '../types/config.js';

// Phase 2 sub-schemas
const UPnPConfigSchema = z.object({
  enabled: z.boolean(),
  description: z.string(),
  ttl: z.number().positive(),
}).partial();

const PMPConfigSchema = z.object({
  enabled: z.boolean(),
}).partial();

const STUNConfigSchema = z.object({
  enabled: z.boolean(),
  servers: z.array(z.string()),
  checkInterval: z.number().nonnegative(),
  timeout: z.number().positive(),
}).partial();

const RelayConfigSchema = z.object({
  enabled: z.boolean(),
  relayServers: z.array(z.string()),
  autoRegister: z.boolean(),
  registrationInterval: z.number().positive(),
}).partial();

const HolePunchingConfigSchema = z.object({
  enabled: z.boolean(),
  timeout: z.number().positive(),
}).partial();

const NatTraversalConfigSchema = z.object({
  enabled: z.boolean(),
  methods: z.array(z.enum(['upnp', 'pmp', 'stun', 'holepunching', 'relay'])),
  upnp: UPnPConfigSchema,
  pmp: PMPConfigSchema,
  stun: STUNConfigSchema,
  relay: RelayConfigSchema,
  holepunching: HolePunchingConfigSchema,
}).partial();

const TCPTransportConfigSchema = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1024).max(65535),
  maxConnections: z.number().positive(),
  connectionTimeout: z.number().positive(),
}).partial();

const WebSocketTransportConfigSchema = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1024).max(65535),
  path: z.string(),
  timeout: z.number().positive(),
  tls: z.boolean(),
  tlsCertPath: z.string(),
  tlsKeyPath: z.string(),
  generateSelfSigned: z.boolean(),
}).partial();

const WebTransportConfigSchema = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1024).max(65535),
  tlsCertPath: z.string(),
  tlsKeyPath: z.string(),
  generateSelfSigned: z.boolean(),
  timeout: z.number().positive(),
}).partial();

const TransportsConfigSchema = z.object({
  tcp: TCPTransportConfigSchema,
  webSocket: WebSocketTransportConfigSchema,
  webTransport: WebTransportConfigSchema,
}).partial();

const DHTConfigSchema = z.object({
  mode: z.enum(['client', 'server']),
  announceInterval: z.number().positive(),
  queryTimeout: z.number().positive(),
}).partial();

const DNSConfigSchema = z.object({
  enabled: z.boolean(),
  servers: z.array(z.string()),
  cacheSize: z.number().positive(),
  cacheTTL: z.number().positive(),
}).partial();

const DiscoveryConfigSchema = z.object({
  mdnsEnabled: z.boolean(),
  dhtEnabled: z.boolean(),
  dht: DHTConfigSchema.optional(),
  dns: DNSConfigSchema.optional(),
});

const GossipsubConfigSchema = z.object({
  enabled: z.boolean(),
  heartbeatInterval: z.number().positive(),
  messageCache: z.object({
    size: z.number().positive(),
    validityMs: z.number().positive(),
  }),
  topicScoring: z.object({
    enabled: z.boolean(),
    maxTrackedTopics: z.number().positive(),
  }),
}).partial();

const ConnectionPoolingConfigSchema = z.object({
  enabled: z.boolean(),
  maxPoolSize: z.number().positive(),
  reuseThreshold: z.number().positive(),
  idleTimeout: z.number().positive(),
  connectionTTL: z.number().positive(),
}).partial();

const MultiplexingConfigSchema = z.object({
  maxStreamsPerConnection: z.number().positive(),
  streamTimeout: z.number().positive(),
}).partial();

const PerformanceConfigSchema = z.object({
  connectionPooling: ConnectionPoolingConfigSchema,
  multiplexing: MultiplexingConfigSchema,
}).partial();

const MonitoringConfigSchema = z.object({
  reachabilityCheck: z.object({
    enabled: z.boolean(),
    interval: z.number().positive(),
    peerSamples: z.number().positive(),
  }).partial(),
  connectivityMetrics: z.object({
    enabled: z.boolean(),
    sampleInterval: z.number().positive(),
  }).partial(),
}).partial();

const BootstrapNodeEntrySchema = z.object({
  address: z.string(),
  peerId: z.string(),
  multiaddr: z.string(),
  healthCheck: z.string().optional(),
  type: z.enum(['bootstrap', 'relay']),
});

const TransportStrategySchema = z.object({
  name: z.string(),
  timeout: z.number().positive(),
  priority: z.number().int().positive(),
});

const ConnectionStrategyConfigSchema = z.object({
  maxConcurrentAttempts: z.number().positive(),
  timeout: z.number().positive(),
  transports: z.array(TransportStrategySchema),
}).partial();

const NodeConfigSchema = z.object({
  nodeId: z.string().min(1),
  apiToken: z.string().min(32),
  apiPort: z.number().int().min(1024).max(65535),
  p2pPort: z.number().int().min(1024).max(65535),
  bootstrapPeers: z.array(z.string()),
  configFile: z.string(),
  dbPath: z.string(),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    file: z.string().nullable(),
    maxSizeKB: z.number().positive(),
    retentionDays: z.number().positive(),
  }),
  message: z.object({
    retentionDays: z.number().positive(),
    maxPayloadSize: z.number().positive(),
  }),
  peer: z.object({
    ttlDays: z.number().positive(),
    autoCleanupInterval: z.string(),
  }),
  timeouts: z.object({
    queryMs: z.number().positive(),
    broadcastMs: z.number().positive(),
    peerCheckIntervalSec: z.number().positive(),
  }),
  discovery: DiscoveryConfigSchema,

  // Phase 2 (optional)
  natTraversal: NatTraversalConfigSchema.optional(),
  transports: TransportsConfigSchema.optional(),
  gossipsub: GossipsubConfigSchema.optional(),
  performance: PerformanceConfigSchema.optional(),
  monitoring: MonitoringConfigSchema.optional(),
  publicBootstrapNodes: z.array(BootstrapNodeEntrySchema).optional(),
  connectionStrategy: ConnectionStrategyConfigSchema.optional(),
});

export function validateConfig(config: unknown): NodeConfig {
  return NodeConfigSchema.parse(config) as NodeConfig;
}
