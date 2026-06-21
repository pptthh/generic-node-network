import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from '../../lib/storage/database.js';
import { BlocklistManager } from '../../lib/security/blocklist/manager.js';
import type { BlocklistConfig } from '../../lib/types/config.js';

const defaultConfig: BlocklistConfig = {
  enabled: true,
  types: ['reputation-based', 'manual'],
  storage: {
    local: './test-blocklist.json',
  },
  updateInterval: 3600000,
};

describe('Blocklist Manager', () => {
  let db: Database;
  let blocklist: BlocklistManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'gnn-bl-test-'));
    db = new Database(join(tempDir, 'test-db'));
    await db.open();
    blocklist = new BlocklistManager(defaultConfig, db);
    await blocklist.initialize();
  });

  afterEach(async () => {
    await db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should not blocklist unknown peers', () => {
    expect(blocklist.isBlocklisted('unknown-peer')).toBe(false);
  });

  it('should permanently blocklist a peer', async () => {
    await blocklist.add('bad-peer', 'malicious', 'manual');

    expect(blocklist.isBlocklisted('bad-peer')).toBe(true);
  });

  it('should temporarily blocklist a peer', async () => {
    await blocklist.add('temp-peer', 'spam', 'reputation', {
      durationMs: 60000, // 1 minute
    });

    expect(blocklist.isBlocklisted('temp-peer')).toBe(true);

    const entry = blocklist.getEntry('temp-peer');
    expect(entry).not.toBeNull();
    expect(entry!.expiresAt).not.toBeNull();
    expect(entry!.expiresAt!).toBeGreaterThan(Date.now());
  });

  it('should remove a peer from blocklist', async () => {
    await blocklist.add('remove-peer', 'policy', 'manual');
    expect(blocklist.isBlocklisted('remove-peer')).toBe(true);

    const removed = await blocklist.remove('remove-peer');
    expect(removed).toBe(true);
    expect(blocklist.isBlocklisted('remove-peer')).toBe(false);
  });

  it('should return false when removing non-existent peer', async () => {
    const removed = await blocklist.remove('non-existent');
    expect(removed).toBe(false);
  });

  it('should track evidence', async () => {
    await blocklist.add('evidence-peer', 'spam', 'reputation', {
      evidence: [{ type: 'rate_limit', timestamp: Date.now(), count: 5 }],
    });

    await blocklist.addEvidence('evidence-peer', {
      type: 'duplicate_messages',
      timestamp: Date.now(),
      count: 10,
    });

    const entry = blocklist.getEntry('evidence-peer');
    expect(entry).not.toBeNull();
    expect(entry!.evidence.length).toBe(2);
  });

  it('should get all blocklisted peers', async () => {
    await blocklist.add('peer-1', 'spam', 'reputation');
    await blocklist.add('peer-2', 'malicious', 'manual');
    await blocklist.add('peer-3', 'spam', 'reputation');

    const all = blocklist.getAll();
    expect(all.length).toBe(3);
  });

  it('should filter by reason', async () => {
    await blocklist.add('peer-1', 'spam', 'reputation');
    await blocklist.add('peer-2', 'malicious', 'manual');
    await blocklist.add('peer-3', 'spam', 'reputation');

    const spamPeers = blocklist.getAll('spam');
    expect(spamPeers.length).toBe(2);

    const maliciousPeers = blocklist.getAll('malicious');
    expect(maliciousPeers.length).toBe(1);
  });

  it('should count blocklisted peers', async () => {
    await blocklist.add('peer-1', 'spam', 'reputation');
    await blocklist.add('peer-2', 'malicious', 'manual');

    expect(blocklist.getCount()).toBe(2);
  });

  it('should handle expired temporary bans as not blocklisted', async () => {
    // Set an already-expired ban
    await blocklist.add('expired-peer', 'spam', 'reputation', {
      expiresAt: Date.now() - 1000, // expired 1 second ago
    });

    // Should not be considered blocklisted
    expect(blocklist.isBlocklisted('expired-peer')).toBe(false);
  });

  it('should cleanup expired entries', async () => {
    await blocklist.add('expired-1', 'spam', 'reputation', { expiresAt: Date.now() - 1000 });
    await blocklist.add('expired-2', 'spam', 'reputation', { expiresAt: Date.now() - 2000 });
    await blocklist.add('active', 'malicious', 'manual'); // permanent

    const removed = await blocklist.cleanup();
    expect(removed).toBe(2);
    expect(blocklist.getCount()).toBe(1);
  });

  it('should persist across re-initialization', async () => {
    await blocklist.add('persist-peer', 'malicious', 'manual');

    // Create new manager with same DB
    const blocklist2 = new BlocklistManager(defaultConfig, db);
    await blocklist2.initialize();

    expect(blocklist2.isBlocklisted('persist-peer')).toBe(true);
  });

  it('should not blocklist when disabled', async () => {
    const disabledConfig = { ...defaultConfig, enabled: false };
    const disabledBlocklist = new BlocklistManager(disabledConfig, db);
    await disabledBlocklist.initialize();

    await disabledBlocklist.add('should-not-block', 'spam', 'reputation');
    expect(disabledBlocklist.isBlocklisted('should-not-block')).toBe(false);
  });

  it('should provide audit trail', async () => {
    await blocklist.add('audit-1', 'spam', 'reputation');
    await blocklist.add('audit-2', 'malicious', 'manual', { expiresAt: Date.now() - 1000 });

    const trail = await blocklist.getAuditTrail();
    expect(trail.length).toBe(2);

    const active = trail.find(e => e.peerId === 'audit-1');
    expect(active!.active).toBe(true);

    const expired = trail.find(e => e.peerId === 'audit-2');
    expect(expired!.active).toBe(false);
  });
});
