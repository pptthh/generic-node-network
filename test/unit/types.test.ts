import { describe, it, expect } from 'vitest';
import {
  PublishedMessageSchema,
  QueryMessageSchema,
  ResponseMessageSchema,
} from '../../lib/types/messages.js';
import { PeerSchema } from '../../lib/types/peers.js';

describe('Message type schemas', () => {
  it('should parse a valid published message', () => {
    const msg = {
      type: 'publish',
      messageId: 'msg_abc123',
      topic: 'sensor/temperature',
      payload: { temp: 23.5 },
      sender: 'node-a',
      timestamp: 1715000000000,
      ttl: null,
    };
    expect(() => PublishedMessageSchema.parse(msg)).not.toThrow();
  });

  it('should reject published message with wrong type', () => {
    const msg = {
      type: 'query', // wrong type
      messageId: 'msg_abc123',
      topic: 'test',
      payload: {},
      sender: 'node-a',
      timestamp: Date.now(),
    };
    expect(() => PublishedMessageSchema.parse(msg)).toThrow();
  });

  it('should parse a valid query message', () => {
    const query = {
      type: 'query',
      queryId: 'qry_def456',
      target: 'node-b',
      request: { action: 'get_state', params: {} },
      sender: 'node-a',
      timestamp: 1715000000000,
      timeout: 100,
    };
    expect(() => QueryMessageSchema.parse(query)).not.toThrow();
  });

  it('should parse a valid response message', () => {
    const response = {
      type: 'response',
      queryId: 'qry_def456',
      status: 'success',
      response: { uptime: 3600 },
      sender: 'node-b',
      timestamp: 1715000000100,
    };
    expect(() => ResponseMessageSchema.parse(response)).not.toThrow();
  });

  it('should parse a valid peer', () => {
    const peer = {
      peerId: 'Qm5aX7Nabc123',
      multiaddr: '/ip4/192.168.1.101/tcp/28111/p2p/Qm5aX7Nabc123',
      status: 'online',
      lastSeen: Date.now(),
      discoveryMethod: 'mDNS',
      metadata: { alias: 'node-b', apiPort: 25112 },
    };
    expect(() => PeerSchema.parse(peer)).not.toThrow();
  });

  it('should reject peer with invalid status', () => {
    const peer = {
      peerId: 'Qm5aX7Nabc123',
      multiaddr: '/ip4/192.168.1.101/tcp/28111/p2p/Qm5aX7Nabc123',
      status: 'unknown', // invalid
      lastSeen: Date.now(),
      discoveryMethod: 'mDNS',
    };
    expect(() => PeerSchema.parse(peer)).toThrow();
  });
});
