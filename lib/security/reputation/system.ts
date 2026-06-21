/**
 * Phase 3: Peer Reputation System
 *
 * Tracks peer behavior with a numeric score (0-100):
 * - 0 = banned (rejected entirely)
 * - 1-9 = quarantined (relay only)
 * - 10-19 = reduced priority
 * - 20-100 = normal operation
 * - Default: 50 (neutral)
 *
 * Scores decay toward neutral (50) over time.
 */

import type { ReputationConfig } from '../../types/config.js';
import type { Database } from '../../storage/database.js';
import type { ReputationEvent, ReputationHistoryEntry, ReputationRecord } from '../types.js';
import { logger } from '../../utils/logger.js';

const MAX_HISTORY_ENTRIES = 1000;

export type ReputationAction = 'none' | 'reduce_priority' | 'quarantine' | 'blocklist';

export class ReputationSystem {
  private readonly config: ReputationConfig;
  private readonly db: Database;
  // In-memory cache for hot-path lookups
  private readonly scoreCache: Map<string, { score: number; lastUpdate: number }> = new Map();

  constructor(config: ReputationConfig, db: Database) {
    this.config = config;
    this.db = db;
  }

  /**
   * Get the current reputation score for a peer.
   * Returns the initial score if no record exists.
   */
  async getScore(peerId: string): Promise<number> {
    // Check cache first
    const cached = this.scoreCache.get(peerId);
    if (cached && Date.now() - cached.lastUpdate < 60000) {
      return cached.score;
    }

    try {
      const score = await this.db.get(`reputation:${peerId}:score`) as number;
      this.scoreCache.set(peerId, { score, lastUpdate: Date.now() });
      return score;
    } catch {
      return this.config.initialScore;
    }
  }

  /**
   * Get the full reputation record for a peer.
   */
  async getRecord(peerId: string): Promise<ReputationRecord> {
    const [score, lastUpdate, validMessages, invalidMessages, spamReports, avgLatency, uptime, history] =
      await Promise.all([
        this.db.get(`reputation:${peerId}:score`).catch(() => this.config.initialScore),
        this.db.get(`reputation:${peerId}:lastUpdate`).catch(() => 0),
        this.db.get(`reputation:${peerId}:validMessages`).catch(() => 0),
        this.db.get(`reputation:${peerId}:invalidMessages`).catch(() => 0),
        this.db.get(`reputation:${peerId}:spamReports`).catch(() => 0),
        this.db.get(`reputation:${peerId}:avgLatency`).catch(() => 0),
        this.db.get(`reputation:${peerId}:uptime`).catch(() => 0),
        this.db.get(`reputation:${peerId}:history`).catch(() => []),
      ]);

    return {
      score: score as number,
      lastUpdate: lastUpdate as number,
      validMessages: validMessages as number,
      invalidMessages: invalidMessages as number,
      spamReports: spamReports as number,
      avgLatency: avgLatency as number,
      uptime: uptime as number,
      history: history as ReputationHistoryEntry[],
    };
  }

  /**
   * Update a peer's reputation score based on an event.
   * Applies time-based decay before adding the delta.
   */
  async updateScore(peerId: string, event: ReputationEvent, delta: number): Promise<number> {
    if (!this.config.enabled) return this.config.initialScore;

    // 1. Get current score
    let score = await this.getScore(peerId);

    // 2. Apply time-based decay toward neutral
    const lastUpdate = await this.db.get(`reputation:${peerId}:lastUpdate`).catch(() => null) as number | null;
    if (lastUpdate) {
      const ageDays = (Date.now() - lastUpdate) / this.config.decayInterval;
      if (ageDays > 0) {
        const decay = Math.pow(this.config.decayRate, ageDays);
        score = this.config.initialScore + (score - this.config.initialScore) * decay;
      }
    }

    // 3. Apply delta
    score = Math.max(this.config.minScore, Math.min(this.config.maxScore, score + delta));

    // 4. Store updated score
    await this.db.put(`reputation:${peerId}:score`, score);
    await this.db.put(`reputation:${peerId}:lastUpdate`, Date.now());

    // Update cache
    this.scoreCache.set(peerId, { score, lastUpdate: Date.now() });

    // 5. Update counters
    await this.updateCounters(peerId, event);

    // 6. Log to history
    await this.appendHistory(peerId, { score, timestamp: Date.now(), reason: event.type, details: event.details });

    // 7. Determine and return action
    const action = this.getActionForScore(score);
    if (action !== 'none') {
      logger.warn('Peer reputation action triggered', { peerId, score, action, event: event.type });
    }

    return score;
  }

  /**
   * Determine what action should be taken based on a reputation score.
   */
  getActionForScore(score: number): ReputationAction {
    if (score <= 0) return 'blocklist';
    if (score < 10) return 'quarantine';
    if (score < 20) return 'reduce_priority';
    return 'none';
  }

  /**
   * Check if a peer should be accepted based on reputation.
   */
  async shouldAcceptPeer(peerId: string): Promise<boolean> {
    const score = await this.getScore(peerId);
    return score > 0;
  }

  /**
   * Reset a peer's reputation to the initial score.
   */
  async resetScore(peerId: string): Promise<void> {
    await this.db.put(`reputation:${peerId}:score`, this.config.initialScore);
    await this.db.put(`reputation:${peerId}:lastUpdate`, Date.now());
    this.scoreCache.set(peerId, { score: this.config.initialScore, lastUpdate: Date.now() });
    logger.info('Peer reputation reset', { peerId });
  }

  /**
   * Get all peers with reputation below a threshold.
   */
  async getPeersBelowThreshold(threshold: number): Promise<Array<{ peerId: string; score: number }>> {
    const results: Array<{ peerId: string; score: number }> = [];

    for await (const [key, value] of this.db.scan({
      gte: 'reputation:',
      lte: 'reputation:\xff',
    })) {
      const keyStr = key as string;
      if (keyStr.endsWith(':score')) {
        const score = value as number;
        if (score < threshold) {
          const peerId = keyStr.replace('reputation:', '').replace(':score', '');
          results.push({ peerId, score });
        }
      }
    }

    return results;
  }

  private async updateCounters(peerId: string, event: ReputationEvent): Promise<void> {
    switch (event.type) {
      case 'valid_message': {
        const count = (await this.db.get(`reputation:${peerId}:validMessages`).catch(() => 0)) as number;
        await this.db.put(`reputation:${peerId}:validMessages`, count + 1);
        break;
      }
      case 'invalid_message':
      case 'invalid_signature': {
        const count = (await this.db.get(`reputation:${peerId}:invalidMessages`).catch(() => 0)) as number;
        await this.db.put(`reputation:${peerId}:invalidMessages`, count + 1);
        break;
      }
      case 'spam':
      case 'rate_limit_exceeded': {
        const count = (await this.db.get(`reputation:${peerId}:spamReports`).catch(() => 0)) as number;
        await this.db.put(`reputation:${peerId}:spamReports`, count + 1);
        break;
      }
    }
  }

  private async appendHistory(peerId: string, entry: ReputationHistoryEntry): Promise<void> {
    let history: ReputationHistoryEntry[];
    try {
      history = (await this.db.get(`reputation:${peerId}:history`)) as ReputationHistoryEntry[];
    } catch {
      history = [];
    }

    history.push(entry);

    // Keep only last N entries
    if (history.length > MAX_HISTORY_ENTRIES) {
      history = history.slice(-MAX_HISTORY_ENTRIES);
    }

    await this.db.put(`reputation:${peerId}:history`, history);
  }

  /**
   * Clear the in-memory score cache. Useful for testing.
   */
  clearCache(): void {
    this.scoreCache.clear();
  }
}
