/**
 * Phase 3: API Token Rotation Manager
 *
 * Manages API token lifecycle:
 * - Token generation (cryptographically random)
 * - Token rotation on schedule
 * - Grace period for old tokens
 * - Hash-based storage (never store plaintext)
 * - Validation against current + grace-period tokens
 */

import { randomBytes, createHash } from 'crypto';
import type { ApiTokensConfig } from '../../types/config.js';
import type { Database } from '../../storage/database.js';
import type { TokenRecord } from '../types.js';
import { logger } from '../../utils/logger.js';

export class TokenRotationManager {
  private readonly config: ApiTokensConfig;
  private readonly db: Database;
  private rotationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: ApiTokensConfig, db: Database) {
    this.config = config;
    this.db = db;
  }

  /**
   * Initialize token rotation. If no token exists, creates one.
   * Returns the current plaintext token (only time it's available in memory).
   */
  async initialize(existingToken?: string): Promise<string> {
    // Check if a current token exists in DB
    let currentRecord: TokenRecord | null = null;
    try {
      currentRecord = await this.db.get('apiToken:current') as TokenRecord;
    } catch {
      // No token record exists
    }

    if (currentRecord && !this.isExpired(currentRecord)) {
      // Token exists and is not expired
      // If an existing token was provided, validate it matches
      if (existingToken) {
        const hash = this.hashToken(existingToken);
        if (hash === currentRecord.hash) {
          return existingToken;
        }
      }
      // Can't recover plaintext from hash - generate new
      if (!existingToken) {
        // This shouldn't normally happen, means we lost the token in memory
        logger.warn('Token record exists but no plaintext available, generating new token');
        return this.forceRotate();
      }
      return existingToken;
    }

    // No valid token exists - create initial one
    const token = existingToken ?? this.generateToken();
    const hash = this.hashToken(token);

    const record: TokenRecord = {
      hash,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.tokenTTL,
      status: 'active',
    };

    await this.db.put('apiToken:current', record);
    await this.db.put('apiToken:rotation:lastRotation', Date.now());
    await this.db.put('apiToken:rotation:nextRotation', Date.now() + this.config.rotationInterval);

    return token;
  }

  /**
   * Start the automatic rotation scheduler.
   */
  startRotationScheduler(): void {
    if (!this.config.rotationEnabled) return;

    // Check every hour if rotation is due
    this.rotationTimer = setInterval(async () => {
      try {
        await this.checkAndRotate();
      } catch (err) {
        logger.error('Token rotation check failed', err);
      }
    }, 3600000); // 1 hour
  }

  /**
   * Stop the rotation scheduler.
   */
  stopRotationScheduler(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  /**
   * Check if rotation is due and perform it if needed.
   * Returns the new token if rotated, null otherwise.
   */
  async checkAndRotate(): Promise<string | null> {
    if (!this.config.rotationEnabled) return null;

    let lastRotation: number;
    try {
      lastRotation = await this.db.get('apiToken:rotation:lastRotation') as number;
    } catch {
      lastRotation = 0;
    }

    const rotationDue = !lastRotation ||
      (Date.now() - lastRotation > this.config.rotationInterval);

    if (!rotationDue) {
      return null;
    }

    return this.forceRotate();
  }

  /**
   * Force a token rotation regardless of schedule.
   * Returns the new plaintext token.
   */
  async forceRotate(): Promise<string> {
    // 1. Get current token record
    let currentRecord: TokenRecord | null = null;
    try {
      currentRecord = await this.db.get('apiToken:current') as TokenRecord;
    } catch {
      // No current record
    }

    // 2. Move current to history
    let history: TokenRecord[];
    try {
      history = await this.db.get('apiToken:history') as TokenRecord[];
    } catch {
      history = [];
    }

    if (currentRecord) {
      currentRecord.status = 'secondary';
      currentRecord.rotatedAt = Date.now();
      currentRecord.gracePeriodUntil = Date.now() + this.config.gracePeriod;
      history.push(currentRecord);
    }

    // 3. Generate new token
    const newToken = this.generateToken();
    const newTokenHash = this.hashToken(newToken);

    const newRecord: TokenRecord = {
      hash: newTokenHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.tokenTTL,
      status: 'active',
    };

    // 4. Store
    await this.db.put('apiToken:current', newRecord);
    await this.db.put('apiToken:rotation:lastRotation', Date.now());
    await this.db.put('apiToken:rotation:nextRotation', Date.now() + this.config.rotationInterval);

    // 5. Clean up history (remove fully expired, keep max N)
    history = history.filter(t => {
      if (t.gracePeriodUntil && Date.now() >= t.gracePeriodUntil) {
        t.status = 'expired';
      }
      return t.status !== 'expired' || Date.now() < t.expiresAt;
    });

    if (history.length > this.config.maxTokensKept) {
      history = history.slice(-this.config.maxTokensKept);
    }

    await this.db.put('apiToken:history', history);

    logger.info('API token rotated', {
      nextRotation: new Date(Date.now() + this.config.rotationInterval).toISOString(),
      gracePeriodsActive: history.filter(t => t.status === 'secondary').length,
    });

    return newToken;
  }

  /**
   * Validate a token against current + grace-period tokens.
   * This is the primary auth check for API requests.
   */
  async validateToken(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);

    // Check current token
    try {
      const current = await this.db.get('apiToken:current') as TokenRecord;
      if (current.hash === tokenHash && !this.isExpired(current)) {
        return true;
      }
    } catch {
      // No current token
    }

    // Check secondary tokens (in grace period)
    try {
      const history = await this.db.get('apiToken:history') as TokenRecord[];
      for (const record of history) {
        if (
          record.hash === tokenHash &&
          record.status === 'secondary' &&
          record.gracePeriodUntil &&
          Date.now() < record.gracePeriodUntil
        ) {
          logger.debug('Token validated via grace period');
          return true;
        }
      }
    } catch {
      // No history
    }

    return false;
  }

  /**
   * Get rotation status information.
   */
  async getRotationStatus(): Promise<{
    lastRotation: number | null;
    nextRotation: number | null;
    activeTokensCount: number;
    gracePeriodTokensCount: number;
  }> {
    let lastRotation: number | null = null;
    let nextRotation: number | null = null;
    let activeTokensCount = 0;
    let gracePeriodTokensCount = 0;

    try {
      lastRotation = await this.db.get('apiToken:rotation:lastRotation') as number;
    } catch { /* empty */ }

    try {
      nextRotation = await this.db.get('apiToken:rotation:nextRotation') as number;
    } catch { /* empty */ }

    try {
      const current = await this.db.get('apiToken:current') as TokenRecord;
      if (!this.isExpired(current)) activeTokensCount = 1;
    } catch { /* empty */ }

    try {
      const history = await this.db.get('apiToken:history') as TokenRecord[];
      gracePeriodTokensCount = history.filter(
        t => t.status === 'secondary' && t.gracePeriodUntil && Date.now() < t.gracePeriodUntil
      ).length;
    } catch { /* empty */ }

    return { lastRotation, nextRotation, activeTokensCount, gracePeriodTokensCount };
  }

  /**
   * Hash a token for storage comparison.
   */
  hashToken(token: string): string {
    return createHash(this.config.hashAlgorithm).update(token).digest('hex');
  }

  /**
   * Generate a new random token.
   */
  private generateToken(): string {
    return 'token_' + randomBytes(this.config.tokenLength).toString('hex');
  }

  /**
   * Check if a token record has expired.
   */
  private isExpired(record: TokenRecord): boolean {
    return Date.now() >= record.expiresAt;
  }
}
