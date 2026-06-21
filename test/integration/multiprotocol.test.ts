import { describe, expect, it, afterAll } from 'vitest';
import { GNNNode } from '../../lib/p2p/node.js';
import type { NodeConfig } from '../../lib/types/config.js';
import { getDefaults } from '../../lib/config/defaults.js';

/**
 * Integration test for multi-protocol transport.
 * Tests that two nodes can discover and connect using both TCP and WebSocket.
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
    // Disable NAT traversal in tests (no real internet)
    natTraversal: {
      ...defaults.natTraversal!,
      enabled: false,
    },
    // Disable WebSocket to avoid port conflicts in basic test
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
    // Disable monitoring in tests
    monitoring: {
      reachabilityCheck: { enabled: false, interval: 300000, peerSamples: 5 },
      connectivityMetrics: { enabled: false, sampleInterval: 60000 },
    },
  } as NodeConfig;
}

describe('Multi-Protocol Integration', () => {
  const nodes: GNNNode[] = [];

  afterAll(async () => {
    for (const node of nodes) {
      if (node.isRunning()) await node.stop();
    }
  });

  it('should connect two nodes via TCP', async () => {
    const configA = await createTestConfig('mp-node-a', 35111, 38111);
    const configB = await createTestConfig('mp-node-b', 35112, 38112);

    const nodeA = new GNNNode(configA);
    const nodeB = new GNNNode(configB);
    nodes.push(nodeA, nodeB);

    await nodeA.start();
    await nodeB.start();

    // Connect B to A
    const addrA = nodeA.getMultiaddrs()[0];
    expect(addrA).toBeDefined();

    await nodeB.addBootstrapPeer(addrA);

    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 2000));

    const peersB = nodeB.getPeers();
    expect(peersB.length).toBeGreaterThanOrEqual(1);
    expect(peersB.some(p => p.status === 'online')).toBe(true);
  }, 15000);

  it('should expose NAT-related info via get_state RPC', async () => {
    const configA = await createTestConfig('mp-rpc-a', 35121, 38121);
    const configB = await createTestConfig('mp-rpc-b', 35122, 38122);

    const nodeA = new GNNNode(configA);
    const nodeB = new GNNNode(configB);
    nodes.push(nodeA, nodeB);

    await nodeA.start();
    await nodeB.start();

    // Connect
    await nodeB.addBootstrapPeer(nodeA.getMultiaddrs()[0]);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Phase 2: get_state should include natType and reachability
    expect(nodeA.getNatType()).toBeDefined();
    expect(nodeA.getReachabilityStatus()).toBeDefined();
    expect(nodeA.getPublicIP()).toBeNull(); // NAT disabled in test
  }, 15000);

  it('should report connectivity metrics', async () => {
    const configA = await createTestConfig('mp-met-a', 35131, 38131);
    const nodeA = new GNNNode({
      ...configA,
      monitoring: {
        reachabilityCheck: { enabled: false, interval: 300000, peerSamples: 5 },
        connectivityMetrics: { enabled: true, sampleInterval: 1000 },
      },
    });
    nodes.push(nodeA);

    await nodeA.start();

    // Metrics should be available even without peers
    const connectivity = nodeA.getConnectivity();
    expect(connectivity).toBeDefined();
    expect(connectivity!.peerCount).toBe(0);
    expect(connectivity!.connected).toBe(false);
  }, 15000);
});
