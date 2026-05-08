# GenericNodeNet (GNN)

A distributed peer-to-peer node network framework built on Bun + Next.js + libp2p + LevelDB.

## Features

- **P2P Networking** — mDNS auto-discovery on LAN, Kademlia DHT routing, Gossipsub pub-sub
- **REST API** — 10 endpoints for messaging, peers, and node management
- **WebSocket** — Real-time live updates for peer events and messages
- **Web Dashboard** — Dark mode React dashboard (Next.js App Router)
- **Persistent Storage** — LevelDB with structured key schema and automatic pruning
- **Flexible Config** — CLI flags > env vars > config file > DB state > defaults

## Prerequisites

```bash
curl -fsSL https://bun.sh/install | bash
```

## Quick Start

```bash
# Clone and install
git clone <repo>
cd generic-node-net
bun install

# Start a node (creates ./gnn-conf-node-a.json and ./gnn-data-node-a/ automatically)
bun run start --node-id=node-a --log-level=info

# Output:
# [GNN] Node ID: node-a
# [GNN] API Token: token_abc123...
# [GNN] Dashboard: http://localhost:25111/dashboard
```

## Multi-Node Local Cluster

```bash
# Terminal 1 — Node A
bun run start --node-id=node-a --api-port=25111 --p2p-port=28111

# Terminal 2 — Node B
bun run start --node-id=node-b --api-port=25112 --p2p-port=28112

# Terminal 3 — Node C
bun run start --node-id=node-c --api-port=25113 --p2p-port=28113

# Nodes auto-discover via mDNS in ~2 seconds
```

## API Token

The API token is printed on startup. Use it as a Bearer token:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:25111/api/node/info
```

## Testing

```bash
bun test              # Unit + integration tests
bun test:e2e          # Playwright E2E tests (requires running node)
```

## CLI Options

```
--node-id <id>                    Node identifier (auto-generated if not set)
--api-port <port>                 REST API port (default: 25111)
--p2p-port <port>                 P2P libp2p port (default: 28111)
--api-token <token>               Bearer token (auto-generated if not set)
--config-file <path>              Config JSON file (default: ./gnn-conf-<nodeId>.json)
--db-path <path>                  LevelDB path (default: ./gnn-data-<nodeId>)
--log-level <level>               debug|info|warn|error (default: error)
--bootstrap-peers <multiaddrs>    Comma-separated bootstrap multiaddrs
--message-retention-days <n>      Message TTL in days (default: 28)
--peer-ttl-days <n>               Peer metadata TTL in days (default: 14)
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for system design and diagrams.

## API Reference

See [API.md](API.md) for full endpoint documentation.
