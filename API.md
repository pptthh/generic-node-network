# GNN REST API Reference

All endpoints (except `/health`) require:
```
Authorization: Bearer <apiToken>
```

Base URL: `http://localhost:25111` (port varies by instance)

---

## 1. GET /health
No auth required.
```json
{ "status": "ok", "nodeId": "node-a", "uptime": 3600, "timestamp": 1715000000 }
```

## 2. GET /api/node/info
```json
{
  "nodeId": "node-a", "apiVersion": "1.0.0", "uptime": 3600,
  "peerCount": 3, "subscriptionCount": 5, "messageCount": 247,
  "dbSize": 1234567, "diskFull": false, "state": "ONLINE",
  "startedAt": "2026-05-06T10:00:00Z", "timestamp": "2026-05-06T10:01:00Z"
}
```

## 3. GET /api/peers
Query params: `?status=online&limit=100`
```json
[{ "peerId": "Qm...", "alias": "node-b", "multiaddr": "...", "status": "online", "lastSeen": "...", "discoveryMethod": "mDNS", "apiPort": 25112 }]
```

## 4. GET /api/messages
Query params: `?limit=50&offset=0&topic=sensor/temp&type=publish&order=desc`
```json
{ "messages": [...], "total": 247, "limit": 50, "offset": 0, "hasMore": true }
```

## 5. POST /api/publish
```json
// Request
{ "topic": "sensor/temperature", "payload": { "temp": 23.5 }, "ttl": null }

// Response
{ "messageId": "msg_abc123", "status": "published", "timestamp": "..." }

// Error (payload >31KB)
{ "error": "PAYLOAD_TOO_LARGE", "maxSize": 31744, "actualSize": 35000 }
```

## 6. POST /api/subscribe
```json
// Request
{ "topic": "sensor/temperature" }

// Response
{ "status": "subscribed", "topic": "sensor/temperature", "timestamp": "..." }
```

## 7. POST /api/unsubscribe
```json
// Request
{ "topic": "sensor/temperature" }

// Response
{ "status": "unsubscribed", "topic": "sensor/temperature", "timestamp": "..." }
```

## 8. POST /api/query
```json
// Request
{ "target": "node-b", "request": { "action": "get_state", "params": {} }, "timeout": 100 }

// Response (success)
{ "queryId": "qry_def456", "status": "success", "response": { "uptime": 3600 }, "from": "node-b", "timestamp": "..." }

// Response (timeout)
{ "error": "QUERY_TIMEOUT", "target": "node-b", "timeoutMs": 100, "message": "No response from target peer" }
```

## 9. POST /api/query/broadcast
```json
// Request
{ "request": { "action": "count_messages" }, "timeout": 1000 }

// Response
{
  "broadcastId": "bcast_ghi789", "status": "complete",
  "responses": [
    { "peerId": "node-b", "status": "success", "response": { "count": 150 }, "responseTime": 45 },
    { "peerId": "node-c", "status": "success", "response": { "count": 87 }, "responseTime": 82 }
  ],
  "respondedCount": 3, "timeoutCount": 0, "averageResponseTime": 42, "timestamp": "..."
}
```

## 10. POST /api/peers/bootstrap
```json
// Request
{ "peers": ["/ip4/192.168.1.105/tcp/28111/p2p/Qm...", "/ip4/192.168.1.106/tcp/28112/p2p/Qm..."] }

// Response
{ "status": "peers_added", "count": 2, "failed": 0, "timestamp": "..." }
```

---

## WebSocket API

Connect: `ws://localhost:25111/ws?token=<apiToken>`

### Events
```json
{ "type": "message_published", "message": { "messageId": "...", "topic": "...", "payload": {...}, "sender": "node-b", "timestamp": "..." } }
{ "type": "peer_online", "peerId": "node-c", "multiaddr": "...", "timestamp": "..." }
{ "type": "peer_offline", "peerId": "node-c", "timestamp": "..." }
{ "type": "query_response", "queryId": "qry_def456", "response": {...}, "from": "node-b", "timestamp": "..." }
{ "type": "broadcast_complete", "broadcastId": "bcast_ghi789", "responses": [...] }
{ "type": "disk_full_warning", "freeSpace": 1024, "timestamp": "..." }
{ "type": "node_restarted", "uptime": 0 }
```

---

## Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer token |
| `INVALID_TOPIC` | 400 | Missing or malformed topic |
| `PAYLOAD_TOO_LARGE` | 413 | Payload exceeds 31KB |
| `MISSING_TARGET` | 400 | Query target peer ID missing |
| `PEER_NOT_FOUND` | 404 | Target peer not in peer list |
| `QUERY_TIMEOUT` | 408 | No response within timeout |
| `INVALID_PEERS` | 400 | Bootstrap peers array invalid |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
