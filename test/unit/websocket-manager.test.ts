import { describe, expect, test } from 'vitest';
import type { NodeConfig } from '../../lib/types/config.js';
import { WebSocketManager, getWebSocketManager, setWebSocketManager } from '../../lib/websocket/server.js';

function makeConfig(overrides: Partial<NodeConfig> = {}): NodeConfig {
  return {
    nodeId: 'test-node',
    apiToken: 'token_' + 'a'.repeat(32),
    apiPort: 25111,
    p2pPort: 28111,
    bootstrapPeers: [],
    configFile: './gnn-conf-test.json',
    dbPath: './gnn-data-test',
    logging: { level: 'error', file: null, maxSizeKB: 100, retentionDays: 1 },
    message: { retentionDays: 28, maxPayloadSize: 31744 },
    peer: { ttlDays: 14, autoCleanupInterval: '24h' },
    timeouts: { queryMs: 100, broadcastMs: 1000, peerCheckIntervalSec: 30 },
    discovery: { mdnsEnabled: true, dhtEnabled: true },
    ...overrides,
  };
}

describe('WebSocketManager', () => {
  describe('clientCount', () => {
    test('should start with zero clients', () => {
      const manager = new WebSocketManager(makeConfig());
      expect(manager.clientCount()).toBe(0);
    });
  });

  describe('addClient / removeClient', () => {
    test('should add a client and increment count', () => {
      const manager = new WebSocketManager(makeConfig());
      manager.addClient('client-1', { id: 'client-1', send: () => {}, readyState: 1 });
      expect(manager.clientCount()).toBe(1);
    });

    test('should remove a client and decrement count', () => {
      const manager = new WebSocketManager(makeConfig());
      manager.addClient('client-1', { id: 'client-1', send: () => {}, readyState: 1 });
      manager.removeClient('client-1');
      expect(manager.clientCount()).toBe(0);
    });

    test('should handle removing a non-existent client gracefully', () => {
      const manager = new WebSocketManager(makeConfig());
      expect(() => manager.removeClient('ghost-client')).not.toThrow();
      expect(manager.clientCount()).toBe(0);
    });

    test('should support multiple concurrent clients', () => {
      const manager = new WebSocketManager(makeConfig());
      manager.addClient('c1', { id: 'c1', send: () => {}, readyState: 1 });
      manager.addClient('c2', { id: 'c2', send: () => {}, readyState: 1 });
      manager.addClient('c3', { id: 'c3', send: () => {}, readyState: 1 });
      expect(manager.clientCount()).toBe(3);
    });
  });

  describe('validateToken', () => {
    test('should return true for the exact configured token', () => {
      const config = makeConfig();
      const manager = new WebSocketManager(config);
      expect(manager.validateToken(config.apiToken)).toBe(true);
    });

    test('should return false for a null token', () => {
      const manager = new WebSocketManager(makeConfig());
      expect(manager.validateToken(null)).toBe(false);
    });

    test('should return false for an incorrect token', () => {
      const manager = new WebSocketManager(makeConfig());
      expect(manager.validateToken('wrong_token')).toBe(false);
    });

    test('should return false for an empty string token', () => {
      const manager = new WebSocketManager(makeConfig());
      expect(manager.validateToken('')).toBe(false);
    });

    test('should strip Bearer prefix and still validate', () => {
      const config = makeConfig();
      const manager = new WebSocketManager(config);
      expect(manager.validateToken(`Bearer ${config.apiToken}`)).toBe(true);
    });

    test('should return false for Bearer with wrong token', () => {
      const manager = new WebSocketManager(makeConfig());
      expect(manager.validateToken('Bearer wrong_token_here')).toBe(false);
    });
  });

  describe('broadcast', () => {
    test('should call send on each connected client', () => {
      const manager = new WebSocketManager(makeConfig());
      const sent: string[] = [];
      manager.addClient('c1', {
        id: 'c1',
        send: (data) => sent.push(data),
        readyState: 1,
      });
      manager.broadcast({ type: 'node_restarted', uptime: 0 });
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0])).toEqual({ type: 'node_restarted', uptime: 0 });
    });

    test('should broadcast to all connected clients', () => {
      const manager = new WebSocketManager(makeConfig());
      const received: Record<string, string[]> = { c1: [], c2: [] };
      manager.addClient('c1', { id: 'c1', send: (d) => received.c1.push(d), readyState: 1 });
      manager.addClient('c2', { id: 'c2', send: (d) => received.c2.push(d), readyState: 1 });
      manager.broadcast({ type: 'node_restarted', uptime: 5 });
      expect(received.c1).toHaveLength(1);
      expect(received.c2).toHaveLength(1);
    });

    test('should skip and remove clients with readyState !== 1', () => {
      const manager = new WebSocketManager(makeConfig());
      const sent: string[] = [];
      manager.addClient('dead', { id: 'dead', send: (d) => sent.push(d), readyState: 3 });
      manager.broadcast({ type: 'node_restarted', uptime: 0 });
      expect(sent).toHaveLength(0);
      // Dead client should have been cleaned up
      expect(manager.clientCount()).toBe(0);
    });

    test('should remove clients that throw during send', () => {
      const manager = new WebSocketManager(makeConfig());
      manager.addClient('throwing', {
        id: 'throwing',
        send: () => { throw new Error('send failed'); },
        readyState: 1,
      });
      expect(() => manager.broadcast({ type: 'node_restarted', uptime: 0 })).not.toThrow();
      expect(manager.clientCount()).toBe(0);
    });

    test('should not throw when there are no clients', () => {
      const manager = new WebSocketManager(makeConfig());
      expect(() => manager.broadcast({ type: 'node_restarted', uptime: 0 })).not.toThrow();
    });

    test('should serialize the event as JSON', () => {
      const manager = new WebSocketManager(makeConfig());
      let received = '';
      manager.addClient('c1', { id: 'c1', send: (d) => { received = d; }, readyState: 1 });
      manager.broadcast({ type: 'peer_offline', peerId: 'QmPeer', timestamp: '2025-01-01T00:00:00.000Z' });
      const parsed = JSON.parse(received);
      expect(parsed.type).toBe('peer_offline');
      expect(parsed.peerId).toBe('QmPeer');
    });
  });
});

describe('getWebSocketManager / setWebSocketManager', () => {
  test('should return null before any manager is set', () => {
    // Temporarily clear global
    const prev = globalThis.__gnnWsManager;
    globalThis.__gnnWsManager = undefined;
    expect(getWebSocketManager()).toBeNull();
    globalThis.__gnnWsManager = prev;
  });

  test('should return the manager after setWebSocketManager is called', () => {
    const config = makeConfig();
    const manager = new WebSocketManager(config);
    setWebSocketManager(manager);
    expect(getWebSocketManager()).toBe(manager);
  });
});
