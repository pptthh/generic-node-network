import { describe, expect, it, beforeEach } from 'vitest';
import { ConnectionPool } from '../../lib/p2p/connection/pool.js';
import type { ConnectionPoolingConfig } from '../../lib/types/config.js';

const testConfig: ConnectionPoolingConfig = {
  enabled: true,
  maxPoolSize: 5,
  reuseThreshold: 3,
  idleTimeout: 5000,
  connectionTTL: 60000,
};

describe('ConnectionPool', () => {
  let pool: ConnectionPool;

  beforeEach(() => {
    pool = new ConnectionPool(testConfig);
    pool.start();
  });

  it('should add and retrieve connections', () => {
    pool.addConnection('peer-1', 'tcp', 10);
    pool.addConnection('peer-2', 'ws', 20);

    const conn = pool.getConnection('peer-1');
    expect(conn).toBeDefined();
    expect(conn!.peerId).toBe('peer-1');
    expect(conn!.transportType).toBe('tcp');
    expect(conn!.latency).toBe(10);
  });

  it('should return null for non-existent peer', () => {
    const conn = pool.getConnection('non-existent');
    expect(conn).toBeNull();
  });

  it('should respect max pool size', () => {
    for (let i = 0; i < 10; i++) {
      pool.addConnection(`peer-${i}`, 'tcp', i);
    }

    // Should have evicted oldest to stay at maxPoolSize
    expect(pool.getTotalConnections()).toBeLessThanOrEqual(testConfig.maxPoolSize);
  });

  it('should not return connections exceeding reuse threshold', () => {
    pool.addConnection('peer-1', 'tcp', 10);

    // Increment streams past threshold
    for (let i = 0; i < testConfig.reuseThreshold; i++) {
      pool.incrementStreams('peer-1');
    }

    // Should not return the connection since it's at capacity
    const conn = pool.getConnection('peer-1');
    expect(conn).toBeNull();
  });

  it('should mark connections unhealthy', () => {
    pool.addConnection('peer-1', 'tcp', 10);
    pool.markUnhealthy('peer-1');

    const conn = pool.getConnection('peer-1');
    expect(conn).toBeNull();
  });

  it('should remove peer connections', () => {
    pool.addConnection('peer-1', 'tcp', 10);
    pool.removePeer('peer-1');

    expect(pool.getConnection('peer-1')).toBeNull();
    expect(pool.getPeerCount()).toBe(0);
  });

  it('should track peer count', () => {
    pool.addConnection('peer-1', 'tcp');
    pool.addConnection('peer-2', 'ws');
    pool.addConnection('peer-3', 'tcp');

    expect(pool.getPeerCount()).toBe(3);
    expect(pool.getTotalConnections()).toBe(3);
  });

  it('should provide pool statistics', () => {
    pool.addConnection('peer-1', 'tcp', 10);
    pool.addConnection('peer-2', 'ws', 20);
    pool.addConnection('peer-3', 'tcp', 30);

    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(3);
    expect(stats.peerCount).toBe(3);
    expect(stats.healthyConnections).toBe(3);
    expect(stats.avgLatency).toBe(20);
  });

  it('should clean up idle connections', () => {
    // Create a pool with very short idle timeout
    const shortPool = new ConnectionPool({
      ...testConfig,
      idleTimeout: 1, // 1ms
    });
    shortPool.start();

    shortPool.addConnection('peer-1', 'tcp', 10);

    // Wait a bit and cleanup
    setTimeout(() => {
      shortPool.cleanup();
      expect(shortPool.getTotalConnections()).toBe(0);
      shortPool.stop();
    }, 10);
  });

  it('should stop cleanly', () => {
    pool.addConnection('peer-1', 'tcp');
    pool.stop();

    expect(pool.getTotalConnections()).toBe(0);
  });
});
