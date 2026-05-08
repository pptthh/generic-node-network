# 📋 PHASE 2: INTERNET + NAT TRAVERSAL IMPLEMENTATION PROMPT

## 🎯 PROJECT SPECIFICATION

**Project Name:** GenericNodeNet (GNN) - Phase 2: Internet Connectivity  
**Phase:** Phase 2 (Production Internet)  
**Timeline:** 4-6 weeks  
**Stack:** Bun 1.3.11 + Next.js 16.2 + LevelDB + libp2p (enhanced)  
**Target:** Internet connectivity with NAT traversal and relay support  
**Dependency:** Requires MVP (Phase 0) as foundation  

---

## 1. PHASE 2 OVERVIEW

### 1.1 What Phase 2 Adds

Phase 2 extends the MVP from **local network only** to **full internet connectivity** by adding:

- **WebTransport (QUIC-based)** for faster connections than WebSocket
- **NAT Traversal** (UPnP, PMP, hole punching)
- **Circuit Relay** for nodes behind restrictive firewalls
- **STUN/TURN** servers for peer discovery behind NAT
- **Connection multiplexing** optimizations
- **Peer reachability detection** (can this peer be reached from internet?)
- **Multi-protocol fallback** (TCP → WebSocket → WebTransport → Relay)
- **Internet bootstrap nodes** (public seed nodes)
- **DNS resolution** for peer addresses

### 1.2 Success Criteria (Phase 2)

✅ **Nodes discover each other across internet** (not just LAN)  
✅ **Direct peer connections established** even behind NAT (80%+ success rate)  
✅ **Circuit relay** works for remaining 20% (unreachable peers)  
✅ **WebTransport** connections 30-40% faster than WebSocket  
✅ **Multiple transports in parallel** (failover if one fails)  
✅ **Relay node can serve 100+ concurrent clients**  
✅ **Connection persistence** across network changes  
✅ **Public bootstrap nodes** discoverable and working  
✅ **Zero additional configuration** needed for NAT (auto-detection)  
✅ **Cross-region latency** acceptable (<500ms typical)  
✅ **Bandwidth efficient** (reuse connections, multiplexing)  

---

## 2. ARCHITECTURE CHANGES

### 2.1 Phase 2 Deployment Model

```
┌─────────────────────────────────────────────────────┐
│         GNN Node Instance (Internet-Ready)          │
│  Memory: ~60-80 MB | Ports: 25111 + 28111+         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Same as Phase 1: REST API, WebSocket, Router]    │
│                                                     │
├─────────────────────────────────────────────────────┤
│  ┌─ NEW Layer 4B: P2P Transport (Enhanced) ──────┐ │
│  │                                                │ │
│  │ Primary Transports:                            │ │
│  │  1. TCP (@libp2p/tcp) [LAN + Internet]        │ │
│  │  2. WebTransport (@libp2p/webtransport) NEW   │ │
│  │  3. WebSocket (@libp2p/websockets)            │ │
│  │                                                │ │
│  │ Advanced Features:                             │ │
│  │  • UPnP/PMP (port mapping)                    │ │
│  │  • STUN/TURN (NAT detection + relay)          │ │
│  │  • Circuit Relay (@libp2p/circuit-relay-v2)  │ │
│  │  • Connection pooling & multiplexing          │ │
│  │  • Peer reachability detection                │ │
│  │  • Failover logic (try next transport if fail) │ │
│  │                                                │ │
│  │ Discovery (Enhanced):                          │ │
│  │  • mDNS (@libp2p/mdns) [LAN only]             │ │
│  │  • Kademlia DHT (@libp2p/kad-dht) [Internet]  │ │
│  │  • Bootstrap nodes (seed peers)               │ │
│  │  • DNS resolution for peer addresses          │ │
│  │                                                │ │
│  │ Gossipsub (Enhanced):                          │ │
│  │  • Heartbeat optimization                     │ │
│  │  • Message caching (gossip efficiency)        │ │
│  │  • Topic scoring (reputation)                 │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 NAT Traversal Flow

```
┌─────────────────────────────────────────────────────┐
│           NAT Traversal Decision Tree               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  New Node Joins Network                            │
│    ↓                                                │
│  1. Detect Local Address                           │
│    ├─ IPv4: 192.168.x.x, 10.x.x.x, 172.x.x.x    │
│    └─ IPv6: fe80::, fc00::, etc.                 │
│    ↓                                                │
│  2. Attempt UPnP/PMP Port Mapping                 │
│    ├─ Success: External IP:port established       │
│    ├─ Announce as: /ip4/${EXT_IP}/tcp/${PORT}   │
│    └─ Failure: Try STUN                          │
│    ↓                                                │
│  3. Query STUN Server (coturn, stunner, etc.)    │
│    ├─ Detect NAT type (Full Cone, Restricted, etc.) │
│    ├─ Get public IP:port                         │
│    └─ Announce if reachable                      │
│    ↓                                                │
│  4. Try Hole Punching (TCP)                       │
│    ├─ Connect simultaneously to peer via DHT      │
│    ├─ Success: Direct P2P connection             │
│    └─ Failure: Use Relay                         │
│    ↓                                                │
│  5. Join Circuit Relay (if needed)               │
│    ├─ Register with relay node                    │
│    ├─ Request: /ip4/${RELAY_IP}/tcp/4001/...    │
│    └─ Peers can reach via: /circuit/p2p/${YOUR_ID}│
│    ↓                                                │
│  ✅ Node reachable (direct or via relay)          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.3 Multi-Protocol Connection Attempt

```
Node-A tries to connect to Node-B:

  1. Query DHT for Node-B's addresses
    → Get: [
        /ip4/203.0.113.50/tcp/28111/p2p/Qm...,
        /ip4/203.0.113.50/tcp/443/wss/p2p/Qm...,
        /ip6/2001:db8::1/tcp/28111/p2p/Qm...,
        /circuit/relay.gnn.io/p2p/Qm...
      ]
  
  2. Try addresses in parallel (with timeouts):
    
    Attempt 1 (TCP):
      /ip4/203.0.113.50/tcp/28111/p2p/Qm...
      → Timeout 3 sec → Fail (firewall blocking)
    
    Attempt 2 (WebTransport):
      /ip4/203.0.113.50/tcp/443/wss/p2p/Qm...
      → Success in 150ms! ✅
      → Use this connection
      → Cancel remaining attempts
    
    Attempt 3 (Relay - cancelled):
      /circuit/relay.gnn.io/p2p/Qm...
      → (cancelled, already connected via WebTransport)
  
  3. Result: Connected via WebTransport in 150ms
```

---

## 3. NEW TECHNOLOGY ADDITIONS

### 3.1 Transport Stack (Phase 2)

```
New/Enhanced:
  Core:
    - libp2p/js (latest, v0.47+)
    - @libp2p/webtransport (v2.0+) NEW
    - @libp2p/stun-socket (NEW) for NAT detection
    - @libp2p/circuit-relay-v2 (v1.0+) for relay
    - @libp2p/quic (optional, future alternative to WebTransport)
  
  NAT Traversal:
    - nat-pmp (via node library) for PMP support
    - miniupnpc (UPnP wrapper) OR nat-library
    - stun (STUN client for public IP detection)
    - coturn (public STUN/TURN server reference)
  
  Enhanced P2P:
    - @libp2p/tcp (v10+, with connection pooling)
    - @libp2p/websockets (v11+)
    - @libp2p/kad-dht (v13.2+, enhanced DHT)
    - @libp2p/gossipsub (v14+, with heartbeat optimization)
  
  Bootstrap:
    - Bootstrap nodes list (JSON config)
    - DNS resolution for .gnn domain
    - Public relay nodes (optional hosted service)
```

### 3.2 Dependency Additions

```json
{
  "dependencies": {
    "libp2p": "^0.47.0",
    "@libp2p/tcp": "^10.0.0",
    "@libp2p/webtransport": "^2.0.0",
    "@libp2p/websockets": "^11.0.0",
    "@libp2p/circuit-relay-v2": "^1.0.0",
    "@libp2p/kad-dht": "^13.2.0",
    "@libp2p/gossipsub": "^14.0.0",
    "@libp2p/mplex": "^11.0.0",
    "@libp2p/mdns": "^11.0.0",
    "stun": "^2.0.0",
    "nat-pmp": "^2.4.0",
    "miniupnpc": "^1.0.0",
    "level": "^8.0.0",
    "ws": "^8.15.0",
    "zod": "^3.22.0",
    "uuid": "^9.0.0",
    "pino": "^8.15.0"
  }
}
```

---

## 4. CONFIGURATION SYSTEM (PHASE 2)

### 4.1 New Config Options

**Additions to `gnn-conf-${node-id}.json`:**

```json
{
  "nodeId": "node-a",
  "apiToken": "token_abc123_xyz...",
  "apiPort": 25111,
  "p2pPort": 28111,
  
  "bootstrapPeers": [
    "/ip4/192.168.1.100/tcp/28111/p2p/Qm...",
    "/ip4/seed1.gnn.io/tcp/28111/p2p/Qm...",
    "/ip4/seed2.gnn.io/tcp/28111/p2p/Qm..."
  ],
  
  "publicBootstrapNodes": [
    {
      "address": "seed1.gnn.io",
      "peerId": "Qm...",
      "multiaddr": "/ip4/203.0.113.1/tcp/28111/p2p/Qm..."
    },
    {
      "address": "seed2.gnn.io",
      "peerId": "Qm...",
      "multiaddr": "/ip4/203.0.113.2/tcp/28111/p2p/Qm..."
    }
  ],
  
  "natTraversal": {
    "enabled": true,
    "methods": [
      "upnp",
      "pmp",
      "stun",
      "holepunching",
      "relay"
    ],
    "upnp": {
      "enabled": true,
      "description": "GenericNodeNet",
      "ttl": 3600
    },
    "pmp": {
      "enabled": true
    },
    "stun": {
      "enabled": true,
      "servers": [
        "stun1.l.google.com:19302",
        "stun2.l.google.com:19302",
        "stun.coturn.io:3478"
      ],
      "checkInterval": 300000,
      "timeout": 5000
    },
    "relay": {
      "enabled": true,
      "relayServers": [
        "/ip4/relay1.gnn.io/tcp/28111/p2p/Qm...",
        "/ip4/relay2.gnn.io/tcp/28111/p2p/Qm..."
      ],
      "autoRegister": true,
      "registrationInterval": 60000
    },
    "holepunching": {
      "enabled": true,
      "timeout": 3000
    }
  },
  
  "transports": {
    "tcp": {
      "enabled": true,
      "port": 28111,
      "maxConnections": 100,
      "connectionTimeout": 5000
    },
    "webTransport": {
      "enabled": true,
      "port": 28111,
      "tlsCertPath": "./gnn-cert-${node-id}.pem",
      "tlsKeyPath": "./gnn-key-${node-id}.pem",
      "generateSelfSigned": true,
      "timeout": 3000
    },
    "webSocket": {
      "enabled": true,
      "port": 25111,
      "path": "/ws/p2p",
      "timeout": 3000
    }
  },
  
  "discovery": {
    "mdns": {
      "enabled": true,
      "query": "_gnn._tcp.local"
    },
    "dht": {
      "enabled": true,
      "mode": "client",
      "announceInterval": 60000,
      "queryTimeout": 5000
    },
    "dns": {
      "enabled": true,
      "servers": ["8.8.8.8", "1.1.1.1"],
      "cacheSize": 1000,
      "cacheTTL": 3600000
    }
  },
  
  "gossipsub": {
    "enabled": true,
    "heartbeatInterval": 1000,
    "messageCache": {
      "size": 1000,
      "validityMs": 120000
    },
    "topicScoring": {
      "enabled": true,
      "maxTrackedTopics": 500
    }
  },
  
  "performance": {
    "connectionPooling": {
      "enabled": true,
      "maxPoolSize": 50,
      "reuseThreshold": 5
    },
    "multiplexing": {
      "maxStreamsPerConnection": 1000,
      "streamTimeout": 30000
    }
  },
  
  "monitoring": {
    "reachabilityCheck": {
      "enabled": true,
      "interval": 300000,
      "peerSamples": 5
    },
    "connectivityMetrics": {
      "enabled": true,
      "sampleInterval": 60000
    }
  }
}
```

### 4.2 Environment Variables (Phase 2)

```bash
# NAT Traversal
GNN_NAT_ENABLED=true
GNN_NAT_METHODS="upnp,pmp,stun,holepunching,relay"
GNN_UPNP_ENABLED=true
GNN_PMP_ENABLED=true
GNN_STUN_SERVERS="stun1.l.google.com:19302,stun2.l.google.com:19302"
GNN_RELAY_SERVERS="/ip4/relay1.gnn.io/tcp/28111/p2p/Qm...,/ip4/relay2.gnn.io/tcp/28111/p2p/Qm..."
GNN_RELAY_AUTO_REGISTER=true

# Transports
GNN_WEBTRANSPORT_ENABLED=true
GNN_WEBTRANSPORT_PORT=28111
GNN_WEBTRANSPORT_TLS_CERT=/path/to/cert.pem
GNN_WEBTRANSPORT_TLS_KEY=/path/to/key.pem
GNN_WEBTRANSPORT_SELF_SIGNED=true

# Discovery
GNN_DHT_MODE=client
GNN_DNS_ENABLED=true
GNN_DNS_SERVERS="8.8.8.8,1.1.1.1"

# Performance
GNN_CONNECTION_POOLING=true
GNN_MAX_POOL_SIZE=50
GNN_MULTIPLEXING_ENABLED=true
GNN_MAX_STREAMS_PER_CONN=1000

# Public Bootstrap Nodes
GNN_PUBLIC_BOOTSTRAP_NODES="seed1.gnn.io:Qm...,seed2.gnn.io:Qm..."
```

### 4.3 CLI Flags (Phase 2 Additions)

```bash
bun run start [options]

NEW OPTIONS (Phase 2):
  --nat-enabled                   Enable NAT traversal (default: true)
  --nat-methods <list>            Comma-separated methods: upnp,pmp,stun,holepunching,relay
  --upnp-enabled                  Enable UPnP port mapping (default: true)
  --pmp-enabled                   Enable PMP (default: true)
  --stun-servers <list>           Comma-separated STUN servers
  --relay-servers <list>          Comma-separated relay server multiaddrs
  --relay-auto-register           Auto-register with relay (default: true)
  --webtransport-enabled          Enable WebTransport (default: true)
  --webtransport-cert <path>      Path to TLS certificate for WebTransport
  --webtransport-key <path>       Path to TLS private key
  --dht-mode <mode>               DHT mode: client, server (default: client)
  --connection-pooling            Enable connection pooling (default: true)
  --max-pool-size <num>           Max connections in pool (default: 50)
  --bootstrap-nodes <list>        Public bootstrap node addresses

EXAMPLES:
  # Enable all NAT traversal methods
  bun run start --node-id=prod-1 --nat-methods="upnp,pmp,stun,holepunching,relay"
  
  # Custom STUN servers
  bun run start --node-id=prod-1 --stun-servers="stun.custom.io:3478,stun2.custom.io:3478"
  
  # WebTransport with custom certificates
  bun run start --node-id=prod-1 --webtransport-cert=/etc/gnn/cert.pem --webtransport-key=/etc/gnn/key.pem
```

---

## 5. NAT TRAVERSAL IMPLEMENTATION

### 5.1 UPnP Port Mapping

**Flow:**
```
1. Discover UPnP device on local network
2. Get external IP from gateway
3. Map internal port to external port
4. Add port mapping rules to gateway
5. Announce public multiaddr: /ip4/${EXT_IP}/tcp/${PORT}/p2p/Qm...
6. Periodically renew mapping (TTL)
```

**Code Pattern (Pseudocode):**
```typescript
async function setupUPnP(internalPort: number, description: string) {
  try {
    const device = await discoverUPnPDevice();
    const externalIP = await device.getExternalIPAddress();
    
    await device.addPortMapping({
      externalPort: internalPort,
      internalPort: internalPort,
      protocol: 'TCP',
      description: description,
      ttl: 3600
    });
    
    logger.info('UPnP mapping successful', {
      externalIP,
      port: internalPort,
      ttl: 3600
    });
    
    // Renew mapping periodically
    setInterval(() => {
      device.addPortMapping({...}); // Refresh TTL
    }, 1800000); // Every 30 minutes
    
    return externalIP;
  } catch (error) {
    logger.warn('UPnP discovery failed', error);
    return null; // Fall back to STUN
  }
}
```

### 5.2 STUN Public IP Detection

**Flow:**
```
1. Connect to public STUN server
2. Send binding request
3. STUN server responds with detected public IP:port
4. Determine NAT type (Full Cone, Restricted, Symmetric, etc.)
5. Cache result (recheck every 5 minutes)
6. Use public IP for multiaddr announcement
```

**Code Pattern (Pseudocode):**
```typescript
async function detectPublicIP(stunServers: string[]) {
  for (const server of stunServers) {
    try {
      const { address, port, natType } = await querySTUNServer(server);
      
      logger.info('STUN detection successful', {
        publicIP: address,
        publicPort: port,
        natType
      });
      
      return { address, port, natType, reachable: true };
    } catch (error) {
      logger.debug(`STUN server ${server} failed, trying next...`);
    }
  }
  
  logger.error('All STUN servers failed');
  return { reachable: false };
}
```

### 5.3 Hole Punching

**Flow:**
```
1. Two peers behind different NATs want direct connection
2. Both connect to STUN to get public IP:port
3. Simultaneous connection attempt:
   - Peer A connects to Peer B's STUN-detected address
   - Peer B connects to Peer A's STUN-detected address
   - NAT rules allow incoming from known sources
4. First connection succeeds, second is redundant
5. Direct P2P connection established
```

**Code Pattern (Pseudocode):**
```typescript
async function attemptHolePunching(
  targetPeerId: string,
  targetAddress: string,
  targetPort: number,
  timeout: number = 3000
) {
  try {
    // Attempt simultaneous connection (race)
    const connectionPromise = Promise.race([
      libp2p.dial(targetPeerId), // Try via DHT routing
      attemptDirectConnection(targetAddress, targetPort),
      timeoutPromise(timeout)
    ]);
    
    const connection = await connectionPromise;
    logger.info('Hole punching successful', { targetPeerId });
    return connection;
  } catch (error) {
    logger.warn('Hole punching failed, will use relay', error);
    return null;
  }
}
```

### 5.4 Circuit Relay Registration

**Flow:**
```
1. Node behind unreachable NAT connects to relay node
2. Registers itself: /circuit/p2p/${RELAY_ID}/p2p/${YOUR_ID}
3. Other peers dial through relay: /circuit/relay-addr/p2p/${YOUR_ID}
4. Relay forwards messages between peers
5. Periodically renew registration (keep-alive)
```

**Code Pattern (Pseudocode):**
```typescript
async function registerWithRelay(
  relayMultiaddr: string,
  registrationInterval: number = 60000
) {
  try {
    // Dial relay node
    const connection = await libp2p.dial(relayMultiaddr);
    
    // Register with relay
    await connection.newStream('/circuit/v2/register');
    
    logger.info('Relay registration successful', { relay: relayMultiaddr });
    
    // Renew periodically
    setInterval(() => {
      connection.newStream('/circuit/v2/register');
    }, registrationInterval);
    
    return connection;
  } catch (error) {
    logger.error('Relay registration failed', error);
    throw error;
  }
}
```

---

## 6. MULTI-PROTOCOL FAILOVER

### 6.1 Connection Attempt Strategy

**Configuration:**
```json
{
  "connectionStrategy": {
    "maxConcurrentAttempts": 3,
    "timeout": 10000,
    "transports": [
      {
        "name": "tcp",
        "timeout": 3000,
        "priority": 1
      },
      {
        "name": "webTransport",
        "timeout": 3000,
        "priority": 2
      },
      {
        "name": "websocket",
        "timeout": 5000,
        "priority": 3
      },
      {
        "name": "relay",
        "timeout": 10000,
        "priority": 4
      }
    ]
  }
}
```

**Connection Attempt Logic (Pseudocode):**
```typescript
async function connectWithFailover(
  peerId: string,
  addresses: string[],
  config: ConnectionConfig
) {
  const attempts = [];
  let completed = false;
  
  // Start attempts in priority order
  for (const transport of config.transports) {
    if (completed) break;
    
    const promise = (async () => {
      try {
        const connection = await attemptConnection(
          peerId,
          addresses.filter(a => a.includes(transport.name)),
          transport.timeout
        );
        
        if (connection && !completed) {
          completed = true;
          logger.info(`Connected via ${transport.name}`, { peerId });
          // Cancel remaining attempts
          attempts.forEach(p => p.cancel?.());
          return connection;
        }
      } catch (error) {
        logger.debug(`${transport.name} connection failed`, error);
        return null;
      }
    })();
    
    attempts.push(promise);
    
    // Stagger attempts (don't start all simultaneously)
    await delay(500);
  }
  
  // Wait for first successful connection
  const result = await Promise.race(attempts);
  
  if (!result) {
    throw new Error('All connection attempts failed');
  }
  
  return result;
}
```

---

## 7. PEER REACHABILITY DETECTION

### 7.1 Reachability Checks

**Configuration:**
```json
{
  "reachabilityCheck": {
    "enabled": true,
    "interval": 300000,
    "sampleSize": 5,
    "timeout": 5000,
    "minSuccessRate": 0.6
  }
}
```

**Check Logic (Pseudocode):**
```typescript
async function checkReachability(peerId: string): Promise<ReachabilityInfo> {
  const results = {
    directReachable: false,
    relayReachable: false,
    avgLatency: null,
    natType: 'unknown',
    lastCheck: Date.now()
  };
  
  try {
    // Try direct connection
    const startTime = Date.now();
    const conn = await Promise.race([
      libp2p.dial(peerId),
      timeoutPromise(5000)
    ]);
    
    results.directReachable = true;
    results.avgLatency = Date.now() - startTime;
    
    // Try to detect NAT type via peer's STUN info
    const stunInfo = await getPeerSTUNInfo(peerId);
    results.natType = stunInfo.type;
  } catch {
    results.directReachable = false;
    
    // Try via relay as fallback
    try {
      const relayConn = await dialViaRelay(peerId);
      results.relayReachable = !!relayConn;
    } catch {
      results.relayReachable = false;
    }
  }
  
  // Store in DB for analytics
  await db.put(`reachability:${peerId}:latest`, results);
  
  return results;
}
```

---

## 8. BOOTSTRAP NODE SETUP

### 8.1 Public Bootstrap Nodes

**Configuration:**
```json
{
  "publicBootstrapNodes": [
    {
      "address": "seed1.gnn.io",
      "peerId": "Qm...",
      "multiaddr": "/ip4/203.0.113.1/tcp/28111/p2p/Qm...",
      "healthCheck": "https://seed1.gnn.io/health",
      "type": "bootstrap"
    },
    {
      "address": "seed2.gnn.io",
      "peerId": "Qm...",
      "multiaddr": "/ip4/203.0.113.2/tcp/28111/p2p/Qm...",
      "healthCheck": "https://seed2.gnn.io/health",
      "type": "bootstrap"
    },
    {
      "address": "relay1.gnn.io",
      "peerId": "Qm...",
      "multiaddr": "/ip4/203.0.113.3/tcp/28111/p2p/Qm...",
      "healthCheck": "https://relay1.gnn.io/health",
      "type": "relay"
    }
  ]
}
```

**Bootstrap Node Discovery (Pseudocode):**
```typescript
async function bootstrapNetwork(config: BootstrapConfig) {
  const bootstrapPeers = config.publicBootstrapNodes;
  
  for (const peer of bootstrapPeers) {
    try {
      // Health check first
      const health = await fetch(peer.healthCheck);
      if (!health.ok) {
        logger.warn(`Bootstrap node ${peer.address} unhealthy`);
        continue;
      }
      
      // Dial bootstrap peer
      const connection = await libp2p.dial(peer.multiaddr);
      logger.info(`Connected to bootstrap node: ${peer.address}`);
      
      // Query DHT for peers
      const peers = await queryDHT(bootstrapPeers.map(p => p.peerId));
      logger.info(`Bootstrap discovery found ${peers.length} peers`);
      
      break; // Success
    } catch (error) {
      logger.debug(`Bootstrap ${peer.address} failed`, error);
      // Try next bootstrap node
    }
  }
}
```

---

## 9. CERTIFICATE GENERATION FOR WEBTRANSPORT

### 9.1 Self-Signed Certificate Generation

**Configuration:**
```json
{
  "webtransport": {
    "enabled": true,
    "tlsCertPath": "./gnn-cert-${node-id}.pem",
    "tlsKeyPath": "./gnn-key-${node-id}.pem",
    "generateSelfSigned": true,
    "certificateDuration": 365,
    "certificateAlgorithm": "rsa2048"
  }
}
```

**Generation Logic (Pseudocode):**
```typescript
async function generateWebTransportCertificates(
  nodeId: string,
  certPath: string,
  keyPath: string,
  durationDays: number = 365
) {
  // Check if certificates already exist
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    logger.info('Using existing WebTransport certificates', { certPath, keyPath });
    return;
  }
  
  try {
    // Generate self-signed certificate
    const { cert, key } = await generateSelfSignedCert({
      commonName: nodeId,
      durationDays,
      algorithm: 'rsa2048'
    });
    
    // Write to files
    fs.writeFileSync(certPath, cert, { mode: 0o600 });
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    
    logger.info('Generated WebTransport certificates', { certPath, keyPath });
  } catch (error) {
    logger.error('Failed to generate WebTransport certificates', error);
    throw error;
  }
}
```

---

## 10. BANDWIDTH & CONNECTION OPTIMIZATIONS

### 10.1 Connection Pooling

**Configuration:**
```json
{
  "connectionPooling": {
    "enabled": true,
    "maxPoolSize": 50,
    "reuseThreshold": 5,
    "idleTimeout": 60000,
    "connectionTTL": 3600000
  }
}
```

**Pool Management (Pseudocode):**
```typescript
class ConnectionPool {
  private pool = new Map<string, Connection[]>();
  private maxPoolSize: number;
  private reuseThreshold: number;
  
  getConnection(peerId: string): Connection | null {
    const connections = this.pool.get(peerId) || [];
    
    // Reuse connection if available and healthy
    for (const conn of connections) {
      if (conn.isHealthy() && conn.getStreamCount() < this.reuseThreshold) {
        return conn;
      }
    }
    
    return null; // No suitable connection, create new
  }
  
  addConnection(peerId: string, conn: Connection): void {
    let connections = this.pool.get(peerId) || [];
    
    if (connections.length < this.maxPoolSize) {
      connections.push(conn);
      this.pool.set(peerId, connections);
    }
  }
  
  cleanup(): void {
    // Remove stale connections
    for (const [peerId, connections] of this.pool.entries()) {
      const active = connections.filter(c => c.isHealthy());
      
      if (active.length === 0) {
        this.pool.delete(peerId);
      } else {
        this.pool.set(peerId, active);
      }
    }
  }
}
```

### 10.2 Stream Multiplexing

**Configuration:**
```json
{
  "multiplexing": {
    "maxStreamsPerConnection": 1000,
    "streamTimeout": 30000,
    "priorityLevels": 3
  }
}
```

**Multiplexing Strategy (Pseudocode):**
```typescript
class StreamMultiplexer {
  private streams = new Map<string, Stream>();
  private maxStreams: number;
  private priorityQueue: PriorityQueue<Stream>;
  
  async openStream(
    peerId: string,
    protocol: string,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<Stream> {
    // Check if at max streams
    if (this.streams.size >= this.maxStreams) {
      // Close lowest priority idle stream
      this.closeLowPriorityStream();
    }
    
    const streamId = `${peerId}:${protocol}`;
    const stream = await libp2p.newStream(peerId, protocol);
    
    this.streams.set(streamId, stream);
    this.priorityQueue.enqueue(stream, this.getPriorityValue(priority));
    
    return stream;
  }
  
  closeStream(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.close();
      this.streams.delete(streamId);
      this.priorityQueue.remove(stream);
    }
  }
}
```

---

## 11. MONITORING & OBSERVABILITY (PHASE 2)

### 11.1 Enhanced Metrics

**New Metrics Tracked:**
```
Per-Node:
  - publicIP (detected via STUN)
  - natType (Full Cone, Restricted, Symmetric, etc.)
  - reachabilityStatus (direct/relay/unreachable)
  - uptime (percentage of time reachable)
  - avgLatency (to bootstrap nodes)
  - connectionSuccessRate
  - failoverEventsCount
  - relayUsagePercentage

Per-Connection:
  - transportType (tcp/webTransport/websocket/relay)
  - latency (RTT)
  - bandwidth (bytes/sec)
  - errorCount
  - lastUsedAt

Per-DHT:
  - peersKnown (total in routing table)
  - peersReachable (verified reachable)
  - discoveryLatency
  - publishRate (messages/sec)

Global:
  - networkSize (estimated peer count)
  - reachability (% of peers reachable without relay)
  - avgPathLength (hops to random peer)
  - bandwidth (in/out rates)
```

**Metrics API Endpoints (New):**
```
GET /api/node/metrics
Response: {
  "node": {
    "publicIP": "203.0.113.50",
    "natType": "Full Cone",
    "reachabilityStatus": "direct",
    "uptime": 0.9876,
    "avgLatency": 45
  },
  "connections": [
    {
      "peerId": "Qm...",
      "transportType": "webTransport",
      "latency": 32,
      "bandwidth": 1024000,
      "lastUsedAt": "2026-05-06T10:00:00Z"
    }
  ],
  "dht": {
    "peersKnown": 1234,
    "peersReachable": 987,
    "discoveryLatency": 234
  }
}

GET /api/node/connectivity
Response: {
  "connected": true,
  "peerCount": 3,
  "directConnections": 2,
  "relayConnections": 1,
  "relayUsagePercentage": 33.3,
  "bandwidth": {
    "inRate": 1024000,
    "outRate": 512000
  }
}
```

---

## 12. PHASE 2 TESTING STRATEGY

### 12.1 Integration Tests (Extended)

**New Test Scenarios:**

```typescript
// test/integration/nat-traversal.test.ts
describe('NAT Traversal', () => {
  it('should establish direct connection via hole punching', async () => {
    // Simulate 2 nodes behind different NATs
    const nodeA = new GNNNode({ nodeId: 'node-a-nat1' });
    const nodeB = new GNNNode({ nodeId: 'node-b-nat2' });
    
    await nodeA.start();
    await nodeB.start();
    
    // Add bootstrap peer
    await nodeA.addBootstrapPeer(nodeB.multiaddr);
    
    // Test direct connection (hole punching)
    const connection = await nodeA.dialPeer(nodeB.peerId);
    expect(connection.transport).toBe('tcp'); // or 'webTransport'
    expect(connection.latency).toBeLessThan(100);
  });
  
  it('should fallback to relay if direct connection fails', async () => {
    const nodeA = new GNNNode({ nodeId: 'node-a-behind-nat' });
    const relay = new RelayNode({ nodeId: 'relay-1' });
    
    await nodeA.start({ relayOnly: true });
    await relay.start();
    
    // Register with relay
    await nodeA.registerWithRelay(relay.multiaddr);
    
    // Peer should be reachable via relay
    const reachability = await nodeA.checkReachability();
    expect(reachability.relayReachable).toBe(true);
  });
  
  it('should detect public IP via STUN', async () => {
    const node = new GNNNode({ nodeId: 'node-stun-test' });
    await node.start();
    
    const publicInfo = await node.detectPublicIP();
    expect(publicInfo.address).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    expect(publicInfo.port).toBeGreaterThan(0);
    expect(publicInfo.natType).toMatch(/FullCone|Restricted|Symmetric/);
  });
});

// test/integration/multiprotocol.test.ts
describe('Multi-Protocol Failover', () => {
  it('should prefer WebTransport over WebSocket', async () => {
    const nodeA = new GNNNode({ nodeId: 'node-a' });
    const nodeB = new GNNNode({ nodeId: 'node-b' });
    
    await nodeA.start();
    await nodeB.start();
    
    // Both should support WebTransport and WebSocket
    const connection = await nodeA.dialPeer(nodeB.peerId);
    expect(connection.transport).toBe('webTransport'); // Preferred
  });
  
  it('should fallback if primary transport fails', async () => {
    const nodeA = new GNNNode({ nodeId: 'node-a' });
    const nodeB = new GNNNode({ nodeId: 'node-b' });
    
    await nodeA.start();
    await nodeB.start({ disableTCP: true }); // Disable TCP
    
    // Should fallback to WebTransport
    const connection = await nodeA.dialPeer(nodeB.peerId);
    expect(connection.transport).toBe('webTransport');
  });
});

// test/integration/bootstrap.test.ts
describe('Bootstrap Nodes', () => {
  it('should discover peers via bootstrap nodes', async () => {
    const bootstrap = new BootstrapNode({ nodeId: 'bootstrap-1' });
    const node1 = new GNNNode({ nodeId: 'node-1' });
    const node2 = new GNNNode({ nodeId: 'node-2' });
    
    await bootstrap.start();
    await node1.start({ bootstrapPeers: [bootstrap.multiaddr] });
    await node2.start({ bootstrapPeers: [bootstrap.multiaddr] });
    
    // Both nodes should discover each other
    await delay(5000); // Time for DHT propagation
    
    const peers1 = node1.getPeers();
    const peers2 = node2.getPeers();
    
    expect(peers1).toContainEqual(expect.objectContaining({ peerId: node2.peerId }));
    expect(peers2).toContainEqual(expect.objectContaining({ peerId: node1.peerId }));
  });
});

// test/load/internet-scale.test.ts
describe('Internet Scale Load', () => {
  it('should handle 100 concurrent peers', async () => {
    const nodes = [];
    for (let i = 0; i < 100; i++) {
      const node = new GNNNode({ nodeId: `node-${i}` });
      nodes.push(node);
    }
    
    // Start all nodes
    await Promise.all(nodes.map(n => n.start()));
    
    // Add bootstrap
    for (let i = 1; i < nodes.length; i++) {
      await nodes[i].addBootstrapPeer(nodes[0].multiaddr);
    }
    
    // Wait for network to stabilize
    await delay(10000);
    
    // Check connectivity
    for (const node of nodes) {
      const peers = node.getPeers();
      expect(peers.length).toBeGreaterThan(10); // Should have discovered many peers
    }
  });
});
```

### 12.2 Performance Benchmarks

**Benchmarks to Run:**

```
Connection Latency:
  ✓ TCP (LAN): ~1-2 ms
  ✓ TCP (Internet): ~10-100 ms
  ✓ WebTransport (LAN): ~1-2 ms
  ✓ WebTransport (Internet): ~10-100 ms (30-40% faster than WebSocket)
  ✓ WebSocket (LAN): ~1-2 ms
  ✓ WebSocket (Internet): ~15-150 ms
  ✓ Relay (LAN): ~5-10 ms (overhead)
  ✓ Relay (Internet): ~30-200 ms (higher overhead)

Connection Success Rate:
  ✓ Direct (no NAT): 100%
  ✓ Full Cone NAT: 95%+
  ✓ Restricted NAT: 70-80%
  ✓ Symmetric NAT: 10-20% (mostly rely on relay)

Failover Time:
  ✓ TCP → WebTransport: <1 sec
  ✓ WebTransport → Relay: <3 sec

Relay Capacity:
  ✓ Connections per relay: 100+ concurrent
  ✓ Message throughput per relay: 10k+ msg/sec
```

---

## 13. PHASE 2 DELIVERABLES

### **Week 1: NAT Traversal & Public IP Detection**
- [x] Implement UPnP port mapping
- [x] Implement PMP (Port Mapping Protocol)
- [x] Integrate STUN server queries
- [x] Public IP detection & caching
- [x] NAT type detection
- **Deliverable:** Nodes can detect external IP, map ports

### **Week 2: WebTransport & Multi-Protocol Failover**
- [x] Add WebTransport transport
- [x] Self-signed certificate generation for WebTransport
- [x] Multi-protocol connection attempt strategy
- [x] Failover logic (fallback if primary fails)
- [x] Connection pooling & reuse
- **Deliverable:** WebTransport working, failover tested

### **Week 3: Circuit Relay & Hole Punching**
- [x] Implement Circuit Relay v2 support
- [x] Relay registration & keep-alive
- [x] Hole punching logic
- [x] Reachability detection
- [x] Bootstrap node integration
- **Deliverable:** Relay working, reachability checks functional

### **Week 4-5: Testing, Monitoring, Documentation**
- [x] Integration tests (NAT scenarios, failover, relay)
- [x] Load tests (100+ concurrent peers)
- [x] Performance benchmarks (latency, bandwidth)
- [x] Metrics API endpoints
- [x] Enhanced logging (NAT events, reachability)
- [x] Documentation (NAT setup, relay configuration)
- [x] Public bootstrap node setup guide
- **Deliverable:** Production-ready internet connectivity

### **Week 6: Optimization & Hardening**
- [x] Connection pooling optimization
- [x] Stream multiplexing tuning
- [x] DHT query optimization
- [x] Message cache tuning
- [x] Graceful degradation (when relays unavailable)
- [x] Security: verify peer certificates (Phase 3 prep)
- **Deliverable:** Optimized, hardened internet layer

---

## 14. ACCEPTANCE CRITERIA (PHASE 2)

**NAT Traversal:**
- [ ] Nodes behind Full Cone NAT reach each other directly (95%+)
- [ ] Nodes behind Restricted NAT use relay (70%+ fallback)
- [ ] Symmetric NAT nodes can connect via relay
- [ ] UPnP/PMP successful on compatible routers
- [ ] STUN detection accurate

**WebTransport:**
- [ ] WebTransport connections 30-40% faster than WebSocket
- [ ] TLS certificates auto-generated for WebTransport
- [ ] WebTransport used as primary over WebSocket

**Multi-Protocol:**
- [ ] Failover happens <1 sec if transport unavailable
- [ ] Connection pooling reuses connections appropriately
- [ ] Multiplexing supports 1000+ streams per connection

**Relay:**
- [ ] Relay node can serve 100+ concurrent clients
- [ ] Relay registration & renewals work reliably
- [ ] Relay messages forwarded with <50ms overhead

**Bootstrapping:**
- [ ] Public bootstrap nodes discoverable via DNS
- [ ] New nodes find 10+ peers in <30 seconds
- [ ] DHT queries timeout gracefully

**Monitoring:**
- [ ] Reachability checks report accurate status
- [ ] Metrics API provides detailed connectivity info
- [ ] Metrics persisted for analytics

**Testing:**
- [ ] 100+ peer network stable for 1 hour
- [ ] 1000+ msg/sec throughput over internet
- [ ] <500ms latency typical (cross-region acceptable)

---

## 15. DEPLOYMENT NOTES (PHASE 2)

### 15.1 Configuration for Internet

**Recommended Production Config:**

```json
{
  "natTraversal": {
    "enabled": true,
    "methods": ["upnp", "pmp", "stun", "holepunching", "relay"]
  },
  "transports": {
    "tcp": { "enabled": true },
    "webTransport": { "enabled": true, "generateSelfSigned": true },
    "webSocket": { "enabled": true }
  },
  "discovery": {
    "mdns": { "enabled": true },
    "dht": { "enabled": true, "mode": "client" },
    "dns": { "enabled": true }
  },
  "publicBootstrapNodes": [
    { "address": "seed1.gnn.io", "peerId": "Qm...", "multiaddr": "/ip4/.../tcp/28111/p2p/Qm..." },
    { "address": "seed2.gnn.io", "peerId": "Qm...", "multiaddr": "/ip4/.../tcp/28111/p2p/Qm..." }
  ]
}
```

### 15.2 Running a Relay Node

```bash
# Relay node (high-capacity server)
bun run start \
  --node-id=relay-1 \
  --api-port=25111 \
  --p2p-port=28111 \
  --relay-enable \
  --relay-max-clients=1000 \
  --log-level=info

# Output:
# [INFO] Relay node relay-1 started
# [INFO] Circuit Relay enabled (max 1000 clients)
# [INFO] Listening on /ip4/203.0.113.50/tcp/28111/p2p/Qm...
```

### 15.3 Docker Example (Phase 2+)

```dockerfile
FROM oven/bun:latest as builder
WORKDIR /app
COPY . .
RUN bun install --production

FROM oven/bun:latest
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 25111 28111
ENV NODE_ID=docker-node-1
ENV GNN_WEBTRANSPORT_SELF_SIGNED=true
ENV GNN_NAT_ENABLED=true
CMD ["bun", "run", "start"]
```

---

# END OF PHASE 2 PROMPT

---
<!--
**Ready for Phase 2? Or questions about this spec?**

Next: Phase 3 (Adversarial Mode + Cryptographic Signing) or Phase 4 (Advanced Features)?
-->