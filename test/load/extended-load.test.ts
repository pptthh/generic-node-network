/**
 * Extended Load Tests (Phase 4) — using mock nodes for CI-friendly execution.
 *
 * These tests verify that GNN's core logic can sustain target throughputs
 * under simulated scale using the in-memory message bus (no real libp2p).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockNode, resetBus } from '../helpers/cluster.js';
import { measuredThroughput, errorRate, sleep } from '../helpers/mock-network.js';
import { Histogram } from '../../lib/metrics/histogram.js';

function createCluster(count: number, topicPrefix = 'load/test'): MockNode[] {
  const nodes: MockNode[] = [];
  for (let i = 0; i < count; i++) {
    const node = new MockNode({ nodeId: `node-${i}` });
    node.start();
    node.subscribe(topicPrefix);
    nodes.push(node);
  }
  return nodes;
}

function stopAll(nodes: MockNode[]): void {
  for (const n of nodes) n.stop();
}

// ---------------------------------------------------------------------------
// Scenario 1: 10 nodes, 100 msg/sec for 1 second
// ---------------------------------------------------------------------------
describe('Load Test - 10 nodes @ 100 msg/sec', () => {
  let nodes: MockNode[];

  beforeEach(() => {
    resetBus();
    nodes = createCluster(10);
  });

  afterEach(() => stopAll(nodes));

  it('publishes 100 messages with <1% error rate', async () => {
    const topic = 'load/test';
    const targetMessages = 100;
    let published = 0;
    let errors = 0;

    const start = Date.now();
    for (let i = 0; i < targetMessages; i++) {
      try {
        const sender = nodes[i % nodes.length];
        await sender.publish(topic, { seq: i, ts: Date.now() });
        published++;
      } catch {
        errors++;
      }
    }
    const elapsed = Date.now() - start;

    const throughput = measuredThroughput(published, elapsed);
    const errRate = errorRate(errors, published + errors);

    expect(errRate).toBeLessThan(0.01);
    expect(published).toBeGreaterThanOrEqual(targetMessages * 0.99);

    // Verify all nodes received messages (the bus delivers to all subscribers)
    for (const node of nodes) {
      const received = node.getReceivedMessages(topic);
      // Each node should receive messages from other nodes
      expect(received.length).toBeGreaterThan(0);
    }
  }, 15000);
});

// ---------------------------------------------------------------------------
// Scenario 2: 100 nodes, 1000 messages total
// ---------------------------------------------------------------------------
describe('Load Test - 100 nodes @ 1000 messages', () => {
  let nodes: MockNode[];

  beforeEach(() => {
    resetBus();
    nodes = createCluster(100);
  });

  afterEach(() => stopAll(nodes));

  it('delivers 1000 messages with <2% error rate', async () => {
    const topic = 'load/test';
    const targetMessages = 1000;
    let published = 0;
    let errors = 0;

    const batchSize = 100; // 10 batches
    for (let batch = 0; batch < targetMessages / batchSize; batch++) {
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < batchSize; i++) {
        const sender = nodes[(batch * batchSize + i) % nodes.length];
        promises.push(
          sender.publish(topic, { batch, seq: i }).then(() => { published++; }).catch(() => { errors++; })
        );
      }
      await Promise.all(promises);
    }

    const errRate = errorRate(errors, published + errors);
    expect(errRate).toBeLessThan(0.02);
    expect(published).toBeGreaterThanOrEqual(targetMessages * 0.98);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Scenario 3: 1000 nodes, 10k messages — throughput & memory test
// ---------------------------------------------------------------------------
describe('Load Test - 1000 nodes @ 10000 messages', () => {
  let nodes: MockNode[];

  beforeEach(() => {
    resetBus();
    nodes = createCluster(1000);
  });

  afterEach(() => stopAll(nodes));

  it('sustains 10k message throughput with <2% error rate', async () => {
    const topic = 'load/test';
    const targetMessages = 10000;
    const batchSize = 500;
    let published = 0;
    let errors = 0;

    const start = Date.now();

    for (let batch = 0; batch < targetMessages / batchSize; batch++) {
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < batchSize; i++) {
        const idx = (batch * batchSize + i) % nodes.length;
        promises.push(
          nodes[idx].publish(topic, { batch, seq: i })
            .then(() => { published++; })
            .catch(() => { errors++; })
        );
      }
      await Promise.all(promises);
    }

    const elapsed = Date.now() - start;
    const throughput = measuredThroughput(published, elapsed);
    const errRate = errorRate(errors, published + errors);

    expect(published).toBeGreaterThanOrEqual(targetMessages * 0.98);
    expect(errRate).toBeLessThan(0.02);
    // The mock bus is fast, so throughput should be well above 1k msg/sec
    expect(throughput).toBeGreaterThan(1000);
  }, 60000);

  it('stays within memory bounds during 1000-node simulation', async () => {
    const topic = 'load/test';
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      await nodes[i % nodes.length].publish(topic, { seq: i });
    }

    const after = process.memoryUsage().heapUsed;
    const deltaMB = (after - before) / 1024 / 1024;

    // Should not allocate more than 100 MB for 1000 lightweight mock nodes + 1000 messages
    expect(deltaMB).toBeLessThan(100);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Scenario 4: 10k simulated "nodes" (lightweight stat tracking only)
// ---------------------------------------------------------------------------
describe('Load Test - 10k node scale simulation', () => {
  it('tracks stats for 10k nodes without OOM', () => {
    resetBus();

    // Create 10k nodes but don't subscribe them all (bus would be huge)
    // Just verify we can instantiate and start them
    const nodes: MockNode[] = [];
    for (let i = 0; i < 10000; i++) {
      const n = new MockNode({ nodeId: `scale-node-${i}` });
      n.start();
      nodes.push(n);
    }

    const memMB = process.memoryUsage().heapUsed / 1024 / 1024;
    expect(memMB).toBeLessThan(500); // Should be well under 500 MB for 10k objects

    for (const n of nodes) n.stop();
  });

  it('measures publish latency distribution', async () => {
    resetBus();
    const nodes = createCluster(50);
    const topic = 'load/latency';
    const histogram = new Histogram([1, 5, 10, 25, 50, 100]);

    for (let i = 0; i < 500; i++) {
      const start = Date.now();
      await nodes[i % nodes.length].publish(topic, { i });
      histogram.record(Date.now() - start);
    }

    const p50 = histogram.percentile(50);
    const p99 = histogram.percentile(99);

    // In-process mock: latencies should be very low
    expect(p50).toBeLessThan(50);
    expect(p99).toBeLessThan(100);

    for (const n of nodes) n.stop();
  }, 30000);
});
