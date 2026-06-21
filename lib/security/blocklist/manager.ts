/**
 * Phase 3: Peer Blocklist Manager
 *
 * Manages blocked peers with:
 * - Permanent and temporary bans
 * - Reason tracking and evidence
 * - Expiry-based automatic unblocking
 * - Integration with reputation system
 */

import type { BlocklistConfig } from '../../types/config.js';
import type { Database } from '../../storage/database.js';
import type { BlocklistEntry, BlocklistEvidence, BlocklistReason, BlocklistSource } from '../types.js';
import { logger } from '../../utils/logger.js';

export class BlocklistManager {
  private readonly config: BlocklistConfig;
  private readonly db: Database;
  // In-memory cache for fast lookups
  private readonly cache: Map<string, BlocklistEntry> = new Map();
  private initialized = false;

  constructor(config: BlocklistConfig, db: Database) {
    this.config = config;
    this.db = db;
  }

  /**
   * Initialize the blocklist manager and load entries from DB into cache.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    for await (const [key, value] of this.db.scan({
      gte: 'blocklist:peer:',
      lte: 'blocklist:peer:\xff',
    })) {
      const entry = value as BlocklistEntry;
      // Skip expired entries
      if (entry.expiresAt && Date.now() >= entry.expiresAt) {
        await this.db.del(key as string);
        continue;
      }
      this.cache.set(entry.peerId, entry);
    }

    this.initialized = true;
    logger.info('Blocklist initialized', { entries: this.cache.size });
  }

  /**
   * Check if a peer is currently blocklisted.
   */
  isBlocklisted(peerId: string): boolean {
    if (!this.config.enabled) return false;

    const entry = this.cache.get(peerId);
    if (!entry) return false;

    // Check if temporary ban has expired
    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      // Remove expired entry asynchronously
      this.remove(peerId).catch(() => {});
      return false;
    }

    return true;
  }

  /**
   * Get the blocklist entry for a peer, if it exists.
   */
  getEntry(peerId: string): BlocklistEntry | null {
    const entry = this.cache.get(peerId);
    if (!entry) return null;

    // Check expiry
    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      this.remove(peerId).catch(() => {});
      return null;
    }

    return entry;
  }

  /**
   * Add a peer to the blocklist.
   */
  async add(
    peerId: string,
    reason: BlocklistReason,
    source: BlocklistSource,
    options: {
      expiresAt?: number | null;
      durationMs?: number;
      evidence?: BlocklistEvidence[];
    } = {}
  ): Promise<void> {
    if (!this.config.enabled) return;

    let expiresAt = options.expiresAt ?? null;
    if (options.durationMs && !expiresAt) {
      expiresAt = Date.now() + options.durationMs;
    }

    const entry: BlocklistEntry = {
      peerId,
      reason,
      addedAt: Date.now(),
      expiresAt,
      source,
      evidence: options.evidence ?? [],
    };

    // Store in DB
    await this.db.put(`blocklist:peer:${peerId}`, entry);

    // Store by reason index
    const reasonKey = `blocklist:reason:${reason}`;
    let reasonList: string[];
    try {
      reasonList = (await this.db.get(reasonKey)) as string[];
    } catch {
      reasonList = [];
    }
    if (!reasonList.includes(peerId)) {
      reasonList.push(peerId);
      await this.db.put(reasonKey, reasonList);
    }

    // Update cache
    this.cache.set(peerId, entry);

    logger.warn('Peer added to blocklist', { peerId, reason, source, expiresAt });
  }

  /**
   * Remove a peer from the blocklist.
   */
  async remove(peerId: string): Promise<boolean> {
    const entry = this.cache.get(peerId);
    if (!entry) return false;

    // Remove from DB
    await this.db.del(`blocklist:peer:${peerId}`).catch(() => {});

    // Remove from reason index
    const reasonKey = `blocklist:reason:${entry.reason}`;
    try {
      const reasonList = (await this.db.get(reasonKey)) as string[];
      const filtered = reasonList.filter(id => id !== peerId);
      await this.db.put(reasonKey, filtered);
    } catch {
      // Index doesn't exist, fine
    }

    // Remove from cache
    this.cache.delete(peerId);

    logger.info('Peer removed from blocklist', { peerId });
    return true;
  }

  /**
   * Add evidence to an existing blocklist entry.
   */
  async addEvidence(peerId: string, evidence: BlocklistEvidence): Promise<void> {
    const entry = this.cache.get(peerId);
    if (!entry) return;

    entry.evidence.push(evidence);
    await this.db.put(`blocklist:peer:${peerId}`, entry);
    this.cache.set(peerId, entry);
  }

  /**
   * Get all blocklisted peers, optionally filtered by reason.
   */
  getAll(reason?: BlocklistReason): BlocklistEntry[] {
    const entries = [...this.cache.values()];

    // Filter out expired entries
    const active = entries.filter(e => !e.expiresAt || Date.now() < e.expiresAt);

    if (reason) {
      return active.filter(e => e.reason === reason);
    }

    return active;
  }

  /**
   * Get the count of blocklisted peers.
   */
  getCount(): number {
    return this.cache.size;
  }

  /**
   * Clean up expired temporary bans.
   */
  async cleanup(): Promise<number> {
    let removed = 0;
    const now = Date.now();

    for (const [peerId, entry] of this.cache) {
      if (entry.expiresAt && now >= entry.expiresAt) {
        await this.remove(peerId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Blocklist cleanup completed', { removed });
    }

    return removed;
  }

  /**
   * Get blocklist audit trail (all entries including historical context).
   */
  async getAuditTrail(): Promise<Array<BlocklistEntry & { active: boolean }>> {
    const results: Array<BlocklistEntry & { active: boolean }> = [];

    for await (const [, value] of this.db.scan({
      gte: 'blocklist:peer:',
      lte: 'blocklist:peer:\xff',
    })) {
      const entry = value as BlocklistEntry;
      const active = !entry.expiresAt || Date.now() < entry.expiresAt;
      results.push({ ...entry, active });
    }

    return results;
  }
}
