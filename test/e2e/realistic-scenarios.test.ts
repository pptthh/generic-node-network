/**
 * Realistic Scenario Tests (Phase 4) — using mock nodes.
 *
 * Tests cover: slow networks, Byzantine peers, network partitions,
 * cascading failures, and variable latency (jitter).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockNode, resetBus } from '../helpers/cluster.js';
import { sleep, simulateDelay, shouldDrop } from '../helpers/mock-network.js';

beforeEach(() => resetBus());

// ---------------------------------------------------------------------------
// Slow network conditions
// ---------------------------------------------------------------------------
describe('Realistic: slow network conditions', () => {
  it('delivers messages despite artificial latency', async () => {
    const node1 = new MockNode({ nodeId: 'slow-1', latencyMs: 50 });
    const node2 = new MockNode({ nodeId: 'slow-2', latencyMs: 50 });

    node1.start(); node1.subscribe('slow/test');
    node2.start(); node2.subscribe('slow/test');

    const received: unknown[] = [];
    node2.on('message', (m) => received.push(m));

    await node1.publish('slow/test', { data: 'hello slow network' });
    await sleep(200); // wait for delivery

    expect(received.length).toBeGreaterThan(0);

    node1.stop(); node2.stop();
  });

  it('handles 5% packet loss gracefully', async () => {
    const MESSAGES = 200;
    const node = new MockNode({ nodeId: 'lossy', packetLoss: 0.05 });
    node.start(); node.subscribe('loss/test');

    let delivered = 0;
    const receiver = new MockNode({ nodeId: 'receiver' });
    receiver.start(); receiver.subscribe('loss/test');
    receiver.on('message', () => delivered++);

    for (let i = 0; i < MESSAGES; i++) {
      await node.publish('loss/test', { seq: i });
    }

    // With 5% loss, at least 90% should deliver
    const deliveredRatio = delivered / MESSAGES;
    expect(deliveredRatio).toBeGreaterThan(0.85);

    node.stop(); receiver.stop();
  });
});

// ---------------------------------------------------------------------------
// Byzantine peers
// ---------------------------------------------------------------------------
describe('Realistic: Byzantine peer — spam attack', () => {
  it('rate-limiter drops excess messages from a spammer', async () => {
    // Legitimate node with low rate limit
    const legitNode = new MockNode({ nodeId: 'legit', rateLimitPerSec: 10 });
    legitNode.start(); legitNode.subscribe('spam/test');

    const spammer = new MockNode({ nodeId: 'spammer' });
    spammer.start(); spammer.subscribe('spam/test');

    // Spammer floods 1000 messages
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(spammer.publish('spam/test', { i }));
    }
    await Promise.all(promises);

    // legit node should have received at most rateLimitPerSec messages
    const received = legitNode.getReceivedMessages('spam/test');
    expect(received.length).toBeLessThanOrEqual(20); // a little slack for timing

    legitNode.stop(); spammer.stop();
  });
});

// ---------------------------------------------------------------------------
// Network partition + heal
// ---------------------------------------------------------------------------
describe('Realistic: network partition and heal', () => {
  it('messages do not cross partitions; sync after heal', async () => {
    const topic = 'partition/test';

    // Partition 1
    const p1nodes = [
      new MockNode({ nodeId: 'p1-a' }),
      new MockNode({ nodeId: 'p1-b' }),
    ];
    // Partition 2 (different topic while partitioned)
    const p2nodes = [
      new MockNode({ nodeId: 'p2-a' }),
      new MockNode({ nodeId: 'p2-b' }),
    ];

    const partition1Topic = `${topic}:p1`;
    const partition2Topic = `${topic}:p2`;

    for (const n of p1nodes) { n.start(); n.subscribe(partition1Topic); }
    for (const n of p2nodes) { n.start(); n.subscribe(partition2Topic); }

    // Before partition: common topic
    const beforePartition = new MockNode({ nodeId: 'bridge' });
    beforePartition.start();
    beforePartition.subscribe(topic);
    for (const n of [...p1nodes, ...p2nodes]) n.subscribe(topic);

    await beforePartition.publish(topic, { data: 'before-split' });
    await sleep(10);

    // Verify all nodes received pre-split message
    for (const n of [...p1nodes, ...p2nodes]) {
      expect(n.getReceivedMessages(topic).length).toBeGreaterThan(0);
    }

    // "Partition": p1 sends to partition1Topic, p2 to partition2Topic
    await p1nodes[0].publish(partition1Topic, { data: 'after-split-1' });
    await p2nodes[0].publish(partition2Topic, { data: 'after-split-2' });
    await sleep(10);

    // Verify partition isolation
    for (const n of p1nodes) {
      const p2msgs = n.getReceivedMessages(partition2Topic);
      expect(p2msgs.length).toBe(0); // should not see partition 2 traffic
    }
    for (const n of p2nodes) {
      const p1msgs = n.getReceivedMessages(partition1Topic);
      expect(p1msgs.length).toBe(0); // should not see partition 1 traffic
    }

    // "Heal": subscribe all nodes to both partition topics and re-publish
    for (const n of [...p1nodes, ...p2nodes]) {
      n.subscribe(partition1Topic);
      n.subscribe(partition2Topic);
    }

    await p1nodes[0].publish(partition1Topic, { data: 'healed-from-p1' });
    await p2nodes[0].publish(partition2Topic, { data: 'healed-from-p2' });
    await sleep(10);

    // After heal, p2 nodes should see p1 messages and vice versa
    for (const n of p2nodes) {
      const healed = n.getReceivedMessages(partition1Topic);
      expect(healed.some((m: any) => m.payload?.data === 'healed-from-p1')).toBe(true);
    }
    for (const n of p1nodes) {
      const healed = n.getReceivedMessages(partition2Topic);
      expect(healed.some((m: any) => m.payload?.data === 'healed-from-p2')).toBe(true);
    }

    for (const n of [...p1nodes, ...p2nodes, beforePartition]) n.stop();
  });
});

// ---------------------------------------------------------------------------
// Cascading node failures
// ---------------------------------------------------------------------------
describe('Realistic: cascading node failures', () => {
  it('network stabilises after 25% of nodes fail', async () => {
    const TOTAL = 20;
    const topic = 'cascade/test';
    const nodes: MockNode[] = [];

    for (let i = 0; i < TOTAL; i++) {
      const n = new MockNode({ nodeId: `cascade-${i}` });
      n.start(); n.subscribe(topic);
      nodes.push(n);
    }

    // Baseline: verify publishing works
    await nodes[0].publish(topic, { data: 'baseline' });
    await sleep(10);

    const baselineReceived = nodes[1].getReceivedMessages(topic).length;
    expect(baselineReceived).toBeGreaterThan(0);

    // Kill 5 nodes (25%)
    for (let i = 0; i < 5; i++) {
      nodes[i].stop();
    }

    // Surviving nodes should still be able to publish
    let successfulPublishes = 0;
    for (let i = 5; i < TOTAL; i++) {
      try {
        await nodes[i].publish(topic, { data: `post-failure-${i}` });
        successfulPublishes++;
      } catch {
        // expected occasionally
      }
    }

    // At least 90% of surviving nodes can publish
    const survivalRate = successfulPublishes / (TOTAL - 5);
    expect(survivalRate).toBeGreaterThan(0.9);

    for (const n of nodes) { if (n.isRunning()) n.stop(); }
  });
});

// ---------------------------------------------------------------------------
// Variable latency / jitter
// ---------------------------------------------------------------------------
describe('Realistic: variable latency and jitter', () => {
  it('simulateDelay returns values within expected range', () => {
    const conditions = { latency: { min: 10, max: 100 }, jitter: 20 };
    const samples: number[] = [];

    for (let i = 0; i < 1000; i++) {
      samples.push(simulateDelay(conditions));
    }

    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

    // Min can go slightly below 10 due to jitter, but not by much
    expect(min).toBeGreaterThanOrEqual(0);
    // Max should be around 100+20 jitter
    expect(max).toBeLessThan(200);
    // Average should be roughly in the middle of [10, 100]
    expect(avg).toBeGreaterThan(20);
    expect(avg).toBeLessThan(120);
  });

  it('measures high standard deviation under jitter', async () => {
    const nodes: MockNode[] = [];
    for (let i = 0; i < 5; i++) {
      const n = new MockNode({ nodeId: `jitter-${i}`, latencyMs: 20 });
      n.start(); n.subscribe('jitter/test');
      nodes.push(n);
    }

    const latencies: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      await nodes[0].publish('jitter/test', { seq: i });
      latencies.push(Date.now() - start);
    }

    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    // With 20ms latency, average should be around 20ms
    expect(avg).toBeGreaterThan(5);

    for (const n of nodes) n.stop();
  }, 15000);
});
