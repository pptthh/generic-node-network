import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, mkdirSync } from 'fs';
import { Database } from '../../lib/storage/database.js';
import { Schema } from '../../lib/storage/schema.js';
import type { PublishedMessage } from '../../lib/types/messages.js';

describe('Database', () => {
  let db: Database;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `gnn-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    db = new Database(testDir);
    await db.open();
  });

  afterEach(async () => {
    await db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should store and retrieve a value', async () => {
    const msg = { type: 'publish', topic: 'test', payload: { temp: 23.5 } };
    await db.put('test:key:123', msg);
    const retrieved = await db.get('test:key:123');
    expect(retrieved).toEqual(msg);
  });

  it('should delete a key', async () => {
    await db.put('del:key', { value: 1 });
    await db.del('del:key');
    await expect(db.get('del:key')).rejects.toThrow();
  });

  it('should scan with prefix', async () => {
    await db.put('peer:a', { id: 'a' });
    await db.put('peer:b', { id: 'b' });
    await db.put('other:c', { id: 'c' });

    const peers = [];
    for await (const [key, val] of db.scan({ gte: 'peer:', lte: 'peer:\xff' })) {
      peers.push({ key, val });
    }
    expect(peers).toHaveLength(2);
    expect(peers.map(p => (p.val as { id: string }).id)).toContain('a');
    expect(peers.map(p => (p.val as { id: string }).id)).toContain('b');
  });

  it('should execute batch operations', async () => {
    await db.batch([
      { type: 'put', key: 'batch:1', value: { n: 1 } },
      { type: 'put', key: 'batch:2', value: { n: 2 } },
    ]);
    const v1 = await db.get('batch:1') as { n: number };
    const v2 = await db.get('batch:2') as { n: number };
    expect(v1.n).toBe(1);
    expect(v2.n).toBe(2);
  });

  it('should handle scan with limit', async () => {
    for (let i = 0; i < 10; i++) {
      await db.put(`item:${i.toString().padStart(3, '0')}`, { i });
    }
    const items = [];
    for await (const [, val] of db.scan({ gte: 'item:', lte: 'item:\xff', limit: 3 })) {
      items.push(val);
    }
    expect(items).toHaveLength(3);
  });
});

describe('Schema', () => {
  let db: Database;
  let schema: Schema;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `gnn-schema-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    db = new Database(testDir);
    await db.open();
    schema = new Schema(db);
  });

  afterEach(async () => {
    await db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should save and retrieve a published message', async () => {
    const msg: PublishedMessage = {
      type: 'publish',
      messageId: 'msg_test001',
      topic: 'sensor/temp',
      payload: { temp: 23.5 },
      sender: 'node-a',
      timestamp: 1715000000000,
      ttl: null,
    };
    await schema.savePublishedMessage(msg);

    const { messages } = await schema.getMessages({ type: 'publish' });
    expect(messages).toHaveLength(1);
    expect((messages[0] as PublishedMessage).messageId).toBe('msg_test001');
  });

  it('should count messages correctly', async () => {
    for (let i = 0; i < 5; i++) {
      await schema.savePublishedMessage({
        type: 'publish',
        messageId: `msg_${i}`,
        topic: 'test',
        payload: { i },
        sender: 'node-a',
        timestamp: Date.now() + i,
        ttl: null,
      });
    }
    expect(await schema.countMessages()).toBe(5);
  });

  it('should manage peer lifecycle', async () => {
    const peer = {
      peerId: 'Qmtest123',
      multiaddr: '/ip4/192.168.1.1/tcp/28111/p2p/Qmtest123',
      status: 'online' as const,
      lastSeen: Date.now(),
      discoveryMethod: 'mDNS' as const,
      metadata: { alias: 'test-node', apiPort: 25111 },
    };

    await schema.savePeer(peer);
    const retrieved = await schema.getPeer('Qmtest123');
    expect(retrieved?.peerId).toBe('Qmtest123');
    expect(retrieved?.status).toBe('online');
  });

  it('should manage subscriptions', async () => {
    await schema.saveSubscription('sensor/temp', 'node-a');
    await schema.saveSubscription('sensor/pressure', 'node-a');

    const topics = await schema.getSubscriptions('node-a');
    expect(topics).toContain('sensor/temp');
    expect(topics).toContain('sensor/pressure');
    expect(topics.length).toBe(2);
  });

  it('should remove subscriptions', async () => {
    await schema.saveSubscription('test/topic', 'node-a');
    await schema.removeSubscription('test/topic', 'node-a');

    const topics = await schema.getSubscriptions('node-a');
    expect(topics).not.toContain('test/topic');
  });

  it('should prune old messages', async () => {
    const oldTs = Date.now() - 30 * 24 * 60 * 60 * 1000 - 1000; // 30 days ago
    await schema.savePublishedMessage({
      type: 'publish',
      messageId: 'old_msg',
      topic: 'test',
      payload: {},
      sender: 'node-a',
      timestamp: oldTs,
      ttl: null,
    });

    await schema.savePublishedMessage({
      type: 'publish',
      messageId: 'new_msg',
      topic: 'test',
      payload: {},
      sender: 'node-a',
      timestamp: Date.now(),
      ttl: null,
    });

    const deleted = await schema.pruneOldMessages(28);
    expect(deleted).toBeGreaterThan(0);

    const { messages } = await schema.getMessages({ type: 'publish' });
    expect(messages.some(m => (m as PublishedMessage).messageId === 'new_msg')).toBe(true);
  });
});
