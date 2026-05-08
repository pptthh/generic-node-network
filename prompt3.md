# 📋 PHASE 3: ADVERSARIAL MODE + CRYPTOGRAPHIC SIGNING IMPLEMENTATION PROMPT

## 🎯 PROJECT SPECIFICATION

**Project Name:** GenericNodeNet (GNN) - Phase 3: Adversarial Mode & Security  
**Phase:** Phase 3 (Adversarial/Untrusted Network)  
**Timeline:** 5-7 weeks  
**Stack:** Bun 1.3.11 + Next.js 16.2 + LevelDB + libp2p (with crypto)  
**Target:** Untrusted network with cryptographic verification and peer reputation  
**Dependency:** Requires Phase 2 (Internet connectivity) as foundation  

---

## 1. PHASE 3 OVERVIEW

### 1.1 What Phase 3 Adds

Phase 3 transforms GNN from a **trusted network** (Phase 0-2) to an **adversarial-resistant network** by adding:

- **Adversarial Mode as DEFAULT** (no longer trusted-only)
- **Asymmetric Cryptography** (ED25519 keypairs per node)
- **Message Signing** (all messages signed by sender)
- **Message Verification** (recipient verifies signature)
- **Peer Reputation System** (track peer behavior, score peers)
- **Peer Blocklists** (ban malicious or spam peers)
- **Token Rotation** (for REST API security)
- **Mutual TLS (mTLS)** for P2P connections (optional)
- **Rate Limiting** per peer (prevent spam/DoS)
- **Message Authentication Code (MAC)** for integrity
- **Identity Verification** (prove node ownership)
- **Key Rotation** (regularly rotate signing keys)

### 1.2 Success Criteria (Phase 3)

✅ **All messages cryptographically signed** (100%)  
✅ **Peer reputation system functional** (track/score behavior)  
✅ **Blocklist prevents malicious peers** from communicating  
✅ **Message verification latency** <50ms per message  
✅ **Token rotation works** without disrupting connections  
✅ **Mutual TLS optional** but configurable  
✅ **Rate limiting prevents spam** (10+ msg/sec per peer allowed, 100+ msg/sec rejected)  
✅ **Key rotation tested** (rotate keys without loss of identity)  
✅ **Backward compatibility** with Phase 2 (graceful fallback)  
✅ **Documentation** on threat model, security assumptions  

---

## 2. CRYPTOGRAPHIC ARCHITECTURE

### 2.1 Key Types & Hierarchy

```
Node Identity (Permanent):
  ├─ Node ID: Derived from public key (immutable)
  │   └─ Format: Qm<base32(SHA256(public_key))>
  │   └─ Permanent throughout node lifetime
  │
  └─ Ed25519 Keypair (permanent):
      ├─ Public Key: Shared with all peers
      ├─ Private Key: Never shared, stored encrypted locally
      └─ Usage: Sign all messages (P2P + REST)

Message Signing (Per-Message):
  ├─ Message Hash: SHA256 of message content
  ├─ Signature: Ed25519(message_hash, private_key)
  └─ Verification: Verify(signature, message_hash, public_key)

API Authentication (Token-Based):
  ├─ API Token: Random 32+ byte string (expires after 90 days)
  ├─ Hash: SHA256(token) stored in DB (never plain text)
  └─ Rotation: Generate new token on schedule, phased rollout

Connection Encryption (TLS, optional mTLS):
  ├─ Standard TLS: Encrypts transport layer (always on)
  ├─ mTLS (mutual TLS): Client verifies server certificate too
  │   └─ Uses node's Ed25519 keypair converted to TLS cert
  └─ Cipher Suite: TLS 1.3+ only (no legacy)
```

### 2.2 Key Storage

**Configuration:**
```json
{
  "cryptography": {
    "keyStorage": {
      "type": "encrypted-file",
      "path": "./gnn-keys-${node-id}/",
      "encryptionAlgorithm": "aes-256-gcm",
      "encryptionKeyDerivation": "argon2id",
      "backupEnabled": true,
      "backupPath": "./gnn-keys-${node-id}-backup/"
    },
    "keyRotation": {
      "enabled": true,
      "rotationInterval": 2592000000,
      "rotationIntervalDays": 30,
      "retainOldKeys": 3,
      "retentionDays": 90
    },
    "signing": {
      "algorithm": "Ed25519",
      "hashAlgorithm": "SHA256"
    },
    "tls": {
      "minVersion": "1.3",
      "cipherSuites": ["TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256"],
      "mTLS": {
        "enabled": false,
        "trustStore": "./gnn-ca-certs/"
      }
    }
  }
}
```

**Key Storage Layout:**
```
./gnn-keys-node-a/
├── node-id.json
│   └─ { "peerId": "Qm...", "publicKey": "base64(...)" }
├── private-key.encrypted
│   └─ Encrypted with Argon2id derived key
├── private-key.password
│   └─ Hash of master password (salted)
├── key-rotation-history.json
│   └─ [{ "publicKey": "old1", "rotatedAt": "2026-02-01", "retiredAt": "2026-05-01" }, ...]
└── backups/
    └── private-key-2026-01-01.encrypted
```

---

## 3. MESSAGE SIGNING & VERIFICATION

### 3.1 Message Format (Signed)

**Before (MVP Phase 0-2 - Trusted):**
```json
{
  "type": "publish",
  "messageId": "msg_abc123",
  "topic": "sensor/temperature",
  "payload": {"temp": 23.5},
  "sender": "node-a",
  "timestamp": 1715000000
}
```

**After (Phase 3 - Adversarial, SIGNED):**
```json
{
  "type": "publish",
  "messageId": "msg_abc123",
  "topic": "sensor/temperature",
  "payload": {"temp": 23.5},
  "sender": "node-a",
  "timestamp": 1715000000,
  "publicKey": "base64(ed25519_public_key)",
  "signature": "base64(ed25519_signature)",
  "version": 2
}
```

**Signature Creation (Pseudocode):**
```typescript
async function signMessage(
  message: Message,
  privateKey: Buffer
): Promise<SignedMessage> {
  // 1. Create signing payload (without signature)
  const signingPayload = {
    type: message.type,
    messageId: message.messageId,
    topic: message.topic,
    payload: JSON.stringify(message.payload),
    sender: message.sender,
    timestamp: message.timestamp,
    publicKey: message.publicKey,
    version: 2
  };
  
  // 2. Serialize canonical JSON (deterministic ordering)
  const canonicalJSON = canonicalStringify(signingPayload);
  
  // 3. Hash message
  const messageHash = crypto.createHash('sha256')
    .update(canonicalJSON)
    .digest();
  
  // 4. Sign hash with private key
  const signature = crypto.sign(null, messageHash, {
    key: privateKey,
    format: 'pem',
    type: 'pkcs8'
  });
  
  // 5. Return signed message
  return {
    ...signingPayload,
    signature: signature.toString('base64'),
    version: 2
  };
}
```

**Signature Verification (Pseudocode):**
```typescript
async function verifyMessage(
  message: SignedMessage,
  publicKey: Buffer
): Promise<boolean> {
  try {
    // 1. Recreate signing payload
    const signingPayload = {
      type: message.type,
      messageId: message.messageId,
      topic: message.topic,
      payload: message.payload,
      sender: message.sender,
      timestamp: message.timestamp,
      publicKey: message.publicKey,
      version: message.version
    };
    
    // 2. Serialize canonical JSON
    const canonicalJSON = canonicalStringify(signingPayload);
    
    // 3. Hash message
    const messageHash = crypto.createHash('sha256')
      .update(canonicalJSON)
      .digest();
    
    // 4. Verify signature
    const isValid = crypto.verify(
      null,
      messageHash,
      { key: publicKey, format: 'pem' },
      Buffer.from(message.signature, 'base64')
    );
    
    // 5. Check timestamp (prevent replay attacks)
    const now = Date.now();
    const messageAge = now - message.timestamp;
    if (messageAge > 300000) { // 5 minutes max
      logger.warn('Message too old', { messageId: message.messageId, age: messageAge });
      return false;
    }
    
    return isValid;
  } catch (error) {
    logger.error('Signature verification failed', error);
    return false;
  }
}
```

### 3.2 Canonical JSON Serialization

**Purpose:** Ensure consistent serialization regardless of library/language

**Implementation (Pseudocode):**
```typescript
function canonicalStringify(obj: any): string {
  // 1. Sort object keys alphabetically
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string') {
      // Escape special characters
      return JSON.stringify(obj);
    }
    return String(obj);
  }
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  
  // 2. Sort keys and recursively stringify
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => {
    return `"${key}":${canonicalStringify(obj[key])}`;
  });
  
  return '{' + pairs.join(',') + '}';
}
```

---

## 4. PEER REPUTATION SYSTEM

### 4.1 Reputation Model

**Reputation Score:**
- Range: 0 (banned) to 100 (fully trusted)
- Default: 50 (neutral)
- Factors:
  - Messages sent (successful/invalid ratio)
  - Response latency
  - Uptime
  - Malicious behavior
  - Spam rate

**Configuration:**
```json
{
  "reputation": {
    "enabled": true,
    "initialScore": 50,
    "minScore": 0,
    "maxScore": 100,
    "decayInterval": 86400000,
    "decayRate": 0.95,
    "factors": {
      "validMessageBenefit": 1,
      "invalidMessagePenalty": -5,
      "signatureFailPenalty": -10,
      "spamPenalty": -50,
      "timeoutPenalty": -2,
      "uptimeBonus": 0.5,
      "latencyBonus": {
        "under50ms": 1,
        "under100ms": 0.5,
        "over500ms": -2
      }
    },
    "actions": {
      "scoreBelow20": "reduce connection priority",
      "scoreBelow10": "quarantine peer (only relay)",
      "scoreZero": "blocklist peer (reject all)"
    }
  }
}
```

### 4.2 Reputation Tracking

**Storage Schema (LevelDB):**
```
reputation:${peerId}:score             → 50 (current score)
reputation:${peerId}:lastUpdate        → 1715000000 (timestamp)
reputation:${peerId}:validMessages     → 1234 (count)
reputation:${peerId}:invalidMessages   → 12 (count)
reputation:${peerId}:spamReports       → 3 (count)
reputation:${peerId}:avgLatency        → 45 (ms)
reputation:${peerId}:uptime            → 0.95 (percentage)
reputation:${peerId}:history           → [{score: 51, timestamp: ..., reason: "valid_message"}, ...]
```

**Reputation Update Logic (Pseudocode):**
```typescript
class ReputationSystem {
  async updateScore(
    peerId: string,
    event: ReputationEvent,
    delta: number
  ): Promise<void> {
    // 1. Get current score
    let score = await this.getScore(peerId) || 50;
    
    // 2. Apply decay (older scores decay toward 50)
    const lastUpdate = await db.get(`reputation:${peerId}:lastUpdate`);
    if (lastUpdate) {
      const ageDays = (Date.now() - lastUpdate) / 86400000;
      const decay = Math.pow(0.95, ageDays);
      score = 50 + (score - 50) * decay;
    }
    
    // 3. Apply delta
    score = Math.max(0, Math.min(100, score + delta));
    
    // 4. Store updated score
    await db.put(`reputation:${peerId}:score`, score);
    await db.put(`reputation:${peerId}:lastUpdate`, Date.now());
    
    // 5. Log event
    const history = await db.get(`reputation:${peerId}:history`) || [];
    history.push({
      score,
      timestamp: Date.now(),
      reason: event.type,
      details: event.details
    });
    
    // Keep only last 1000 events
    if (history.length > 1000) {
      history.shift();
    }
    
    await db.put(`reputation:${peerId}:history`, history);
    
    // 6. Check if action needed
    await this.checkReputationThresholds(peerId, score);
  }
  
  async checkReputationThresholds(peerId: string, score: number): Promise<void> {
    if (score >= 20) {
      // Normal operation
    } else if (score >= 10) {
      // Reduce connection priority
      logger.warn('Peer below threshold 20', { peerId, score });
      await this.reduceConnectionPriority(peerId);
    } else if (score > 0) {
      // Quarantine (relay only)
      logger.warn('Peer quarantined', { peerId, score });
      await this.quarantinePeer(peerId);
    } else {
      // Ban
      logger.error('Peer banned', { peerId });
      await this.blocklistPeer(peerId);
    }
  }
}
```

---

## 5. BLOCKLIST & PEER FILTERING

### 5.1 Blocklist Types

**Configuration:**
```json
{
  "blocklist": {
    "enabled": true,
    "types": [
      "reputation-based",
      "manual",
      "community-fed"
    ],
    "storage": {
      "local": "./gnn-blocklist-${node-id}.json",
      "community": "https://blocklist.gnn.io/latest.json",
      "updateInterval": 3600000
    }
  }
}
```

**Storage Schema (LevelDB):**
```
blocklist:${peerId}                    → {reason, addedAt, expiresAt, source}
blocklist:reason:${reason}             → [peerId1, peerId2, ...]
blocklist:manual                       → [peerId1, peerId2, ...]
blocklist:community                    → [{peerId, hash, timestamp}, ...]
blocklist:temporary:${peerId}          → {expiresAt}
```

**Blocklist Entry:**
```json
{
  "peerId": "Qm...",
  "reason": "spam | malicious | unresponsive | policy",
  "addedAt": 1715000000,
  "expiresAt": null,
  "source": "manual | reputation | community",
  "evidence": [
    {
      "type": "invalid_signature",
      "timestamp": 1715000000,
      "count": 5
    }
  ]
}
```

### 5.2 Peer Filtering Logic

**Acceptance Decision (Pseudocode):**
```typescript
async function shouldAcceptPeer(peerId: string): Promise<boolean> {
  // 1. Check permanent blocklist
  const blocklisted = await db.get(`blocklist:${peerId}`);
  if (blocklisted && !blocklisted.expiresAt) {
    logger.debug('Peer permanently blocklisted', { peerId });
    return false;
  }
  
  // 2. Check temporary blocklist (expired?)
  if (blocklisted && blocklisted.expiresAt) {
    if (Date.now() < blocklisted.expiresAt) {
      logger.debug('Peer temporarily blocklisted', { peerId });
      return false;
    } else {
      // Expiration passed, remove from blocklist
      await db.del(`blocklist:${peerId}`);
    }
  }
  
  // 3. Check reputation score
  const score = await reputationSystem.getScore(peerId) || 50;
  if (score < 0) {
    logger.debug('Peer reputation too low', { peerId, score });
    return false;
  }
  
  // 4. Check community blocklist (optional)
  if (config.blocklist.types.includes('community-fed')) {
    const communityBan = await this.checkCommunityBlocklist(peerId);
    if (communityBan && communityBan.consensus > 0.8) {
      logger.info('Community voted to block peer', { peerId, consensus: communityBan.consensus });
      return false;
    }
  }
  
  return true;
}

async function handlePeerConnection(peerId: string, connection: Connection): Promise<void> {
  // 1. Check if should accept
  const accepted = await shouldAcceptPeer(peerId);
  if (!accepted) {
    connection.close();
    logger.info('Rejected connection from blocklisted peer', { peerId });
    return;
  }
  
  // 2. Verify peer's public key matches peerId
  const peerPublicKey = connection.metadata.publicKey;
  const expectedPeerId = deriveNodeId(peerPublicKey);
  
  if (expectedPeerId !== peerId) {
    connection.close();
    logger.error('Peer identity mismatch', { declared: peerId, actual: expectedPeerId });
    await this.addToBlocklist(peerId, 'identity_fraud', 'permanent');
    return;
  }
  
  // 3. Accept connection
  logger.info('Accepted connection from peer', { peerId });
}
```

---

## 6. TOKEN ROTATION SYSTEM

### 6.1 API Token Lifecycle

**Configuration:**
```json
{
  "apiTokens": {
    "rotationEnabled": true,
    "tokenTTL": 7776000000,
    "tokenTTLDays": 90,
    "rotationInterval": 2592000000,
    "rotationIntervalDays": 30,
    "gracePeriod": 604800000,
    "gracePeriodDays": 7,
    "maxTokensKept": 3,
    "hashAlgorithm": "sha256",
    "tokenLength": 32
  }
}
```

**Token Lifecycle:**
```
Token Created → Active (30 days)
  ↓
Rotated → Secondary (7 day grace period)
  ↓
Deprecated → Retired (kept for audit, expires after 90 days)
  ↓
Deleted → Purged
```

**Storage Schema (LevelDB):**
```
apiToken:current                       → {hash, createdAt, expiresAt, status: "active"}
apiToken:history                       → [{hash, createdAt, expiresAt, status, reason}, ...]
apiToken:rotation:lastRotation         → 1715000000 (timestamp)
apiToken:rotation:nextRotation         → 1717592000 (timestamp)
```

### 6.2 Token Rotation Logic

**Rotation Process (Pseudocode):**
```typescript
class TokenRotationManager {
  async rotateToken(): Promise<{ newToken: string; rotationDetails: any }> {
    // 1. Check if rotation needed
    const lastRotation = await db.get('apiToken:rotation:lastRotation');
    const rotationDue = !lastRotation || 
      (Date.now() - lastRotation > config.apiTokens.rotationInterval);
    
    if (!rotationDue) {
      logger.debug('Token rotation not yet due');
      return null;
    }
    
    // 2. Get current token
    const currentToken = await db.get('apiToken:current');
    
    // 3. Generate new token
    const newToken = crypto.randomBytes(config.apiTokens.tokenLength).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex');
    
    // 4. Move current to history
    const history = await db.get('apiToken:history') || [];
    if (currentToken) {
      currentToken.status = 'secondary';
      currentToken.rotatedAt = Date.now();
      currentToken.gracePeriodUntil = Date.now() + config.apiTokens.gracePeriod;
      history.push(currentToken);
    }
    
    // 5. Set new token as current
    const newTokenObj = {
      hash: newTokenHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + config.apiTokens.tokenTTL,
      status: 'active'
    };
    
    await db.put('apiToken:current', newTokenObj);
    await db.put('apiToken:history', history);
    await db.put('apiToken:rotation:lastRotation', Date.now());
    
    // 6. Clean up expired tokens
    const activeHistory = history.filter(t => Date.now() < t.expiresAt);
    if (activeHistory.length > config.apiTokens.maxTokensKept) {
      activeHistory.shift(); // Remove oldest
    }
    await db.put('apiToken:history', activeHistory);
    
    // 7. Schedule next rotation
    const nextRotation = Date.now() + config.apiTokens.rotationInterval;
    await db.put('apiToken:rotation:nextRotation', nextRotation);
    
    logger.info('Token rotated successfully', {
      rotatedAt: new Date().toISOString(),
      nextRotation: new Date(nextRotation).toISOString()
    });
    
    return {
      newToken,
      rotationDetails: {
        rotatedAt: new Date().toISOString(),
        expiresAt: new Date(newTokenObj.expiresAt).toISOString(),
        gracePeriodsActive: history.filter(t => t.status === 'secondary').length
      }
    };
  }
  
  async validateToken(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // Check current token
    const current = await db.get('apiToken:current');
    if (current && current.hash === tokenHash && Date.now() < current.expiresAt) {
      return true;
    }
    
    // Check secondary tokens (in grace period)
    const history = await db.get('apiToken:history') || [];
    for (const historical of history) {
      if (
        historical.hash === tokenHash &&
        historical.status === 'secondary' &&
        historical.gracePeriodUntil &&
        Date.now() < historical.gracePeriodUntil
      ) {
        logger.warn('Token used during grace period', { expiresAt: new Date(historical.gracePeriodUntil) });
        return true; // Still valid in grace period
      }
    }
    
    return false;
  }
}
```

---

## 7. RATE LIMITING & SPAM PROTECTION

### 7.1 Rate Limiting Configuration

```json
{
  "rateLimiting": {
    "enabled": true,
    "perPeer": {
      "messagesPerSecond": 100,
      "queriesPerSecond": 50,
      "connectionAttemptsPerMinute": 10,
      "windowSizeMs": 1000
    },
    "global": {
      "messagesPerSecond": 10000,
      "windowSizeMs": 1000
    },
    "spam": {
      "duplicateMessageThreshold": 10,
      "duplicateWindowMs": 60000,
      "largePayloadThreshold": 30000,
      "largePayloadPenalty": -20,
      "malformedMessagePenalty": -10
    }
  }
}
```

### 7.2 Rate Limit Implementation

**Token Bucket Algorithm (Pseudocode):**
```typescript
class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  
  async checkLimit(peerId: string, type: 'message' | 'query'): Promise<boolean> {
    // 1. Get or create bucket
    let bucket = this.buckets.get(peerId);
    if (!bucket) {
      bucket = new TokenBucket(
        type === 'message' 
          ? config.rateLimiting.perPeer.messagesPerSecond 
          : config.rateLimiting.perPeer.queriesPerSecond,
        config.rateLimiting.perPeer.windowSizeMs
      );
      this.buckets.set(peerId, bucket);
    }
    
    // 2. Check if token available
    const allowed = bucket.consume(1);
    
    if (!allowed) {
      logger.debug('Rate limit exceeded', { peerId, type });
      
      // Update reputation
      await reputationSystem.updateScore(peerId, {
        type: 'rate_limit_exceeded',
        details: { type }
      }, -5);
    }
    
    return allowed;
  }
  
  cleanup(): void {
    // Remove stale buckets periodically
    const now = Date.now();
    for (const [peerId, bucket] of this.buckets) {
      if (now - bucket.lastUsed > 3600000) { // 1 hour
        this.buckets.delete(peerId);
      }
    }
  }
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number = Date.now();
  public lastUsed: number = Date.now();
  
  constructor(
    private capacity: number,
    private refillIntervalMs: number
  ) {
    this.tokens = capacity;
  }
  
  consume(amount: number = 1): boolean {
    // 1. Refill based on time elapsed
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / this.refillIntervalMs) * this.capacity;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
    this.lastUsed = now;
    
    // 2. Check if enough tokens
    if (this.tokens >= amount) {
      this.tokens -= amount;
      return true;
    }
    
    return false;
  }
}
```

---

## 8. MESSAGE VERIFICATION ON RECEIPT

### 8.1 Verification Pipeline

**Flow:**
```
Receive Message
  ↓
1. Check sender in blocklist
  ├─ Yes → Drop message, log
  └─ No → Continue
  ↓
2. Verify message signature
  ├─ Invalid → Penalty reputation, log alert
  └─ Valid → Continue
  ↓
3. Check timestamp (replay attack prevention)
  ├─ Too old (>5 min) → Drop message
  └─ Recent → Continue
  ↓
4. Check rate limits
  ├─ Exceeded → Penalty reputation, drop
  └─ OK → Continue
  ↓
5. Check for duplicate (spam)
  ├─ Duplicate within 60s → Penalty reputation
  └─ Unique → Continue
  ↓
6. Process message normally
  ↓
7. Update peer reputation (positive event)
```

**Implementation (Pseudocode):**
```typescript
async function handleIncomingMessage(
  message: SignedMessage,
  senderConnection: Connection
): Promise<void> {
  const peerId = message.sender;
  
  try {
    // 1. Blocklist check
    const blocked = await shouldAcceptPeer(peerId);
    if (!blocked) {
      logger.info('Rejected message from blocklisted peer', { peerId });
      return;
    }
    
    // 2. Verify signature
    const publicKeyBuffer = Buffer.from(message.publicKey, 'base64');
    const isSignatureValid = await verifyMessage(message, publicKeyBuffer);
    
    if (!isSignatureValid) {
      logger.warn('Invalid message signature', { peerId, messageId: message.messageId });
      await reputationSystem.updateScore(peerId, {
        type: 'invalid_signature',
        details: { messageId: message.messageId }
      }, -10);
      return;
    }
    
    // 3. Verify sender identity (peerId derived from public key)
    const derivedPeerId = deriveNodeId(publicKeyBuffer);
    if (derivedPeerId !== peerId) {
      logger.error('Sender identity mismatch', { declared: peerId, derived: derivedPeerId });
      await reputationSystem.updateScore(peerId, {
        type: 'identity_fraud',
        details: {}
      }, -50);
      return;
    }
    
    // 4. Timestamp validation (replay attack)
    const messageAge = Date.now() - message.timestamp;
    if (messageAge > 300000) { // 5 minutes
      logger.warn('Message too old', { peerId, age: messageAge });
      return;
    }
    
    // 5. Rate limit check
    const allowed = await rateLimiter.checkLimit(peerId, message.type);
    if (!allowed) {
      logger.warn('Rate limit exceeded', { peerId });
      return;
    }
    
    // 6. Duplicate check
    const duplicateKey = `message:dedup:${peerId}:${message.messageId}`;
    const isDuplicate = await db.get(duplicateKey);
    
    if (isDuplicate) {
      logger.debug('Duplicate message', { peerId, messageId: message.messageId });
      await reputationSystem.updateScore(peerId, {
        type: 'duplicate_message',
        details: { messageId: message.messageId }
      }, -5);
      return;
    }
    
    // 7. Mark as seen (prevent duplicates for next 60 seconds)
    await db.put(duplicateKey, Date.now());
    setTimeout(() => db.del(duplicateKey), 60000);
    
    // 8. Process message
    await processMessage(message);
    
    // 9. Update reputation (positive event)
    await reputationSystem.updateScore(peerId, {
      type: 'valid_message',
      details: { messageId: message.messageId }
    }, 1);
    
    logger.debug('Message processed successfully', { peerId, messageId: message.messageId });
  } catch (error) {
    logger.error('Error processing incoming message', error);
    await reputationSystem.updateScore(peerId, {
      type: 'processing_error',
      details: { error: error.message }
    }, -5);
  }
}
```

---

## 9. KEY ROTATION

### 9.1 Key Rotation Strategy

**Configuration:**
```json
{
  "keyRotation": {
    "enabled": true,
    "rotationIntervalDays": 30,
    "rotationInterval": 2592000000,
    "retainOldKeys": 3,
    "retentionDays": 90,
    "gracePeriodDays": 7,
    "gracePeriod": 604800000
  }
}
```

**Key Rotation Timeline:**
```
Old Key 1 (expired)
  ├─ Created: Day -60
  ├─ Rotated Out: Day -30
  ├─ Grace Period: Day -30 to Day -23 ✓ (Still accepted)
  └─ Purged: Day 0 (No longer accepted)

Old Key 2 (secondary)
  ├─ Created: Day -30
  ├─ Rotated Out: Day 0
  ├─ Grace Period: Day 0 to Day 7 (Still accepted) ← Current grace period
  └─ Purged: Day 30

Current Key (active)
  ├─ Created: Day 0
  ├─ Active Period: Day 0 to Day 30
  └─ Rotation: Day 30 → New key

Next Key (future)
  └─ Will be generated on Day 30
```

### 9.2 Key Rotation Execution

**Process (Pseudocode):**
```typescript
async function rotateSigningKeys(): Promise<void> {
  // 1. Check if rotation needed
  const lastRotation = await db.get('keys:lastRotation');
  const rotationDue = !lastRotation || 
    (Date.now() - lastRotation > config.keyRotation.rotationInterval);
  
  if (!rotationDue) {
    logger.debug('Key rotation not yet due');
    return;
  }
  
  try {
    // 2. Generate new keypair
    const { publicKey, privateKey } = await generateED25519Keypair();
    
    // 3. Derive new node ID from public key (may change!)
    const newNodeId = deriveNodeId(publicKey);
    const oldNodeId = config.nodeId;
    
    // 4. Save old key to history
    const keyHistory = await db.get('keys:history') || [];
    const currentKey = {
      publicKey: (await db.get('keys:current:publicKey')),
      nodeId: oldNodeId,
      createdAt: await db.get('keys:createdAt'),
      rotatedAt: Date.now(),
      gracePeriodUntil: Date.now() + config.keyRotation.gracePeriod,
      status: 'secondary'
    };
    
    keyHistory.push(currentKey);
    
    // 5. Set new key as current
    const encryptedPrivateKey = await encryptPrivateKey(privateKey);
    await db.put('keys:current:publicKey', publicKey.toString('base64'));
    await db.put('keys:current:privateKeyEncrypted', encryptedPrivateKey);
    await db.put('keys:createdAt', Date.now());
    await db.put('keys:lastRotation', Date.now());
    
    // 6. Update node ID (if changed)
    if (newNodeId !== oldNodeId) {
      logger.info('Node ID changed due to key rotation', {
        old: oldNodeId,
        new: newNodeId
      });
      
      // Update all peers about new node ID
      await announceNodeIdChange(oldNodeId, newNodeId);
    }
    
    // 7. Clean up expired keys
    const activeKeys = keyHistory.filter(k => Date.now() < k.expiresAt);
    if (activeKeys.length > config.keyRotation.retainOldKeys) {
      activeKeys.shift(); // Remove oldest
    }
    await db.put('keys:history', activeKeys);
    
    logger.info('Signing keys rotated successfully', {
      newNodeId,
      nextRotation: new Date(Date.now() + config.keyRotation.rotationInterval).toISOString()
    });
    
  } catch (error) {
    logger.error('Key rotation failed', error);
    throw error;
  }
}

async function verifySignatureWithHistory(
  message: SignedMessage,
  senderPublicKey: Buffer
): Promise<boolean> {
  // 1. Try current public key first
  const isCurrentValid = await verifyMessage(message, senderPublicKey);
  if (isCurrentValid) {
    return true;
  }
  
  // 2. Try old public keys (within grace period)
  const keyHistory = await db.get('keys:history') || [];
  for (const oldKey of keyHistory) {
    if (Date.now() > oldKey.gracePeriodUntil) {
      continue; // Grace period expired
    }
    
    const oldKeyBuffer = Buffer.from(oldKey.publicKey, 'base64');
    const isOldValid = await verifyMessage(message, oldKeyBuffer);
    
    if (isOldValid) {
      logger.debug('Message verified with old key (grace period)', {
        rotatedAt: new Date(oldKey.rotatedAt).toISOString()
      });
      return true;
    }
  }
  
  return false;
}
```

---

## 10. MUTUAL TLS (OPTIONAL)

### 10.1 mTLS Configuration

```json
{
  "tls": {
    "minVersion": "1.3",
    "cipherSuites": ["TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256"],
    "mTLS": {
      "enabled": false,
      "mode": "optional|required",
      "trustStore": "./gnn-ca-certs/",
      "trustStoreUpdate": "manual|automatic",
      "certificatePinning": true,
      "pinningStrategy": "public_key|certificate|subject_public_key_info"
    }
  }
}
```

### 10.2 Certificate Pinning

**Configuration:**
```json
{
  "certificatePinning": {
    "enabled": true,
    "pins": {
      "Qm...node1": {
        "fingerprint": "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "algorithm": "sha256",
        "certHash": "..."
      },
      "Qm...node2": {
        "fingerprint": "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
        "algorithm": "sha256",
        "certHash": "..."
      }
    },
    "allowUnpinned": false,
    "updateInterval": 2592000000
  }
}
```

---

## 11. PHASE 3 TESTING STRATEGY

### 11.1 Signature & Verification Tests

```typescript
// test/unit/cryptography.test.ts
describe('Cryptography & Signing', () => {
  it('should sign and verify messages', async () => {
    const { publicKey, privateKey } = await generateED25519Keypair();
    
    const message = {
      type: 'publish',
      messageId: 'msg_123',
      topic: 'test',
      payload: { data: 'hello' },
      sender: 'node-a',
      timestamp: Date.now()
    };
    
    const signed = await signMessage(message, privateKey);
    const isValid = await verifyMessage(signed, publicKey);
    
    expect(isValid).toBe(true);
  });
  
  it('should reject tampered messages', async () => {
    const { publicKey, privateKey } = await generateED25519Keypair();
    
    const message = {
      type: 'publish',
      messageId: 'msg_123',
      topic: 'test',
      payload: { data: 'hello' },
      sender: 'node-a',
      timestamp: Date.now()
    };
    
    const signed = await signMessage(message, privateKey);
    
    // Tamper with payload
    signed.payload.data = 'evil';
    
    const isValid = await verifyMessage(signed, publicKey);
    expect(isValid).toBe(false);
  });
  
  it('should reject old messages (replay attack)', async () => {
    const { publicKey, privateKey } = await generateED25519Keypair();
    
    const message = {
      type: 'publish',
      messageId: 'msg_123',
      topic: 'test',
      payload: { data: 'hello' },
      sender: 'node-a',
      timestamp: Date.now() - 400000 // 6+ minutes old
    };
    
    const signed = await signMessage(message, privateKey);
    const isValid = await verifyMessage(signed, publicKey);
    
    expect(isValid).toBe(false); // Too old
  });
});

// test/unit/reputation.test.ts
describe('Reputation System', () => {
  it('should track peer reputation', async () => {
    const reputation = new ReputationSystem();
    
    const peerId = 'Qm...peer1';
    
    // Initial score
    let score = await reputation.getScore(peerId);
    expect(score).toBe(50); // Default
    
    // Valid message
    await reputation.updateScore(peerId, { type: 'valid_message' }, 1);
    score = await reputation.getScore(peerId);
    expect(score).toBe(51);
    
    // Invalid signature
    await reputation.updateScore(peerId, { type: 'invalid_signature' }, -10);
    score = await reputation.getScore(peerId);
    expect(score).toBe(41);
    
    // Score decay over time
    await db.put(`reputation:${peerId}:lastUpdate`, Date.now() - 86400000 * 30); // 30 days ago
    score = await reputation.getScore(peerId);
    expect(score).toBeCloseTo(50); // Decayed toward 50
  });
  
  it('should blocklist peers with zero reputation', async () => {
    const reputation = new ReputationSystem();
    const peerId = 'Qm...malicious';
    
    // Reduce to 0
    for (let i = 0; i < 10; i++) {
      await reputation.updateScore(peerId, { type: 'spam' }, -10);
    }
    
    // Should be blocklisted
    const accepted = await reputation.shouldAcceptPeer(peerId);
    expect(accepted).toBe(false);
  });
});

// test/unit/tokenRotation.test.ts
describe('Token Rotation', () => {
  it('should rotate API tokens', async () => {
    const tokenMgr = new TokenRotationManager();
    
    const token1 = (await tokenMgr.rotateToken()).newToken;
    expect(token1).toBeDefined();
    
    const isValid1 = await tokenMgr.validateToken(token1);
    expect(isValid1).toBe(true);
    
    // Rotate again
    const token2 = (await tokenMgr.rotateToken()).newToken;
    expect(token2).toBeDefined();
    expect(token2).not.toBe(token1);
    
    // token1 still valid in grace period
    const isValid1Grace = await tokenMgr.validateToken(token1);
    expect(isValid1Grace).toBe(true);
    
    // token2 now active
    const isValid2 = await tokenMgr.validateToken(token2);
    expect(isValid2).toBe(true);
  });
});

// test/unit/rateLimiting.test.ts
describe('Rate Limiting', () => {
  it('should rate limit peer messages', async () => {
    const limiter = new RateLimiter();
    
    const peerId = 'Qm...peer1';
    
    // Allow 100 msg/sec
    let allowed = 0;
    for (let i = 0; i < 150; i++) {
      if (await limiter.checkLimit(peerId, 'message')) {
        allowed++;
      }
    }
    
    expect(allowed).toBeGreaterThanOrEqual(90);
    expect(allowed).toBeLessThanOrEqual(110);
  });
});
```

### 11.2 Integration Tests (Adversarial Scenarios)

```typescript
// test/integration/adversarial.test.ts
describe('Adversarial Network', () => {
  it('should reject messages with invalid signatures', async () => {
    const nodeA = new GNNNode({ nodeId: 'node-a' });
    const nodeB = new GNNNode({ nodeId: 'node-b' });
    
    await nodeA.start();
    await nodeB.start();
    
    // Create valid message
    let message = await nodeA.createSignedMessage({
      type: 'publish',
      topic: 'test',
      payload: { data: 'hello' }
    });
    
    // Verify it's accepted
    const isValid = await nodeB.verifyMessage(message);
    expect(isValid).toBe(true);
    
    // Tamper with message
    message.payload.data = 'tampered';
    
    // Should be rejected
    const isTamperedValid = await nodeB.verifyMessage(message);
    expect(isTamperedValid).toBe(false);
  });
  
  it('should detect and block spam peers', async () => {
    const nodeA = new GNNNode({ nodeId: 'node-a' });
    const spammer = new GNNNode({ nodeId: 'spammer' });
    
    await nodeA.start();
    await spammer.start();
    
    // Spam messages
    for (let i = 0; i < 1000; i++) {
      const message = await spammer.createSignedMessage({
        type: 'publish',
        topic: `spam/${i}`,
        payload: { data: 'spam' }
      });
      nodeA.handleIncomingMessage(message);
    }
    
    // Spammer should be blocklisted
    const reputation = await nodeA.getReputation(spammer.peerId);
    expect(reputation.score).toBeLessThan(10);
    
    const accepted = await nodeA.shouldAcceptPeer(spammer.peerId);
    expect(accepted).toBe(false);
  });
  
  it('should handle peer key rotation', async () => {
    const node = new GNNNode({ nodeId: 'node-a' });
    await node.start();
    
    const oldNodeId = node.peerId;
    
    // Rotate keys
    await node.rotateSigningKeys();
    
    const newNodeId = node.peerId;
    
    // Node ID should change (derived from public key)
    expect(newNodeId).not.toBe(oldNodeId);
    
    // Messages should still be verifiable during grace period
    const message = await node.createSignedMessage({
      type: 'publish',
      topic: 'test',
      payload: { data: 'hello' }
    });
    
    const isValid = await node.verifyMessage(message);
    expect(isValid).toBe(true);
  });
});
```

---

## 12. PHASE 3 CONFIGURATION

### 12.1 Default Adversarial Mode Config

**New `gnn-conf-${node-id}.json` (Phase 3):**

```json
{
  "nodeId": "node-a",
  "apiToken": "token_abc123_xyz...",
  
  "security": {
    "mode": "adversarial",
    "defaultTrust": false
  },
  
  "cryptography": {
    "keyStorage": {
      "type": "encrypted-file",
      "path": "./gnn-keys-${node-id}/",
      "encryptionAlgorithm": "aes-256-gcm",
      "encryptionKeyDerivation": "argon2id"
    },
    "keyRotation": {
      "enabled": true,
      "rotationIntervalDays": 30,
      "retainOldKeys": 3
    },
    "signing": {
      "algorithm": "Ed25519",
      "hashAlgorithm": "SHA256"
    },
    "tls": {
      "minVersion": "1.3",
      "mTLS": {
        "enabled": false,
        "mode": "optional"
      }
    }
  },
  
  "reputation": {
    "enabled": true,
    "initialScore": 50,
    "minScore": 0,
    "maxScore": 100,
    "decayRate": 0.95,
    "decayInterval": 86400000
  },
  
  "blocklist": {
    "enabled": true,
    "types": ["reputation-based", "manual"],
    "updateInterval": 3600000
  },
  
  "apiTokens": {
    "rotationEnabled": true,
    "tokenTTLDays": 90,
    "rotationIntervalDays": 30,
    "gracePeriodDays": 7,
    "maxTokensKept": 3
  },
  
  "rateLimiting": {
    "enabled": true,
    "perPeer": {
      "messagesPerSecond": 100,
      "queriesPerSecond": 50
    },
    "spam": {
      "duplicateMessageThreshold": 10,
      "duplicateWindowMs": 60000,
      "largePayloadThreshold": 30000,
      "largePayloadPenalty": -20
    }
  }
}
```

---

## 13. PHASE 3 DELIVERABLES

### **Week 1: Key Generation & Message Signing**
- [x] Generate ED25519 keypairs
- [x] Message signing implementation
- [x] Message verification implementation
- [x] Canonical JSON serialization
- [x] Encrypted key storage
- **Deliverable:** All messages cryptographically signed

### **Week 2: Reputation & Blocklist**
- [x] Reputation scoring system
- [x] Reputation decay over time
- [x] Blocklist storage & enforcement
- [x] Peer filtering logic
- [x] Community blocklist integration (prep)
- **Deliverable:** Peer reputation tracked, blocklist functional

### **Week 3: Token Rotation & Rate Limiting**
- [x] API token lifecycle management
- [x] Token rotation scheduler
- [x] Rate limiting per peer
- [x] Spam detection
- [x] Duplicate message detection
- **Deliverable:** Tokens rotate safely, spam prevented

### **Week 4: Key Rotation & Advanced Security**
- [x] Signing key rotation
- [x] Grace period for old keys
- [x] Node ID persistence/change
- [x] Certificate pinning (optional mTLS)
- [x] Mutual TLS setup (optional)
- **Deliverable:** Keys rotate, identities remain stable

### **Week 5: Testing & Integration**
- [x] Cryptography unit tests
- [x] Reputation system tests
- [x] Token rotation tests
- [x] Rate limiting tests
- [x] Adversarial scenario tests
- [x] Key rotation tests
- **Deliverable:** 80%+ test coverage

### **Week 6: Monitoring & Documentation**
- [x] Security metrics API
- [x] Reputation history queries
- [x] Blocklist auditing
- [x] Key rotation logs
- [x] Threat model documentation
- [x] Security best practices guide
- **Deliverable:** Security ops dashboard, threat model

### **Week 7: Hardening & Performance**
- [x] Signature verification optimization
- [x] Reputation calculation caching
- [x] Rate limiter efficiency
- [x] Key decryption caching
- [x] Graceful key rotation
- [x] Backward compatibility testing
- **Deliverable:** Optimized, backward-compatible

---

## 14. ACCEPTANCE CRITERIA (PHASE 3)

**Message Signing:**
- [ ] 100% of messages signed (both P2P and REST)
- [ ] Signature verification latency <50ms per message
- [ ] Invalid signatures rejected immediately

**Reputation:**
- [ ] Peer scores track accurately (0-100 range)
- [ ] Score decay toward neutral (50) over time
- [ ] Reputation persists across restarts

**Blocklist:**
- [ ] Blocklisted peers rejected entirely
- [ ] Temporary blocklist entries expire
- [ ] Permanent blocklist can be manually set

**Token Rotation:**
- [ ] Tokens rotate on schedule without disruption
- [ ] Old tokens valid during grace period (7 days)
- [ ] Expired tokens rejected

**Rate Limiting:**
- [ ] 100+ msg/sec allowed per peer (configurable)
- [ ] 1000+ msg/sec rejected (triggers spam penalty)
- [ ] Duplicate messages detected within 60s window

**Key Rotation:**
- [ ] Signing keys rotate every 30 days
- [ ] Old keys valid during grace period
- [ ] Node identity remains stable (or properly announced if changes)

**Security Metrics:**
- [ ] Reputation API provides detailed peer scores
- [ ] Blocklist audit trail available
- [ ] Key rotation history logged

**Testing:**
- [ ] Unit tests: 80%+ coverage
- [ ] Integration tests: adversarial scenarios pass
- [ ] Load tests: 10k msg/sec throughput maintained
- [ ] E2E: spam peer blocked within 60s

---

## 15. THREAT MODEL (PHASE 3)

### Threats Addressed

| Threat | Mechanism | Residual Risk |
|--------|-----------|---------------|
| **Message Tampering** | ED25519 signatures | None (cryptographic guarantee) |
| **Replay Attacks** | Timestamp validation (5 min window) | Time sync attacks (mitigated by blockchain-like time sources in Phase 4) |
| **Identity Spoofing** | Node ID derived from public key | None (cryptographic identity) |
| **Spam/DoS** | Rate limiting + reputation | Some resource exhaustion (mitigated by relay limits) |
| **Malicious Peers** | Reputation + blocklist | Sybil attacks (mitigated by identity costs in Phase 4) |
| **Key Compromise** | Encrypted storage + rotation | Depends on secure key storage (hardware wallet optional in Phase 4) |

### Threats NOT Addressed (Phase 3)

- **Network Partition:** Nodes can't verify global consensus
- **Sybil Attacks:** Attacker creates many fake identities cheaply
- **51% Attacks:** Majority of network nodes collude
- **Hardware Compromise:** Private keys stolen from storage
- **Timing Attacks:** Side-channel attacks on crypto operations

*These are addressed in Phase 4 (Consensus) and beyond.*

---

# END OF PHASE 3 PROMPT

---

**Phase 3 Complete!**

Ready for **Phase 4: Advanced Features** (compression, retry logic, extended load testing)?

Or any questions about Phase 3 security model? 🔐