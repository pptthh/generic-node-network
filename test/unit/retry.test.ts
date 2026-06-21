import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryManager } from '../../lib/retry/manager.js';
import { CircuitBreaker, CircuitBreakerRegistry } from '../../lib/retry/circuit-breaker.js';
import { AdaptiveRetryManager, SmartRetryFacade } from '../../lib/retry/adaptive.js';
import type { RetryLogicConfig } from '../../lib/types/config.js';

// ---------------------------------------------------------------------------
// RetryManager
// ---------------------------------------------------------------------------
describe('RetryManager', () => {
  it('should succeed on first attempt without retrying', async () => {
    const mgr = new RetryManager();
    let calls = 0;
    const result = await mgr.retryWithBackoff(async () => {
      calls++;
      return 'ok';
    }, 3);
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('should retry and succeed on the Nth attempt', async () => {
    const mgr = new RetryManager({ jitter: false });
    let attempts = 0;
    const result = await mgr.retryWithBackoff(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Not ready');
      return 'success';
    }, 5, 1);
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw after maxRetries are exhausted', async () => {
    const mgr = new RetryManager({ jitter: false });
    let attempts = 0;
    await expect(
      mgr.retryWithBackoff(async () => {
        attempts++;
        throw new Error('always fails');
      }, 2, 1),
    ).rejects.toThrow('always fails');
    expect(attempts).toBe(3); // initial + 2 retries
  });

  it('should calculate exponential backoff correctly', () => {
    const mgr = new RetryManager({ jitter: false, multiplier: 2, maxDelayMs: 30000 });
    expect(mgr.calculateBackoffDelay(0, 100)).toBe(100);
    expect(mgr.calculateBackoffDelay(1, 100)).toBe(200);
    expect(mgr.calculateBackoffDelay(2, 100)).toBe(400);
    expect(mgr.calculateBackoffDelay(3, 100)).toBe(800);
  });

  it('should cap delay at maxDelayMs', () => {
    const mgr = new RetryManager({ jitter: false, multiplier: 2, maxDelayMs: 500 });
    expect(mgr.calculateBackoffDelay(10, 100)).toBe(500);
  });

  it('should apply jitter that stays within the jitterFactor range', () => {
    const mgr = new RetryManager({ jitter: true, jitterFactor: 0.1, multiplier: 2 });
    const base = 100;
    for (let i = 0; i < 50; i++) {
      const delay = mgr.calculateBackoffDelay(0, base);
      expect(delay).toBeGreaterThanOrEqual(Math.floor(base * 0.9));
      expect(delay).toBeLessThanOrEqual(Math.ceil(base * 1.1));
    }
  });

  it('should reject with timeout error when operation takes too long', async () => {
    const mgr = new RetryManager({ jitter: false });
    await expect(
      mgr.retryWithTimeout(
        () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('late')), 500)),
        0,
        50,
      ),
    ).rejects.toThrow(/timed out/i);
  });
});

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------
describe('CircuitBreaker', () => {
  it('starts CLOSED and allows requests', async () => {
    const cb = new CircuitBreaker('peer-1');
    expect(cb.state).toBe('CLOSED');
    expect(cb.isAllowed()).toBe(true);
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
  });

  it('opens circuit after failureThreshold failures', async () => {
    const cb = new CircuitBreaker('peer-2', { failureThreshold: 3, successThreshold: 2, timeout: 60000 });
    for (let i = 0; i < 3; i++) {
      try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
    }
    expect(cb.state).toBe('OPEN');
  });

  it('rejects requests immediately when OPEN', async () => {
    const cb = new CircuitBreaker('peer-3', { failureThreshold: 1, timeout: 60000 });
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
    expect(cb.state).toBe('OPEN');
    await expect(cb.execute(async () => 'ok')).rejects.toThrow(/OPEN/);
  });

  it('transitions to HALF_OPEN after timeout', async () => {
    const cb = new CircuitBreaker('peer-4', { failureThreshold: 1, timeout: 10 });
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
    expect(cb.state).toBe('OPEN');
    await new Promise((r) => setTimeout(r, 20));
    // Trigger state check by calling isAllowed
    cb.isAllowed();
    expect(cb.state).toBe('HALF_OPEN');
  });

  it('closes circuit after sufficient successes in HALF_OPEN', async () => {
    const cb = new CircuitBreaker('peer-5', {
      failureThreshold: 1,
      timeout: 10,
      successThreshold: 2,
    });
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
    await new Promise((r) => setTimeout(r, 20));
    cb.isAllowed(); // trigger HALF_OPEN

    await cb.execute(async () => 'ok');
    expect(cb.state).toBe('HALF_OPEN');
    await cb.execute(async () => 'ok');
    expect(cb.state).toBe('CLOSED');
  });

  it('goes back to OPEN on failure in HALF_OPEN', async () => {
    const cb = new CircuitBreaker('peer-6', { failureThreshold: 1, timeout: 10 });
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
    await new Promise((r) => setTimeout(r, 20));
    cb.isAllowed();
    expect(cb.state).toBe('HALF_OPEN');
    try { await cb.execute(async () => { throw new Error('fail again'); }); } catch {}
    expect(cb.state).toBe('OPEN');
  });

  it('reset() restores to CLOSED', async () => {
    const cb = new CircuitBreaker('peer-7', { failureThreshold: 1 });
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
    expect(cb.state).toBe('OPEN');
    cb.reset();
    expect(cb.state).toBe('CLOSED');
  });
});

describe('CircuitBreakerRegistry', () => {
  it('creates and reuses circuit breakers per peer', () => {
    const registry = new CircuitBreakerRegistry();
    const cb1 = registry.get('peer-a');
    const cb2 = registry.get('peer-a');
    const cb3 = registry.get('peer-b');
    expect(cb1).toBe(cb2);
    expect(cb1).not.toBe(cb3);
  });
});

// ---------------------------------------------------------------------------
// AdaptiveRetryManager
// ---------------------------------------------------------------------------
describe('AdaptiveRetryManager', () => {
  it('gives more retries to high-reputation peers', async () => {
    const retryMgr = new RetryManager({ jitter: false, initialDelayMs: 0, maxDelayMs: 0 });
    const adaptive = new AdaptiveRetryManager(
      { enabled: true, baseRetries: 3, maxRetries: 10, backoffMultiplier: 1.5, timeoutMultiplier: 1.2 },
      retryMgr,
    );

    adaptive.updatePeerProfile('good-peer', { reputation: 90, avgLatencyMs: 20 });
    adaptive.updatePeerProfile('bad-peer', { reputation: 10, avgLatencyMs: 20 });

    let goodPeerAttempts = 0;
    await expect(
      adaptive.retryWithAdaptiveBackoff(async () => {
        goodPeerAttempts++;
        throw new Error('always fails');
      }, 'good-peer', 'publish', 5000),
    ).rejects.toThrow();

    let badPeerAttempts = 0;
    await expect(
      adaptive.retryWithAdaptiveBackoff(async () => {
        badPeerAttempts++;
        throw new Error('always fails');
      }, 'bad-peer', 'publish', 5000),
    ).rejects.toThrow();

    // high-rep peer should have gotten more attempts
    expect(goodPeerAttempts).toBeGreaterThan(badPeerAttempts);
  });
});

// ---------------------------------------------------------------------------
// SmartRetryFacade
// ---------------------------------------------------------------------------
describe('SmartRetryFacade', () => {
  const makeConfig = (): RetryLogicConfig => ({
    enabled: true,
    strategies: {
      exponentialBackoff: {
        enabled: true, initialDelayMs: 1, maxDelayMs: 100, multiplier: 2, jitter: false, jitterFactor: 0.1,
      },
      circuitBreaker: {
        enabled: true, failureThreshold: 3, successThreshold: 2, timeout: 60000, halfOpenRequests: 1,
      },
      adaptiveRetry: {
        enabled: false, baseRetries: 2, maxRetries: 5, backoffMultiplier: 1.5, timeoutMultiplier: 1.2,
      },
    },
    perMessageType: {
      publish: { maxRetries: 2, timeout: 500 },
      query:   { maxRetries: 3, timeout: 1000 },
      response: { maxRetries: 1, timeout: 300 },
    },
  });

  it('succeeds on first try through facade', async () => {
    const facade = new SmartRetryFacade(makeConfig());
    const result = await facade.execute(async () => 'ok', 'peer-x', 'publish');
    expect(result).toBe('ok');
  });

  it('retries and succeeds', async () => {
    const facade = new SmartRetryFacade(makeConfig());
    let attempts = 0;
    const result = await facade.execute(async () => {
      attempts++;
      if (attempts < 2) throw new Error('temporary');
      return 'recovered';
    }, 'peer-y', 'publish');
    expect(result).toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('opens circuit breaker after threshold failures', async () => {
    const facade = new SmartRetryFacade(makeConfig());
    for (let i = 0; i < 10; i++) {
      try { await facade.execute(async () => { throw new Error('fail'); }, 'peer-z', 'publish'); } catch {}
    }
    const cb = facade.getCircuitBreaker('peer-z');
    expect(cb.state).toBe('OPEN');
  });
});
