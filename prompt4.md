# 📋 PHASE 4: ADVANCED FEATURES IMPLEMENTATION PROMPT

## 🎯 PROJECT SPECIFICATION

**Project Name:** GenericNodeNet (GNN) - Phase 4: Advanced Features & Optimization  
**Phase:** Phase 4 (Production-Grade Optimization)  
**Timeline:** 6-8 weeks  
**Stack:** Bun 1.3.11 + Next.js 16.2 + LevelDB + libp2p (fully featured)  
**Target:** Enterprise-grade network with compression, retry logic, monitoring  
**Dependency:** Requires Phase 3 (Adversarial Mode) as foundation  

---

## 1. PHASE 4 OVERVIEW

### 1.1 What Phase 4 Adds

Phase 4 optimizes GNN for **production-scale deployments** by adding:

- **Payload Compression** (gzip, brotli, zstd for large messages)
- **Smart Retry Logic** (exponential backoff, jitter, circuit breakers)
- **Extended Load Testing** (10k-100k+ concurrent peers)
- **Extended E2E Testing** (realistic scenarios, chaos testing)
- **Metrics & Analytics** (Prometheus, time-series data)
- **Configurable Log Formats** (JSON + human-readable)
- **Backup & Recovery** (key backups, state snapshots)
- **Graceful Shutdown/Restart** (preserve connections, no data loss)
- **Hardware Acceleration** (SIMD for compression)
- **Memory Optimization** (pooling, GC tuning)
- **Network Optimization** (connection pooling, batching)
- **Observability** (tracing, flamegraphs)
- **Health Checks** (liveness, readiness probes)
- **Auto-scaling Prep** (metrics for orchestration)

### 1.2 Success Criteria (Phase 4)

✅ **Compression reduces message size 50-70%** for large payloads  
✅ **Retry logic recovers 95%+** of temporary failures  
✅ **10k concurrent peers stable** for 24+ hours  
✅ **100k msg/sec throughput** sustained  
✅ **Metrics API provides actionable data** (Prometheus format)  
✅ **Graceful restart <30 seconds** (no message loss)  
✅ **JSON + human-readable logs** both working  
✅ **Chaos tests prove resilience** (node failures, network splits)  
✅ **Memory footprint <200 MB** even with 10k peers  
✅ **E2E tests cover real scenarios** (Byzantine peers, slow networks)  

---

## 2. PAYLOAD COMPRESSION

### 2.1 Compression Strategy

**Configuration:**
```json
{
  "compression": {
    "enabled": true,
    "algorithm": "auto",
    "algorithms": {
      "gzip": {
        "enabled": true,
        "level": 6,
        "threshold": 2048
      },
      "brotli": {
        "enabled": true,
        "level": 6,
        "threshold": 2048
      },
      "zstd": {
        "enabled": true,
        "level": 6,
        "threshold": 2048
      }
    },
    "selectionStrategy": "adaptive",
    "compressionThreshold": 2048,
    "blacklist": [
      "application/octet-stream",
      "image/*",
      "video/*"
    ]
  }
}
```

**Compression Decision Tree:**
```
Message Size
  ↓
< 2 KB?
  ├─ No compression (overhead > savings)
  └─ Send uncompressed
  ↓
≥ 2 KB?
  ├─ Check content type
  │  ├─ Already compressed (image/video)? → Skip
  │  └─ Compressible (JSON/text)? → Continue
  ↓
Choose Algorithm:
  1. Check peer capabilities (DHT metadata)
  2. Select best algorithm for this peer:
     ├─ Brotli (slower but best ratio, 30-40% reduction)
     ├─ Zstd (fast + good ratio, 25-35% reduction)
     └─ Gzip (universal, 20-30% reduction)
  3. Compress message
  ↓
Add Compression Header:
  { "compressed": true, "algorithm": "brotli", "originalSize": 10000 }
  ↓
Send Compressed Message (3-4 KB instead of 10 KB)
```

### 2.2 Compression Implementation

**Code Pattern (Pseudocode):**
```typescript
class CompressionManager {
  private compressionStats = new Map<string, CompressionStats>();
  
  async shouldCompress(
    payload: any,
    contentType: string,
    peerId: string
  ): Promise<CompressionDecision> {
    // 1. Check if compression threshold met
    const serialized = JSON.stringify(payload);
    if (serialized.length < config.compression.compressionThreshold) {
      return { shouldCompress: false, reason: 'below_threshold' };
    }
    
    // 2. Check if already compressed (blacklist)
    if (this.isBlacklisted(contentType)) {
      return { shouldCompress: false, reason: 'blacklisted' };
    }
    
    // 3. Select best algorithm
    const algorithm = await this.selectBestAlgorithm(peerId);
    
    // 4. Estimate compression ratio
    const estimatedRatio = this.getEstimatedRatio(algorithm, contentType);
    const estimatedSize = serialized.length * estimatedRatio;
    
    // Only compress if we save >10% size
    if (estimatedSize > serialized.length * 0.9) {
      return { shouldCompress: false, reason: 'not_worth_it' };
    }
    
    return { shouldCompress: true, algorithm, estimatedSize };
  }
  
  async compressPayload(
    payload: any,
    algorithm: 'gzip' | 'brotli' | 'zstd'
  ): Promise<Buffer> {
    const serialized = JSON.stringify(payload);
    const data = Buffer.from(serialized, 'utf-8');
    
    let compressed: Buffer;
    
    switch (algorithm) {
      case 'gzip':
        compressed = await this.gzipCompress(data);
        break;
      case 'brotli':
        compressed = await this.brotliCompress(data);
        break;
      case 'zstd':
        compressed = await this.zstdCompress(data);
        break;
    }
    
    // Track statistics
    const peerId = 'current_peer'; // From context
    const stats = this.compressionStats.get(peerId) || {
      messagesCompressed: 0,
      originalBytes: 0,
      compressedBytes: 0
    };
    
    stats.messagesCompressed++;
    stats.originalBytes += data.length;
    stats.compressedBytes += compressed.length;
    
    this.compressionStats.set(peerId, stats);
    
    logger.debug('Payload compressed', {
      algorithm,
      originalSize: data.length,
      compressedSize: compressed.length,
      ratio: (compressed.length / data.length * 100).toFixed(1) + '%'
    });
    
    return compressed;
  }
  
  async decompressPayload(
    compressed: Buffer,
    algorithm: 'gzip' | 'brotli' | 'zstd'
  ): Promise<any> {
    let decompressed: Buffer;
    
    switch (algorithm) {
      case 'gzip':
        decompressed = await this.gzipDecompress(compressed);
        break;
      case 'brotli':
        decompressed = await this.brotliDecompress(compressed);
        break;
      case 'zstd':
        decompressed = await this.zstdDecompress(compressed);
        break;
    }
    
    const json = decompressed.toString('utf-8');
    return JSON.parse(json);
  }
  
  private async selectBestAlgorithm(peerId: string): Promise<string> {
    // 1. Check peer capabilities
    const peerCaps = await this.getPeerCapabilities(peerId);
    
    if (config.compression.selectionStrategy === 'adaptive') {
      // 2. Consider peer's recent compression stats
      const peerStats = this.compressionStats.get(peerId);
      
      // Prefer algorithm with best historical ratio for this peer
      let bestAlgo = 'gzip'; // Fallback
      let bestRatio = Infinity;
      
      for (const algo of ['gzip', 'brotli', 'zstd']) {
        if (!peerCaps.supportedAlgorithms.includes(algo)) {
          continue; // Peer doesn't support
        }
        
        const ratio = peerStats?.ratioByAlgorithm?.[algo] || this.getEstimatedRatio(algo);
        if (ratio < bestRatio) {
          bestRatio = ratio;
          bestAlgo = algo;
        }
      }
      
      return bestAlgo;
    } else {
      // Static selection
      return config.compression.algorithm || 'gzip';
    }
  }
  
  private getEstimatedRatio(algorithm: string, contentType?: string): number {
    // Based on algorithm and content type
    const ratios = {
      gzip: { json: 0.25, text: 0.30, binary: 0.90 },
      brotli: { json: 0.20, text: 0.25, binary: 0.88 },
      zstd: { json: 0.22, text: 0.28, binary: 0.85 }
    };
    
    const type = contentType?.includes('json') ? 'json' : 'text';
    return ratios[algorithm]?.[type] || 0.50;
  }
}
```

### 2.3 Compression in Message Format

**Message with Compression Metadata:**
```json
{
  "type": "publish",
  "messageId": "msg_abc123",
  "topic": "sensor/temperature",
  "payload": "H4sICIzIdmYC/3BheWxvYWQuanNvbgCrVkktLsksrAQAVPBRACYAAAA=",
  "compressed": true,
  "compressionAlgorithm": "gzip",
  "originalSize": 10000,
  "compressedSize": 3500,
  "sender": "node-a",
  "timestamp": 1715000000,
  "publicKey": "base64(ed25519_public_key)",
  "signature": "base64(ed25519_signature)",
  "version": 3
}
```

**Compression Negotiation (Peer Capabilities):**
```
Node A Discovery:
  ├─ Advertises: "compression=gzip,brotli,zstd"
  ├─ Stored in DHT metadata
  └─ Other peers see capabilities

Node B connects to Node A:
  ├─ Query DHT for Node A's metadata
  ├─ Read: compression=gzip,brotli,zstd
  ├─ Select best algorithm
  └─ Start compressing messages for Node A
```

---

## 3. SMART RETRY LOGIC

### 3.1 Retry Strategy

**Configuration:**
```json
{
  "retryLogic": {
    "enabled": true,
    "strategies": {
      "exponentialBackoff": {
        "enabled": true,
        "initialDelayMs": 100,
        "maxDelayMs": 30000,
        "multiplier": 2,
        "jitter": true,
        "jitterFactor": 0.1
      },
      "circuitBreaker": {
        "enabled": true,
        "failureThreshold": 5,
        "successThreshold": 2,
        "timeout": 60000,
        "halfOpenRequests": 1
      },
      "adaptiveRetry": {
        "enabled": true,
        "baseRetries": 3,
        "maxRetries": 10,
        "backoffMultiplier": 1.5,
        "timeoutMultiplier": 1.2
      }
    },
    "perMessageType": {
      "publish": {
        "maxRetries": 3,
        "timeout": 5000
      },
      "query": {
        "maxRetries": 5,
        "timeout": 10000
      },
      "response": {
        "maxRetries": 2,
        "timeout": 3000
      }
    }
  }
}
```

### 3.2 Exponential Backoff with Jitter

**Implementation (Pseudocode):**
```typescript
class RetryManager {
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelayMs: number = 100
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Attempt ${attempt + 1}/${maxRetries + 1}`);
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          // Final attempt failed
          throw error;
        }
        
        // Calculate delay with exponential backoff + jitter
        const delay = this.calculateBackoffDelay(
          attempt,
          initialDelayMs,
          config.retryLogic.strategies.exponentialBackoff
        );
        
        logger.debug(`Retry ${attempt + 1} failed, backing off ${delay}ms`, {
          error: error.message,
          attempt,
          maxRetries
        });
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }
  
  private calculateBackoffDelay(
    attemptNumber: number,
    initialDelayMs: number,
    config: ExponentialBackoffConfig
  ): number {
    // Base delay: initialDelay * multiplier^attempt
    let delay = initialDelayMs * Math.pow(config.multiplier, attemptNumber);
    
    // Cap at max delay
    delay = Math.min(delay, config.maxDelayMs);
    
    // Add jitter (±10% by default)
    if (config.jitter) {
      const jitterAmount = delay * config.jitterFactor;
      const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
      delay += jitter;
    }
    
    return Math.max(0, Math.floor(delay));
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3.3 Circuit Breaker Pattern

**States:**
```
CLOSED (Normal)
  ├─ Requests allowed
  ├─ Failures counted
  └─ If failures > threshold → OPEN

OPEN (Blocked)
  ├─ Requests rejected (fail fast)
  ├─ Wait timeout period
  └─ If timeout passed → HALF_OPEN

HALF_OPEN (Testing)
  ├─ Limited requests allowed (1 by default)
  ├─ If success → CLOSED (reset)
  └─ If failure → OPEN (retry timeout)
```

**Implementation (Pseudocode):**
```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number = null;
  
  async execute<T>(
    operation: () => Promise<T>,
    peerId: string
  ): Promise<T> {
    // Check circuit state
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceLastFailure > config.circuitBreaker.timeout) {
        // Timeout passed, try half-open
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        logger.info('Circuit breaker entering HALF_OPEN state', { peerId });
      } else {
        // Still open, fail fast
        throw new Error(`Circuit breaker OPEN for ${peerId}`);
      }
    }
    
    try {
      // Execute operation
      const result = await operation();
      
      // Success
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        
        if (this.successCount >= config.circuitBreaker.successThreshold) {
          // Enough successes, close circuit
          this.state = 'CLOSED';
          this.failureCount = 0;
          this.successCount = 0;
          logger.info('Circuit breaker CLOSED (recovered)', { peerId });
        }
      }
      
      return result;
    } catch (error) {
      // Failure
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= config.circuitBreaker.failureThreshold) {
        this.state = 'OPEN';
        logger.warn('Circuit breaker OPEN (too many failures)', {
          peerId,
          failureCount: this.failureCount
        });
      } else if (this.state === 'HALF_OPEN') {
        // Failure in half-open, go back to open
        this.state = 'OPEN';
        logger.warn('Circuit breaker OPEN (half-open test failed)', { peerId });
      }
      
      throw error;
    }
  }
}
```

### 3.4 Adaptive Retry Based on Peer Profile

**Adaptive Strategy (Pseudocode):**
```typescript
class AdaptiveRetryManager {
  async retryWithAdaptiveBackoff<T>(
    operation: () => Promise<T>,
    peerId: string,
    messageType: 'publish' | 'query' | 'response'
  ): Promise<T> {
    // 1. Get peer profile (latency, success rate, reputation)
    const peerProfile = await this.getPeerProfile(peerId);
    
    // 2. Calculate adaptive retry parameters
    const baseRetries = config.retryLogic.strategies.adaptiveRetry.baseRetries;
    const reputationFactor = peerProfile.reputation / 100; // 0-1
    const successRateFactor = peerProfile.successRate; // 0-1
    
    // Peers with good reputation get more retries
    const maxRetries = Math.ceil(
      baseRetries + (peerProfile.reputation - 50) / 10
    );
    
    // 3. Adjust timeout based on peer's average latency
    let timeoutMs = config.retryLogic.perMessageType[messageType].timeout;
    timeoutMs = Math.ceil(timeoutMs * peerProfile.avgLatencyMs / 50);
    
    logger.debug('Adaptive retry parameters', {
      peerId,
      maxRetries,
      timeoutMs,
      reputation: peerProfile.reputation,
      successRate: peerProfile.successRate
    });
    
    // 4. Retry with calculated parameters
    return this.retryWithTimeout(operation, maxRetries, timeoutMs);
  }
  
  private async getPeerProfile(peerId: string): Promise<PeerProfile> {
    const rep = await reputationSystem.getScore(peerId);
    const stats = await db.get(`peer:${peerId}:stats`) || {};
    
    return {
      reputation: rep,
      successRate: stats.successRate || 0.95,
      avgLatencyMs: stats.avgLatencyMs || 50,
      failureRate: stats.failureRate || 0.05
    };
  }
}
```

---

## 4. EXTENDED LOAD TESTING

### 4.1 Load Test Scenarios

**Configuration:**
```json
{
  "loadTesting": {
    "scenarios": [
      {
        "name": "small_cluster",
        "nodes": 10,
        "duration": 600000,
        "messagesPerSecond": 100
      },
      {
        "name": "medium_cluster",
        "nodes": 100,
        "duration": 3600000,
        "messagesPerSecond": 1000
      },
      {
        "name": "large_cluster",
        "nodes": 1000,
        "duration": 7200000,
        "messagesPerSecond": 10000
      },
      {
        "name": "massive_cluster",
        "nodes": 10000,
        "duration": 14400000,
        "messagesPerSecond": 100000
      }
    ]
  }
}
```

### 4.2 Load Test Implementation

**Test Suite (Pseudocode):**
```typescript
// test/load/extended-load.test.ts
describe('Extended Load Tests', () => {
  it('should handle 10 nodes with 100 msg/sec', async () => {
    const nodes = await createNodeCluster(10);
    await startAllNodes(nodes);
    
    const startTime = Date.now();
    const duration = 600000; // 10 minutes
    let messagesPublished = 0;
    let errors = 0;
    
    // Publish messages continuously
    const publishInterval = setInterval(async () => {
      try {
        for (let i = 0; i < 100; i++) {
          const node = nodes[Math.floor(Math.random() * nodes.length)];
          await node.publish(`load/test`, { data: 'test' });
          messagesPublished++;
        }
      } catch (error) {
        errors++;
      }
    }, 1000);
    
    // Run for duration
    await sleep(duration);
    clearInterval(publishInterval);
    
    // Verify metrics
    const elapsed = Date.now() - startTime;
    const throughput = messagesPublished / (elapsed / 1000);
    
    expect(throughput).toBeGreaterThan(90); // At least 90 msg/sec
    expect(errors).toBeLessThan(messagesPublished * 0.01); // <1% error rate
    expect(throughput).toBeLessThan(110); // Not too high (100 ±10%)
    
    logger.info('Small cluster load test passed', {
      nodes: 10,
      messagesPublished,
      throughput: throughput.toFixed(2) + ' msg/sec',
      errorRate: (errors / messagesPublished * 100).toFixed(2) + '%'
    });
    
    await stopAllNodes(nodes);
  });
  
  it('should handle 100 nodes with 1000 msg/sec', async () => {
    // Similar to above, scaled to 100 nodes, 1 hour duration
    // ...
  });
  
  it('should handle 1000 nodes with 10k msg/sec', async () => {
    // Similar to above, scaled to 1000 nodes, 2 hour duration
    // ...
  });
  
  it('should handle 10k nodes with 100k msg/sec', async () => {
    const nodes = await createNodeCluster(10000);
    await startAllNodes(nodes);
    
    const startTime = Date.now();
    const duration = 14400000; // 4 hours
    let messagesPublished = 0;
    let errors = 0;
    const memorySnapshots = [];
    const latencyHistogram = new Histogram();
    
    // Publish at target rate
    const publishLoop = async () => {
      for (let i = 0; i < 100000; i++) {
        try {
          const node = nodes[Math.floor(Math.random() * nodes.length)];
          const publishStartTime = Date.now();
          
          await node.publish(`load/test`, { data: 'test' });
          
          const latency = Date.now() - publishStartTime;
          latencyHistogram.record(latency);
          messagesPublished++;
        } catch (error) {
          errors++;
        }
      }
    };
    
    // Sample memory usage every minute
    const memoryInterval = setInterval(() => {
      memorySnapshots.push({
        timestamp: Date.now(),
        heapUsed: process.memoryUsage().heapUsed,
        external: process.memoryUsage().external
      });
    }, 60000);
    
    // Run for duration
    const startPromise = publishLoop();
    await Promise.race([startPromise, sleep(duration)]);
    clearInterval(memoryInterval);
    
    // Verify metrics
    const elapsed = Date.now() - startTime;
    const throughput = messagesPublished / (elapsed / 1000);
    const avgLatency = latencyHistogram.mean();
    const p99Latency = latencyHistogram.percentile(99);
    const maxMemory = Math.max(...memorySnapshots.map(s => s.heapUsed));
    
    expect(throughput).toBeGreaterThan(90000); // At least 90k msg/sec
    expect(errors).toBeLessThan(messagesPublished * 0.02); // <2% error rate
    expect(avgLatency).toBeLessThan(50); // <50ms average
    expect(p99Latency).toBeLessThan(500); // <500ms p99
    expect(maxMemory).toBeLessThan(200 * 1024 * 1024); // <200 MB
    
    logger.info('Massive cluster load test passed', {
      nodes: 10000,
      messagesPublished,
      throughput: throughput.toFixed(0) + ' msg/sec',
      avgLatency: avgLatency.toFixed(2) + ' ms',
      p99Latency: p99Latency.toFixed(2) + ' ms',
      maxMemory: (maxMemory / 1024 / 1024).toFixed(1) + ' MB',
      errorRate: (errors / messagesPublished * 100).toFixed(2) + '%'
    });
    
    await stopAllNodes(nodes);
  });
});
```

---

## 5. EXTENDED E2E TESTING

### 5.1 Realistic Scenario Tests

**Test Suite (Pseudocode):**
```typescript
// test/e2e/realistic-scenarios.test.ts
describe('Realistic Scenarios', () => {
  it('should handle slow network conditions', async () => {
    const network = new MockNetwork({
      latency: { min: 500, max: 2000 }, // 500-2000ms
      packetLoss: 0.05, // 5% loss
      jitter: 100 // ±100ms
    });
    
    const node1 = new GNNNode({ nodeId: 'node-1', network });
    const node2 = new GNNNode({ nodeId: 'node-2', network });
    
    await node1.start();
    await node2.start();
    
    // Publish message
    const message = await node1.publish('test/topic', { data: 'hello' });
    
    // Should still work despite slow network
    expect(message.status).toBe('published');
    
    // Query should timeout gracefully
    const query = await node1.query(node2.peerId, { action: 'test' });
    expect(query.status).toMatch(/success|timeout/);
  });
  
  it('should handle Byzantine peer (sends invalid signatures)', async () => {
    const normalNode = new GNNNode({ nodeId: 'normal' });
    const byzantineNode = new MockByzantineNode({
      nodeId: 'byzantine',
      behavior: 'invalid_signatures'
    });
    
    await normalNode.start();
    await byzantineNode.start();
    
    // Connect nodes
    await normalNode.addBootstrapPeer(byzantineNode.multiaddr);
    
    // Byzantine sends messages with fake signatures
    for (let i = 0; i < 10; i++) {
      const fakeMessage = await byzantineNode.createFakeSignedMessage();
      await normalNode.handleIncomingMessage(fakeMessage);
    }
    
    // Normal node should reject all and blocklist Byzantine
    const rep = await normalNode.getReputation(byzantineNode.peerId);
    expect(rep).toBeLessThan(10); // Very low reputation
    
    // Eventually should be blocklisted
    const accepted = await normalNode.shouldAcceptPeer(byzantineNode.peerId);
    expect(accepted).toBe(false);
  });
  
  it('should handle Byzantine peer (spam)', async () => {
    const normalNode = new GNNNode({ nodeId: 'normal' });
    const spammerNode = new GNNNode({ nodeId: 'spammer' });
    
    await normalNode.start();
    await spammerNode.start();
    
    // Spammer publishes 1000 messages/sec
    for (let i = 0; i < 10; i++) {
      const promises = [];
      for (let j = 0; j < 1000; j++) {
        promises.push(
          spammerNode.publish(`spam/${i}/${j}`, { data: 'spam' })
        );
      }
      await Promise.all(promises);
    }
    
    // Normal node should rate-limit and blocklist
    const rep = await normalNode.getReputation(spammerNode.peerId);
    expect(rep).toBeLessThan(20);
  });
  
  it('should handle network partition (split-brain)', async () => {
    const partition1 = await createNodeCluster(5);
    const partition2 = await createNodeCluster(5);
    
    await startAllNodes([...partition1, ...partition2]);
    
    // Connect partitions initially
    await connectNodeClusters(partition1, partition2);
    
    // Publish message that reaches both partitions
    const msg1 = await partition1[0].publish('test/partition', { data: 'before-split' });
    expect(msg1.status).toBe('published');
    
    // Partition the network (sever connections)
    await severeNetworkConnection(partition1, partition2);
    
    // Each partition continues publishing
    const msg2a = await partition1[0].publish('test/partition', { data: 'after-split-1' });
    const msg2b = await partition2[0].publish('test/partition', { data: 'after-split-2' });
    
    expect(msg2a.status).toBe('published');
    expect(msg2b.status).toBe('published');
    
    // Messages don't cross partition (expected)
    const partition1Msgs = await partition1[0].getMessages({ topic: 'test/partition' });
    const partition2Msgs = await partition2[0].getMessages({ topic: 'test/partition' });
    
    expect(partition1Msgs.some(m => m.data === 'after-split-2')).toBe(false);
    expect(partition2Msgs.some(m => m.data === 'after-split-1')).toBe(false);
    
    // Heal partition
    await healNetworkConnection(partition1, partition2);
    
    // Nodes should synchronize (eventual consistency)
    await sleep(5000); // Time for propagation
    
    const healed1Msgs = await partition1[0].getMessages({ topic: 'test/partition' });
    const healed2Msgs = await partition2[0].getMessages({ topic: 'test/partition' });
    
    expect(healed1Msgs.some(m => m.data === 'after-split-2')).toBe(true);
    expect(healed2Msgs.some(m => m.data === 'after-split-1')).toBe(true);
  });
  
  it('should handle cascading node failures', async () => {
    const nodes = await createNodeCluster(20);
    await startAllNodes(nodes);
    
    // Connect all nodes
    await fullyConnectCluster(nodes);
    
    // Start baseline message flow
    const publishInterval = setInterval(async () => {
      const node = nodes[Math.floor(Math.random() * nodes.length)];
      try {
        await node.publish('test/cascade', { timestamp: Date.now() });
      } catch (error) {
        // Expected during failures
      }
    }, 100);
    
    // Cascade failures: kill 5 nodes
    for (let i = 0; i < 5; i++) {
      await sleep(2000); // Stagger failures
      await nodes[i].stop();
    }
    
    // Measure recovery
    const recoveryTime = await measureNetworkStabilization(nodes.slice(5));
    
    expect(recoveryTime).toBeLessThan(10000); // Stabilize within 10 sec
    
    clearInterval(publishInterval);
  });
  
  it('should handle variable latency (jitter)', async () => {
    const network = new MockNetwork({
      latency: { min: 10, max: 500 }, // Highly variable
      jitter: 200
    });
    
    const node1 = new GNNNode({ nodeId: 'node-1', network });
    const node2 = new GNNNode({ nodeId: 'node-2', network });
    
    await node1.start();
    await node2.start();
    
    const latencies = [];
    
    // Send 100 queries, measure latencies
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      const response = await node1.query(node2.peerId, { action: 'test' });
      const latency = Date.now() - start;
      
      if (response.status === 'success') {
        latencies.push(latency);
      }
    }
    
    // Should have high variance
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const stdDev = Math.sqrt(
      latencies.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / latencies.length
    );
    
    expect(stdDev).toBeGreaterThan(100); // High variance
    expect(avgLatency).toBeGreaterThan(250); // High average due to jitter
  });
});
```

---

## 6. METRICS & OBSERVABILITY

### 6.1 Prometheus Metrics

**Configuration:**
```json
{
  "metrics": {
    "enabled": true,
    "exportFormat": "prometheus",
    "exportInterval": 60000,
    "metricsPort": 9090,
    "pushgateway": null
  }
}
```

**Metrics Endpoints:**
```
GET /metrics (Prometheus format)

# Counters
gnn_messages_published_total{topic="sensor/temp"} 1234
gnn_messages_received_total{sender="node-a"} 5678
gnn_messages_invalid_total{reason="bad_signature"} 12
gnn_queries_sent_total{status="success"} 456
gnn_queries_sent_total{status="timeout"} 23
gnn_retries_total{reason="network_error"} 45

# Gauges
gnn_peers_connected 25
gnn_peer_reputation{peer="node-a"} 85
gnn_memory_usage_bytes 52428800
gnn_db_size_bytes 1073741824
gnn_message_queue_size 234

# Histograms
gnn_message_latency_seconds{quantile="0.5"} 0.023
gnn_message_latency_seconds{quantile="0.9"} 0.145
gnn_message_latency_seconds{quantile="0.99"} 0.512
gnn_query_latency_seconds{quantile="0.5"} 0.042
gnn_query_latency_seconds{quantile="0.9"} 0.234

# Rate
gnn_messages_per_second{window="1m"} 125.4
gnn_bandwidth_inbound_bytes_per_second 1024000
gnn_bandwidth_outbound_bytes_per_second 512000
```

**Implementation (Pseudocode):**
```typescript
class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, Histogram>();
  
  recordCounter(name: string, labels: Record<string, string>, delta: number = 1): void {
    const key = this.buildKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + delta);
  }
  
  recordGauge(name: string, labels: Record<string, string>, value: number): void {
    const key = this.buildKey(name, labels);
    this.gauges.set(key, value);
  }
  
  recordHistogram(name: string, labels: Record<string, string>, value: number): void {
    const key = this.buildKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram());
    }
    this.histograms.get(key).record(value);
  }
  
  exportPrometheus(): string {
    let output = '';
    
    // Export counters
    for (const [key, value] of this.counters) {
      output += `gnn_${key} ${value}\n`;
    }
    
    // Export gauges
    for (const [key, value] of this.gauges) {
      output += `gnn_${key} ${value}\n`;
    }
    
    // Export histograms
    for (const [key, histogram] of this.histograms) {
      for (const percentile of [0.5, 0.9, 0.99]) {
        const value = histogram.percentile(percentile * 100);
        output += `gnn_${key}{quantile="${percentile}"} ${value}\n`;
      }
    }
    
    return output;
  }
  
  private buildKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return `${name}{${labelStr}}`;
  }
}
```

### 6.2 JSON + Human-Readable Logs

**Configuration:**
```json
{
  "logging": {
    "formats": ["human", "json"],
    "level": "info",
    "levels": {
      "human": "info",
      "json": "debug"
    },
    "files": {
      "human": "./logs/gnn.log",
      "json": "./logs/gnn.json.log"
    },
    "rotation": {
      "maxSizeKB": 100,
      "retentionDays": 7
    }
  }
}
```

**Log Output Examples:**

Human-Readable:
```
[INFO] 2026-05-06T10:30:00Z Message published
        topic: sensor/temperature
        messageId: msg_abc123
        payload_size: 1234 bytes
        latency: 23ms

[WARN] 2026-05-06T10:30:15Z Peer reputation dropped
        peerId: Qm...xyz
        old_score: 75
        new_score: 65
        reason: invalid_signature
        message_id: msg_def456
```

JSON:
```json
{"timestamp":"2026-05-06T10:30:00.000Z","level":"INFO","service":"gnn","event":"message_published","topic":"sensor/temperature","messageId":"msg_abc123","payloadSize":1234,"latencyMs":23}
{"timestamp":"2026-05-06T10:30:15.000Z","level":"WARN","service":"gnn","event":"peer_reputation_dropped","peerId":"Qm...xyz","oldScore":75,"newScore":65,"reason":"invalid_signature","messageId":"msg_def456"}
```

**Implementation (Pseudocode):**
```typescript
class DualLogger {
  private humanLogger: Logger;
  private jsonLogger: Logger;
  
  info(message: string, context?: Record<string, any>): void {
    // Human-readable format
    const humanMsg = this.formatHuman('INFO', message, context);
    this.humanLogger.write(humanMsg);
    
    // JSON format
    const jsonMsg = this.formatJSON('INFO', message, context);
    this.jsonLogger.write(jsonMsg);
  }
  
  private formatHuman(level: string, message: string, context?: any): string {
    const timestamp = new Date().toISOString();
    let output = `[${level}] ${timestamp} ${message}\n`;
    
    if (context) {
      const lines = Object.entries(context)
        .map(([k, v]) => `        ${k}: ${this.formatValue(v)}`)
        .join('\n');
      output += lines + '\n';
    }
    
    return output;
  }
  
  private formatJSON(level: string, message: string, context?: any): string {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'gnn',
      message,
      ...context
    };
    
    return JSON.stringify(entry) + '\n';
  }
  
  private formatValue(value: any): string {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }
}
```

---

## 7. GRACEFUL SHUTDOWN & RESTART

### 7.1 Graceful Shutdown

**Configuration:**
```json
{
  "shutdown": {
    "gracefulTimeout": 30000,
    "timeoutAction": "force_kill",
    "signalHandlers": true,
    "cleanupSteps": [
      "flush_in_memory_queues",
      "close_connections",
      "persist_state",
      "close_database"
    ]
  }
}
```

**Implementation (Pseudocode):**
```typescript
class GracefulShutdownManager {
  async handleShutdownSignal(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
    logger.info('Received shutdown signal', { signal });
    
    const startTime = Date.now();
    const timeout = config.shutdown.gracefulTimeout;
    
    try {
      // 1. Stop accepting new connections
      logger.info('Stopping API server');
      await this.apiServer.close();
      
      // 2. Flush in-memory queues
      logger.info('Flushing message queue');
      await this.messageQueue.flush();
      
      // 3. Close P2P connections gracefully
      logger.info('Closing P2P connections');
      await this.libp2p.stop();
      
      // 4. Persist state to database
      logger.info('Persisting node state');
      await this.persistState();
      
      // 5. Close database
      logger.info('Closing database');
      await this.database.close();
      
      const duration = Date.now() - startTime;
      logger.info('Graceful shutdown complete', { durationMs: duration });
      
      process.exit(0);
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.error('Graceful shutdown failed', { error, elapsedMs: elapsed });
      
      if (elapsed > timeout) {
        logger.error('Shutdown timeout exceeded, force killing');
        process.exit(1);
      } else {
        // Retry
        throw error;
      }
    }
  }
  
  private async persistState(): Promise<void> {
    const state = {
      nodeId: config.nodeId,
      uptime: process.uptime(),
      peersKnown: this.p2p.getPeers().length,
      messagesProcessed: this.stats.messagesProcessed,
      lastShutdown: Date.now()
    };
    
    await this.database.put('state:last_shutdown', state);
  }
}

// Register signal handlers
process.on('SIGTERM', () => shutdownManager.handleShutdownSignal('SIGTERM'));
process.on('SIGINT', () => shutdownManager.handleShutdownSignal('SIGINT'));
```

### 7.2 Connection Persistence on Restart

**Restart Recovery (Pseudocode):**
```typescript
async function onNodeRestart(): Promise<void> {
  logger.info('Node restarting');
  
  // 1. Recover stored peer list
  const savedPeers = await database.get('peers:saved') || [];
  logger.info('Restoring peers', { count: savedPeers.length });
  
  for (const peer of savedPeers) {
    try {
      // Try to reconnect to saved peers
      await libp2p.dial(peer.multiaddr);
      logger.debug('Reconnected to peer', { peerId: peer.peerId });
    } catch (error) {
      logger.debug('Failed to reconnect', { peerId: peer.peerId, error: error.message });
      // Continue, peer may be offline
    }
  }
  
  // 2. Recover pending operations
  const pendingMessages = await database.get('messages:pending') || [];
  logger.info('Retrying pending messages', { count: pendingMessages.length });
  
  for (const msg of pendingMessages) {
    try {
      await messageQueue.enqueue(msg);
    } catch (error) {
      logger.warn('Failed to requeue message', { messageId: msg.messageId });
    }
  }
  
  // 3. Reset node state
  await database.put('state:restarted_at', Date.now());
  await database.put('state:restart_count', (await database.get('state:restart_count') || 0) + 1);
  
  logger.info('Node restart recovery complete');
}
```

---

## 8. HEALTH CHECKS

### 8.1 Health Check Endpoints

**Configuration:**
```json
{
  "healthChecks": {
    "enabled": true,
    "interval": 10000,
    "liveness": {
      "enabled": true,
      "path": "/healthz"
    },
    "readiness": {
      "enabled": true,
      "path": "/readyz"
    }
  }
}
```

**Health Check Handlers (Pseudocode):**
```typescript
// GET /healthz (Liveness)
async function handleLiveness(req: Request): Promise<Response> {
  const isAlive = process.uptime() > 0; // Always true if responding
  
  return Response.json({
    status: isAlive ? 'healthy' : 'unhealthy',
    uptime: process.uptime(),
    timestamp: Date.now()
  }, {
    status: isAlive ? 200 : 503
  });
}

// GET /readyz (Readiness)
async function handleReadiness(req: Request): Promise<Response> {
  const checks = {
    p2p: await checkP2PConnectivity(),
    database: await checkDatabaseHealth(),
    memory: checkMemoryHealth(),
    peers: await checkPeerConnectivity()
  };
  
  const isReady = Object.values(checks).every(check => check.healthy);
  
  return Response.json({
    status: isReady ? 'ready' : 'not_ready',
    checks,
    timestamp: Date.now()
  }, {
    status: isReady ? 200 : 503
  });
}

async function checkP2PConnectivity(): Promise<HealthCheckResult> {
  try {
    const peers = libp2p.getPeers();
    return {
      healthy: peers.length > 0,
      details: { peerCount: peers.length }
    };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  try {
    const test = await database.put('health:check', Date.now());
    const result = await database.get('health:check');
    return {
      healthy: result != null,
      details: { readable: true, writable: true }
    };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

function checkMemoryHealth(): HealthCheckResult {
  const usage = process.memoryUsage();
  const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
  
  return {
    healthy: heapUsedPercent < 90,
    details: { heapUsedPercent: heapUsedPercent.toFixed(1) }
  };
}

async function checkPeerConnectivity(): Promise<HealthCheckResult> {
  const peers = libp2p.getPeers();
  const reachable = await Promise.all(
    peers.slice(0, 5).map(p => checkPeerReachable(p))
  );
  
  const reachableCount = reachable.filter(r => r).length;
  return {
    healthy: reachableCount > 0,
    details: { reachableCount, sampleSize: reachable.length }
  };
}
```

---

## 9. PHASE 4 TESTING STRATEGY

### 9.1 Compression Tests

```typescript
// test/unit/compression.test.ts
describe('Compression', () => {
  it('should compress large JSON payloads', async () => {
    const compression = new CompressionManager();
    
    const largePayload = {
      data: Array(1000).fill({ test: 'data', value: 12345 })
    };
    
    const originalSize = JSON.stringify(largePayload).length;
    const compressed = await compression.compressPayload(largePayload, 'gzip');
    const compressedSize = compressed.length;
    
    const ratio = compressedSize / originalSize;
    expect(ratio).toBeLessThan(0.5); // At least 50% reduction
    
    // Verify decompression
    const decompressed = await compression.decompressPayload(compressed, 'gzip');
    expect(decompressed).toEqual(largePayload);
  });
});
```

### 9.2 Retry Logic Tests

```typescript
// test/unit/retry.test.ts
describe('Retry Logic', () => {
  it('should retry with exponential backoff', async () => {
    const retryMgr = new RetryManager();
    let attempts = 0;
    
    const operation = async () => {
      attempts++;
      if (attempts < 3) throw new Error('Not ready');
      return 'success';
    };
    
    const result = await retryMgr.retryWithBackoff(operation, 5, 10);
    
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
  
  it('should use circuit breaker', async () => {
    const breaker = new CircuitBreaker();
    
    const operation = async () => { throw new Error('Failed'); };
    
    // Fail threshold (5)
    for (let i = 0; i < 5; i++) {
      try {
        await breaker.execute(operation, 'test-peer');
      } catch (e) {
        // Expected
      }
    }
    
    // Circuit should be OPEN now
    expect(breaker.state).toBe('OPEN');
  });
});
```

### 9.3 E2E Chaos Tests

```typescript
// test/e2e/chaos.test.ts
describe('Chaos Engineering', () => {
  it('should recover from random node failures', async () => {
    const nodes = await createNodeCluster(50);
    await startAllNodes(nodes);
    
    // Kill random nodes every 5 seconds
    const killInterval = setInterval(() => {
      const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
      if (randomNode.isRunning) {
        randomNode.stop();
      }
    }, 5000);
    
    // Measure message delivery
    let deliveredCount = 0;
    for (let i = 0; i < 1000; i++) {
      const sender = nodes.find(n => n.isRunning);
      if (sender) {
        try {
          await sender.publish('chaos/test', { seq: i });
          deliveredCount++;
        } catch (e) {
          // Expected during failures
        }
      }
      await sleep(10);
    }
    
    clearInterval(killInterval);
    
    // Should deliver most messages despite failures
    expect(deliveredCount).toBeGreaterThan(800);
  });
});
```

---

## 10. PHASE 4 DELIVERABLES

### **Week 1: Compression Implementation**
- [x] Implement gzip compression
- [x] Implement brotli compression
- [x] Implement zstd compression
- [x] Compression negotiation
- [x] Payload size reduction tests
- **Deliverable:** 50-70% payload reduction for large messages

### **Week 2: Retry Logic & Circuit Breakers**
- [x] Exponential backoff with jitter
- [x] Circuit breaker state machine
- [x] Adaptive retry based on peer profile
- [x] Retry logic tests
- **Deliverable:** 95%+ temporary failure recovery

### **Week 3: Extended Load Testing**
- [x] 10 node cluster tests (100 msg/sec)
- [x] 100 node cluster tests (1k msg/sec)
- [x] 1000 node cluster tests (10k msg/sec)
- [x] 10k node cluster tests (100k msg/sec)
- [x] Throughput, latency, memory metrics
- **Deliverable:** Proven performance at scale

### **Week 4: Extended E2E Testing**
- [x] Slow network scenarios
- [x] Byzantine peer detection
- [x] Network partition handling
- [x] Cascading failures
- [x] Variable latency tests
- **Deliverable:** Real-world scenario coverage

### **Week 5: Metrics & Observability**
- [x] Prometheus metrics export
- [x] JSON + human-readable logs
- [x] Metrics API endpoints
- [x] Health check endpoints
- [x] Graceful shutdown/restart
- **Deliverable:** Production observability

### **Week 6: Documentation & Integration**
- [x] Compression tuning guide
- [x] Retry configuration guide
- [x] Metrics interpretation guide
- [x] Chaos testing scenarios
- [x] Deployment best practices
- **Deliverable:** Operational runbook

### **Week 7-8: Optimization & Hardening**
- [x] Memory pool optimization
- [x] Connection reuse patterns
- [x] Hardware acceleration (SIMD)
- [x] GC tuning
- [x] Stress testing (7-day soak)
- **Deliverable:** Production-hardened system

---

## 11. ACCEPTANCE CRITERIA (PHASE 4)

**Compression:**
- [ ] Gzip/Brotli/Zstd all working
- [ ] 50-70% reduction for JSON payloads
- [ ] <10ms compression/decompression overhead
- [ ] Negotiation handles incompatible peers

**Retry Logic:**
- [ ] Exponential backoff working
- [ ] Jitter prevents thundering herd
- [ ] Circuit breaker prevents cascade failures
- [ ] Adaptive retry improves success rate

**Load Testing:**
- [ ] 10 nodes @ 100 msg/sec: Sustained
- [ ] 100 nodes @ 1k msg/sec: Sustained
- [ ] 1000 nodes @ 10k msg/sec: Sustained
- [ ] 10k nodes @ 100k msg/sec: Sustained (with caveats)
- [ ] Memory <200 MB at all scales
- [ ] CPU <50% average

**E2E Testing:**
- [ ] Slow network scenarios pass
- [ ] Byzantine peer scenarios pass
- [ ] Network partition scenarios pass
- [ ] Cascading failure scenarios pass
- [ ] Variable latency scenarios pass

**Metrics & Observability:**
- [ ] Prometheus metrics accurate
- [ ] JSON + human logs both working
- [ ] Health checks accurate
- [ ] Graceful shutdown <30 sec

**Performance:**
- [ ] Message latency p99 <500ms
- [ ] Query latency p99 <200ms
- [ ] Startup time <8 sec
- [ ] Restart time <30 sec

---

## 12. PHASE 4 CONFIGURATION (COMPLETE)

**Final `gnn-conf-${node-id}.json`:**

```json
{
  "nodeId": "node-a",
  "apiToken": "token_abc123_xyz...",
  "apiPort": 25111,
  "p2pPort": 28111,
  
  "security": {
    "mode": "adversarial",
    "defaultTrust": false,
    "cryptography": { /* from Phase 3 */ }
  },
  
  "compression": {
    "enabled": true,
    "algorithm": "auto",
    "algorithms": {
      "gzip": { "enabled": true, "level": 6, "threshold": 2048 },
      "brotli": { "enabled": true, "level": 6, "threshold": 2048 },
      "zstd": { "enabled": true, "level": 6, "threshold": 2048 }
    },
    "selectionStrategy": "adaptive",
    "compressionThreshold": 2048
  },
  
  "retryLogic": {
    "enabled": true,
    "strategies": {
      "exponentialBackoff": {
        "enabled": true,
        "initialDelayMs": 100,
        "maxDelayMs": 30000,
        "multiplier": 2,
        "jitter": true,
        "jitterFactor": 0.1
      },
      "circuitBreaker": {
        "enabled": true,
        "failureThreshold": 5,
        "successThreshold": 2,
        "timeout": 60000
      },
      "adaptiveRetry": {
        "enabled": true,
        "baseRetries": 3,
        "maxRetries": 10
      }
    },
    "perMessageType": {
      "publish": { "maxRetries": 3, "timeout": 5000 },
      "query": { "maxRetries": 5, "timeout": 10000 },
      "response": { "maxRetries": 2, "timeout": 3000 }
    }
  },
  
  "metrics": {
    "enabled": true,
    "exportFormat": "prometheus",
    "exportInterval": 60000,
    "metricsPort": 9090
  },
  
  "logging": {
    "formats": ["human", "json"],
    "level": "info",
    "files": {
      "human": "./logs/gnn.log",
      "json": "./logs/gnn.json.log"
    },
    "rotation": {
      "maxSizeKB": 100,
      "retentionDays": 7
    }
  },
  
  "shutdown": {
    "gracefulTimeout": 30000,
    "timeoutAction": "force_kill",
    "signalHandlers": true,
    "cleanupSteps": [
      "flush_in_memory_queues",
      "close_connections",
      "persist_state",
      "close_database"
    ]
  },
  
  "healthChecks": {
    "enabled": true,
    "interval": 10000,
    "liveness": { "enabled": true, "path": "/healthz" },
    "readiness": { "enabled": true, "path": "/readyz" }
  },
  
  "performance": {
    "connectionPooling": { "enabled": true, "maxPoolSize": 50 },
    "multiplexing": { "maxStreamsPerConnection": 1000 },
    "memoryPool": { "enabled": true, "poolSize": 100 }
  }
}
```

---

## 13. PHASE 4 DEPLOYMENT

### 13.1 Docker with All Features

```dockerfile
FROM oven/bun:latest as builder
WORKDIR /app
COPY . .
RUN bun install --production

FROM oven/bun:latest
WORKDIR /app
COPY --from=builder /app /app

# Create directories
RUN mkdir -p logs gnn-keys-${NODE_ID} gnn-data-${NODE_ID}

EXPOSE 25111 28111 9090

ENV NODE_ID=docker-node-1
ENV GNN_COMPRESSION_ENABLED=true
ENV GNN_RETRY_ENABLED=true
ENV GNN_METRICS_ENABLED=true
ENV GNN_LOG_FORMATS=human,json

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD bun --eval "import('http').then(h => h.get('http://localhost:25111/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1)))"

CMD ["bun", "run", "start"]
```

### 13.2 Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gnn-node
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: gnn-node
    spec:
      containers:
      - name: gnn
        image: gnn:latest
        ports:
        - containerPort: 25111
          name: api
        - containerPort: 28111
          name: p2p
        - containerPort: 9090
          name: metrics
        
        env:
        - name: NODE_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: GNN_COMPRESSION_ENABLED
          value: "true"
        - name: GNN_RETRY_ENABLED
          value: "true"
        - name: GNN_METRICS_ENABLED
          value: "true"
        
        livenessProbe:
          httpGet:
            path: /healthz
            port: 25111
          initialDelaySeconds: 5
          periodSeconds: 10
        
        readinessProbe:
          httpGet:
            path: /readyz
            port: 25111
          initialDelaySeconds: 10
          periodSeconds: 5
        
        resources:
          requests:
            memory: "100Mi"
            cpu: "100m"
          limits:
            memory: "500Mi"
            cpu: "500m"
        
        volumeMounts:
        - name: data
          mountPath: /app/gnn-data-${NODE_ID}
        - name: logs
          mountPath: /app/logs
        - name: keys
          mountPath: /app/gnn-keys-${NODE_ID}
      
      volumes:
      - name: data
        emptyDir: {}
      - name: logs
        emptyDir: {}
      - name: keys
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  name: gnn-node
spec:
  selector:
    app: gnn-node
  ports:
  - name: api
    port: 25111
    targetPort: 25111
  - name: p2p
    port: 28111
    targetPort: 28111
  - name: metrics
    port: 9090
    targetPort: 9090
  type: ClusterIP

---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: gnn-metrics
spec:
  selector:
    matchLabels:
      app: gnn-node
  endpoints:
  - port: metrics
    interval: 30s
```

---

# END OF PHASE 4 PROMPT

---

## COMPLETE ROADMAP SUMMARY

```
Phase 0 (MVP):
  ✅ Local network P2P
  ✅ Pub-Sub messaging
  ✅ REST API + Dashboard
  ✅ Basic storage (LevelDB)

Phase 1 (Future):
  💡 Internet + NAT traversal
  💡 WebTransport
  💡 Circuit Relay
  💡 Bootstrap nodes

Phase 2 (Achieved):
  ✅ NAT traversal (UPnP, PMP, STUN, hole punching)
  ✅ WebTransport + multi-protocol failover
  ✅ Circuit Relay for unreachable peers
  ✅ Public bootstrap nodes
  ✅ Connection pooling & multiplexing

Phase 3 (Achieved):
  ✅ Adversarial mode (default)
  ✅ ED25519 message signing
  ✅ Peer reputation system
  ✅ Blocklist + spam prevention
  ✅ Token rotation
  ✅ Rate limiting
  ✅ Key rotation

Phase 4 (Current):
  ✅ Payload compression (gzip, brotli, zstd)
  ✅ Smart retry logic (exponential backoff + circuit breaker)
  ✅ Extended load testing (10k+ concurrent nodes)
  ✅ Extended E2E testing (chaos, Byzantine, partitions)
  ✅ Prometheus metrics + JSON/human logs
  ✅ Graceful shutdown/restart
  ✅ Health checks + observability
  ✅ Production hardening

Future Phases (Beyond Phase 4):
  💡 Phase 5: Consensus & Ordering (Raft, PBFT)
  💡 Phase 6: State Machine Replication
  💡 Phase 7: Smart Contracts / DAOs
  💡 Phase 8: Sharding & Horizontal Scaling
```

---

**Congratulations! 🎉 You now have:**

1. ✅ Complete MVP (Phase 0) specification
2. ✅ Internet connectivity roadmap (Phase 2)
3. ✅ Security & adversarial robustness (Phase 3)
4. ✅ Enterprise-grade optimization (Phase 4)
5. ✅ Production deployment guides
6. ✅ Testing & chaos engineering strategies
7. ✅ Comprehensive monitoring & observability

**Ready to start building? 🚀**