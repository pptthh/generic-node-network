import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDefaults } from '../../lib/config/defaults.js';
import { GNNNode } from '../../lib/p2p/node.js';
import type { NodeConfig } from '../../lib/types/config.js';
import type { PublishedMessage } from '../../lib/types/messages.js';

async function makeConfig(nodeId: string, apiPort: number, p2pPort: number): Promise<NodeConfig> {
  const defaults = await getDefaults();
  return {
    ...defaults,
    nodeId,
    apiToken: 'token_' + 'a'.repeat(32),
    apiPort,
    p2pPort,
    bootstrapPeers: [],
    configFile: `./gnn-conf-${nodeId}.json`,
    dbPath: `./gnn-data-${nodeId}-test`,
    discovery: { ...defaults.discovery, mdnsEnabled: true, dhtEnabled: false },
    natTraversal: { ...defaults.natTraversal!, enabled: false },
    transports: {
      ...defaults.transports!,
      tcp: { ...defaults.transports!.tcp, port: p2pPort },
      webSocket: { ...defaults.transports!.webSocket, enabled: false },
    },
    monitoring: {
      reachabilityCheck: { enabled: false, interval: 300000, peerSamples: 5 },
      connectivityMetrics: { enabled: false, sampleInterval: 60000 },
    },
  };
}

describe('Pub-Sub Integration', () => {
  let nodeA: GNNNode;
  let nodeB: GNNNode;

  beforeAll(async () => {
    nodeA = new GNNNode(await makeConfig('pubsub-a', 25231, 28231));
    nodeB = new GNNNode(await makeConfig('pubsub-b', 25232, 28232));

    await nodeA.start();
    await nodeB.start();

    // Connect B to A
    const peerId = nodeA.getPeerId();
    const addrsA = nodeA.getMultiaddrs();
    const localAddr = addrsA.find(a => a.includes('127.0.0.1'));
    if (localAddr && peerId) {
      await nodeB.addBootstrapPeer(`${localAddr}/p2p/${peerId}`).catch(() => null);
    }

    // Wait for connection + gossipsub mesh formation
    await new Promise(r => setTimeout(r, 2000));
  }, 30000);

  afterAll(async () => {
    await nodeA.stop();
    await nodeB.stop();
  }, 10000);

  it('should publish a message without error', async () => {
    await nodeA.subscribe('pubsub-test/topic');
    const msgId = await nodeA.publish('pubsub-test/topic', { data: 'hello' });
    expect(msgId).toMatch(/^msg_/);
  });

  it('should receive published messages locally', async () => {
    const received: PublishedMessage[] = [];
    nodeA.on('message', (msg: PublishedMessage) => {
      if (msg.topic === 'local-test') received.push(msg);
    });

    await nodeA.subscribe('local-test');
    await nodeA.publish('local-test', { val: 42 });

    await new Promise(r => setTimeout(r, 200));
    expect(received.length).toBeGreaterThan(0);
    expect((received[0]!.payload as { val: number }).val).toBe(42);
  });

  it('should subscribe and unsubscribe without error', async () => {
    await nodeA.subscribe('subscribe-test');
    await nodeA.unsubscribe('subscribe-test');
    // If we get here, no exceptions were thrown
    expect(true).toBe(true);
  });
}, 60000);
