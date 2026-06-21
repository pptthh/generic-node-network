import { describe, it, expect } from 'vitest';
import { generateED25519Keypair } from '../../lib/security/crypto/keys.js';
import {
  signMessage,
  verifySignature,
  verifyTimestamp,
  verifyMessage,
  isSignedMessage,
} from '../../lib/security/crypto/signing.js';
import type { PublishedMessage, SignedGNNMessage } from '../../lib/types/messages.js';

function createTestMessage(overrides?: Partial<PublishedMessage>): PublishedMessage {
  return {
    type: 'publish',
    messageId: 'msg_test123',
    topic: 'test/topic',
    payload: { data: 'hello', value: 42 },
    sender: 'node-a',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('Message Signing', () => {
  it('should sign a message and add publicKey, signature, version fields', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage();

    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    expect(signed.publicKey).toBe(kp.publicKeyBase64);
    expect(signed.signature).toBeDefined();
    expect(signed.signature.length).toBeGreaterThan(0);
    expect(signed.version).toBe(2);
    // Original fields preserved
    expect(signed.type).toBe('publish');
    expect(signed.messageId).toBe('msg_test123');
    expect(signed.sender).toBe('node-a');
  });

  it('should produce different signatures for different messages', () => {
    const kp = generateED25519Keypair();
    const msg1 = createTestMessage({ messageId: 'msg_1' });
    const msg2 = createTestMessage({ messageId: 'msg_2' });

    const signed1 = signMessage(msg1, kp.privateKey, kp.publicKeyBase64);
    const signed2 = signMessage(msg2, kp.privateKey, kp.publicKeyBase64);

    expect(signed1.signature).not.toBe(signed2.signature);
  });

  it('should produce different signatures with different keys', () => {
    const kp1 = generateED25519Keypair();
    const kp2 = generateED25519Keypair();
    const message = createTestMessage();

    const signed1 = signMessage(message, kp1.privateKey, kp1.publicKeyBase64);
    const signed2 = signMessage(message, kp2.privateKey, kp2.publicKeyBase64);

    expect(signed1.signature).not.toBe(signed2.signature);
  });
});

describe('Signature Verification', () => {
  it('should verify a valid signed message', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage();
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    const isValid = verifySignature(signed);
    expect(isValid).toBe(true);
  });

  it('should reject a tampered message (payload changed)', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage();
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    // Tamper with payload
    (signed as any).payload = { data: 'evil' };

    const isValid = verifySignature(signed);
    expect(isValid).toBe(false);
  });

  it('should reject a tampered message (sender changed)', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage();
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    // Tamper with sender
    (signed as any).sender = 'attacker';

    const isValid = verifySignature(signed);
    expect(isValid).toBe(false);
  });

  it('should reject a tampered message (topic changed)', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage();
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    // Tamper with topic
    (signed as any).topic = 'different/topic';

    const isValid = verifySignature(signed);
    expect(isValid).toBe(false);
  });

  it('should reject a message with wrong public key', () => {
    const kp1 = generateED25519Keypair();
    const kp2 = generateED25519Keypair();
    const message = createTestMessage();
    const signed = signMessage(message, kp1.privateKey, kp1.publicKeyBase64);

    // Try to verify with wrong public key
    const isValid = verifySignature(signed, kp2.publicKey);
    expect(isValid).toBe(false);
  });

  it('should reject a message with invalid signature', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage();
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    // Corrupt the signature
    (signed as any).signature = 'aW52YWxpZHNpZ25hdHVyZQ==';

    const isValid = verifySignature(signed);
    expect(isValid).toBe(false);
  });

  it('should return false for messages missing signature', () => {
    const isValid = verifySignature({ signature: '', publicKey: 'abc' } as unknown as SignedGNNMessage);
    expect(isValid).toBe(false);
  });
});

describe('Timestamp Verification', () => {
  it('should accept a fresh message', () => {
    expect(verifyTimestamp(Date.now())).toBe(true);
  });

  it('should accept a message up to 5 minutes old', () => {
    expect(verifyTimestamp(Date.now() - 290000)).toBe(true); // ~4.8 min
  });

  it('should reject a message older than 5 minutes', () => {
    expect(verifyTimestamp(Date.now() - 310000)).toBe(false); // ~5.2 min
  });

  it('should reject a message from the far future', () => {
    expect(verifyTimestamp(Date.now() + 60000)).toBe(false); // 1 min in future
  });

  it('should accept a message slightly in the future (clock skew)', () => {
    expect(verifyTimestamp(Date.now() + 20000)).toBe(true); // 20s in future
  });

  it('should support custom max age', () => {
    // 1 second max age
    expect(verifyTimestamp(Date.now() - 500, 1000)).toBe(true);
    expect(verifyTimestamp(Date.now() - 1500, 1000)).toBe(false);
  });
});

describe('Full Message Verification (verifyMessage)', () => {
  it('should pass for a valid fresh signed message', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage();
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    const result = verifyMessage(signed);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should fail for missing signature', () => {
    const message = createTestMessage() as any;
    message.publicKey = 'abc';
    message.version = 2;

    const result = verifyMessage(message as SignedGNNMessage);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_signature');
  });

  it('should fail for expired timestamp', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage({ timestamp: Date.now() - 400000 });
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    const result = verifyMessage(signed);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_expired');
  });

  it('should skip timestamp check when option is set', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage({ timestamp: Date.now() - 400000 });
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    const result = verifyMessage(signed, undefined, { checkTimestamp: false });
    expect(result.valid).toBe(true);
  });

  it('should fail for invalid signature', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage();
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    // Tamper
    (signed as any).sender = 'hacked';

    const result = verifyMessage(signed, undefined, { checkTimestamp: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });
});

describe('isSignedMessage', () => {
  it('should return true for signed messages', () => {
    const kp = generateED25519Keypair();
    const message = createTestMessage();
    const signed = signMessage(message, kp.privateKey, kp.publicKeyBase64);

    expect(isSignedMessage(signed)).toBe(true);
  });

  it('should return false for unsigned messages', () => {
    const message = createTestMessage();
    expect(isSignedMessage(message)).toBe(false);
  });

  it('should return false for partially signed messages', () => {
    const message = createTestMessage();
    (message as any).publicKey = 'abc';
    // Missing signature and version
    expect(isSignedMessage(message)).toBe(false);
  });
});
