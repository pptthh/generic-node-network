import type { AdaptiveRetryConfig, RetryLogicConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { RetryManager } from './manager.js';
import { CircuitBreaker } from './circuit-breaker.js';
import type { PeerProfile } from './types.js';

const DEFAULT_PROFILE: PeerProfile = {
  reputation: 50,
  successRate: 0.95,
  avgLatencyMs: 50,
  failureRate: 0.05,
};

/**
 * AdaptiveRetryManager tunes retry parameters dynamically based on a peer's
 * historical reputation, latency, and success rate.
 */
export class AdaptiveRetryManager {
  private readonly config: AdaptiveRetryConfig;
  private readonly retryManager: RetryManager;
  private readonly peerProfiles: Map<string, PeerProfile> = new Map();

  constructor(config: AdaptiveRetryConfig, retryManager: RetryManager) {
    this.config = config;
    this.retryManager = retryManager;
  }

  /**
   * Retry an operation with parameters tuned for the specified peer.
   */
  async retryWithAdaptiveBackoff<T>(
    operation: () => Promise<T>,
    peerId: string,
    messageType: 'publish' | 'query' | 'response',
    baseTimeoutMs: number,
  ): Promise<T> {
    const profile = this.getPeerProfile(peerId);
    const maxRetries = this.calculateMaxRetries(profile);
    const timeoutMs = this.calculateTimeout(profile, baseTimeoutMs);

    logger.debug('Adaptive retry parameters', {
      peerId,
      maxRetries,
      timeoutMs,
      reputation: profile.reputation,
      successRate: profile.successRate,
      avgLatencyMs: profile.avgLatencyMs,
    });

    return this.retryManager.retryWithTimeout(operation, maxRetries, timeoutMs);
  }

  // ---------------------------------------------------------------------------
  // Peer profile management
  // ---------------------------------------------------------------------------

  updatePeerProfile(peerId: string, update: Partial<PeerProfile>): void {
    const existing = this.peerProfiles.get(peerId) ?? { ...DEFAULT_PROFILE };
    this.peerProfiles.set(peerId, { ...existing, ...update });
  }

  getPeerProfile(peerId: string): PeerProfile {
    return this.peerProfiles.get(peerId) ?? { ...DEFAULT_PROFILE };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private calculateMaxRetries(profile: PeerProfile): number {
    const base = this.config.baseRetries;
    // Peers with reputation above 50 get more retries, below 50 get fewer
    const bonus = Math.floor((profile.reputation - 50) / 10);
    return Math.max(1, Math.min(this.config.maxRetries, base + bonus));
  }

  private calculateTimeout(profile: PeerProfile, baseTimeoutMs: number): number {
    // Scale timeout by average latency relative to the "normal" 50ms baseline
    const latencyFactor = Math.max(1, profile.avgLatencyMs / 50);
    return Math.ceil(baseTimeoutMs * Math.min(latencyFactor, this.config.timeoutMultiplier * 2));
  }
}

/**
 * Top-level facade that combines RetryManager, CircuitBreaker, and AdaptiveRetryManager
 * in a single entry point for GNNNode to use.
 */
export class SmartRetryFacade {
  private readonly retryManager: RetryManager;
  private readonly adaptiveManager: AdaptiveRetryManager;
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly config: RetryLogicConfig;

  constructor(config: RetryLogicConfig) {
    this.config = config;
    this.retryManager = new RetryManager(config.strategies.exponentialBackoff);
    this.adaptiveManager = new AdaptiveRetryManager(
      config.strategies.adaptiveRetry,
      this.retryManager,
    );
  }

  /**
   * Execute an operation with full retry + circuit-breaker protection.
   */
  async execute<T>(
    operation: () => Promise<T>,
    peerId: string,
    messageType: 'publish' | 'query' | 'response',
  ): Promise<T> {
    const breaker = this.getCircuitBreaker(peerId);

    return breaker.execute(() => {
      const baseTimeout = this.config.perMessageType[messageType].timeout;

      if (this.config.strategies.adaptiveRetry.enabled) {
        return this.adaptiveManager.retryWithAdaptiveBackoff(
          operation,
          peerId,
          messageType,
          baseTimeout,
        );
      }

      const maxRetries = this.config.perMessageType[messageType].maxRetries;
      return this.retryManager.retryWithTimeout(operation, maxRetries, baseTimeout);
    });
  }

  getCircuitBreaker(peerId: string): CircuitBreaker {
    if (!this.circuitBreakers.has(peerId)) {
      this.circuitBreakers.set(
        peerId,
        new CircuitBreaker(peerId, this.config.strategies.circuitBreaker),
      );
    }
    return this.circuitBreakers.get(peerId)!;
  }

  updatePeerProfile(peerId: string, profile: Partial<PeerProfile>): void {
    this.adaptiveManager.updatePeerProfile(peerId, profile);
  }

  getPeerProfile(peerId: string): PeerProfile {
    return this.adaptiveManager.getPeerProfile(peerId);
  }
}
