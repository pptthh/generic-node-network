import { describe, test, expect } from 'vitest';
import { nowIso, nowMs, uptimeSeconds } from '../../lib/utils/time.js';
import { isValidNodeId } from '../../lib/utils/validation.js';
import { getDefaults } from '../../lib/config/defaults.js';

describe('time utilities', () => {
  describe('nowIso', () => {
    test('should return a valid ISO 8601 string', () => {
      const result = nowIso();
      expect(() => new Date(result)).not.toThrow();
      expect(new Date(result).toISOString()).toBe(result);
    });

    test('should return a string close to the current time', () => {
      const before = Date.now();
      const result = nowIso();
      const after = Date.now();
      const ts = new Date(result).getTime();
      expect(ts >= before).toBe(true);
      expect(ts <= after).toBe(true);
    });
  });

  describe('nowMs', () => {
    test('should return a number', () => {
      expect(typeof nowMs()).toBe('number');
    });

    test('should return a value close to Date.now()', () => {
      const before = Date.now();
      const result = nowMs();
      const after = Date.now();
      expect(result >= before).toBe(true);
      expect(result <= after).toBe(true);
    });
  });

  describe('uptimeSeconds', () => {
    test('should return 0 for a startedAt equal to now', () => {
      const now = Date.now();
      const result = uptimeSeconds(now);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    test('should return correct uptime for a known past start time', () => {
      const fiveSecondsAgo = Date.now() - 5000;
      const result = uptimeSeconds(fiveSecondsAgo);
      expect(result).toBeGreaterThanOrEqual(4);
      expect(result).toBeLessThanOrEqual(6);
    });

    test('should return a whole number (floored)', () => {
      const startedAt = Date.now() - 1500;
      const result = uptimeSeconds(startedAt);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBe(1);
    });

    test('should return large uptime for an old start time', () => {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const result = uptimeSeconds(oneDayAgo);
      expect(result).toBeGreaterThanOrEqual(86399);
      expect(result).toBeLessThanOrEqual(86401);
    });
  });
});

describe('isValidNodeId', () => {
  describe('valid node IDs', () => {
    test('should accept alphanumeric node IDs', () => {
      expect(isValidNodeId('node1')).toBe(true);
      expect(isValidNodeId('NodeABC')).toBe(true);
      expect(isValidNodeId('abc123')).toBe(true);
    });

    test('should accept node IDs with hyphens', () => {
      expect(isValidNodeId('node-a')).toBe(true);
      expect(isValidNodeId('my-node-1')).toBe(true);
    });

    test('should accept node IDs with underscores', () => {
      expect(isValidNodeId('node_a')).toBe(true);
      expect(isValidNodeId('my_node_1')).toBe(true);
    });

    test('should accept a single character node ID', () => {
      expect(isValidNodeId('a')).toBe(true);
    });
  });

  describe('invalid node IDs', () => {
    test('should reject node IDs with spaces', () => {
      expect(isValidNodeId('node a')).toBe(false);
      expect(isValidNodeId(' node')).toBe(false);
    });

    test('should reject node IDs with special characters', () => {
      expect(isValidNodeId('node@1')).toBe(false);
      expect(isValidNodeId('node.1')).toBe(false);
      expect(isValidNodeId('node/1')).toBe(false);
    });

    test('should reject an empty string', () => {
      expect(isValidNodeId('')).toBe(false);
    });

    test('should reject node IDs with unicode characters', () => {
      expect(isValidNodeId('nóde')).toBe(false);
    });
  });
});

describe('getDefaults with nodeId', () => {
  test('should produce port offset when nodeId is provided', () => {
    const defaultsWithId = getDefaults('node-a');
    const defaultsNoId = getDefaults();
    // With a nodeId, ports may differ from the base 25111 / 28111
    expect(typeof defaultsWithId.apiPort).toBe('number');
    expect(typeof defaultsWithId.p2pPort).toBe('number');
    expect(defaultsWithId.apiPort).toBeGreaterThanOrEqual(25111);
    expect(defaultsWithId.apiPort).toBeLessThanOrEqual(26011); // 25111 + 900
    expect(defaultsWithId.p2pPort).toBeGreaterThanOrEqual(28111);
    expect(defaultsWithId.p2pPort).toBeLessThanOrEqual(29011);
    // Without nodeId offset is 0, so ports are baseline
    expect(defaultsNoId.apiPort).toBe(25111);
    expect(defaultsNoId.p2pPort).toBe(28111);
  });

  test('should produce deterministic offsets for the same nodeId', () => {
    const a = getDefaults('my-node');
    const b = getDefaults('my-node');
    expect(a.apiPort).toBe(b.apiPort);
    expect(a.p2pPort).toBe(b.p2pPort);
  });

  test('should produce different offsets for different nodeIds', () => {
    const a = getDefaults('node-alpha');
    const b = getDefaults('node-beta');
    // Very likely different (hash collision is unlikely for these)
    expect(a.apiPort !== b.apiPort || a.p2pPort !== b.p2pPort).toBe(true);
  });

  test('should keep all non-port defaults unchanged regardless of nodeId', () => {
    const d = getDefaults('some-node');
    expect(d.logging.level).toBe('error');
    expect(d.message.retentionDays).toBe(28);
    expect(d.message.maxPayloadSize).toBe(31744);
    expect(d.timeouts.queryMs).toBe(100);
    expect(d.timeouts.broadcastMs).toBe(1000);
    expect(d.discovery.mdnsEnabled).toBe(true);
    expect(d.discovery.dhtEnabled).toBe(true);
  });
});
