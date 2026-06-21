import { createServer } from 'net';
import type { NodeConfig } from '../types/config.js';

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
  const [apiPort, p2pPort] = await Promise.all([
    findAvailablePort(25111),
    findAvailablePort(28111),
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
      dht: {
        mode: 'client',
        announceInterval: 60000,
        queryTimeout: 5000,
      },
      dns: {
        enabled: true,
        servers: ['8.8.8.8', '1.1.1.1'],
        cacheSize: 1000,
        cacheTTL: 3600000,
      },
    },

    // Phase 2 defaults
    natTraversal: {
      enabled: true,
      methods: ['upnp', 'pmp', 'stun', 'holepunching', 'relay'],
      upnp: {
        enabled: true,
        description: 'GenericNodeNet',
        ttl: 3600,
      },
      pmp: {
        enabled: true,
      },
      stun: {
        enabled: true,
        servers: [
          'stun1.l.google.com:19302',
          'stun2.l.google.com:19302',
        ],
        checkInterval: 300000,
        timeout: 5000,
      },
      relay: {
        enabled: true,
        relayServers: [],
        autoRegister: true,
        registrationInterval: 60000,
      },
      holepunching: {
        enabled: true,
        timeout: 3000,
      },
    },
    transports: {
      tcp: {
        enabled: true,
        port: p2pPort,
        maxConnections: 100,
        connectionTimeout: 5000,
      },
      webSocket: {
        enabled: true,
        port: p2pPort + 1,
        path: '/ws/p2p',
        timeout: 3000,
        tls: false,
        tlsCertPath: './gnn-cert-${node-id}.pem',
        tlsKeyPath: './gnn-key-${node-id}.pem',
        generateSelfSigned: true,
      },
      webTransport: {
        enabled: false, // Not yet supported server-side
        port: p2pPort + 2,
        tlsCertPath: './gnn-cert-${node-id}.pem',
        tlsKeyPath: './gnn-key-${node-id}.pem',
        generateSelfSigned: true,
        timeout: 3000,
      },
    },
    gossipsub: {
      enabled: true,
      heartbeatInterval: 1000,
      messageCache: {
        size: 1000,
        validityMs: 120000,
      },
      topicScoring: {
        enabled: true,
        maxTrackedTopics: 500,
      },
    },
    performance: {
      connectionPooling: {
        enabled: true,
        maxPoolSize: 50,
        reuseThreshold: 5,
        idleTimeout: 60000,
        connectionTTL: 3600000,
      },
      multiplexing: {
        maxStreamsPerConnection: 1000,
        streamTimeout: 30000,
      },
    },
    monitoring: {
      reachabilityCheck: {
        enabled: true,
        interval: 300000,
        peerSamples: 5,
      },
      connectivityMetrics: {
        enabled: true,
        sampleInterval: 60000,
      },
    },
    publicBootstrapNodes: [],
    connectionStrategy: {
      maxConcurrentAttempts: 3,
      timeout: 10000,
      transports: [
        { name: 'tcp', timeout: 3000, priority: 1 },
        { name: 'ws', timeout: 3000, priority: 2 },
        { name: 'wss', timeout: 3000, priority: 3 },
        { name: 'relay', timeout: 10000, priority: 4 },
      ],
    },
  };
}
