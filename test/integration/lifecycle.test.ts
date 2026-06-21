import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { GracefulShutdownManager } from '../../lib/lifecycle/shutdown.js';
import { HealthChecker } from '../../lib/lifecycle/health.js';
import type { ShutdownConfig } from '../../lib/types/config.js';

// ---------------------------------------------------------------------------
// Helper: mock ServerResponse
// ---------------------------------------------------------------------------
function mockResponse() {
  const chunks: Buffer[] = [];
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string | number>,
    writeHead(status: number, headers?: Record<string, string | number>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(body?: string | Buffer) {
      if (body) chunks.push(typeof body === 'string' ? Buffer.from(body) : body);
    },
    getBody() {
      return Buffer.concat(chunks).toString('utf-8');
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// GracefulShutdownManager
// ---------------------------------------------------------------------------
describe('GracefulShutdownManager', () => {
  it('calls cleanup steps in correct order', async () => {
    const order: string[] = [];

    const mgr = new GracefulShutdownManager({
      stopBackgroundServices: async () => { order.push('bg'); },
      closeApiServer: async () => { order.push('api'); },
      closeMetricsServer: async () => { order.push('metrics'); },
      flushMessageQueue: async () => { order.push('queue'); },
      closeP2PConnections: async () => { order.push('p2p'); },
      persistState: async () => { order.push('state'); },
      closeDatabase: async () => { order.push('db'); },
    }, {
      gracefulTimeout: 5000,
      timeoutAction: 'log_only',
      signalHandlers: false,
      cleanupSteps: ['flush_in_memory_queues', 'close_connections', 'persist_state', 'close_database'],
    });

    await mgr.shutdown('test');

    expect(order).toEqual(['bg', 'api', 'metrics', 'queue', 'p2p', 'state', 'db']);
  });

  it('continues through a failing step without throwing', async () => {
    const completed: string[] = [];

    const mgr = new GracefulShutdownManager({
      flushMessageQueue: async () => { throw new Error('flush failed'); },
      closeDatabase: async () => { completed.push('db'); },
    }, {
      gracefulTimeout: 5000,
      timeoutAction: 'log_only',
      signalHandlers: false,
      cleanupSteps: ['flush_in_memory_queues', 'close_database'],
    });

    // Should not throw — individual step failures are warned but swallowed
    await expect(mgr.shutdown('test')).resolves.toBeUndefined();
    expect(completed).toContain('db');
  });

  it('only runs steps listed in cleanupSteps', async () => {
    const called: string[] = [];

    const mgr = new GracefulShutdownManager({
      flushMessageQueue: async () => { called.push('queue'); },
      closeP2PConnections: async () => { called.push('p2p'); },
      persistState: async () => { called.push('state'); },
      closeDatabase: async () => { called.push('db'); },
    }, {
      gracefulTimeout: 5000,
      timeoutAction: 'log_only',
      signalHandlers: false,
      // Deliberately omit persist_state and flush_in_memory_queues
      cleanupSteps: ['close_connections', 'close_database'],
    });

    await mgr.shutdown('test');

    expect(called).toContain('p2p');
    expect(called).toContain('db');
    expect(called).not.toContain('queue');
    expect(called).not.toContain('state');
  });

  it('ignores duplicate shutdown calls', async () => {
    let calls = 0;
    const mgr = new GracefulShutdownManager({
      closeDatabase: async () => { calls++; },
    }, {
      gracefulTimeout: 5000,
      timeoutAction: 'log_only',
      signalHandlers: false,
      cleanupSteps: ['close_database'],
    });

    await mgr.shutdown('test');
    await mgr.shutdown('test'); // duplicate

    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// HealthChecker - liveness
// ---------------------------------------------------------------------------
describe('HealthChecker - liveness', () => {
  const config = {
    enabled: true,
    interval: 10000,
    liveness: { enabled: true, path: '/healthz' },
    readiness: { enabled: true, path: '/readyz' },
  };

  const providers = {
    checkP2P: () => ({ healthy: true, details: { peerCount: 3 } }),
    checkDatabase: () => ({ healthy: true }),
    checkMemory: () => ({ healthy: true }),
    checkPeers: () => ({ healthy: true }),
  };

  it('returns 200 for /healthz', async () => {
    const checker = new HealthChecker(config, providers);
    const res = mockResponse();
    await checker.handleLiveness(res as unknown as ServerResponse);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.getBody());
    expect(body.status).toBe('healthy');
    expect(typeof body.uptime).toBe('number');
  });

  it('routes /healthz via handle()', async () => {
    const checker = new HealthChecker(config, providers);
    const req = { method: 'GET', url: '/healthz' } as IncomingMessage;
    const res = mockResponse();
    const handled = await checker.handle(req, res as unknown as ServerResponse);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('does not handle unknown paths', async () => {
    const checker = new HealthChecker(config, providers);
    const req = { method: 'GET', url: '/unknown' } as IncomingMessage;
    const res = mockResponse();
    const handled = await checker.handle(req, res as unknown as ServerResponse);
    expect(handled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HealthChecker - readiness
// ---------------------------------------------------------------------------
describe('HealthChecker - readiness', () => {
  const config = {
    enabled: true,
    interval: 10000,
    liveness: { enabled: true, path: '/healthz' },
    readiness: { enabled: true, path: '/readyz' },
  };

  it('returns 200 when all checks pass', async () => {
    const checker = new HealthChecker(config, {
      checkP2P: () => ({ healthy: true, details: { peerCount: 5 } }),
      checkDatabase: () => ({ healthy: true }),
      checkMemory: () => ({ healthy: true }),
      checkPeers: () => ({ healthy: true }),
    });
    const res = mockResponse();
    await checker.handleReadiness(res as unknown as ServerResponse);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.getBody());
    expect(body.status).toBe('ready');
  });

  it('returns 503 when any check fails', async () => {
    const checker = new HealthChecker(config, {
      checkP2P: () => ({ healthy: false, error: 'no peers' }),
      checkDatabase: () => ({ healthy: true }),
      checkMemory: () => ({ healthy: true }),
      checkPeers: () => ({ healthy: false }),
    });
    const res = mockResponse();
    await checker.handleReadiness(res as unknown as ServerResponse);
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.getBody());
    expect(body.status).toBe('not_ready');
    expect(body.checks.p2p.healthy).toBe(false);
  });

  it('routes /readyz via handle()', async () => {
    const checker = new HealthChecker(config, {
      checkP2P: () => ({ healthy: true }),
      checkDatabase: () => ({ healthy: true }),
      checkMemory: () => ({ healthy: true }),
      checkPeers: () => ({ healthy: true }),
    });
    const req = { method: 'GET', url: '/readyz' } as IncomingMessage;
    const res = mockResponse();
    const handled = await checker.handle(req, res as unknown as ServerResponse);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('catches thrown check errors and reports unhealthy', async () => {
    const checker = new HealthChecker(config, {
      checkP2P: () => ({ healthy: true }),
      checkDatabase: () => { throw new Error('DB exploded'); },
      checkMemory: () => ({ healthy: true }),
      checkPeers: () => ({ healthy: true }),
    });
    const res = mockResponse();
    await checker.handleReadiness(res as unknown as ServerResponse);
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.getBody());
    expect(body.checks.database.healthy).toBe(false);
    expect(body.checks.database.error).toContain('DB exploded');
  });
});

// ---------------------------------------------------------------------------
// HealthChecker.memoryCheck (static)
// ---------------------------------------------------------------------------
describe('HealthChecker.memoryCheck', () => {
  it('returns healthy when heap is not near limit', () => {
    const result = HealthChecker.memoryCheck();
    expect(result.healthy).toBe(true);
    expect(result.details?.heapUsedMB).toBeGreaterThan(0);
    expect(result.details?.heapUsedPercent).toBeGreaterThan(0);
    expect(result.details?.heapUsedPercent).toBeLessThan(100);
  });
});
