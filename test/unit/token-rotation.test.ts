import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from '../../lib/storage/database.js';
import { TokenRotationManager } from '../../lib/security/tokens/rotation.js';
import type { ApiTokensConfig } from '../../lib/types/config.js';

const defaultConfig: ApiTokensConfig = {
  rotationEnabled: true,
  tokenTTL: 7776000000, // 90 days
  tokenTTLDays: 90,
  rotationInterval: 2592000000, // 30 days
  rotationIntervalDays: 30,
  gracePeriod: 604800000, // 7 days
  gracePeriodDays: 7,
  maxTokensKept: 3,
  hashAlgorithm: 'sha256',
  tokenLength: 32,
};

describe('Token Rotation Manager', () => {
  let db: Database;
  let tokenManager: TokenRotationManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'gnn-token-test-'));
    db = new Database(join(tempDir, 'test-db'));
    await db.open();
    tokenManager = new TokenRotationManager(defaultConfig, db);
  });

  afterEach(async () => {
    tokenManager.stopRotationScheduler();
    await db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should initialize and return a token', async () => {
    const token = await tokenManager.initialize();
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(0);
  });

  it('should initialize with an existing token', async () => {
    const existingToken = 'token_existing_1234567890abcdef';
    const token = await tokenManager.initialize(existingToken);
    expect(token).toBe(existingToken);
  });

  it('should validate the current token', async () => {
    const token = await tokenManager.initialize();
    const isValid = await tokenManager.validateToken(token);
    expect(isValid).toBe(true);
  });

  it('should reject an invalid token', async () => {
    await tokenManager.initialize();
    const isValid = await tokenManager.validateToken('invalid_token_xyz');
    expect(isValid).toBe(false);
  });

  it('should rotate tokens', async () => {
    const token1 = await tokenManager.initialize();
    const token2 = await tokenManager.forceRotate();

    expect(token2).toBeDefined();
    expect(token2).not.toBe(token1);
  });

  it('should validate old token during grace period after rotation', async () => {
    const token1 = await tokenManager.initialize();
    const token2 = await tokenManager.forceRotate();

    // Old token should still be valid (grace period)
    const isOldValid = await tokenManager.validateToken(token1);
    expect(isOldValid).toBe(true);

    // New token should also be valid
    const isNewValid = await tokenManager.validateToken(token2);
    expect(isNewValid).toBe(true);
  });

  it('should reject random tokens', async () => {
    await tokenManager.initialize();
    const isValid = await tokenManager.validateToken('token_' + 'a'.repeat(64));
    expect(isValid).toBe(false);
  });

  it('should hash tokens consistently', () => {
    const hash1 = tokenManager.hashToken('test-token');
    const hash2 = tokenManager.hashToken('test-token');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different tokens', () => {
    const hash1 = tokenManager.hashToken('token-1');
    const hash2 = tokenManager.hashToken('token-2');
    expect(hash1).not.toBe(hash2);
  });

  it('should provide rotation status', async () => {
    await tokenManager.initialize();

    const status = await tokenManager.getRotationStatus();
    expect(status.activeTokensCount).toBe(1);
    expect(status.lastRotation).not.toBeNull();
    expect(status.nextRotation).not.toBeNull();
    expect(status.gracePeriodTokensCount).toBe(0);
  });

  it('should update status after rotation', async () => {
    await tokenManager.initialize();
    await tokenManager.forceRotate();

    const status = await tokenManager.getRotationStatus();
    expect(status.activeTokensCount).toBe(1);
    expect(status.gracePeriodTokensCount).toBe(1);
  });

  it('should keep max N tokens in history', async () => {
    await tokenManager.initialize();

    // Rotate many times
    for (let i = 0; i < 5; i++) {
      await tokenManager.forceRotate();
    }

    const status = await tokenManager.getRotationStatus();
    // Should be limited to maxTokensKept = 3
    expect(status.gracePeriodTokensCount).toBeLessThanOrEqual(defaultConfig.maxTokensKept);
  });

  it('should not auto-rotate when not due', async () => {
    await tokenManager.initialize();

    // checkAndRotate should return null since rotation just happened
    const result = await tokenManager.checkAndRotate();
    expect(result).toBeNull();
  });
});
