import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RateLimiter, TokenBucket } from '../../lib/security/ratelimit/limiter.js';
import type { RateLimitingConfig } from '../../lib/types/config.js';

const defaultConfig: RateLimitingConfig = {
  enabled: true,
  perPeer: {
    messagesPerSecond: 100,
    queriesPerSecond: 50,
    connectionAttemptsPerMinute: 10,
    windowSizeMs: 1000,
  },
  global: {
    messagesPerSecond: 10000,
    windowSizeMs: 1000,
  },
  spam: {
    duplicateMessageThreshold: 10,
    duplicateWindowMs: 60000,
    largePayloadThreshold: 30000,
    largePayloadPenalty: -20,
    malformedMessagePenalty: -10,
  },
};

describe('TokenBucket', () => {
  it('should allow consumption within capacity', () => {
    const bucket = new TokenBucket(10, 1000);
    expect(bucket.consume(1)).toBe(true);
    expect(bucket.consume(1)).toBe(true);
  });

  it('should reject when capacity is exhausted', () => {
    const bucket = new TokenBucket(3, 1000);
    expect(bucket.consume(1)).toBe(true);
    expect(bucket.consume(1)).toBe(true);
    expect(bucket.consume(1)).toBe(true);
    expect(bucket.consume(1)).toBe(false);
  });

  it('should report remaining tokens', () => {
    const bucket = new TokenBucket(10, 1000);
    expect(bucket.getRemaining()).toBe(10);
    bucket.consume(3);
    expect(bucket.getRemaining()).toBe(7);
  });

  it('should consume multiple tokens at once', () => {
    const bucket = new TokenBucket(10, 1000);
    expect(bucket.consume(5)).toBe(true);
    expect(bucket.getRemaining()).toBe(5);
    expect(bucket.consume(6)).toBe(false); // Not enough
  });

  it('should refill over time', async () => {
    const bucket = new TokenBucket(100, 100); // 100 tokens per 100ms
    // Consume all tokens
    bucket.consume(100);
    expect(bucket.getRemaining()).toBe(0);

    // Wait for refill
    await new Promise(resolve => setTimeout(resolve, 55));
    // Should have refilled ~50 tokens
    const remaining = bucket.getRemaining();
    expect(remaining).toBeGreaterThan(30);
    expect(remaining).toBeLessThanOrEqual(100);
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(defaultConfig);
  });

  afterEach(() => {
    limiter.stop();
  });

  it('should allow messages within rate limit', () => {
    const result = limiter.checkLimit('peer-1', 'message');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('should block messages exceeding per-peer rate limit', () => {
    const peerId = 'spam-peer';

    // Exhaust the bucket (100 msg/sec)
    let blocked = false;
    for (let i = 0; i < 150; i++) {
      const result = limiter.checkLimit(peerId, 'message');
      if (!result.allowed) {
        blocked = true;
        break;
      }
    }

    expect(blocked).toBe(true);
  });

  it('should have separate limits for messages and queries', () => {
    const peerId = 'peer-separate';

    // Exhaust message budget
    for (let i = 0; i < 100; i++) {
      limiter.checkLimit(peerId, 'message');
    }

    // Query budget should still be available
    const queryResult = limiter.checkLimit(peerId, 'query');
    expect(queryResult.allowed).toBe(true);
  });

  it('should detect duplicate messages', () => {
    const peerId = 'peer-dup';
    const messageId = 'msg_duplicate';

    expect(limiter.isDuplicate(peerId, messageId)).toBe(false); // First time
    expect(limiter.isDuplicate(peerId, messageId)).toBe(true); // Duplicate!
  });

  it('should not flag different messages as duplicates', () => {
    const peerId = 'peer-unique';
    expect(limiter.isDuplicate(peerId, 'msg_1')).toBe(false);
    expect(limiter.isDuplicate(peerId, 'msg_2')).toBe(false);
    expect(limiter.isDuplicate(peerId, 'msg_3')).toBe(false);
  });

  it('should detect large payloads', () => {
    expect(limiter.isLargePayload(1000)).toBe(false);
    expect(limiter.isLargePayload(30001)).toBe(true);
    expect(limiter.isLargePayload(30000)).toBe(false);
  });

  it('should track peer count', () => {
    limiter.checkLimit('peer-1', 'message');
    limiter.checkLimit('peer-2', 'message');
    limiter.checkLimit('peer-3', 'message');

    expect(limiter.getTrackedPeerCount()).toBe(3);
  });

  it('should remove peer tracking', () => {
    limiter.checkLimit('peer-remove', 'message');
    expect(limiter.getTrackedPeerCount()).toBe(1);

    limiter.removePeer('peer-remove');
    expect(limiter.getTrackedPeerCount()).toBe(0);
  });

  it('should always allow when disabled', () => {
    const disabledConfig = { ...defaultConfig, enabled: false };
    const disabledLimiter = new RateLimiter(disabledConfig);

    for (let i = 0; i < 1000; i++) {
      const result = disabledLimiter.checkLimit('any-peer', 'message');
      expect(result.allowed).toBe(true);
    }

    disabledLimiter.stop();
  });

  it('should not flag duplicates when disabled', () => {
    const disabledConfig = { ...defaultConfig, enabled: false };
    const disabledLimiter = new RateLimiter(disabledConfig);

    expect(disabledLimiter.isDuplicate('peer', 'msg')).toBe(false);
    expect(disabledLimiter.isDuplicate('peer', 'msg')).toBe(false); // Still false

    disabledLimiter.stop();
  });
});
