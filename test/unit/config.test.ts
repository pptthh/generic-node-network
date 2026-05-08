import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDefaults } from '../../lib/config/defaults.js';
import { validateConfig } from '../../lib/config/validator.js';

describe('Config defaults', () => {
  it('should return valid default values', () => {
    const defaults = getDefaults();
    expect(defaults.apiPort).toBe(25111);
    expect(defaults.p2pPort).toBe(28111);
    expect(defaults.logging.level).toBe('error');
    expect(defaults.message.retentionDays).toBe(28);
    expect(defaults.message.maxPayloadSize).toBe(31744);
    expect(defaults.timeouts.queryMs).toBe(100);
    expect(defaults.timeouts.broadcastMs).toBe(1000);
    expect(defaults.discovery.mdnsEnabled).toBe(true);
    expect(defaults.discovery.dhtEnabled).toBe(true);
  });
});

describe('Config validator', () => {
  it('should validate a valid config', () => {
    const config = {
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
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should reject config with short token', () => {
    const config = {
      nodeId: 'test-node',
      apiToken: 'short',
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
    };
    expect(() => validateConfig(config)).toThrow();
  });

  it('should reject invalid port numbers', () => {
    const config = {
      nodeId: 'test-node',
      apiToken: 'token_' + 'a'.repeat(32),
      apiPort: 80, // below 1024
      p2pPort: 28111,
      bootstrapPeers: [],
      configFile: './gnn-conf-test.json',
      dbPath: './gnn-data-test',
      logging: { level: 'error', file: null, maxSizeKB: 100, retentionDays: 1 },
      message: { retentionDays: 28, maxPayloadSize: 31744 },
      peer: { ttlDays: 14, autoCleanupInterval: '24h' },
      timeouts: { queryMs: 100, broadcastMs: 1000, peerCheckIntervalSec: 30 },
      discovery: { mdnsEnabled: true, dhtEnabled: true },
    };
    expect(() => validateConfig(config)).toThrow();
  });
});
