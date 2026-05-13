import type { PublishedMessage, QueryMessage, ResponseMessage } from '../types/messages.js';
import type { Peer } from '../types/peers.js';
import type { Database } from './database.js';

export class Schema {
  constructor(private readonly db: Database) {}

  // Message operations
  async savePublishedMessage(msg: PublishedMessage): Promise<void> {
    const key = `message:published:${msg.timestamp}:${msg.messageId}`;
    await this.db.put(key, msg);
  }

  async saveQueryMessage(query: QueryMessage): Promise<void> {
    const key = `message:query:${query.timestamp}:${query.queryId}`;
    await this.db.put(key, query);
  }

  async saveResponseMessage(res: ResponseMessage): Promise<void> {
    const key = `message:response:${res.timestamp}:${res.queryId}`;
    await this.db.put(key, res);
  }

  async getMessages(options: {
    type?: 'publish' | 'query' | 'response';
    topic?: string;
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
  } = {}): Promise<{ messages: unknown[]; total: number }> {
    const { type, topic, limit = 50, offset = 0, order = 'desc' } = options;

    const prefix = type === 'query' ? 'message:query:'
      : type === 'response' ? 'message:response:'
      : 'message:published:';

    const all: unknown[] = [];
    for await (const [, val] of this.db.scan({
      gte: prefix,
      lte: prefix + '\xff',
      reverse: order === 'desc',
    })) {
      const msg = val as Record<string, unknown>;
      if (topic && msg.topic !== topic) continue;
      all.push(val);
    }

    const total = all.length;
    const messages = all.slice(offset, offset + limit);
    return { messages, total };
  }

  async countMessages(): Promise<number> {
    let count = 0;
    for await (const [key] of this.db.scan({ gte: 'message:', lte: 'message:\xff' })) {
      if ((key as string).startsWith('message:published:') ||
          (key as string).startsWith('message:query:') ||
          (key as string).startsWith('message:response:')) {
        count++;
      }
    }
    return count;
  }

  async pruneOldMessages(retentionDays: number): Promise<number> {
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;
    const toDelete: string[] = [];

    for (const prefix of ['message:published:', 'message:query:', 'message:response:']) {
      for await (const [key] of this.db.scan({
        gte: prefix + '0',
        lte: `${prefix}${cutoffTime}:`,
      })) {
        toDelete.push(key as string);
      }
    }

    if (toDelete.length > 0) {
      await this.db.batch(toDelete.map(key => ({ type: 'del' as const, key })));
    }
    return toDelete.length;
  }

  // Peer operations
  async savePeer(peer: Peer): Promise<void> {
    await this.db.put(`peer:${peer.peerId}`, peer);
    await this.db.put(`peer:byaddr:${peer.multiaddr}`, peer.peerId);
  }

  async getPeer(peerId: string): Promise<Peer | null> {
    try {
      return await this.db.get(`peer:${peerId}`) as Peer;
    } catch {
      return null;
    }
  }

  async getAllPeers(status?: 'online' | 'offline'): Promise<Peer[]> {
    const peers: Peer[] = [];
    for await (const [key, val] of this.db.scan({ gte: 'peer:', lte: 'peer:\xff' })) {
      if ((key as string).startsWith('peer:byaddr:')) continue;
      const peer = val as Peer;
      if (!status || peer.status === status) {
        peers.push(peer);
      }
    }
    return peers;
  }

  async deleteStalePeers(ttlDays: number): Promise<number> {
    const cutoffTime = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
    const peers = await this.getAllPeers('offline');
    const toDelete: string[] = [];

    for (const peer of peers) {
      if (peer.lastSeen < cutoffTime) {
        toDelete.push(`peer:${peer.peerId}`);
        toDelete.push(`peer:byaddr:${peer.multiaddr}`);
      }
    }

    if (toDelete.length > 0) {
      await this.db.batch(toDelete.map(key => ({ type: 'del' as const, key })));
    }
    return toDelete.length / 2;
  }

  // Subscription operations
  async saveSubscription(topic: string, nodeId: string): Promise<void> {
    await this.db.put(`subscription:${topic}:${nodeId}`, {
      topic,
      nodeId,
      subscribedAt: Date.now(),
    });
  }

  async removeSubscription(topic: string, nodeId: string): Promise<void> {
    await this.db.del(`subscription:${topic}:${nodeId}`);
  }

  async getSubscriptions(nodeId: string): Promise<string[]> {
    const topics: string[] = [];
    for await (const [key] of this.db.scan({ gte: 'subscription:', lte: 'subscription:\xff' })) {
      const parts = (key as string).split(':');
      if (parts[parts.length - 1] === nodeId) {
        topics.push(parts.slice(1, -1).join(':'));
      }
    }
    return topics;
  }

  async countSubscriptions(nodeId: string): Promise<number> {
    return (await this.getSubscriptions(nodeId)).length;
  }

  // Config operations
  async getConfig(key: string): Promise<unknown> {
    try {
      return await this.db.get(`config:${key}`);
    } catch {
      return null;
    }
  }

  async setConfig(key: string, value: unknown): Promise<void> {
    await this.db.put(`config:${key}`, value);
  }

  // State operations
  async getState(key: string): Promise<unknown> {
    try {
      return await this.db.get(`state:${key}`);
    } catch {
      return null;
    }
  }

  async setState(key: string, value: unknown): Promise<void> {
    await this.db.put(`state:${key}`, value);
  }
}
