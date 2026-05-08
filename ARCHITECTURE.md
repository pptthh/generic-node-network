# GNN Architecture

## Single Node

```
┌─────────────────────────────────────────────────────┐
│         GNN Node Instance (Bun Runtime)             │
│  Memory: ~50 MB (idle) | Process: 1 binary         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Layer 1: REST API Server ─────────────────┐    │
│  │ Next.js API Routes (App Router)            │    │
│  │ Endpoints: /api/node/*, /api/peers/*       │    │
│  │ Bearer token auth (Authorization header)   │    │
│  │ Port: 25111 + instance offset              │    │
│  └─────────────────────────────────────────────┘    │
│                         ↓                           │
│  ┌─ Layer 2: WebSocket Server ────────────────┐    │
│  │ Same port as REST API (Bun custom server)  │    │
│  │ Live updates: peer events, messages        │    │
│  │ Connection: ws://localhost:25111/ws        │    │
│  └─────────────────────────────────────────────┘    │
│                         ↓                           │
│  ┌─ Layer 3: Message Router ──────────────────┐    │
│  │ Pub-Sub handler (Gossipsub)                │    │
│  │ Request-Response handler (RPC streams)     │    │
│  │ In-memory queue (max 1000 pending)         │    │
│  └─────────────────────────────────────────────┘    │
│                         ↓                           │
│  ┌─ Layer 4: P2P Transport (libp2p) ──────────┐    │
│  │ TCP (primary transport)                    │    │
│  │ Yamux multiplexing                         │    │
│  │ Noise encryption                           │    │
│  │ mDNS discovery (auto on LAN)               │    │
│  │ Kademlia DHT (peer routing)                │    │
│  │ Gossipsub (pub-sub protocol)               │    │
│  │ Port: 28111 + instance offset              │    │
│  └─────────────────────────────────────────────┘    │
│                         ↓                           │
│  ┌─ Layer 5: Storage (LevelDB) ───────────────┐    │
│  │ Peer metadata (peerId, multiaddr, status)  │    │
│  │ Messages (published, queries, responses)   │    │
│  │ Subscriptions (topic -> nodeId mappings)   │    │
│  │ Node configuration state                   │    │
│  │ Database: ./gnn-data-${node-id}/           │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Multi-Node LAN

```
┌──────────────────────────────────────────────────┐
│            Local Network (192.168.1.x)           │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌─────────────┐  ┌─────────────┐ ┌──────────┐  │
│  │   Node-A    │  │   Node-B    │ │ Node-C   │  │
│  │ 25111/28111 │  │ 25112/28112 │ │25113/... │  │
│  └─────────────┘  └─────────────┘ └──────────┘  │
│        ↓                ↓               ↓        │
│    mDNS announces   mDNS announces   mDNS ann.   │
│        ↓                ↓               ↓        │
│    Auto-discover via Bonjour/Avahi (~2 sec)      │
│        ↓                ↓               ↓        │
│    Connect via TCP/Yamux (libp2p streams)        │
│        ↓                ↓               ↓        │
│  ✅ Mesh network (each knows all peers)          │
│                                                  │
└──────────────────────────────────────────────────┘
```

## Configuration Precedence

```
CLI Flags  >  Env Vars  >  Config File  >  DB State  >  Defaults
(highest)                                              (lowest)
```

## LevelDB Key Schema

```
message:published:${timestamp}:${messageId}   → PublishedMessage
message:query:${timestamp}:${queryId}         → QueryMessage
message:response:${timestamp}:${queryId}      → ResponseMessage
peer:${peerId}                                → Peer
peer:byaddr:${multiaddr}                      → peerId
subscription:${topic}:${nodeId}               → { topic, nodeId, subscribedAt }
config:nodeId                                 → string
config:apiToken                               → string
config:bootstrapPeers                         → string[]
config:nodeState                              → { diskFull, uptime }
state:uptime                                  → number (seconds)
state:messageCount                            → number
state:dbSize                                  → number (bytes)
```

## File Structure

```
generic-node-net/
├── server.ts                  # Entry point (Bun custom server)
├── lib/
│   ├── p2p/node.ts            # GNNNode class (core P2P logic)
│   ├── storage/database.ts    # LevelDB wrapper
│   ├── storage/schema.ts      # Key schema & queries
│   ├── config/loader.ts       # Config precedence loading
│   ├── websocket/server.ts    # WebSocket manager
│   ├── api/middleware.ts      # Auth & error handling
│   └── types/                 # Shared TypeScript types
├── app/
│   ├── api/                   # 10 REST endpoints
│   └── dashboard/             # React dashboard
└── test/                      # Vitest + Playwright tests
```
