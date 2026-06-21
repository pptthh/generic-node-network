import type { ExponentialBackoffConfig, CircuitBreakerConfig } from '../types/config.js';

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  backoff?: ExponentialBackoffConfig;
}

export interface RetryResult<T> {
  value: T;
  attempts: number;
  totalDelayMs: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  peerId: string;
}

export interface PeerProfile {
  reputation: number;    // 0–100
  successRate: number;   // 0–1
  avgLatencyMs: number;
  failureRate: number;   // 0–1
}
