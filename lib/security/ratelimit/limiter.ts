/**
 * Phase 3: Rate Limiting & Spam Protection
 *
 * Implements a Token Bucket algorithm for per-peer and global rate limiting.
 * Also includes duplicate message detection.
 */

import type { RateLimitingConfig } from '../../types/config.js';
import type { RateLimitResult } from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * Token Bucket implementation for rate limiting.
 * Tokens are refilled over time; consuming a token allows an action.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  public lastUsed: number;

  constructor(
    private readonly capacity: number,
    private readonly refillIntervalMs: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
    this.lastUsed = Date.now();
  }

  /**
   * Try to consume tokens. Returns true if enough tokens are available.
   */
  consume(amount: number = 1): boolean {
    this.refill();

    if (this.tokens >= amount) {
      this.tokens -= amount;
      this.lastUsed = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Get the number of remaining tokens.
   */
  getRemaining(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Get the time until the next token is available.
   */
  getResetTime(): number {
    const timePerToken = this.refillIntervalMs / this.capacity;
    return Date.now() + Math.ceil(timePerToken);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / this.refillIntervalMs) * this.capacity;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Rate limiter managing per-peer and global rate limits.
 */
export class RateLimiter {
  private readonly config: RateLimitingConfig;
  private readonly peerBuckets: Map<string, { message: TokenBucket; query: TokenBucket }> = new Map();
  private readonly globalBucket: TokenBucket;
  private readonly recentMessages: Map<string, number> = new Map(); // messageId → timestamp
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitingConfig) {
    this.config = config;
    this.globalBucket = new TokenBucket(
      config.global.messagesPerSecond,
      config.global.windowSizeMs
    );
  }

  /**
   * Start periodic cleanup of stale buckets and old message IDs.
   */
  start(): void {
    // Clean up every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Stop the rate limiter and clear timers.
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Check if a message/query from a peer is within rate limits.
   */
  checkLimit(peerId: string, type: 'message' | 'query'): RateLimitResult {
    if (!this.config.enabled) {
      return { allowed: true, remaining: Infinity, resetAt: 0 };
    }

    // Check global limit first
    if (!this.globalBucket.consume(1)) {
      logger.debug('Global rate limit exceeded');
      return {
        allowed: false,
        remaining: 0,
        resetAt: this.globalBucket.getResetTime(),
      };
    }

    // Get or create per-peer buckets
    let buckets = this.peerBuckets.get(peerId);
    if (!buckets) {
      buckets = {
        message: new TokenBucket(
          this.config.perPeer.messagesPerSecond,
          this.config.perPeer.windowSizeMs
        ),
        query: new TokenBucket(
          this.config.perPeer.queriesPerSecond,
          this.config.perPeer.windowSizeMs
        ),
      };
      this.peerBuckets.set(peerId, buckets);
    }

    const bucket = type === 'message' ? buckets.message : buckets.query;
    const allowed = bucket.consume(1);

    return {
      allowed,
      remaining: bucket.getRemaining(),
      resetAt: bucket.getResetTime(),
    };
  }

  /**
   * Check if a message is a duplicate (spam detection).
   * Returns true if the message has been seen before within the duplicate window.
   */
  isDuplicate(peerId: string, messageId: string): boolean {
    if (!this.config.enabled) return false;

    const key = `${peerId}:${messageId}`;
    const seenAt = this.recentMessages.get(key);

    if (seenAt && Date.now() - seenAt < this.config.spam.duplicateWindowMs) {
      return true;
    }

    // Mark as seen
    this.recentMessages.set(key, Date.now());
    return false;
  }

  /**
   * Check if a payload exceeds the large payload threshold.
   */
  isLargePayload(payloadSize: number): boolean {
    return payloadSize > this.config.spam.largePayloadThreshold;
  }

  /**
   * Get the number of tracked peers.
   */
  getTrackedPeerCount(): number {
    return this.peerBuckets.size;
  }

  /**
   * Remove rate limit tracking for a specific peer.
   */
  removePeer(peerId: string): void {
    this.peerBuckets.delete(peerId);
  }

  /**
   * Clean up stale buckets and old message IDs.
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 3600000; // 1 hour

    // Remove stale peer buckets
    for (const [peerId, buckets] of this.peerBuckets) {
      if (now - buckets.message.lastUsed > staleThreshold &&
          now - buckets.query.lastUsed > staleThreshold) {
        this.peerBuckets.delete(peerId);
      }
    }

    // Remove old message IDs
    for (const [key, timestamp] of this.recentMessages) {
      if (now - timestamp > this.config.spam.duplicateWindowMs) {
        this.recentMessages.delete(key);
      }
    }
  }
}
