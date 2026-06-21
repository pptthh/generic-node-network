import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDefaults } from '../../lib/config/defaults.js';
import { GNNNode } from '../../lib/p2p/node.js';
import type { NodeConfig } from '../../lib/types/config.js';

async function makeConfig(nodeId: string, p2pPort: number): Promise<NodeConfig> {
  const defaults = await getDefaults(nodeId);
  return {
    ...defaults,
    nodeId,
    apiToken: 'token_' + 'a'.repeat(32),
    apiPort: p2pPort + 1000, // derive apiPort from p2pPort to avoid conflicts
    p2pPort,
    bootstrapPeers: [],
    configFile: `./gnn-conf-${nodeId}.json`,
    dbPath: `./gnn-data-${nodeId}-test`,
    discovery: {
      ...defaults.discovery,
      mdnsEnabled: false,
      dhtEnabled: false,
    },
    natTraversal: {
      ...defaults.natTraversal!,
      enabled: false,
    },
    monitoring: {
      reachabilityCheck: { enabled: false, interval: 300000, peerSamples: 5 },
      connectivityMetrics: { enabled: false, sampleInterval: 60000 },
    },
  };
}

describe('Load Test - Message Throughput', () => {
  let node: GNNNode;

  beforeAll(async () => {
    node = new GNNNode(await makeConfig('load-test', 28300));
    await node.start();
    await node.subscribe('load/test');
  }, 15000);

  afterAll(async () => {
    if (node?.isRunning()) await node.stop();
  }, 15000);

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
