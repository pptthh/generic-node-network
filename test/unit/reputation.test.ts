import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from '../../lib/storage/database.js';
import { ReputationSystem } from '../../lib/security/reputation/system.js';
import type { ReputationConfig } from '../../lib/types/config.js';

const defaultConfig: ReputationConfig = {
  enabled: true,
  initialScore: 50,
  minScore: 0,
  maxScore: 100,
  decayInterval: 86400000,
  decayRate: 0.95,
  factors: {
    validMessageBenefit: 1,
    invalidMessagePenalty: -5,
    signatureFailPenalty: -10,
    spamPenalty: -50,
    timeoutPenalty: -2,
    uptimeBonus: 0.5,
    latencyBonus: {
      under50ms: 1,
      under100ms: 0.5,
      over500ms: -2,
    },
  },
};

describe('Reputation System', () => {
  let db: Database;
  let reputation: ReputationSystem;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'gnn-rep-test-'));
    db = new Database(join(tempDir, 'test-db'));
    await db.open();
    reputation = new ReputationSystem(defaultConfig, db);
  });

  afterEach(async () => {
    await db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return initial score for unknown peers', async () => {
    const score = await reputation.getScore('unknown-peer');
    expect(score).toBe(50);
  });

  it('should increase score for valid messages', async () => {
    const peerId = 'peer-good';
    await reputation.updateScore(peerId, { type: 'valid_message' }, 1);
    const score = await reputation.getScore(peerId);
    expect(score).toBe(51);
  });

  it('should decrease score for invalid signatures', async () => {
    const peerId = 'peer-bad';
    await reputation.updateScore(peerId, { type: 'invalid_signature' }, -10);
    const score = await reputation.getScore(peerId);
    expect(score).toBe(40);
  });

  it('should clamp score at minimum (0)', async () => {
    const peerId = 'peer-malicious';
    // Apply heavy penalty
    await reputation.updateScore(peerId, { type: 'spam' }, -100);
    const score = await reputation.getScore(peerId);
    expect(score).toBe(0);
  });

  it('should clamp score at maximum (100)', async () => {
    const peerId = 'peer-excellent';
    // Apply large bonus
    await reputation.updateScore(peerId, { type: 'valid_message' }, 100);
    const score = await reputation.getScore(peerId);
    expect(score).toBe(100);
  });

  it('should accumulate multiple score changes', async () => {
    const peerId = 'peer-mixed';
    await reputation.updateScore(peerId, { type: 'valid_message' }, 5);
    await reputation.updateScore(peerId, { type: 'valid_message' }, 5);
    await reputation.updateScore(peerId, { type: 'invalid_message' }, -3);

    const score = await reputation.getScore(peerId);
    // 50 + 5 + 5 - 3 = 57 (approximately, slight decay between calls)
    expect(score).toBeCloseTo(57, 0);
  });

  it('should determine correct action for score thresholds', () => {
    expect(reputation.getActionForScore(50)).toBe('none');
    expect(reputation.getActionForScore(20)).toBe('none');
    expect(reputation.getActionForScore(19)).toBe('reduce_priority');
    expect(reputation.getActionForScore(10)).toBe('reduce_priority');
    expect(reputation.getActionForScore(9)).toBe('quarantine');
    expect(reputation.getActionForScore(1)).toBe('quarantine');
    expect(reputation.getActionForScore(0)).toBe('blocklist');
  });

  it('should reject peers with zero reputation', async () => {
    const peerId = 'peer-banned';
    await reputation.updateScore(peerId, { type: 'spam' }, -100);

    const accepted = await reputation.shouldAcceptPeer(peerId);
    expect(accepted).toBe(false);
  });

  it('should accept peers with positive reputation', async () => {
    const peerId = 'peer-ok';
    await reputation.updateScore(peerId, { type: 'valid_message' }, 1);

    const accepted = await reputation.shouldAcceptPeer(peerId);
    expect(accepted).toBe(true);
  });

  it('should track valid message counter', async () => {
    const peerId = 'peer-counter';
    await reputation.updateScore(peerId, { type: 'valid_message' }, 1);
    await reputation.updateScore(peerId, { type: 'valid_message' }, 1);
    await reputation.updateScore(peerId, { type: 'valid_message' }, 1);

    const record = await reputation.getRecord(peerId);
    expect(record.validMessages).toBe(3);
  });

  it('should track invalid message counter', async () => {
    const peerId = 'peer-invalid';
    await reputation.updateScore(peerId, { type: 'invalid_signature' }, -10);
    await reputation.updateScore(peerId, { type: 'invalid_message' }, -5);

    const record = await reputation.getRecord(peerId);
    expect(record.invalidMessages).toBe(2);
  });

  it('should track spam counter', async () => {
    const peerId = 'peer-spam';
    await reputation.updateScore(peerId, { type: 'spam' }, -50);
    await reputation.updateScore(peerId, { type: 'rate_limit_exceeded' }, -5);

    const record = await reputation.getRecord(peerId);
    expect(record.spamReports).toBe(2);
  });

  it('should maintain history of events', async () => {
    const peerId = 'peer-history';
    await reputation.updateScore(peerId, { type: 'valid_message' }, 1);
    await reputation.updateScore(peerId, { type: 'invalid_signature', details: { messageId: 'msg_1' } }, -10);

    const record = await reputation.getRecord(peerId);
    expect(record.history.length).toBe(2);
    expect(record.history[0].reason).toBe('valid_message');
    expect(record.history[1].reason).toBe('invalid_signature');
  });

  it('should reset score to initial value', async () => {
    const peerId = 'peer-reset';
    await reputation.updateScore(peerId, { type: 'spam' }, -30);
    expect(await reputation.getScore(peerId)).toBe(20);

    await reputation.resetScore(peerId);
    expect(await reputation.getScore(peerId)).toBe(50);
  });

  it('should find peers below threshold', async () => {
    await reputation.updateScore('peer-low', { type: 'spam' }, -40);
    await reputation.updateScore('peer-ok', { type: 'valid_message' }, 5);
    await reputation.updateScore('peer-medium', { type: 'invalid_message' }, -20);

    const lowPeers = await reputation.getPeersBelowThreshold(20);
    expect(lowPeers.length).toBe(1);
    expect(lowPeers[0].peerId).toBe('peer-low');
  });

  it('should not update scores when disabled', async () => {
    const disabledConfig = { ...defaultConfig, enabled: false };
    const disabledRep = new ReputationSystem(disabledConfig, db);

    const peerId = 'peer-disabled';
    const score = await disabledRep.updateScore(peerId, { type: 'spam' }, -50);
    expect(score).toBe(50); // Always returns initial
  });
});
