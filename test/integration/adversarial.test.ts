/**
 * Phase 3: Integration test - Adversarial Network Scenarios
 *
 * Tests the full security stack working together:
 * - Key generation + message signing
 * - Reputation tracking across interactions
 * - Blocklist enforcement
 * - Rate limiting under load
 * - Token rotation lifecycle
 * - Key rotation with grace period verification
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from '../../lib/storage/database.js';
import {
  generateED25519Keypair,
  KeyManager,
  signMessage,
  verifyMessage,
  isSignedMessage,
  ReputationSystem,
  BlocklistManager,
  RateLimiter,
  TokenRotationManager,
  MessageVerificationPipeline,
} from '../../lib/security/index.js';
import type { PublishedMessage } from '../../lib/types/messages.js';
import type {
  SecurityConfig,
  ReputationConfig,
  BlocklistConfig,
  RateLimitingConfig,
  ApiTokensConfig,
} from '../../lib/types/config.js';

// Default configs for integration tests
const securityConfig: SecurityConfig = { mode: 'adversarial', defaultTrust: false };

const reputationConfig: ReputationConfig = {
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
    latencyBonus: { under50ms: 1, under100ms: 0.5, over500ms: -2 },
  },
};

const blocklistConfig: BlocklistConfig = {
  enabled: true,
  types: ['reputation-based', 'manual'],
  storage: { local: './test-blocklist.json' },
  updateInterval: 3600000,
};

const rateLimitConfig: RateLimitingConfig = {
  enabled: true,
  perPeer: { messagesPerSecond: 50, queriesPerSecond: 25, connectionAttemptsPerMinute: 10, windowSizeMs: 1000 },
  global: { messagesPerSecond: 10000, windowSizeMs: 1000 },
  spam: { duplicateMessageThreshold: 10, duplicateWindowMs: 60000, largePayloadThreshold: 30000, largePayloadPenalty: -20, malformedMessagePenalty: -10 },
};

const tokenConfig: ApiTokensConfig = {
  rotationEnabled: true,
  tokenTTL: 7776000000,
  tokenTTLDays: 90,
  rotationInterval: 2592000000,
  rotationIntervalDays: 30,
  gracePeriod: 604800000,
  gracePeriodDays: 7,
  maxTokensKept: 3,
  hashAlgorithm: 'sha256',
  tokenLength: 32,
};

function createMessage(sender: string, topic = 'test/data'): PublishedMessage {
  return {
    type: 'publish',
    messageId: `msg_${Math.random().toString(36).slice(2, 14)}`,
    topic,
    payload: { value: Math.random(), timestamp: Date.now() },
    sender,
    timestamp: Date.now(),
  };
}

describe('Adversarial Network Integration', () => {
  let db: Database;
  let tempDir: string;
  let reputation: ReputationSystem;
  let blocklist: BlocklistManager;
  let rateLimiter: RateLimiter;
  let pipeline: MessageVerificationPipeline;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'gnn-adversarial-'));
    db = new Database(join(tempDir, 'test-db'));
    await db.open();

    reputation = new ReputationSystem(reputationConfig, db);
    blocklist = new BlocklistManager(blocklistConfig, db);
    await blocklist.initialize();
    rateLimiter = new RateLimiter(rateLimitConfig);

    pipeline = new MessageVerificationPipeline({
      securityConfig,
      reputationSystem: reputation,
      blocklistManager: blocklist,
      rateLimiter,
    });
  });

  afterEach(async () => {
    rateLimiter.stop();
    await db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('End-to-End Message Signing & Verification', () => {
    it('should sign, transmit, and verify a message between two nodes', () => {
      // Node A signs a message
      const nodeAKeys = generateED25519Keypair();
      const message = createMessage('node-a');
      const signed = signMessage(message, nodeAKeys.privateKey, nodeAKeys.publicKeyBase64);

      // "Transmit" (JSON serialize/deserialize simulating network)
      const transmitted = JSON.parse(JSON.stringify(signed));

      // Node B verifies the received message
      expect(isSignedMessage(transmitted)).toBe(true);
      const result = verifyMessage(transmitted, undefined, { checkTimestamp: true });
      expect(result.valid).toBe(true);
    });

    it('should detect tampering during transit', () => {
      const nodeAKeys = generateED25519Keypair();
      const message = createMessage('node-a');
      const signed = signMessage(message, nodeAKeys.privateKey, nodeAKeys.publicKeyBase64);

      // Simulate man-in-the-middle attack
      const transmitted = JSON.parse(JSON.stringify(signed));
      transmitted.payload = { value: 999, injected: true };

      // Verification should fail
      const result = verifyMessage(transmitted, undefined, { checkTimestamp: true });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_signature');
    });
  });

  describe('Reputation-Based Peer Management', () => {
    it('should gradually block a malicious peer through reputation decay', async () => {
      const attackerKeys = generateED25519Keypair();
      const attackerId = 'attacker-node';

      // Attacker sends 10 messages with invalid signatures (tampered after signing)
      for (let i = 0; i < 10; i++) {
        const msg = createMessage(attackerId);
        msg.messageId = `msg_attack_${i}`;
        const signed = signMessage(msg, attackerKeys.privateKey, attackerKeys.publicKeyBase64);
        // Tamper after signing
        (signed as any).payload = { evil: true };
        await pipeline.verify(signed);
      }

      // Attacker's reputation should be very low
      const score = await reputation.getScore(attackerId);
      expect(score).toBeLessThan(10); // Should be around -50 (clamped to 0)

      // Peer should no longer be accepted
      const accepted = await pipeline.shouldAcceptPeer(attackerId);
      expect(accepted).toBe(false);
    });

    it('should reward consistently good peers', async () => {
      const goodKeys = generateED25519Keypair();
      const goodPeerId = 'good-node';

      // Send 20 valid messages
      for (let i = 0; i < 20; i++) {
        const msg = createMessage(goodPeerId);
        msg.messageId = `msg_good_${i}`;
        const signed = signMessage(msg, goodKeys.privateKey, goodKeys.publicKeyBase64);
        await pipeline.verify(signed);
      }

      const score = await reputation.getScore(goodPeerId);
      expect(score).toBeGreaterThan(60); // Started at 50, +1 per valid message
    });
  });

  describe('Blocklist Enforcement', () => {
    it('should immediately reject messages from manually blocklisted peers', async () => {
      const kp = generateED25519Keypair();
      const peerId = 'manual-blocked';

      await blocklist.add(peerId, 'policy', 'manual');

      const msg = createMessage(peerId);
      const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);
      const result = await pipeline.verify(signed);

      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.reason).toBe('blocklisted');
      }
    });

    it('should unblock peers when temporary ban expires', async () => {
      const kp = generateED25519Keypair();
      const peerId = 'temp-blocked';

      // Ban for a very short time (already expired)
      await blocklist.add(peerId, 'spam', 'reputation', {
        expiresAt: Date.now() - 1, // Already expired
      });

      const msg = createMessage(peerId);
      const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);
      const result = await pipeline.verify(signed);

      expect(result.accepted).toBe(true);
    });
  });

  describe('Key Rotation', () => {
    it('should maintain signing capability after key rotation', async () => {
      const keyDir = join(tempDir, 'keys');
      const keyManager = new KeyManager({ keyDir, nodeId: 'rotating-node' });
      const originalKeys = await keyManager.initialize();

      // Sign message with original key
      const msg1 = createMessage('rotating-node');
      const signed1 = signMessage(msg1, originalKeys.privateKey, originalKeys.publicKeyBase64);
      const result1 = verifyMessage(signed1, undefined, { checkTimestamp: true });
      expect(result1.valid).toBe(true);

      // Rotate keys
      const newKeys = await keyManager.rotateKeys();

      // Sign message with new key
      const msg2 = createMessage('rotating-node');
      const signed2 = signMessage(msg2, newKeys.privateKey, newKeys.publicKeyBase64);
      const result2 = verifyMessage(signed2, undefined, { checkTimestamp: true });
      expect(result2.valid).toBe(true);

      // Old key should still be recognized (grace period)
      expect(keyManager.isKnownPublicKey(originalKeys.publicKeyBase64)).toBe(true);
    });
  });

  describe('Token Rotation', () => {
    it('should maintain API access through token rotation', async () => {
      const tokenManager = new TokenRotationManager(tokenConfig, db);
      const token1 = await tokenManager.initialize();

      // Token should be valid
      expect(await tokenManager.validateToken(token1)).toBe(true);

      // Rotate
      const token2 = await tokenManager.forceRotate();

      // Both should be valid (grace period)
      expect(await tokenManager.validateToken(token1)).toBe(true);
      expect(await tokenManager.validateToken(token2)).toBe(true);

      // Random token should be invalid
      expect(await tokenManager.validateToken('fake_token_xyz')).toBe(false);
    });
  });

  describe('Spam Detection & Prevention', () => {
    it('should detect and penalize duplicate message spam', async () => {
      const kp = generateED25519Keypair();
      const peerId = 'spammer';
      const msg = createMessage(peerId);
      const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

      // First send succeeds
      const r1 = await pipeline.verify(signed);
      expect(r1.accepted).toBe(true);

      // Duplicate should fail
      const r2 = await pipeline.verify(signed);
      expect(r2.accepted).toBe(false);
      if (!r2.accepted) {
        expect(r2.reason).toBe('duplicate_message');
      }

      // Score should have been penalized
      const score = await reputation.getScore(peerId);
      expect(score).toBeLessThan(50); // Penalized for duplicate
    });

    it('should prevent replay attacks with old timestamps', async () => {
      const kp = generateED25519Keypair();
      const msg = createMessage('replay-attacker');
      msg.timestamp = Date.now() - 600000; // 10 minutes old
      const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

      const result = await pipeline.verify(signed);
      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.reason).toBe('timestamp_expired');
      }
    });
  });

  describe('Performance', () => {
    it('should verify messages within 50ms', () => {
      const kp = generateED25519Keypair();
      const msg = createMessage('perf-node');
      const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

      const start = performance.now();
      const result = verifyMessage(signed, undefined, { checkTimestamp: true });
      const elapsed = performance.now() - start;

      expect(result.valid).toBe(true);
      expect(elapsed).toBeLessThan(50);
    });

    it('should sign messages within 10ms', () => {
      const kp = generateED25519Keypair();
      const msg = createMessage('perf-node');

      const start = performance.now();
      signMessage(msg, kp.privateKey, kp.publicKeyBase64);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
    });
  });
});
