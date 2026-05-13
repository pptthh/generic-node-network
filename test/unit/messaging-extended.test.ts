import { describe, test, expect } from 'vitest';
import {
  encodeMessage,
  decodeQueryMessage,
  decodeResponseMessage,
} from '../../lib/p2p/messaging.js';
import type { QueryMessage, ResponseMessage } from '../../lib/types/messages.js';

describe('decodeQueryMessage', () => {
  describe('happy path', () => {
    test('should decode a valid encoded query message', () => {
      const query: QueryMessage = {
        type: 'query',
        queryId: 'qry_001',
        target: 'node-b',
        request: { action: 'get_status', params: {} },
        sender: 'node-a',
        timestamp: 1715000000000,
        timeout: 100,
      };
      const encoded = encodeMessage(query);
      const decoded = decodeQueryMessage(encoded);
      expect(decoded.queryId).toBe('qry_001');
      expect(decoded.type).toBe('query');
      expect(decoded.sender).toBe('node-a');
      expect(decoded.request.action).toBe('get_status');
    });

    test('should decode a query message without optional fields', () => {
      const query: QueryMessage = {
        type: 'query',
        queryId: 'qry_min',
        request: { action: 'ping' },
        sender: 'node-x',
        timestamp: 0,
      };
      const encoded = encodeMessage(query);
      const decoded = decodeQueryMessage(encoded);
      expect(decoded.queryId).toBe('qry_min');
      expect(decoded.target).toBeUndefined();
      expect(decoded.timeout).toBeUndefined();
    });

    test('should preserve request params', () => {
      const query: QueryMessage = {
        type: 'query',
        queryId: 'qry_params',
        request: { action: 'get_messages', params: { topic: 'sensors', limit: 10 } },
        sender: 'node-z',
        timestamp: 9999999999999,
      };
      const encoded = encodeMessage(query);
      const decoded = decodeQueryMessage(encoded);
      expect(decoded.request.params?.topic).toBe('sensors');
      expect(decoded.request.params?.limit).toBe(10);
    });
  });

  describe('error cases', () => {
    test('should throw for invalid query data (wrong type)', () => {
      const bad = { type: 'publish', messageId: 'x', topic: 't', payload: {}, sender: 's', timestamp: 0 };
      const encoded = new TextEncoder().encode(JSON.stringify(bad));
      expect(() => decodeQueryMessage(encoded)).toThrow();
    });
  });
});

describe('decodeResponseMessage', () => {
  describe('happy path', () => {
    test('should decode a valid encoded response message', () => {
      const response: ResponseMessage = {
        type: 'response',
        queryId: 'qry_001',
        status: 'success',
        response: { uptime: 3600 },
        sender: 'node-b',
        timestamp: 1715000000100,
      };
      const encoded = encodeMessage(response);
      const decoded = decodeResponseMessage(encoded);
      expect(decoded.queryId).toBe('qry_001');
      expect(decoded.type).toBe('response');
      expect(decoded.status).toBe('success');
      expect(decoded.sender).toBe('node-b');
    });

    test('should decode a response with error status', () => {
      const response: ResponseMessage = {
        type: 'response',
        queryId: 'qry_err',
        status: 'error',
        error: 'node not found',
        sender: 'node-c',
        timestamp: 1715000000200,
      };
      const encoded = encodeMessage(response);
      const decoded = decodeResponseMessage(encoded);
      expect(decoded.status).toBe('error');
      expect(decoded.error).toBe('node not found');
    });

    test('should decode a response with timeout status', () => {
      const response: ResponseMessage = {
        type: 'response',
        queryId: 'qry_timeout',
        status: 'timeout',
        sender: 'node-d',
        timestamp: 1715000000300,
      };
      const encoded = encodeMessage(response);
      const decoded = decodeResponseMessage(encoded);
      expect(decoded.status).toBe('timeout');
    });

    test('should decode a response message without optional response field', () => {
      const response: ResponseMessage = {
        type: 'response',
        queryId: 'qry_nodata',
        status: 'success',
        sender: 'node-e',
        timestamp: 1715000000400,
      };
      const encoded = encodeMessage(response);
      const decoded = decodeResponseMessage(encoded);
      expect(decoded.response).toBeUndefined();
    });
  });

  describe('error cases', () => {
    test('should throw for invalid response data (wrong type)', () => {
      const bad = { type: 'query', queryId: 'q', request: { action: 'x' }, sender: 's', timestamp: 0 };
      const encoded = new TextEncoder().encode(JSON.stringify(bad));
      expect(() => decodeResponseMessage(encoded)).toThrow();
    });

    test('should throw for a response with invalid status value', () => {
      const bad = { type: 'response', queryId: 'q', status: 'pending', sender: 's', timestamp: 0 };
      const encoded = new TextEncoder().encode(JSON.stringify(bad));
      expect(() => decodeResponseMessage(encoded)).toThrow();
    });
  });
});
