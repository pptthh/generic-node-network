import type { CircuitBreakerConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import type { CircuitState, CircuitBreakerStatus } from './types.js';

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
  halfOpenRequests: 1,
};

/**
 * Per-peer circuit breaker implementing the CLOSED → OPEN → HALF_OPEN state machine.
 */
export class CircuitBreaker {
  readonly peerId: string;
  private readonly config: CircuitBreakerConfig;

  state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private halfOpenInFlight = 0;
  private lastFailureTime: number | null = null;

  constructor(peerId: string, config?: Partial<CircuitBreakerConfig>) {
    this.peerId = peerId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute an operation through the circuit breaker.
   * Throws immediately when the circuit is OPEN (fail-fast).
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.checkStateTransition();

    if (this.state === 'OPEN') {
      throw new Error(`Circuit breaker OPEN for peer ${this.peerId}`);
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenInFlight >= this.config.halfOpenRequests) {
      throw new Error(`Circuit breaker HALF_OPEN probe limit reached for peer ${this.peerId}`);
    }

    if (this.state === 'HALF_OPEN') {
      this.halfOpenInFlight++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    } finally {
      if (this.state === 'HALF_OPEN') {
        this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      }
    }
  }

  /**
   * Whether the circuit will allow a request right now.
   */
  isAllowed(): boolean {
    this.checkStateTransition();
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') return false;
    // HALF_OPEN: allow only up to halfOpenRequests
    return this.halfOpenInFlight < this.config.halfOpenRequests;
  }

  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      peerId: this.peerId,
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenInFlight = 0;
    this.lastFailureTime = null;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private checkStateTransition(): void {
    if (this.state === 'OPEN' && this.lastFailureTime !== null) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.timeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        this.halfOpenInFlight = 0;
        logger.info('Circuit breaker entering HALF_OPEN state', { peerId: this.peerId });
      }
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
        logger.info('Circuit breaker CLOSED (recovered)', { peerId: this.peerId });
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn('Circuit breaker OPEN (half-open probe failed)', { peerId: this.peerId });
      return;
    }

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
      logger.warn('Circuit breaker OPEN (failure threshold exceeded)', {
        peerId: this.peerId,
        failureCount: this.failureCount,
      });
    }
  }
}

/**
 * Registry that holds one CircuitBreaker per peer.
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly config: Partial<CircuitBreakerConfig>;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = config ?? {};
  }

  get(peerId: string): CircuitBreaker {
    if (!this.breakers.has(peerId)) {
      this.breakers.set(peerId, new CircuitBreaker(peerId, this.config));
    }
    return this.breakers.get(peerId)!;
  }

  getAll(): CircuitBreakerStatus[] {
    return [...this.breakers.values()].map((b) => b.getStatus());
  }
}
