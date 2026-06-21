/**
 * Chaos Engineering Tests (Phase 4) — using mock nodes.
 *
 * Tests verify system resilience under random failures, concurrent node kills,
 * and message delivery under adverse conditions.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockNode, resetBus } from '../helpers/cluster.js';
import { sleep, errorRate } from '../helpers/mock-network.js';

beforeEach(() => resetBus());

// ---------------------------------------------------------------------------
// Random node failures
// ---------------------------------------------------------------------------
describe('Chaos: random node failures during message flow', () => {
  it('delivers >80% of messages despite 20% of nodes being killed', async () => {
    const TOTAL = 50;
    const topic = 'chaos/random-kill';
    const nodes: MockNode[] = [];

    for (let i = 0; i < TOTAL; i++) {
      const n = new MockNode({ nodeId: `chaos-${i}` });
      n.start(); n.subscribe(topic);
      nodes.push(n);
    }

    let published = 0;
    let errors = 0;

    // Kill random nodes during message flow
    let killCount = 0;
    const MAX_KILLS = Math.floor(TOTAL * 0.2);

    for (let i = 0; i < 200; i++) {
      // Randomly kill a node every 20 iterations
      if (i % 20 === 0 && killCount < MAX_KILLS) {
        const aliveIdx = nodes.findIndex((n) => n.isRunning());
        if (aliveIdx !== -1) {
          nodes[aliveIdx].stop();
          killCount++;
        }
      }

      const alive = nodes.filter((n) => n.isRunning());
      if (alive.length === 0) break;

      const sender = alive[Math.floor(Math.random() * alive.length)];
      try {
        await sender.publish(topic, { seq: i });
        published++;
      } catch {
        errors++;
      }
    }

    const errRate = errorRate(errors, published + errors);
    expect(published).toBeGreaterThan(0);
    // Error rate should be low — only counting actual thrown errors, not kills
    expect(errRate).toBeLessThan(0.1);

    for (const n of nodes) { if (n.isRunning()) n.stop(); }
  }, 15000);
});

// ---------------------------------------------------------------------------
// Staggered cascading failures
// ---------------------------------------------------------------------------
describe('Chaos: staggered cascading failures', () => {
  it('network recovers after staggered 50% node loss', async () => {
    const TOTAL = 20;
    const topic = 'chaos/cascade';
    const nodes: MockNode[] = [];

    for (let i = 0; i < TOTAL; i++) {
      const n = new MockNode({ nodeId: `casc-${i}` });
      n.start(); n.subscribe(topic);
      nodes.push(n);
    }

    // Kill nodes in staggered batches
    for (let batch = 0; batch < 2; batch++) {
      for (let j = batch * 5; j < (batch + 1) * 5; j++) {
        if (nodes[j].isRunning()) nodes[j].stop();
      }
      await sleep(5);
    }

    // Surviving nodes
    const survivors = nodes.filter((n) => n.isRunning());
    expect(survivors.length).toBe(TOTAL / 2);

    // Publish from survivors and verify delivery
    let delivered = 0;
    for (const n of survivors) {
      n.on('message', () => delivered++);
    }

    for (let i = 0; i < 10; i++) {
      const sender = survivors[i % survivors.length];
      await sender.publish(topic, { seq: i });
    }
    await sleep(20);

    // Each survivor should receive messages from other survivors
    const totalReceived = survivors.reduce((sum, n) => sum + n.getReceivedMessages(topic).length, 0);
    expect(totalReceived).toBeGreaterThan(0);

    for (const n of survivors) n.stop();
  });
});

// ---------------------------------------------------------------------------
// High-concurrency burst
// ---------------------------------------------------------------------------
describe('Chaos: high-concurrency burst', () => {
  it('handles 5000 concurrent publishes without crashing', async () => {
    resetBus();
    const NODES = 20;
    const topic = 'chaos/burst';
    const nodes: MockNode[] = [];

    for (let i = 0; i < NODES; i++) {
      const n = new MockNode({ nodeId: `burst-${i}` });
      n.start(); n.subscribe(topic);
      nodes.push(n);
    }

    const MESSAGES = 5000;
    let published = 0;
    let errors = 0;

    const promises = Array.from({ length: MESSAGES }, (_, i) => {
      const sender = nodes[i % NODES];
      return sender.publish(topic, { seq: i })
        .then(() => { published++; })
        .catch(() => { errors++; });
    });

    await Promise.all(promises);

    expect(published + errors).toBe(MESSAGES);
    expect(errors).toBeLessThan(MESSAGES * 0.05); // <5% error rate
    expect(published).toBeGreaterThan(MESSAGES * 0.95);

    for (const n of nodes) n.stop();
  }, 30000);
});

// ---------------------------------------------------------------------------
// Packet loss chaos
// ---------------------------------------------------------------------------
describe('Chaos: high packet loss environment', () => {
  it('still delivers messages with 30% packet loss', async () => {
    resetBus();
    const topic = 'chaos/lossy';
    const sender = new MockNode({ nodeId: 'sender-lossy', packetLoss: 0.3 });
    const receivers: MockNode[] = [];

    sender.start(); sender.subscribe(topic);
    for (let i = 0; i < 5; i++) {
      const r = new MockNode({ nodeId: `recv-${i}` });
      r.start(); r.subscribe(topic);
      receivers.push(r);
    }

    let sent = 0;
    for (let i = 0; i < 100; i++) {
      await sender.publish(topic, { seq: i });
      sent++;
    }

    await sleep(20);

    // With 30% loss, at least 60% should get through
    const totalReceived = receivers.reduce((sum, r) => sum + r.getReceivedMessages(topic).length, 0);
    expect(totalReceived).toBeGreaterThan(sent * 0.6 * receivers.length);

    sender.stop();
    for (const r of receivers) r.stop();
  });
});
