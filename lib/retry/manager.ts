import type { ExponentialBackoffConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import type { RetryOptions } from './types.js';

const DEFAULT_BACKOFF: ExponentialBackoffConfig = {
  enabled: true,
  initialDelayMs: 100,
  maxDelayMs: 30000,
  multiplier: 2,
  jitter: true,
  jitterFactor: 0.1,
};

/**
 * RetryManager implements exponential backoff with optional jitter.
 */
export class RetryManager {
  private readonly backoffConfig: ExponentialBackoffConfig;

  constructor(backoffConfig?: Partial<ExponentialBackoffConfig>) {
    this.backoffConfig = { ...DEFAULT_BACKOFF, ...backoffConfig };
  }

  /**
   * Retry an async operation with exponential backoff.
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelayMs: number = this.backoffConfig.initialDelayMs,
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Retry attempt ${attempt + 1}/${maxRetries + 1}`);
        return await operation();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt === maxRetries) {
          break;
        }

        const delay = this.calculateBackoffDelay(attempt, initialDelayMs);

        logger.debug(`Retry ${attempt + 1} failed, backing off ${delay}ms`, {
          error: lastError.message,
          attempt,
          maxRetries,
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Retry with a per-attempt timeout.
   */
  async retryWithTimeout<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    timeoutMs: number,
  ): Promise<T> {
    return this.retryWithBackoff(
      () => this.withTimeout(operation, timeoutMs),
      maxRetries,
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  calculateBackoffDelay(attemptNumber: number, initialDelayMs: number): number {
    const cfg = this.backoffConfig;
    let delay = initialDelayMs * Math.pow(cfg.multiplier, attemptNumber);
    delay = Math.min(delay, cfg.maxDelayMs);

    if (cfg.jitter) {
      const jitterAmount = delay * cfg.jitterFactor;
      const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
      delay += jitter;
    }

    return Math.max(0, Math.floor(delay));
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      operation()
        .then((v) => { clearTimeout(timer); resolve(v); })
        .catch((e) => { clearTimeout(timer); reject(e); });
    });
  }
}
