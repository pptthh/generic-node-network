<!--
Perfect! I'll update the MVP prompt with these changes and then generate the complete Phase 2-4 prompts. Let me make these modifications:
----
-->

# 📋 PHASE 0: MVP IMPLEMENTATION PROMPT (FINAL - UPDATED v2)

## 🎯 PROJECT SPECIFICATION

**Project Name:** GenericNodeNet (GNN) - Distributed Network Framework  
**Phase:** MVP (Proof of Concept)  
**Timeline:** 4 weeks  
**Stack:** Bun 1.3.11 + Next.js 16.2 + LevelDB + libp2p  
**Target:** Local network node-to-node communication  

---

## 1. SYSTEM OVERVIEW

### 1.1 What We're Building

A **distributed peer-to-peer (P2P) node network framework** where:
- Nodes discover each other on **local networks** via mDNS + DHT bootstrap
- Nodes communicate via **Publish-Subscribe** (broadcast) and **Request-Response** (query)
- Each node has **persistent local storage** (LevelDB) for state, messages, and peer info
- **Simple token authentication** for REST API (P2P messages untrusted in MVP)
- **Web dashboard** shows node status, peers, and message history in real-time
- Network tolerates individual node failures (eventual consistency model)

### 1.2 Success Criteria (MVP)

✅ **3-5 nodes on LAN auto-discover** in <2 seconds via mDNS  
✅ **Publish message** reaches all subscribers in <1 second  
✅ **P2P query (1-to-1)** responds in <100 ms  
✅ **Broadcast query (1-to-many)** responds in <1 second (all peers aggregate)  
✅ **Message persistence** with 80k messages/day throughput  
✅ **Web dashboard** shows live peer status, message stream (WebSocket)  
✅ **All 10 REST API endpoints** documented + working  
✅ **67% unit test coverage** + integration tests (3-5 node scenarios)  
✅ **Node startup** <4 seconds, <55 MB idle RAM per node  
✅ **CLI config + env vars + config file + DB state** with proper precedence  
✅ **Full documentation** (setup guide, API spec, architecture diagram)  

---

## 2. ARCHITECTURE

### 2.1 Deployment Model (Single Node)

```
┌─────────────────────────────────────────────────────┐
│         GNN Node Instance (Bun Runtime)             │
│  Memory: ~50 MB (idle) | Process: 1 binary         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Layer 1: REST API Server ─────────────────┐  │
│  │ Next.js API Routes (App Router)            │  │
│  │ Endpoints: /api/node/*, /api/peers/*      │  │
│  │ Bearer token auth (header: Authorization) │  │
│  │ Port: 25111 + instance offset             │  │
│  │ (Node-1: 25111, Node-2: 25112, etc.)     │  │
│  │ Dev Server: ~500-800 ms startup (Turbopack) │ │
│  └─────────────────────────────────────────────┘  │
│                         ↓                          │
│  ┌─ Layer 2: WebSocket Server ────────────────┐  │
│  │ Same port as REST API (Next.js integrates)│  │
│  │ Live updates: peer online/offline, msgs   │  │
│  │ Connection: ws://localhost:25111/ws       │  │
│  └─────────────────────────────────────────────┘  │
│                         ↓                          │
│  ┌─ Layer 3: Message Router ──────────────────┐  │
│  │ Pub-Sub handler (Gossipsub)               │  │
│  │ Request-Response handler (RPC)            │  │
│  │ Message validation & serialization        │  │
│  │ In-memory queue (max 1000 pending)        │  │
│  └─────────────────────────────────────────────┘  │
│                         ↓                          │
│  ┌─ Layer 4: P2P Transport (libp2p) ─────────┐  │
│  │ TCP (primary) + WebSocket (optional)      │  │
│  │ MPLEX multiplexing                        │  │
│  │ mDNS discovery (auto on LAN)              │  │
│  │ Kademlia DHT (for peer routing)           │  │
│  │ Gossipsub (pub-sub protocol)              │  │
│  │ Port: 28111 + instance offset             │  │
│  │ (Node-1: 28111, Node-2: 28112, etc.)    │  │
│  └─────────────────────────────────────────────┘  │
│                         ↓                          │
│  ┌─ Layer 5: Storage (LevelDB) ───────────────┐  │
│  │ Peer metadata (peerId, multiaddr, status) │  │
│  │ Messages (published, queries, responses)  │  │
│  │ Subscriptions (topic -> nodeId mappings)  │  │
│  │ Node configuration state                  │  │
│  │ Database: ./gnn-data-${node-id}/          │  │
│  │ Size: grows ~5-10 MB per 100k messages   │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 Multi-Node Local Network

```
┌──────────────────────────────────────────────────┐
│            Local Network (192.168.1.x)           │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌─────────────┐  ┌─────────────┐ ┌──────────┐ │
│  │   Node-A    │  │   Node-B    │ │ Node-C   │ │
│  │ 25111/28111 │  │ 25112/28112 │ │25113/... │ │
│  │             │  │             │ │          │ │
│  └─────────────┘  └─────────────┘ └──────────┘ │
│        ↓                ↓               ↓       │
│    mDNS announces   mDNS announces   mDNS ann. │
│    _gnn._tcp.local  _gnn._tcp.local  _gnn...  │
│        ↓                ↓               ↓       │
│    Auto-discover via Bonjour/Avahi (2 sec)    │
│        ↓                ↓               ↓       │
│    Connect via TCP/MPLEX (libp2p streams)     │
│        ↓                ↓               ↓       │
│  ✅ Mesh network (each knows all peers)       │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 2.3 Message Flow Examples

**Example 1: Publish-Subscribe (1-to-many)**

```
User publishes via REST:
POST /api/publish
{
  "topic": "sensor/temperature",
  "payload": {"temp": 23.5}
}
  ↓
Node-A creates message:
{
  "type": "publish",
  "messageId": "msg_abc123",
  "topic": "sensor/temperature",
  "payload": {"temp": 23.5},
  "sender": "node-a",
  "timestamp": 1715000000
}
  ↓
Message stored in LevelDB:
message:published:1715000000:msg_abc123 → {JSON}
  ↓
Gossipsub broadcasts to subscribed peers (B, C)
  ↓
Node-B & Node-C receive, store, emit WebSocket event
  ↓
Dashboard shows message in real-time
```

**Example 2: Query (1-to-1, Direct)**

```
User queries via REST:
POST /api/query
{
  "target": "node-b",
  "request": {"action": "get_state"}
}
  ↓
Node-A creates query:
{
  "type": "query",
  "queryId": "qry_def456",
  "target": "node-b",
  "request": {"action": "get_state"},
  "sender": "node-a",
  "timestamp": 1715000000
}
  ↓
libp2p routes directly to Node-B (TCP stream)
  ↓
Timeout: 100 ms (configurable)
  ↓
Node-B responds immediately with response message
  ↓
Node-A receives, stores in LevelDB, returns to user
```

**Example 3: Broadcast Query (1-to-many, Collect Responses)**

```
User broadcasts query via REST:
POST /api/query/broadcast
{
  "request": {"action": "count_messages"}
}
  ↓
Node-A sends query to all connected peers (B, C)
  ↓
Timeout: 1000 ms (configurable), collect responses
  ↓
Node-B responds: {count: 150}
Node-C responds: {count: 87}
  ↓
Node-A aggregates: [
  {from: "node-b", response: {count: 150}},
  {from: "node-c", response: {count: 87}},
  {from: "node-a", response: {count: 200}}
]
  ↓
Return aggregated response to user
```

---

## 3. TECHNOLOGY STACK (FINAL - APPROVED)

### 3.1 Stack Components

```
Frontend:
  Framework: Next.js 16.2 (latest, released Feb 2026)
  React: 19.2 (with Compiler auto-memoization)
  Build Tool: Turbopack (default, 80% faster builds)
  Server Components: Default (50-70% less JS shipped)
  Styling: Tailwind CSS 3.3+
  WebSocket: ws library for live updates

Backend:
  Runtime: Bun 1.3.11 (latest stable, released Feb 2026)
  TypeScript: 5.x (native, no tsc needed)
  Package Manager: Bun (built-in, 80% faster installs)
  Cold Start: ~1 ms (runtime) + ~500-800 ms (Next.js dev)
  Memory: ~50-55 MB idle per node

P2P Networking:
  Core: libp2p/js (latest)
  Transport (MVP):
    - TCP (@libp2p/tcp) [PRIMARY]
    - WebSocket (@libp2p/websockets) [OPTIONAL]
  
  Discovery:
    - mDNS (@libp2p/mdns)
    - Kademlia DHT (@libp2p/kad-dht)
  
  Multiplexing: MPLEX (@libp2p/mplex)
  Pub-Sub: Gossipsub (@libp2p/gossipsub)

Storage:
  Database: LevelDB (via `level` npm)
  Format: JSON
  Size: ~5-10 MB per 100k messages

Testing:
  Unit: Vitest (native Bun support)
  Integration: Custom multi-node scripts
  Load: Bun benchmarking
  E2E: Playwright (browser tests)

Logging:
  Format: Human-readable (MVP)
  Level: Configurable (default: ERROR)
  Rotation: Configurable (default: 1 day / 100 KB)
```

### 3.2 Dependency List

```json
{
  "dependencies": {
    "next": "^16.2.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "libp2p": "^0.47.0",
    "@libp2p/tcp": "^10.0.0",
    "@libp2p/mdns": "^11.0.0",
    "@libp2p/kad-dht": "^13.2.0",
    "@libp2p/gossipsub": "^14.0.0",
    "@libp2p/mplex": "^11.0.0",
    "level": "^8.0.0",
    "ws": "^8.15.0",
    "zod": "^3.22.0",
    "uuid": "^9.0.0",
    "pino": "^8.15.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "vitest": "^1.0.0",
    "@playwright/test": "^1.40.0",
    "tailwindcss": "^3.3.0"
  },
  "packageManager": "bun@1.3.11"
}
```

### 3.3 Performance Metrics

**Expected Performance (MVP):**
- **Binary size:** 80-120 MB (Bun + deps)
- **Startup time:** 3-4 seconds (Bun 1ms + Next.js 500-800ms + libp2p 1-2s)
- **Idle memory:** 50-55 MB
- **Under load (100 msg/sec):** 70-90 MB
- **CPU (idle):** <1%
- **Disk (per 100k messages):** ~5-10 MB
- **Dev Hot Reload:** ~500 ms (Turbopack)
- **Build time:** ~2-3 sec (Turbopack)

---

## 4. LEVELDB SCHEMA (UPDATED - DAYS INSTEAD OF WEEKS)

### 4.1 Database Structure

**Key Prefix Convention:**

```
Message Storage:
  message:published:${timestamp}:${messageId}  → message object (JSON)
  message:query:${timestamp}:${queryId}        → query object (JSON)
  message:response:${timestamp}:${responseId}  → response object (JSON)

Subscription Management:
  subscription:${topic}:${nodeId}  → {subscribedAt, topic}

Peer Management:
  peer:${peerId}                    → {peerId, multiaddr, status, lastSeen, metadata}
  peer:byaddr:${multiaddr}          → ${peerId} (reverse lookup)

Node Configuration:
  config:nodeId                     → ${nodeId}
  config:apiToken                   → ${token}
  config:bootstrapPeers             → [multiaddr array] (JSON)
  config:nodeState                  → {diskFull: false, uptime: 3600}

Local State:
  state:uptime                      → 3600 (seconds)
  state:messageCount                → 12345
  state:lastPublishTime             → 1715000000
  state:dbSize                      → 1234567 (bytes)
```

### 4.2 Detailed Key Examples

```javascript
// Message: Published
{
  key: "message:published:1715000000000:msg_abc123",
  value: {
    type: "publish",
    messageId: "msg_abc123",
    topic: "sensor/temperature",
    payload: { temp: 23.5 },
    sender: "node-a",
    timestamp: 1715000000000,
    ttl: null  // optional, seconds
  }
}

// Message: Query
{
  key: "message:query:1715000000100:qry_def456",
  value: {
    type: "query",
    queryId: "qry_def456",
    target: "node-b",
    request: { action: "get_state", params: {} },
    sender: "node-a",
    timestamp: 1715000000100,
    timeout: 100  // milliseconds
  }
}

// Message: Response
{
  key: "message:response:1715000000150:qry_def456",
  value: {
    type: "response",
    queryId: "qry_def456",
    status: "success",
    response: { uptime: 3600, peerCount: 2 },
    sender: "node-b",
    timestamp: 1715000000150
  }
}

// Peer
{
  key: "peer:Qm5aX7N...abc123",
  value: {
    peerId: "Qm5aX7N...abc123",
    multiaddr: "/ip4/192.168.1.101/tcp/28111/p2p/Qm5aX7N...abc123",
    status: "online",
    lastSeen: 1715000000000,
    discoveryMethod: "mDNS",
    metadata: {
      alias: "node-b",
      apiPort: 25112
    }
  }
}

// Subscription
{
  key: "subscription:sensor/temperature:node-a",
  value: {
    topic: "sensor/temperature",
    nodeId: "node-a",
    subscribedAt: 1715000000000
  }
}

// Config
{
  key: "config:nodeId",
  value: "node-a"  // string
}

{
  key: "config:bootstrapPeers",
  value: [
    "/ip4/192.168.1.100/tcp/28111/p2p/Qm...",
    "/ip4/192.168.1.102/tcp/28111/p2p/Qm..."
  ]  // JSON array
}
```

### 4.3 Message Lifecycle & Auto-Deletion

**Configuration:**
```json
{
  "message": {
    "retentionDays": 28,
    "autoDeleteInterval": "24h",
    "maxPayloadSize": 31744
  }
}
```

**Deletion Logic (runs daily):**
```typescript
// Pseudocode
async function pruneOldMessages() {
  const retentionMs = config.message.retentionDays * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - retentionMs;
  
  // Scan all message keys with timestamp < cutoffTime
  for await (const [key] of db.iterator({
    gte: "message:published:0",
    lte: `message:published:${cutoffTime}:~`
  })) {
    await db.del(key);
  }
}
```

---

## 5. REST API SPECIFICATION

### 5.1 Authentication

All endpoints (except `/health`) require:
```
Header: Authorization: Bearer ${apiToken}
```

Token is a 32+ character random string, stored in LevelDB under `config:apiToken`.

**Note:** In MVP, P2P messages do **not** require authentication (trusted network).

### 5.2 Endpoints (10 total)

#### **1. GET /health**
Check node is running (no auth required).

```
Request:  GET /health
Response: {
  "status": "ok",
  "nodeId": "node-a",
  "uptime": 3600,
  "timestamp": 1715000000
}
```

#### **2. GET /api/node/info**
Get node status and statistics.

```
Request:  GET /api/node/info
Auth:     Bearer token

Response: {
  "nodeId": "node-a",
  "apiVersion": "1.0.0",
  "uptime": 3600,  // seconds
  "peerCount": 3,
  "subscriptionCount": 5,
  "messageCount": 247,
  "dbSize": 1234567,  // bytes
  "diskFull": false,
  "state": "ONLINE",
  "startedAt": "2026-05-06T10:00:00Z",
  "timestamp": "2026-05-06T10:01:00Z"
}
```

#### **3. GET /api/peers**
List all known peers.

```
Request:  GET /api/peers?status=online&limit=100

Response: [
  {
    "peerId": "Qm5aX7N...abc123",
    "alias": "node-b",
    "multiaddr": "/ip4/192.168.1.101/tcp/28111/p2p/Qm...",
    "status": "online",
    "lastSeen": "2026-05-06T10:00:50Z",
    "discoveryMethod": "mDNS",
    "apiPort": 25112
  },
  ...
]
```

#### **4. GET /api/messages**
Retrieve message history with pagination.

```
Request:  GET /api/messages?limit=50&offset=0&topic=sensor/temp&type=publish&order=desc

Response: {
  "messages": [
    {
      "messageId": "msg_abc123",
      "type": "publish",
      "topic": "sensor/temperature",
      "payload": {"temp": 23.5},
      "sender": "node-a",
      "timestamp": "2026-05-06T10:00:00Z"
    },
    ...
  ],
  "total": 247,
  "limit": 50,
  "offset": 0,
  "hasMore": true
}
```

#### **5. POST /api/publish**
Publish a message to a topic (Pub-Sub).

```
Request:  POST /api/publish
Body: {
  "topic": "sensor/temperature",
  "payload": {"temp": 23.5, "unit": "celsius"},
  "ttl": null  // optional, seconds until message expires
}

Response: {
  "messageId": "msg_abc123",
  "status": "published",
  "timestamp": "2026-05-06T10:00:00Z"
}

Error (payload >31KB):
{
  "error": "PAYLOAD_TOO_LARGE",
  "maxSize": 31744,
  "actualSize": 35000
}
```

#### **6. POST /api/subscribe**
Subscribe to a topic.

```
Request:  POST /api/subscribe
Body: {
  "topic": "sensor/temperature"
}

Response: {
  "status": "subscribed",
  "topic": "sensor/temperature",
  "timestamp": "2026-05-06T10:00:00Z"
}
```

#### **7. POST /api/unsubscribe**
Unsubscribe from a topic.

```
Request:  POST /api/unsubscribe
Body: {
  "topic": "sensor/temperature"
}

Response: {
  "status": "unsubscribed",
  "topic": "sensor/temperature",
  "timestamp": "2026-05-06T10:00:00Z"
}
```

#### **8. POST /api/query**
Send a query to a specific peer (Request-Response, 1-to-1).

```
Request:  POST /api/query
Body: {
  "target": "node-b",
  "request": {
    "action": "get_state",
    "params": {}
  },
  "timeout": 100  // optional, milliseconds (default 100)
}

Response: {
  "queryId": "qry_def456",
  "status": "pending",
  "target": "node-b",
  "timeoutMs": 100,
  "timestamp": "2026-05-06T10:00:00Z"
}

[Client polls or uses WebSocket for response]

Response (when ready):
{
  "queryId": "qry_def456",
  "status": "success",
  "response": {
    "uptime": 3600,
    "peerCount": 2
  },
  "from": "node-b",
  "timestamp": "2026-05-06T10:00:00.100Z"
}
```

#### **9. POST /api/query/broadcast**
Send a query to all peers and collect responses (1-to-many).

```
Request:  POST /api/query/broadcast
Body: {
  "request": {
    "action": "count_messages"
  },
  "timeout": 1000  // optional, milliseconds (default 1000)
}

Response: {
  "broadcastId": "bcast_ghi789",
  "status": "pending",
  "peerCount": 3,
  "timeout": 1000,
  "timestamp": "2026-05-06T10:00:00Z"
}

[Client polls or uses WebSocket]

Response (when ready or timeout):
{
  "broadcastId": "bcast_ghi789",
  "status": "complete",
  "responses": [
    {
      "peerId": "node-b",
      "status": "success",
      "response": {count: 150},
      "responseTime": 45
    },
    {
      "peerId": "node-c",
      "status": "success",
      "response": {count: 87},
      "responseTime": 82
    },
    {
      "peerId": "node-a",
      "status": "success",
      "response": {count: 200},
      "responseTime": 0  // local
    }
  ],
  "respondedCount": 3,
  "timeoutCount": 0,
  "averageResponseTime": 42,
  "timestamp": "2026-05-06T10:00:01Z"
}
```

#### **10. POST /api/peers/bootstrap**
Dynamically add bootstrap peers (runtime).

```
Request:  POST /api/peers/bootstrap
Body: {
  "peers": [
    "/ip4/192.168.1.105/tcp/28111/p2p/Qm...",
    "/ip4/192.168.1.106/tcp/28111/p2p/Qm..."
  ]
}

Response: {
  "status": "peers_added",
  "count": 2,
  "timestamp": "2026-05-06T10:00:00Z"
}

[Node will try to connect immediately]
```

### 5.3 WebSocket API (/ws)

**Connection:**
```
ws://localhost:25111/ws
Auth: Query param: ?token=Bearer_${apiToken}
```

**Events sent to client:**

```javascript
// Message published by another peer
{
  "type": "message_published",
  "message": {
    "messageId": "msg_abc123",
    "topic": "sensor/temperature",
    "payload": {...},
    "sender": "node-b",
    "timestamp": "2026-05-06T10:00:00Z"
  }
}

// Peer came online
{
  "type": "peer_online",
  "peerId": "node-c",
  "multiaddr": "/ip4/192.168.1.103/tcp/28111/p2p/Qm...",
  "timestamp": "2026-05-06T10:00:00Z"
}

// Peer went offline
{
  "type": "peer_offline",
  "peerId": "node-c",
  "timestamp": "2026-05-06T10:00:05Z"
}

// Query response ready
{
  "type": "query_response",
  "queryId": "qry_def456",
  "response": {
    "uptime": 3600,
    "peerCount": 2
  },
  "from": "node-b",
  "timestamp": "2026-05-06T10:00:00.100Z"
}

// Broadcast complete
{
  "type": "broadcast_complete",
  "broadcastId": "bcast_ghi789",
  "responses": [...]
}

// Disk full warning
{
  "type": "disk_full_warning",
  "freeSpace": 1024,
  "timestamp": "2026-05-06T10:00:00Z"
}
```

---

## 6. CONFIGURATION SYSTEM (UPDATED v2 - WITH NEW DEFAULTS)

### 6.1 Configuration Precedence

**Priority (highest to lowest):**
1. **CLI Flags** (command-line arguments) - HIGHEST
2. **Environment Variables** (process.env)
3. **Config File** (JSON file, default: `./gnn-conf-${node-id}.json`)
4. **Database Stored State** (LevelDB, persisted settings)
5. **Built-in Defaults** (hardcoded in code) - LOWEST

**Example:**
```bash
# CLI flag takes precedence
bun run start --node-id=my-node-1 --api-port=25111

# Config file uses node-id in default path
# ./gnn-conf-my-node-1.json (auto-resolved from --node-id)

# DB path also uses node-id
# ./gnn-data-my-node-1/ (auto-resolved from --node-id)

# Env var second
NODE_ID=env-node-1 bun run start

# Result: CLI > Env > File > DB > Default
# Final nodeId = "my-node-1" (CLI wins)
# Final config file = "./gnn-conf-my-node-1.json"
# Final db path = "./gnn-data-my-node-1/"
```

### 6.2 CLI Flags (UPDATED)

```bash
bun run start [options]

OPTIONS:
  --node-id <string>              Node identifier (auto-generated if not provided)
  --api-port <number>             REST API port (default: 25111)
  --p2p-port <number>             libp2p port (default: 28111)
  --api-token <string>            Bearer token for API (auto-generated if not provided)
  --config-file <path>            Path to config JSON file (default: ./gnn-conf-${node-id}.json)
  --bootstrap-peers <list>        Comma-separated multiaddrs to bootstrap
  --db-path <path>                LevelDB database path (default: ./gnn-data-${node-id}/)
  --log-level <level>             Log level: debug, info, warn, error (default: error)
  --log-file <path>               Log file path (default: no file, stdout only)
  --message-retention-days <n>    Message retention period in days (default: 28)
  --peer-ttl-days <n>             Peer metadata TTL in days (default: 14)
  --help, -h                      Show help
  --version, -v                   Show version

EXAMPLES:
  # Start with default config file (./gnn-conf-prod-node-1.json)
  bun run start --node-id=prod-node-1

  # Start with custom config file path
  bun run start --node-id=prod-node-1 --config-file=/etc/gnn/custom.json

  # Start with environment overrides
  bun run start --node-id=prod-node-1 --api-port=25111 --log-level=info

  # Start with bootstrap peers
  bun run start --node-id=prod-node-1 --bootstrap-peers="/ip4/192.168.1.100/tcp/28111/p2p/Qm...,/ip4/192.168.1.101/tcp/28111/p2p/Qm..."

  # Custom db path
  bun run start --node-id=prod-node-1 --db-path=/data/gnn/node1/
```

### 6.3 Environment Variables (UPDATED)

```bash
# Node Identity
GNN_NODE_ID=node-1
GNN_API_TOKEN=token_xyz...

# Network
GNN_API_PORT=25111
GNN_P2P_PORT=28111
GNN_BOOTSTRAP_PEERS="/ip4/192.168.1.100/tcp/28111/p2p/Qm...,/ip4/..."

# Storage
GNN_CONFIG_FILE=./gnn-conf-node-1.json
GNN_DB_PATH=./gnn-data-node-1/
GNN_MESSAGE_RETENTION_DAYS=28
GNN_PEER_TTL_DAYS=14

# Logging
GNN_LOG_LEVEL=error
GNN_LOG_FILE=/var/log/gnn/node.log
GNN_LOG_MAX_SIZE_KB=100
GNN_LOG_RETENTION_DAYS=1

# Messaging Timeouts
GNN_QUERY_TIMEOUT_MS=100           # P2P query timeout
GNN_BROADCAST_TIMEOUT_MS=1000      # Broadcast query timeout
GNN_MAX_PAYLOAD_SIZE=31744         # 31 KB
```

### 6.4 Config File Format (JSON) - UPDATED

**Default path: `./gnn-conf-${node-id}.json`**

```json
{
  "nodeId": "node-a",
  "apiToken": "token_abc123_xyz...",
  "apiPort": 25111,
  "p2pPort": 28111,
  "bootstrapPeers": [
    "/ip4/192.168.1.100/tcp/28111/p2p/Qm...",
    "/ip4/192.168.1.101/tcp/28111/p2p/Qm..."
  ],
  "configFile": "./gnn-conf-node-a.json",
  "dbPath": "./gnn-data-node-a/",
  "logging": {
    "level": "error",
    "file": null,
    "maxSizeKB": 100,
    "retentionDays": 1
  },
  "message": {
    "retentionDays": 28,
    "maxPayloadSize": 31744
  },
  "peer": {
    "ttlDays": 14,
    "autoCleanupInterval": "24h"
  },
  "timeouts": {
    "queryMs": 100,
    "broadcastMs": 1000,
    "peerCheckIntervalSec": 30
  },
  "discovery": {
    "mdnsEnabled": true,
    "dhtEnabled": true
  }
}
```

### 6.5 Configuration Loading Logic

```typescript
// Pseudocode for precedence with new defaults
async function loadConfig(): Promise<NodeConfig> {
  // 1. Parse CLI flags (highest priority)
  const cliConfig = parseCLIArgs();
  
  // Resolve node-id first (needed for default paths)
  const nodeId = cliConfig.nodeId || process.env.GNN_NODE_ID || generateUUID();
  
  // 2. Resolve default paths using node-id
  const defaultConfigFile = `./gnn-conf-${nodeId}.json`;
  const defaultDbPath = `./gnn-data-${nodeId}/`;
  
  // 3. Load environment variables
  const envConfig = loadEnv();
  
  // 4. Load config file (use CLI path, env path, or default)
  const configFilePath = cliConfig.configFile 
    || process.env.GNN_CONFIG_FILE 
    || defaultConfigFile;
  
  const fileConfig = fileExists(configFilePath)
    ? await loadConfigFile(configFilePath)
    : {};
  
  // 5. Load DB state
  const dbPath = cliConfig.dbPath 
    || process.env.GNN_DB_PATH 
    || defaultDbPath;
  
  const dbConfig = await loadFromDB(dbPath);
  
  // 6. Apply defaults
  const defaults = getDefaults();
  
  // Merge (priority: CLI > env > file > DB > defaults)
  return deepMerge(defaults, dbConfig, fileConfig, envConfig, cliConfig);
}
```

### 6.6 Dynamic Path Resolution

**File naming convention:**
```
Config file:  gnn-conf-${NODE_ID}.json
DB directory: gnn-data-${NODE_ID}/

Examples:
  --node-id=prod-1
    → ./gnn-conf-prod-1.json
    → ./gnn-data-prod-1/
  
  --node-id=staging-app-server
    → ./gnn-conf-staging-app-server.json
    → ./gnn-data-staging-app-server/
  
  GNN_NODE_ID=sensor-hub
    → ./gnn-conf-sensor-hub.json
    → ./gnn-data-sensor-hub/
```

---

## 7. NEXT.JS PROJECT STRUCTURE

### 7.1 File Organization

```
generic-nodenet/
├── app/
│   ├── api/
│   │   ├── health/
│   │   │   └── route.ts                     # GET /health
│   │   ├── node/
│   │   │   ├── info/
│   │   │   │   └── route.ts                 # GET /api/node/info
│   │   │   ├── peers/
│   │   │   │   └── route.ts                 # GET /api/peers
│   │   │   └── messages/
│   │   │       └── route.ts                 # GET /api/messages
│   │   ├── publish/
│   │   │   └── route.ts                     # POST /api/publish
│   │   ├── subscribe/
│   │   │   └── route.ts                     # POST /api/subscribe
│   │   ├── unsubscribe/
│   │   │   └── route.ts                     # POST /api/unsubscribe
│   │   ├── query/
│   │   │   ├── route.ts                     # POST /api/query (1-to-1)
│   │   │   └── broadcast/
│   │   │       └── route.ts                 # POST /api/query/broadcast
│   │   ├── peers/
│   │   │   └── bootstrap/
│   │   │       └── route.ts                 # POST /api/peers/bootstrap
│   │   └── ws/
│   │       └── route.ts                     # WebSocket upgrade
│   │
│   ├── dashboard/
│   │   ├── page.tsx                         # Home / Status (Server Component)
│   │   ├── peers/
│   │   │   └── page.tsx                     # Peer list
│   │   ├── messages/
│   │   │   └── page.tsx                     # Message history
│   │   ├── publish/
│   │   │   └── page.tsx                     # Publish UI
│   │   ├── query/
│   │   │   └── page.tsx                     # Query UI
│   │   ├── settings/
│   │   │   └── page.tsx                     # Node settings
│   │   └── components/
│   │       ├── navbar.tsx                   # Client Component
│   │       ├── sidebar.tsx                  # Client Component
│   │       ├── status-card.tsx              # Server Component
│   │       ├── peer-list.tsx                # Server Component
│   │       ├── message-stream.tsx           # Client Component (WebSocket)
│   │       └── publish-form.tsx             # Client Component
│   │
│   ├── layout.tsx                           # Root layout (Server Component)
│   └── page.tsx                             # Redirect to /dashboard
│
├── lib/
│   ├── p2p/
│   │   ├── node.ts                          # Main P2P node class
│   │   ├── discovery.ts                     # mDNS + DHT logic
│   │   ├── messaging.ts                     # Pub-Sub + RPC handlers
│   │   ├── transports.ts                    # TCP + WebSocket setup
│   │   └── types.ts                         # P2P TypeScript types
│   │
│   ├── storage/
│   │   ├── database.ts                      # LevelDB wrapper
│   │   ├── schema.ts                        # Key schema & queries
│   │   ├── migrations.ts                    # DB initialization
│   │   └── types.ts                         # Storage types
│   │
│   ├── api/
│   │   ├── handlers.ts                      # Shared API logic
│   │   ├── middleware.ts                    # Auth, logging, error handling
│   │   └── types.ts                         # API response types
│   │
│   ├── config/
│   │   ├── loader.ts                        # CLI + env + file + DB loader
│   │   ├── validator.ts                     # Config validation (Zod)
│   │   └── defaults.ts                      # Default values
│   │
│   ├── types/
│   │   ├── index.ts                         # Global type definitions
│   │   ├── messages.ts                      # Message types
│   │   ├── peers.ts                         # Peer types
│   │   └── config.ts                        # Config types
│   │
│   ├── utils/
│   │   ├── logger.ts                        # Structured logging
│   │   ├── time.ts                          # Time utilities
│   │   └── validation.ts                    # Input validation
│   │
│   └── websocket/
│       ├── server.ts                        # WebSocket connection manager
│       └── events.ts                        # Event broadcasting
│
├── config/
│   ├── gnn-conf-example.json                # Example config (shows as gnn-conf-${node-id}.json)
│   └── .env.example                         # Example env file
│
├── test/
│   ├── unit/
│   │   ├── storage.test.ts
│   │   ├── messaging.test.ts
│   │   ├── config.test.ts
│   │   └── types.test.ts
│   │
│   ├── integration/
│   │   ├── multi-node.test.ts               # 3-5 nodes test
│   │   ├── pubsub.test.ts                   # Pub-Sub scenarios
│   │   ├── query.test.ts                    # Query scenarios
│   │   └── discovery.test.ts                # Peer discovery
│   │
│   ├── load/
│   │   └── throughput.test.ts               # 1k msg/sec test
│   │
│   └── e2e/
│       ├── dashboard.spec.ts                # Playwright tests
│       ├── publish.spec.ts
│       └── peer-discovery.spec.ts
│
├── public/
│   └── favicon.ico
│
├── styles/
│   └── globals.css                          # Tailwind + custom
│
├── package.json
├── bun.lockb                                # Bun lock file
├── next.config.js
├── tsconfig.json
├── tailwind.config.js
├── vitest.config.ts
├── playwright.config.ts
│
├── README.md                                # Setup & quickstart
├── ARCHITECTURE.md                          # System design
├── API.md                                   # API documentation
└── .gitignore
```

### 7.2 Key Files & Their Responsibilities

**`lib/p2p/node.ts`** (Core P2P Logic)
```typescript
export class GNNNode {
  // Constructor: init libp2p, start discovery, load peers from DB
  constructor(config: NodeConfig)
  
  // Lifecycle
  async start(): Promise<void>
  async stop(): Promise<void>
  
  // Messaging
  async publish(topic: string, payload: any, ttl?: number): Promise<string>
  async query(target: string, request: any, timeout?: number): Promise<any>
  async broadcastQuery(request: any, timeout?: number): Promise<any>
  
  // Subscriptions
  async subscribe(topic: string): Promise<void>
  async unsubscribe(topic: string): Promise<void>
  
  // Peer management
  getPeers(): Peer[]
  addBootstrapPeer(multiaddr: string): Promise<void>
  
  // Events
  on(event: string, handler: Function): void
}
```

**`lib/storage/database.ts`** (LevelDB Wrapper)
```typescript
export class Database {
  // Constructor: open LevelDB at path
  constructor(dbPath: string)
  
  // CRUD
  async put(key: string, value: any): Promise<void>
  async get(key: string): Promise<any>
  async del(key: string): Promise<void>
  async *scan(options: ScanOptions): AsyncGenerator<[key, value]>
  
  // Bulk operations
  async batch(operations: Operation[]): Promise<void>
  
  // Maintenance
  async compact(): Promise<void>
  getSize(): number
  async close(): Promise<void>
}
```

**`lib/config/loader.ts`** (Config Resolution - UPDATED)
```typescript
export async function loadConfig(): Promise<NodeConfig> {
  // 1. Parse CLI flags (highest priority)
  const cliConfig = parseCLIArgs();
  
  // Resolve node-id first
  const nodeId = cliConfig.nodeId || process.env.GNN_NODE_ID || generateUUID();
  
  // 2. Load environment variables
  const envConfig = loadEnv();
  
  // 3. Load config file (with dynamic path resolution)
  const configFilePath = cliConfig.configFile 
    || process.env.GNN_CONFIG_FILE 
    || `./gnn-conf-${nodeId}.json`;
  
  const fileConfig = fileExists(configFilePath)
    ? await loadConfigFile(configFilePath)
    : {};
  
  // 4. Load DB state (with dynamic path resolution)
  const dbPath = cliConfig.dbPath 
    || process.env.GNN_DB_PATH 
    || `./gnn-data-${nodeId}/`;
  
  const dbConfig = await loadFromDB(dbPath);
  
  // 5. Apply defaults
  const defaults = getDefaults();
  
  // Merge (priority: CLI > env > file > DB > defaults)
  return deepMerge(defaults, dbConfig, fileConfig, envConfig, cliConfig);
}
```

**`lib/utils/logger.ts`** (Structured Logging)
```typescript
export const logger = {
  debug(message: string, data?: any): void
  info(message: string, data?: any): void
  warn(message: string, data?: any): void
  error(message: string, error?: Error): void
  // Writes to stdout, respects log level & rotation config
}
```

**`app/api/middleware.ts`** (Authentication & Error Handling)
```typescript
export async function authenticateRequest(req: Request): Promise<boolean> {
  // Check Authorization header, compare to config:apiToken
  // Return true if valid, false otherwise
}

export function errorHandler(error: Error): Response {
  // Format error as JSON, log it, return appropriate status code
}
```

**`lib/websocket/server.ts`** (WebSocket Management)
```typescript
export class WebSocketServer {
  constructor(nodeInstance: GNNNode)
  
  async handleUpgrade(req: Request, socket: WebSocket): Promise<void>
  
  broadcast(event: string, data: any): void
  
  on(event: string, handler: Function): void
}
```

---

## 8. TESTING STRATEGY (MVP: 67% coverage)

### 8.1 Unit Tests (`test/unit/`)

**Target: 67% line coverage**

Test modules:
- **storage.test.ts** - LevelDB operations (put, get, scan, delete)
- **messaging.test.ts** - Message serialization, validation
- **config.test.ts** - Config loading & precedence resolution
- **types.test.ts** - Type validation with Zod

Example (Vitest):
```typescript
// storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '@/lib/storage/database';

describe('Database', () => {
  let db: Database;
  
  beforeEach(async () => {
    db = new Database(':memory:');
    await db.open();
  });
  
  it('should store and retrieve a message', async () => {
    const msg = { type: 'publish', topic: 'test' };
    await db.put('message:pub:123', msg);
    const retrieved = await db.get('message:pub:123');
    expect(retrieved).toEqual(msg);
  });
  
  it('should handle scan with prefix', async () => {
    await db.put('peer:a', { id: 'a' });
    await db.put('peer:b', { id: 'b' });
    
    const peers = [];
    for await (const [key, val] of db.scan({ gte: 'peer:', lte: 'peer:~' })) {
      peers.push(val);
    }
    expect(peers).toHaveLength(2);
  });
});
```

### 8.2 Integration Tests (`test/integration/`)

**Scenario: 3-5 nodes communicating locally**

Tests:
- **multi-node.test.ts** - Spin up 3 nodes, verify they discover each other
- **pubsub.test.ts** - Publish from Node-A, verify Node-B & C receive
- **query.test.ts** - Query from A to B (1-to-1), query broadcast (1-to-many)
- **discovery.test.ts** - mDNS peer discovery, peer online/offline

Example:
```typescript
// pubsub.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GNNNode } from '@/lib/p2p/node';

describe('Pub-Sub Integration', () => {
  let nodeA: GNNNode, nodeB: GNNNode;
  
  beforeAll(async () => {
    nodeA = new GNNNode({ nodeId: 'node-a', apiPort: 25111, p2pPort: 28111 });
    nodeB = new GNNNode({ nodeId: 'node-b', apiPort: 25112, p2pPort: 28112 });
    
    await nodeA.start();
    await nodeB.start();
    
    // Wait for discovery
    await new Promise(r => setTimeout(r, 3000));
  });
  
  it('should publish from A and receive on B', async () => {
    let received = false;
    nodeB.on('message', (msg) => {
      if (msg.topic === 'test/topic') received = true;
    });
    
    await nodeA.publish('test/topic', { data: 'hello' });
    
    await new Promise(r => setTimeout(r, 500));
    expect(received).toBe(true);
  });
  
  afterAll(async () => {
    await nodeA.stop();
    await nodeB.stop();
  });
});
```

### 8.3 Load Test (`test/load/`)

**Target: 1k messages/sec**

```typescript
// throughput.test.ts
describe('Load Test - 1000 msg/sec', () => {
  it('should handle burst of 1k messages in 1 second', async () => {
    const node = new GNNNode({ ... });
    await node.start();
    
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      await node.publish('load/test', { seq: i });
    }
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(2000); // Should handle in <2 sec
  });
});
```

### 8.4 E2E Tests (`test/e2e/`, Playwright)

**Test actual web dashboard**

```typescript
// dashboard.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should display node info on load', async ({ page }) => {
    await page.goto('http://localhost:25111/dashboard');
    
    const nodeId = await page.locator('[data-testid="node-id"]');
    await expect(nodeId).toContainText('node-a');
  });
  
  test('should show peer count', async ({ page }) => {
    await page.goto('http://localhost:25111/dashboard/peers');
    
    const peers = await page.locator('[data-testid="peer-item"]');
    expect(peers).toHaveCount(2); // Connected to 2 peers
  });
});
```

---

## 9. LOGGING & OBSERVABILITY (MVP)

### 9.1 Log Configuration

**Default (ERROR level):**
```
[ERROR] Failed to connect to peer: Qm... (Connection timeout)
[ERROR] Message payload exceeds max size: 35000 > 31744
```

**With --log-level=info:**
```
[INFO] Node node-a started (PID: 12345)
[INFO] Listening on /ip4/192.168.1.100/tcp/28111/p2p/Qm...
[INFO] REST API on http://localhost:25111
[INFO] Peer node-b online (discovered via mDNS)
[INFO] Published message msg_abc123 to topic sensor/temperature
[INFO] Query qry_def456 responded in 45ms
```

**With --log-level=debug:**
```
[DEBUG] mDNS advertisement sent
[DEBUG] DHT lookup for peer Qm... returned [multiaddr1, multiaddr2]
[DEBUG] Gossipsub message received: msg_abc123
[DEBUG] LevelDB write: message:pub:1715000000:msg_abc123 (1.2 KB)
```

### 9.2 Log Rotation

**Configuration:**
```json
{
  "logging": {
    "level": "error",
    "file": "/var/log/gnn/node.log",
    "maxSizeKB": 100,
    "retentionDays": 1
  }
}
```

**Behavior:**
- Logs to file + stdout
- Rotates when file exceeds 100 KB
- Keeps only last 1 day of logs
- Old logs automatically deleted

---

## 10. ERROR HANDLING & EDGE CASES (MVP)

### 10.1 P2P Query Failures

| Scenario | Behavior |
|----------|----------|
| **Peer offline** | Query times out after 100ms (P2P) or 1000ms (broadcast), return error |
| **No response** | Report as timeout, don't retry (no retry in MVP) |
| **Network latency spike** | Wait full timeout, then fail |
| **Invalid peer ID** | Return error immediately (peer not found) |

**Example API response:**
```json
{
  "error": "QUERY_TIMEOUT",
  "target": "node-c",
  "timeoutMs": 100,
  "message": "No response from target peer"
}
```

### 10.2 Storage Failures

| Scenario | Behavior |
|----------|----------|
| **LevelDB corrupted** | Wipe DB directory, start fresh on next restart |
| **Disk full** | Stop accepting new messages, set node state to DISK_FULL, warn via logs + WebSocket |
| **DB write fails** | Log error, retry once, then fail message |
| **Peer metadata TTL expired** | Auto-delete from LevelDB (daily cleanup) |

**Disk full behavior:**
```
1. Monitor available disk space (check during message writes)
2. If <1 MB free:
   - Set state: DISK_FULL
   - Log: [ERROR] Disk full, stopping message acceptance
   - WebSocket: {type: "disk_full_warning", freeSpace: 512000}
   - API: Reject POST /api/publish with HTTP 507 (Insufficient Storage)
3. On restart: Check disk, if space available, resume
```

### 10.3 Node Restart Recovery

**On restart:**
```
1. Load config from CLI/env/file/DB (precedence order)
2. Initialize LevelDB (check for corruption)
3. Load all peers from LevelDB
4. Filter out offline peers (mark as offline if >5 min stale)
5. Start libp2p, connect to mDNS + bootstrap peers
6. Rescan for new peers in network
7. Restore subscriptions from LevelDB
8. Start accepting API requests
9. Emit WebSocket event: {type: "node_restarted", uptime: 0}
```

---

## 11. PERFORMANCE TARGETS (MVP)

| Metric | Target | Success Criteria |
|--------|--------|------------------|
| **Publish latency** | <1 sec | Message arrives at all subscribers |
| **P2P query latency** | <100 ms | Direct peer response (LAN) |
| **Broadcast latency** | <1 sec | Collect all responses |
| **Node startup** | <4 sec | From `bun run start` to accepting API requests |
| **Idle memory** | <55 MB | Per node, no activity |
| **Under load (100 msg/sec)** | <90 MB | Per node |
| **Message throughput** | 100+ msg/sec | Sustained for 1 minute |
| **Storage density** | 80k msg/day | Growth rate for 5-10 MB DB/100k messages |
| **Concurrent peers** | 25+ | Can maintain connections to 25 peers |
| **API response time** | <50 ms | GET /api/node/info (not including network) |
| **Dev Hot Reload** | ~500 ms | Fast Refresh (Turbopack) |
| **Build time** | ~2-3 sec | Full production build |

---

## 12. ACCEPTANCE CRITERIA (MVP - Go/No-Go)

**Node Discovery:**
- [ ] 3-5 nodes on local network auto-discover in <2 sec (mDNS)
- [ ] Discovered peers listed in `/api/peers`
- [ ] Peer status shows "online" / "offline" correctly

**Messaging - Pub-Sub:**
- [ ] Publish message via REST API
- [ ] All subscribed peers receive message <1 sec
- [ ] Message stored in LevelDB with correct key
- [ ] Retrieve messages via `/api/messages` with pagination

**Messaging - Query:**
- [ ] P2P query (1-to-1) responds in <100 ms
- [ ] Broadcast query (1-to-many) responds in <1 sec
- [ ] Query timeout respected (100ms P2P, 1000ms broadcast)
- [ ] No retry if query fails (fails fast)

**API & Dashboard:**
- [ ] All 10 endpoints working (status 200 for successful calls)
- [ ] Bearer token auth required (except /health)
- [ ] WebSocket live updates working (peer online/offline, new messages)
- [ ] Dashboard renders without errors (dark mode only)
- [ ] Message pagination works (20/50/100 items)

**Storage & Configuration:**
- [ ] LevelDB stores messages with correct key structure
- [ ] Auto-delete old messages based on retention config
- [ ] Config precedence works: CLI > env > file > DB > defaults
- [ ] Config file optional (CLI + env only also works)
- [ ] Default config file path: `./gnn-conf-${node-id}.json`
- [ ] Default db path: `./gnn-data-${node-id}/`
- [ ] Optional node ID auto-generated on first run
- [ ] Node ID stored in DB, loaded on restart

**Testing:**
- [ ] Unit tests: 67% code coverage (measured by vitest)
- [ ] Integration tests: 3-5 nodes discover, pub-sub, query
- [ ] Load test: Handle 1k messages in 1 second
- [ ] E2E tests: Dashboard loads, peer list appears (Playwright)

**Performance:**
- [ ] Startup time: <4 sec
- [ ] Idle memory: <55 MB
- [ ] Under 100 msg/sec: <90 MB
- [ ] API latency: <50 ms (not including network)
- [ ] Dev Hot Reload: ~500 ms

**Documentation:**
- [ ] README with setup instructions
- [ ] API specification (endpoints, examples, error codes)
- [ ] Architecture diagram (ASCII or image)
- [ ] Config reference (all options documented)
- [ ] Example config file provided

**Code Quality:**
- [ ] TypeScript strict mode enabled
- [ ] No console.log (use logger.ts)
- [ ] Error handling for all async operations
- [ ] No hardcoded secrets (use config system)
- [ ] Shared types across frontend/backend
- [ ] P2P core isolated for future extraction

---

## 13. DEPLOYMENT & RUNNING (MVP - No Docker)

### 13.1 Prerequisites

```bash
# Install Bun (macOS/Linux/Windows)
curl -fsSL https://bun.sh/install | bash

# or Windows: https://bun.sh/docs/installation#windows
```

### 13.2 Quick Start (Single Node - UPDATED)

```bash
# Clone & setup
git clone <repo>
cd generic-nodenet
bun install

# Create config (will use default path ./gnn-conf-node-a.json)
bun run start --node-id=node-a

# OR create with custom config
cp config/gnn-conf-example.json config/gnn-conf-node-a.json
bun run start --config-file=./config/gnn-conf-node-a.json

# Output:
# [INFO] Node node-a started (PID: 12345)
# [INFO] Config file: ./gnn-conf-node-a.json
# [INFO] Data path: ./gnn-data-node-a/
# [INFO] Listening on /ip4/192.168.1.100/tcp/28111/p2p/Qm...
# [INFO] REST API on http://localhost:25111
# [INFO] Dashboard: http://localhost:25111/dashboard
```

### 13.3 Multi-Node Local Cluster (UPDATED)

```bash
# Terminal 1 - Node A (auto-creates ./gnn-conf-node-a.json and ./gnn-data-node-a/)
bun run start --node-id=node-a --api-port=25111 --p2p-port=28111

# Terminal 2 - Node B (auto-creates ./gnn-conf-node-b.json and ./gnn-data-node-b/)
bun run start --node-id=node-b --api-port=25112 --p2p-port=28112

# Terminal 3 - Node C (auto-creates ./gnn-conf-node-c.json and ./gnn-data-node-c/)
bun run start --node-id=node-c --api-port=25113 --p2p-port=28113

# All nodes auto-discover via mDNS in ~2 seconds
# Check dashboards:
# http://localhost:25111/dashboard  (Node A)
# http://localhost:25112/dashboard  (Node B)
# http://localhost:25113/dashboard  (Node C)
```

### 13.4 Test Pub-Sub

```bash
# Get API token from Node A config
API_TOKEN=$(cat ./gnn-conf-node-a.json | jq -r '.apiToken')

# Publish from Node A
curl -X POST http://localhost:25111/api/publish \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic":"test/hello","payload":{"msg":"world"}}'

# Subscribe on Node B
curl -X POST http://localhost:25112/api/subscribe \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic":"test/hello"}'

# View messages on Node B
curl http://localhost:25112/api/messages \
  -H "Authorization: Bearer $API_TOKEN"
```

---

## 14. DELIVERABLES (MVP - FINAL)

### **Week 1: Foundation (Core P2P + Storage)**
- [x] Initialize Bun 1.3.11 + Next.js 16.2 project
- [x] Setup libp2p (TCP, mDNS, DHT, Gossipsub, MPLEX)
- [x] Implement LevelDB schema
- [x] Basic node startup/shutdown
- [x] Peer discovery (mDNS + bootstrap from config)
- [x] Config loader (CLI + env + file + dynamic paths)
- **Deliverable:** 3 nodes discover each other on LAN

### **Week 2: Messaging (Pub-Sub + RPC)**
- [x] Pub-Sub publisher/subscriber logic
- [x] Request-Response query handler
- [x] Broadcast query aggregation
- [x] Message persistence (LevelDB)
- [x] Message serialization/deserialization
- [x] Message TTL (optional field)
- **Deliverable:** Pub-Sub and queries work between nodes

### **Week 3: REST API + Web UI**
- [x] All 10 REST API endpoints
- [x] Bearer token authentication
- [x] WebSocket server + events
- [x] React dashboard (dark mode, Server Components)
- [x] Config persistence (DB state)
- [x] Logging system with rotation
- [x] Error handling & edge cases
- **Deliverable:** API endpoints respond correctly, WebSocket live updates

### **Week 4: Testing + Documentation + Polish**
- [x] Unit tests (67% coverage)
- [x] Integration tests (multi-node scenarios)
- [x] Load test (1k msg/sec)
- [x] E2E tests (Playwright basic)
- [x] README with setup instructions
- [x] API specification document
- [x] Architecture diagram
- [x] Config reference
- [x] Code cleanup, TypeScript strict mode
- [x] P2P core isolated/modular
- **Deliverable:** Production-ready MVP, fully documented

---

# END OF MVP PROMPT (FINAL v2)

---
<!--

Now I'll generate the **Phase 2-4 prompts** as separate comprehensive documents:

Due to token/length constraints, I'll create them as structured outputs. Would you like me to:

1. **Generate Phase 2 Prompt** (Internet + NAT Traversal + WebTransport)?
2. **Generate Phase 3 Prompt** (Adversarial + Crypto + Signing)?
3. **Generate Phase 4 Prompt** (Advanced Features)?

Or should I provide them all in one comprehensive output? Let me know your preference! 🚀
-->