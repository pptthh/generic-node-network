import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  buildMessagePublishedEvent,
  buildPeerOnlineEvent,
  buildPeerOfflineEvent,
} from '../../lib/websocket/events.js';

describe('buildMessagePublishedEvent', () => {
  describe('happy path', () => {
    test('should return a message_published event with correct type', () => {
      const input = {
        messageId: 'msg_abc123',
        topic: 'sensor/temperature',
        payload: { temp: 22.5 },
        sender: 'node-a',
        timestamp: 1715000000000,
      };
      const event = buildMessagePublishedEvent(input);
      expect(event.type).toBe('message_published');
    });

    test('should embed all message fields in the event', () => {
      const input = {
        messageId: 'msg_abc123',
        topic: 'sensor/temperature',
        payload: { temp: 22.5, unit: 'celsius' },
        sender: 'node-a',
        timestamp: 1715000000000,
      };
      const event = buildMessagePublishedEvent(input);
      if (event.type !== 'message_published') throw new Error('unexpected type');
      expect(event.message.messageId).toBe('msg_abc123');
      expect(event.message.topic).toBe('sensor/temperature');
      expect(event.message.sender).toBe('node-a');
      expect(event.message.timestamp).toBe(1715000000000);
      expect(event.message.payload).toEqual({ temp: 22.5, unit: 'celsius' });
    });

    test('should set inner message type to publish', () => {
      const event = buildMessagePublishedEvent({
        messageId: 'msg_x',
        topic: 'test',
        payload: null,
        sender: 'node-b',
        timestamp: 0,
      });
      if (event.type !== 'message_published') throw new Error('unexpected type');
      expect(event.message.type).toBe('publish');
    });

    test('should accept null payload', () => {
      const event = buildMessagePublishedEvent({
        messageId: 'msg_null',
        topic: 'null/payload',
        payload: null,
        sender: 'node-c',
        timestamp: 1234567890,
      });
      if (event.type !== 'message_published') throw new Error('unexpected type');
      expect(event.message.payload).toBeNull();
    });

    test('should accept complex nested payload', () => {
      const payload = { a: { b: { c: [1, 2, 3] } } };
      const event = buildMessagePublishedEvent({
        messageId: 'msg_nested',
        topic: 'nested/data',
        payload,
        sender: 'node-d',
        timestamp: 9999999999999,
      });
      if (event.type !== 'message_published') throw new Error('unexpected type');
      expect(event.message.payload).toEqual(payload);
    });

    test('should accept zero timestamp', () => {
      const event = buildMessagePublishedEvent({
        messageId: 'msg_zero',
        topic: 'test',
        payload: {},
        sender: 'node-e',
        timestamp: 0,
      });
      if (event.type !== 'message_published') throw new Error('unexpected type');
      expect(event.message.timestamp).toBe(0);
    });
  });
});

describe('buildPeerOnlineEvent', () => {
  describe('happy path', () => {
    test('should return a peer_online event with correct type', () => {
      const event = buildPeerOnlineEvent('Qm123', '/ip4/127.0.0.1/tcp/28111/p2p/Qm123');
      expect(event.type).toBe('peer_online');
    });

    test('should include peerId and multiaddr', () => {
      const peerId = 'QmAbCdEf123456';
      const multiaddr = '/ip4/192.168.1.10/tcp/28111/p2p/QmAbCdEf123456';
      const event = buildPeerOnlineEvent(peerId, multiaddr);
      if (event.type !== 'peer_online') throw new Error('unexpected type');
      expect(event.peerId).toBe(peerId);
      expect(event.multiaddr).toBe(multiaddr);
    });

    test('should include an ISO timestamp string', () => {
      const before = new Date().toISOString();
      const event = buildPeerOnlineEvent('QmPeer1', '/ip4/0.0.0.0/tcp/28111');
      const after = new Date().toISOString();
      if (event.type !== 'peer_online') throw new Error('unexpected type');
      expect(event.timestamp >= before).toBe(true);
      expect(event.timestamp <= after).toBe(true);
    });

    test('should accept an empty multiaddr string', () => {
      const event = buildPeerOnlineEvent('QmPeer2', '');
      if (event.type !== 'peer_online') throw new Error('unexpected type');
      expect(event.multiaddr).toBe('');
    });
  });
});

describe('buildPeerOfflineEvent', () => {
  describe('happy path', () => {
    test('should return a peer_offline event with correct type', () => {
      const event = buildPeerOfflineEvent('Qm456');
      expect(event.type).toBe('peer_offline');
    });

    test('should include the peerId', () => {
      const peerId = 'QmOffline789';
      const event = buildPeerOfflineEvent(peerId);
      if (event.type !== 'peer_offline') throw new Error('unexpected type');
      expect(event.peerId).toBe(peerId);
    });

    test('should include an ISO timestamp string', () => {
      const before = new Date().toISOString();
      const event = buildPeerOfflineEvent('QmOffline999');
      const after = new Date().toISOString();
      if (event.type !== 'peer_offline') throw new Error('unexpected type');
      expect(event.timestamp >= before).toBe(true);
      expect(event.timestamp <= after).toBe(true);
    });

    test('should not include multiaddr field', () => {
      const event = buildPeerOfflineEvent('QmNoAddr');
      expect((event as Record<string, unknown>).multiaddr).toBeUndefined();
    });
  });
});
