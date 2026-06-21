import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateED25519Keypair,
  deriveCryptoPeerId,
  encryptPrivateKey,
  decryptPrivateKey,
  generateKeyPassword,
  KeyManager,
} from '../../lib/security/crypto/keys.js';

describe('Ed25519 Key Generation', () => {
  it('should generate a valid keypair', () => {
    const keyPair = generateED25519Keypair();

    expect(keyPair.publicKey).toBeInstanceOf(Buffer);
    expect(keyPair.privateKey).toBeInstanceOf(Buffer);
    expect(keyPair.publicKeyBase64).toBeDefined();
    expect(keyPair.publicKeyBase64.length).toBeGreaterThan(0);
    expect(keyPair.cryptoPeerId).toMatch(/^Qm[a-z2-7]+$/);
  });

  it('should generate different keypairs each time', () => {
    const kp1 = generateED25519Keypair();
    const kp2 = generateED25519Keypair();

    expect(kp1.publicKeyBase64).not.toBe(kp2.publicKeyBase64);
    expect(kp1.cryptoPeerId).not.toBe(kp2.cryptoPeerId);
  });

  it('should derive consistent peer IDs from the same public key', () => {
    const kp = generateED25519Keypair();
    const peerId1 = deriveCryptoPeerId(kp.publicKey);
    const peerId2 = deriveCryptoPeerId(kp.publicKey);

    expect(peerId1).toBe(peerId2);
    expect(peerId1).toBe(kp.cryptoPeerId);
  });

  it('should generate peer IDs starting with Qm', () => {
    const kp = generateED25519Keypair();
    expect(kp.cryptoPeerId).toMatch(/^Qm/);
    expect(kp.cryptoPeerId.length).toBe(46);
  });
});

describe('Private Key Encryption/Decryption', () => {
  it('should encrypt and decrypt a private key', () => {
    const kp = generateED25519Keypair();
    const password = 'test-password-123';

    const encrypted = encryptPrivateKey(kp.privateKey, password);

    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.kdf).toBe('scrypt');
    expect(encrypted.kdfParams.salt).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.ciphertext).toBeDefined();

    const decrypted = decryptPrivateKey(encrypted, password);
    expect(decrypted).toEqual(kp.privateKey);
  });

  it('should fail to decrypt with wrong password', () => {
    const kp = generateED25519Keypair();
    const encrypted = encryptPrivateKey(kp.privateKey, 'correct-password');

    expect(() => decryptPrivateKey(encrypted, 'wrong-password')).toThrow();
  });

  it('should generate unique salt and IV each time', () => {
    const kp = generateED25519Keypair();
    const password = 'same-password';

    const enc1 = encryptPrivateKey(kp.privateKey, password);
    const enc2 = encryptPrivateKey(kp.privateKey, password);

    expect(enc1.kdfParams.salt).not.toBe(enc2.kdfParams.salt);
    expect(enc1.iv).not.toBe(enc2.iv);
  });
});

describe('Key Password Generation', () => {
  it('should generate a 64-char hex string', () => {
    const password = generateKeyPassword();
    expect(password).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate unique passwords', () => {
    const p1 = generateKeyPassword();
    const p2 = generateKeyPassword();
    expect(p1).not.toBe(p2);
  });
});

describe('KeyManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gnn-keys-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should generate keys on first initialization', async () => {
    const manager = new KeyManager({ keyDir: tempDir, nodeId: 'test-node' });
    const keyPair = await manager.initialize();

    expect(keyPair.publicKey).toBeInstanceOf(Buffer);
    expect(keyPair.privateKey).toBeInstanceOf(Buffer);
    expect(keyPair.cryptoPeerId).toMatch(/^Qm/);
  });

  it('should load existing keys on subsequent initialization', async () => {
    const manager1 = new KeyManager({ keyDir: tempDir, nodeId: 'test-node' });
    const kp1 = await manager1.initialize();

    const manager2 = new KeyManager({ keyDir: tempDir, nodeId: 'test-node' });
    const kp2 = await manager2.initialize();

    expect(kp2.publicKeyBase64).toBe(kp1.publicKeyBase64);
    expect(kp2.cryptoPeerId).toBe(kp1.cryptoPeerId);
  });

  it('should rotate keys and retain old key in grace period', async () => {
    const manager = new KeyManager({ keyDir: tempDir, nodeId: 'test-node' });
    const original = await manager.initialize();
    const originalPeerId = original.cryptoPeerId;

    const rotated = await manager.rotateKeys();

    expect(rotated.cryptoPeerId).not.toBe(originalPeerId);
    expect(manager.getCryptoPeerId()).toBe(rotated.cryptoPeerId);

    // Old key should be in grace period
    const gracePeriodKeys = manager.getGracePeriodKeys();
    expect(gracePeriodKeys.length).toBe(1);
    expect(gracePeriodKeys[0].publicKey).toBe(original.publicKeyBase64);
  });

  it('should report known public keys including grace period', async () => {
    const manager = new KeyManager({ keyDir: tempDir, nodeId: 'test-node' });
    const original = await manager.initialize();

    await manager.rotateKeys();

    // Original key should still be known (grace period)
    expect(manager.isKnownPublicKey(original.publicKeyBase64)).toBe(true);

    // Current key should be known
    const current = manager.getKeyPair()!;
    expect(manager.isKnownPublicKey(current.publicKeyBase64)).toBe(true);

    // Random key should not be known
    const random = generateED25519Keypair();
    expect(manager.isKnownPublicKey(random.publicKeyBase64)).toBe(false);
  });
});
