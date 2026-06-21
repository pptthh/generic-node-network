import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from '../../lib/storage/database.js';
import { generateED25519Keypair } from '../../lib/security/crypto/keys.js';
import { signMessage } from '../../lib/security/crypto/signing.js';
import { ReputationSystem } from '../../lib/security/reputation/system.js';
import { BlocklistManager } from '../../lib/security/blocklist/manager.js';
import { RateLimiter } from '../../lib/security/ratelimit/limiter.js';
import { MessageVerificationPipeline } from '../../lib/security/verification/pipeline.js';
import type { PublishedMessage } from '../../lib/types/messages.js';
import type { ReputationConfig, BlocklistConfig, RateLimitingConfig, SecurityConfig } from '../../lib/types/config.js';

const securityConfig: SecurityConfig = {
  mode: 'adversarial',
  defaultTrust: false,
};

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
  perPeer: {
    messagesPerSecond: 100,
    queriesPerSecond: 50,
    connectionAttemptsPerMinute: 10,
    windowSizeMs: 1000,
  },
  global: { messagesPerSecond: 10000, windowSizeMs: 1000 },
  spam: {
    duplicateMessageThreshold: 10,
    duplicateWindowMs: 60000,
    largePayloadThreshold: 30000,
    largePayloadPenalty: -20,
    malformedMessagePenalty: -10,
  },
};

function createTestMessage(sender: string): PublishedMessage {
  return {
    type: 'publish',
    messageId: `msg_${Math.random().toString(36).slice(2, 14)}`,
    topic: 'test/topic',
    payload: { data: 'hello' },
    sender,
    timestamp: Date.now(),
  };
}

describe('Message Verification Pipeline', () => {
  let db: Database;
  let reputation: ReputationSystem;
  let blocklist: BlocklistManager;
  let rateLimiter: RateLimiter;
  let pipeline: MessageVerificationPipeline;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'gnn-pipeline-test-'));
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

  it('should accept a valid signed message', async () => {
    const kp = generateED25519Keypair();
    const msg = createTestMessage('node-a');
    const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

    const result = await pipeline.verify(signed);
    expect(result.accepted).toBe(true);
  });

  it('should reject unsigned messages in adversarial mode', async () => {
    const msg = createTestMessage('node-a');

    const result = await pipeline.verify(msg);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe('unsigned_message');
    }
  });

  it('should reject messages from blocklisted peers', async () => {
    const kp = generateED25519Keypair();
    await blocklist.add('blocked-node', 'malicious', 'manual');

    const msg = createTestMessage('blocked-node');
    const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

    const result = await pipeline.verify(signed);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe('blocklisted');
    }
  });

  it('should reject messages with invalid signatures', async () => {
    const kp = generateED25519Keypair();
    const msg = createTestMessage('node-tampered');
    const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

    // Tamper with the message after signing
    (signed as any).payload = { data: 'tampered!' };

    const result = await pipeline.verify(signed);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe('invalid_signature');
      expect(result.penalty).toBe(-10);
    }
  });

  it('should reject messages with expired timestamps', async () => {
    const kp = generateED25519Keypair();
    const msg = createTestMessage('node-old');
    msg.timestamp = Date.now() - 400000; // 6+ minutes ago
    const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

    const result = await pipeline.verify(signed);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe('timestamp_expired');
    }
  });

  it('should reject duplicate messages', async () => {
    const kp = generateED25519Keypair();
    const msg = createTestMessage('node-dup');
    const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

    // First should pass
    const result1 = await pipeline.verify(signed);
    expect(result1.accepted).toBe(true);

    // Second (same messageId) should fail
    const result2 = await pipeline.verify(signed);
    expect(result2.accepted).toBe(false);
    if (!result2.accepted) {
      expect(result2.reason).toBe('duplicate_message');
    }
  });

  it('should accept messages in trusted mode', async () => {
    const trustedPipeline = new MessageVerificationPipeline({
      securityConfig: { mode: 'trusted', defaultTrust: true },
      reputationSystem: reputation,
      blocklistManager: blocklist,
      rateLimiter,
    });

    const msg = createTestMessage('node-unsigned');
    const result = await trustedPipeline.verify(msg);
    expect(result.accepted).toBe(true);
  });

  it('should update reputation positively for valid messages', async () => {
    const kp = generateED25519Keypair();
    const msg = createTestMessage('node-good');
    const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

    await pipeline.verify(signed);

    const score = await reputation.getScore('node-good');
    expect(score).toBe(51); // 50 + 1
  });

  it('should penalize reputation for invalid signatures', async () => {
    const kp = generateED25519Keypair();
    const msg = createTestMessage('node-bad-sig');
    const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);
    (signed as any).payload = { data: 'tampered' };

    await pipeline.verify(signed);

    const score = await reputation.getScore('node-bad-sig');
    expect(score).toBe(40); // 50 - 10
  });

  it('should check peer acceptance', async () => {
    expect(await pipeline.shouldAcceptPeer('normal-peer')).toBe(true);

    await blocklist.add('blocked-peer', 'malicious', 'manual');
    expect(await pipeline.shouldAcceptPeer('blocked-peer')).toBe(false);
  });

  it('should verify signature only (lightweight)', () => {
    const kp = generateED25519Keypair();
    const msg = createTestMessage('node-sig-only');
    const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);

    expect(pipeline.verifySignatureOnly(signed)).toBe(true);

    // Unsigned message
    expect(pipeline.verifySignatureOnly(msg)).toBe(false);
  });

  it('should reject rate-limited peers', async () => {
    // Use a very low rate limit for this test
    const lowRateLimitConfig: RateLimitingConfig = {
      ...rateLimitConfig,
      perPeer: {
        ...rateLimitConfig.perPeer,
        messagesPerSecond: 5, // Very low limit
        windowSizeMs: 1000,
      },
    };
    const lowRateLimiter = new RateLimiter(lowRateLimitConfig);
    const strictPipeline = new MessageVerificationPipeline({
      securityConfig,
      reputationSystem: reputation,
      blocklistManager: blocklist,
      rateLimiter: lowRateLimiter,
    });

    const kp = generateED25519Keypair();
    const peerId = 'rate-limited-peer';

    // Exhaust rate limit (5 msg/s)
    for (let i = 0; i < 5; i++) {
      const msg = createTestMessage(peerId);
      msg.messageId = `msg_${i}_${Math.random().toString(36).slice(2)}`;
      const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);
      await strictPipeline.verify(signed);
    }

    // Next message should be rate limited
    const msg = createTestMessage(peerId);
    msg.messageId = `msg_final_${Math.random().toString(36).slice(2)}`;
    const signed = signMessage(msg, kp.privateKey, kp.publicKeyBase64);
    const result = await strictPipeline.verify(signed);

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe('rate_limit_exceeded');
    }

    lowRateLimiter.stop();
  });
});
