import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GNNNode } from '../../lib/p2p/node.js';
import { getDefaults } from '../../lib/config/defaults.js';
import type { NodeConfig } from '../../lib/types/config.js';

function makeConfig(nodeId: string, p2pPort: number): NodeConfig {
  const defaults = getDefaults();
  return {
    ...defaults,
    nodeId,
    apiToken: 'token_' + 'a'.repeat(32),
    apiPort: 25300,
    p2pPort,
    bootstrapPeers: [],
    configFile: `./gnn-conf-${nodeId}.json`,
    dbPath: `./gnn-data-${nodeId}-test`,
    discovery: { mdnsEnabled: false, dhtEnabled: false },
  };
}

describe('Load Test - Message Throughput', () => {
  let node: GNNNode;

  beforeAll(async () => {
    node = new GNNNode(makeConfig('load-test', 28300));
    await node.start();
    await node.subscribe('load/test');
  }, 15000);

  afterAll(async () => {
    await node.stop();
  }, 5000);

  it('should handle 1000 messages within 2 seconds', async () => {
    const start = Date.now();
    const promises = [];

    for (let i = 0; i < 1000; i++) {
      promises.push(node.publish('load/test', { seq: i, ts: Date.now() }));
    }

    await Promise.all(promises);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
  }, 10000);

  it('should handle 100 sequential messages under 500ms', async () => {
    const start = Date.now();

    for (let i = 0; i < 100; i++) {
      await node.publish('load/test', { seq: i });
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  }, 5000);
}, 60000);
