import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GNNNode } from '../../lib/p2p/node.js';
import { getDefaults } from '../../lib/config/defaults.js';
import type { NodeConfig } from '../../lib/types/config.js';

function makeConfig(nodeId: string, apiPort: number, p2pPort: number): NodeConfig {
  const defaults = getDefaults();
  return {
    ...defaults,
    nodeId,
    apiToken: 'token_' + 'a'.repeat(32),
    apiPort,
    p2pPort,
    bootstrapPeers: [],
    configFile: `./gnn-conf-${nodeId}.json`,
    dbPath: `./gnn-data-${nodeId}-test`,
    discovery: { mdnsEnabled: true, dhtEnabled: false },
  };
}

describe('Multi-node P2P Discovery', () => {
  let nodeA: GNNNode;
  let nodeB: GNNNode;

  beforeAll(async () => {
    nodeA = new GNNNode(makeConfig('int-test-a', 25211, 28211));
    nodeB = new GNNNode(makeConfig('int-test-b', 25212, 28212));

    await nodeA.start();
    await nodeB.start();

    // Give mDNS time to discover (up to 3 seconds)
    await new Promise(r => setTimeout(r, 3000));
  }, 30000);

  afterAll(async () => {
    await nodeA.stop();
    await nodeB.stop();
  }, 10000);

  it('should have both nodes running', () => {
    expect(nodeA.isRunning()).toBe(true);
    expect(nodeB.isRunning()).toBe(true);
  });

  it('should expose P2P addresses', () => {
    expect(nodeA.getMultiaddrs().length).toBeGreaterThan(0);
    expect(nodeB.getMultiaddrs().length).toBeGreaterThan(0);
  });

  it('should have a peer ID', () => {
    expect(nodeA.getPeerId()).toBeTruthy();
    expect(nodeB.getPeerId()).toBeTruthy();
  });
}, 60000);

describe('P2P RPC Query', () => {
  let nodeA: GNNNode;
  let nodeB: GNNNode;

  beforeAll(async () => {
    nodeA = new GNNNode(makeConfig('rpc-test-a', 25221, 28221));
    nodeB = new GNNNode(makeConfig('rpc-test-b', 25222, 28222));

    await nodeA.start();
    await nodeB.start();

    // Connect B to A via bootstrap
    const addrsA = nodeA.getMultiaddrs();
    if (addrsA.length > 0) {
      const peerId = nodeA.getPeerId();
      const localAddr = addrsA.find(a => a.includes('127.0.0.1'));
      if (localAddr) {
        await nodeB.addBootstrapPeer(`${localAddr}/p2p/${peerId}`).catch(() => null);
      }
    }

    // Wait for connection
    await new Promise(r => setTimeout(r, 2000));
  }, 30000);

  afterAll(async () => {
    await nodeA.stop();
    await nodeB.stop();
  }, 10000);

  it('should answer local get_state query', async () => {
    // Test local RPC handler directly
    const localResp = await (nodeA as unknown as {
      handleRpcRequest: (req: { queryId: string; action: string; params: Record<string, unknown>; sender: string; timestamp: number }) => Promise<unknown>
    }).handleRpcRequest({
      queryId: 'test-local',
      action: 'get_state',
      params: {},
      sender: 'test',
      timestamp: Date.now(),
    });
    expect((localResp as { status: string }).status).toBe('success');
    expect((localResp as { response: { nodeId: string } }).response.nodeId).toBe('rpc-test-a');
  });
}, 60000);
