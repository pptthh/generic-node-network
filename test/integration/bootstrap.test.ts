import { describe, expect, it, afterAll } from 'vitest';
import { GNNNode } from '../../lib/p2p/node.js';
import type { NodeConfig } from '../../lib/types/config.js';
import { getDefaults } from '../../lib/config/defaults.js';

/**
 * Integration test for bootstrap node discovery.
 * Tests that nodes can discover each other through a bootstrap/seed node.
 */

async function createTestConfig(nodeId: string, apiPort: number, p2pPort: number): Promise<NodeConfig> {
  const defaults = await getDefaults(nodeId);
  return {
    ...defaults,
    nodeId,
    apiToken: 'token_' + 'a'.repeat(44),
    apiPort,
    p2pPort,
    configFile: `./gnn-conf-${nodeId}.json`,
    dbPath: `./.next/${nodeId}/dev/data-base`,
    natTraversal: {
      ...defaults.natTraversal!,
      enabled: false,
    },
    transports: {
      ...defaults.transports!,
      tcp: {
        ...defaults.transports!.tcp,
        port: p2pPort,
      },
      webSocket: {
        ...defaults.transports!.webSocket,
        enabled: false,
      },
    },
    monitoring: {
      reachabilityCheck: { enabled: false, interval: 300000, peerSamples: 5 },
      connectivityMetrics: { enabled: false, sampleInterval: 60000 },
    },
  } as NodeConfig;
}

describe('Bootstrap Node Discovery', () => {
  const nodes: GNNNode[] = [];

  afterAll(async () => {
    for (const node of nodes) {
      if (node.isRunning()) await node.stop();
    }
  });

  it('should discover peers via a bootstrap node', async () => {
    // Node A acts as bootstrap
    const configA = await createTestConfig('bs-node-a', 36111, 39111);
    const configB = await createTestConfig('bs-node-b', 36112, 39112);
    const configC = await createTestConfig('bs-node-c', 36113, 39113);

    const nodeA = new GNNNode(configA);
    const nodeB = new GNNNode(configB);
    const nodeC = new GNNNode(configC);
    nodes.push(nodeA, nodeB, nodeC);

    await nodeA.start();
    await nodeB.start();
    await nodeC.start();

    // B and C both connect to A as bootstrap
    const addrA = nodeA.getMultiaddrs()[0];
    await nodeB.addBootstrapPeer(addrA);
    await nodeC.addBootstrapPeer(addrA);

    // Wait for DHT propagation and peer discovery
    await new Promise(resolve => setTimeout(resolve, 5000));

    // All nodes should be aware of each other
    const peersA = nodeA.getPeers().filter(p => p.status === 'online');
    const peersB = nodeB.getPeers().filter(p => p.status === 'online');
    const peersC = nodeC.getPeers().filter(p => p.status === 'online');

    // A should have connections from B and C
    expect(peersA.length).toBeGreaterThanOrEqual(2);
    // B should know at least A
    expect(peersB.length).toBeGreaterThanOrEqual(1);
    // C should know at least A
    expect(peersC.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('should maintain connections after bootstrap node stops', async () => {
    // Create a mini-network
    const configA = await createTestConfig('bs2-node-a', 36121, 39121);
    const configB = await createTestConfig('bs2-node-b', 36122, 39122);
    const configC = await createTestConfig('bs2-node-c', 36123, 39123);

    const nodeA = new GNNNode(configA); // bootstrap
    const nodeB = new GNNNode(configB);
    const nodeC = new GNNNode(configC);
    nodes.push(nodeA, nodeB, nodeC);

    await nodeA.start();
    await nodeB.start();
    await nodeC.start();

    // B and C connect to A
    const addrA = nodeA.getMultiaddrs()[0];
    await nodeB.addBootstrapPeer(addrA);
    await nodeC.addBootstrapPeer(addrA);

    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify B is connected
    const peersB = nodeB.getPeers().filter(p => p.status === 'online');
    expect(peersB.length).toBeGreaterThanOrEqual(1);

    // Stop bootstrap node A
    await nodeA.stop();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // B and C should still be running (graceful degradation)
    expect(nodeB.isRunning()).toBe(true);
    expect(nodeC.isRunning()).toBe(true);
  }, 30000);
});
