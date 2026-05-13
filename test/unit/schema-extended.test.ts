import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, mkdirSync } from 'fs';
import { Database } from '../../lib/storage/database.js';
import { Schema } from '../../lib/storage/schema.js';
import type { QueryMessage, ResponseMessage } from '../../lib/types/messages.js';
import type { Peer } from '../../lib/types/peers.js';

function makePeer(overrides: Partial<Peer> = {}): Peer {
  return {
    peerId: 'QmDefaultPeer',
    multiaddr: '/ip4/192.168.1.1/tcp/28111/p2p/QmDefaultPeer',
    status: 'online',
    lastSeen: Date.now(),
    discoveryMethod: 'mDNS',
    metadata: { alias: 'default-peer', apiPort: 25111 },
    ...overrides,
  };
}

describe('Schema extended', () => {
  let db: Database;
  let schema: Schema;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `gnn-schema-ext-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    db = new Database(testDir);
    await db.open();
    schema = new Schema(db);
  });

  afterEach(async () => {
    await db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('saveQueryMessage / getMessages query type', () => {
    test('should save and retrieve a query message', async () => {
      const query: QueryMessage = {
        type: 'query',
        queryId: 'qry_test001',
        target: 'node-b',
        request: { action: 'get_status', params: {} },
        sender: 'node-a',
        timestamp: 1715000000000,
        timeout: 100,
      };
      await schema.saveQueryMessage(query);
      const { messages, total } = await schema.getMessages({ type: 'query' });
      expect(total).toBe(1);
      const saved = messages[0] as QueryMessage;
      expect(saved.queryId).toBe('qry_test001');
      expect(saved.type).toBe('query');
    });

    test('should save multiple query messages and return all', async () => {
      for (let i = 0; i < 3; i++) {
        await schema.saveQueryMessage({
          type: 'query',
          queryId: `qry_${i}`,
          request: { action: 'ping' },
          sender: 'node-a',
          timestamp: 1715000000000 + i,
        });
      }
      const { total } = await schema.getMessages({ type: 'query' });
      expect(total).toBe(3);
    });
  });

  describe('saveResponseMessage / getMessages response type', () => {
    test('should save and retrieve a response message', async () => {
      const response: ResponseMessage = {
        type: 'response',
        queryId: 'qry_test001',
        status: 'success',
        response: { uptime: 3600 },
        sender: 'node-b',
        timestamp: 1715000000100,
      };
      await schema.saveResponseMessage(response);
      const { messages, total } = await schema.getMessages({ type: 'response' });
      expect(total).toBe(1);
      const saved = messages[0] as ResponseMessage;
      expect(saved.queryId).toBe('qry_test001');
      expect(saved.status).toBe('success');
    });

    test('should save a response with error status', async () => {
      const response: ResponseMessage = {
        type: 'response',
        queryId: 'qry_error',
        status: 'error',
        error: 'target unreachable',
        sender: 'node-c',
        timestamp: 1715000000200,
      };
      await schema.saveResponseMessage(response);
      const { messages } = await schema.getMessages({ type: 'response' });
      const saved = messages[0] as ResponseMessage;
      expect(saved.status).toBe('error');
    });
  });

  describe('getAllPeers', () => {
    test('should return an empty array when no peers exist', async () => {
      const peers = await schema.getAllPeers();
      expect(peers).toHaveLength(0);
    });

    test('should return all stored peers without a status filter', async () => {
      await schema.savePeer(makePeer({ peerId: 'QmPeer1', status: 'online' }));
      await schema.savePeer(makePeer({ peerId: 'QmPeer2', multiaddr: '/ip4/1.1.1.1/tcp/28111/p2p/QmPeer2', status: 'offline' }));
      const peers = await schema.getAllPeers();
      expect(peers).toHaveLength(2);
    });

    test('should filter by online status', async () => {
      await schema.savePeer(makePeer({ peerId: 'QmOnline', status: 'online' }));
      await schema.savePeer(makePeer({ peerId: 'QmOffline', multiaddr: '/ip4/2.2.2.2/tcp/28111/p2p/QmOffline', status: 'offline' }));
      const onlinePeers = await schema.getAllPeers('online');
      expect(onlinePeers).toHaveLength(1);
      expect(onlinePeers[0].peerId).toBe('QmOnline');
    });

    test('should filter by offline status', async () => {
      await schema.savePeer(makePeer({ peerId: 'QmA', status: 'online' }));
      await schema.savePeer(makePeer({ peerId: 'QmB', multiaddr: '/ip4/3.3.3.3/tcp/28111/p2p/QmB', status: 'offline' }));
      const offlinePeers = await schema.getAllPeers('offline');
      expect(offlinePeers).toHaveLength(1);
      expect(offlinePeers[0].peerId).toBe('QmB');
    });
  });

  describe('deleteStalePeers', () => {
    test('should delete offline peers older than ttlDays', async () => {
      const staleLastSeen = Date.now() - 15 * 24 * 60 * 60 * 1000; // 15 days ago
      await schema.savePeer(makePeer({
        peerId: 'QmStale',
        status: 'offline',
        lastSeen: staleLastSeen,
      }));
      const deleted = await schema.deleteStalePeers(14);
      expect(deleted).toBe(1);
    });

    test('should not delete offline peers within the TTL window', async () => {
      const recentLastSeen = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago
      await schema.savePeer(makePeer({
        peerId: 'QmRecent',
        status: 'offline',
        lastSeen: recentLastSeen,
      }));
      const deleted = await schema.deleteStalePeers(14);
      expect(deleted).toBe(0);
    });

    test('should not delete online peers regardless of age', async () => {
      const oldLastSeen = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
      await schema.savePeer(makePeer({
        peerId: 'QmOldOnline',
        status: 'online',
        lastSeen: oldLastSeen,
      }));
      const deleted = await schema.deleteStalePeers(14);
      expect(deleted).toBe(0);
    });

    test('should return 0 when no peers exist', async () => {
      const deleted = await schema.deleteStalePeers(14);
      expect(deleted).toBe(0);
    });
  });

  describe('getConfig / setConfig', () => {
    test('should store and retrieve a config value', async () => {
      await schema.setConfig('theme', 'dark');
      const value = await schema.getConfig('theme');
      expect(value).toBe('dark');
    });

    test('should store and retrieve a complex config object', async () => {
      const complexConfig = { retries: 3, timeout: 5000, enabled: true };
      await schema.setConfig('advanced', complexConfig);
      const value = await schema.getConfig('advanced');
      expect(value).toEqual(complexConfig);
    });

    test('should return null for a non-existent config key', async () => {
      const value = await schema.getConfig('nonexistent_key');
      expect(value).toBeNull();
    });

    test('should overwrite an existing config value', async () => {
      await schema.setConfig('color', 'red');
      await schema.setConfig('color', 'blue');
      const value = await schema.getConfig('color');
      expect(value).toBe('blue');
    });
  });

  describe('getState / setState', () => {
    test('should store and retrieve a state value', async () => {
      await schema.setState('uptime', 12345);
      const value = await schema.getState('uptime');
      expect(value).toBe(12345);
    });

    test('should return null for a non-existent state key', async () => {
      const value = await schema.getState('no_such_key');
      expect(value).toBeNull();
    });

    test('should overwrite an existing state value', async () => {
      await schema.setState('status', 'starting');
      await schema.setState('status', 'online');
      const value = await schema.getState('status');
      expect(value).toBe('online');
    });

    test('should store and retrieve a state object', async () => {
      const state = { peers: 3, messages: 42 };
      await schema.setState('metrics', state);
      const value = await schema.getState('metrics');
      expect(value).toEqual(state);
    });
  });

  describe('countSubscriptions', () => {
    test('should return 0 when no subscriptions exist for a node', async () => {
      const count = await schema.countSubscriptions('node-x');
      expect(count).toBe(0);
    });

    test('should return correct count after saving subscriptions', async () => {
      await schema.saveSubscription('topic/a', 'node-a');
      await schema.saveSubscription('topic/b', 'node-a');
      await schema.saveSubscription('topic/c', 'node-b');
      const countA = await schema.countSubscriptions('node-a');
      const countB = await schema.countSubscriptions('node-b');
      expect(countA).toBe(2);
      expect(countB).toBe(1);
    });
  });

  describe('getMessages with topic filter', () => {
    test('should filter messages by topic', async () => {
      for (const topic of ['sensors/temp', 'sensors/humidity', 'alerts/high']) {
        await schema.savePublishedMessage({
          type: 'publish',
          messageId: `msg_${topic.replace('/', '_')}`,
          topic,
          payload: {},
          sender: 'node-a',
          timestamp: Date.now(),
          ttl: null,
        });
      }
      const { messages, total } = await schema.getMessages({ type: 'publish', topic: 'sensors/temp' });
      expect(total).toBe(1);
      expect((messages[0] as { topic: string }).topic).toBe('sensors/temp');
    });
  });

  describe('getMessages with limit and offset', () => {
    test('should respect limit when fetching messages', async () => {
      for (let i = 0; i < 10; i++) {
        await schema.savePublishedMessage({
          type: 'publish',
          messageId: `msg_lim_${i}`,
          topic: 'test',
          payload: { i },
          sender: 'node-a',
          timestamp: Date.now() + i,
          ttl: null,
        });
      }
      const { messages, total } = await schema.getMessages({ type: 'publish', limit: 3 });
      expect(total).toBe(10);
      expect(messages).toHaveLength(3);
    });

    test('should respect offset when fetching messages', async () => {
      for (let i = 0; i < 5; i++) {
        await schema.savePublishedMessage({
          type: 'publish',
          messageId: `msg_off_${i}`,
          topic: 'test',
          payload: { i },
          sender: 'node-a',
          timestamp: Date.now() + i,
          ttl: null,
        });
      }
      const { messages, total } = await schema.getMessages({ type: 'publish', offset: 3, limit: 50 });
      expect(total).toBe(5);
      expect(messages).toHaveLength(2);
    });
  });

  describe('database getSize', () => {
    test('should return a positive size after storing data', async () => {
      await db.put('size:test', { data: 'hello world' });
      const size = await db.getSize();
      expect(size).toBeGreaterThan(0);
    });

    test('should return 0 for an empty database', async () => {
      const size = await db.getSize();
      expect(size).toBe(0);
    });
  });
});
