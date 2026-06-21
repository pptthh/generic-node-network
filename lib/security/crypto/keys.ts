/**
 * Phase 3: Ed25519 Key Generation, Storage, and Management
 *
 * - Generates Ed25519 keypairs for node identity
 * - Encrypts private keys at rest using AES-256-GCM + scrypt
 * - Derives cryptographic peer ID from public key
 * - Handles key rotation with grace periods
 */

import {
  generateKeyPairSync,
  createHash,
  scryptSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '../../utils/logger.js';
import type {
  NodeKeyPair,
  EncryptedKeyFile,
  NodeIdentityFile,
  KeyRotationEntry,
} from '../types.js';

// Base32 encoding (RFC 4648 without padding)
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Derive a cryptographic peer ID from a public key.
 * Format: Qm<base32(SHA256(publicKey))> (truncated to 46 chars total)
 */
export function deriveCryptoPeerId(publicKey: Buffer): string {
  const hash = createHash('sha256').update(publicKey).digest();
  const encoded = base32Encode(hash);
  return 'Qm' + encoded.slice(0, 44); // Total 46 chars
}

/**
 * Generate a new Ed25519 keypair.
 */
export function generateED25519Keypair(): NodeKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  const publicKeyBuffer = Buffer.from(publicKey);
  const privateKeyBuffer = Buffer.from(privateKey);
  const publicKeyBase64 = publicKeyBuffer.toString('base64');
  const cryptoPeerId = deriveCryptoPeerId(publicKeyBuffer);

  return {
    publicKey: publicKeyBuffer,
    privateKey: privateKeyBuffer,
    publicKeyBase64,
    cryptoPeerId,
  };
}

/**
 * Encrypt a private key for storage at rest.
 * Uses AES-256-GCM with a key derived from a password via scrypt.
 */
export function encryptPrivateKey(privateKey: Buffer, password: string): EncryptedKeyFile {
  const salt = randomBytes(32);
  const N = 16384;
  const r = 8;
  const p = 1;

  // Derive encryption key via scrypt
  const derivedKey = scryptSync(password, salt, 32, { N, r, p });

  // Encrypt with AES-256-GCM
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(privateKey),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    kdfParams: {
      N,
      r,
      p,
      salt: salt.toString('hex'),
    },
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
  };
}

/**
 * Decrypt a private key from its encrypted storage format.
 */
export function decryptPrivateKey(encrypted: EncryptedKeyFile, password: string): Buffer {
  const { kdfParams, iv, authTag, ciphertext } = encrypted;
  const salt = Buffer.from(kdfParams.salt, 'hex');

  // Derive decryption key via scrypt
  const derivedKey = scryptSync(password, salt, 32, {
    N: kdfParams.N,
    r: kdfParams.r,
    p: kdfParams.p,
  });

  // Decrypt with AES-256-GCM
  const decipher = createDecipheriv(
    'aes-256-gcm',
    derivedKey,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]);

  return decrypted;
}

/**
 * Generate a secure random password for key encryption.
 * Used as the master password when no user-provided password exists.
 */
export function generateKeyPassword(): string {
  return randomBytes(32).toString('hex');
}

// --- Key Storage Manager ---

export interface KeyStorageOptions {
  keyDir: string;
  nodeId: string;
}

export class KeyManager {
  private readonly keyDir: string;
  private readonly nodeId: string;
  private keyPair: NodeKeyPair | null = null;
  private keyHistory: KeyRotationEntry[] = [];
  private password: string | null = null;

  constructor(options: KeyStorageOptions) {
    this.keyDir = options.keyDir.replace('${node-id}', options.nodeId);
    this.nodeId = options.nodeId;
  }

  /**
   * Initialize the key manager - load existing keys or generate new ones.
   */
  async initialize(password?: string): Promise<NodeKeyPair> {
    // Ensure key directory exists
    if (!existsSync(this.keyDir)) {
      mkdirSync(this.keyDir, { recursive: true });
    }

    const identityPath = join(this.keyDir, 'node-id.json');
    const encryptedKeyPath = join(this.keyDir, 'private-key.encrypted');
    const passwordPath = join(this.keyDir, 'private-key.password');
    const historyPath = join(this.keyDir, 'key-rotation-history.json');

    // Load key rotation history
    if (existsSync(historyPath)) {
      try {
        this.keyHistory = JSON.parse(readFileSync(historyPath, 'utf-8'));
      } catch {
        this.keyHistory = [];
      }
    }

    // Check if keys already exist
    if (existsSync(identityPath) && existsSync(encryptedKeyPath)) {
      return this.loadExistingKeys(identityPath, encryptedKeyPath, passwordPath, password);
    }

    // Generate new keys
    return this.generateAndStoreKeys(identityPath, encryptedKeyPath, passwordPath, password);
  }

  private loadExistingKeys(
    identityPath: string,
    encryptedKeyPath: string,
    passwordPath: string,
    providedPassword?: string
  ): NodeKeyPair {
    const identity: NodeIdentityFile = JSON.parse(readFileSync(identityPath, 'utf-8'));
    const encryptedKey: EncryptedKeyFile = JSON.parse(readFileSync(encryptedKeyPath, 'utf-8'));

    // Resolve password
    this.password = providedPassword ?? this.loadPassword(passwordPath);
    if (!this.password) {
      throw new Error('No password available to decrypt private key');
    }

    // Decrypt private key
    const privateKey = decryptPrivateKey(encryptedKey, this.password);
    const publicKey = Buffer.from(identity.publicKey, 'base64');

    this.keyPair = {
      publicKey,
      privateKey,
      publicKeyBase64: identity.publicKey,
      cryptoPeerId: identity.peerId,
    };

    logger.info('Loaded existing node keys', { peerId: identity.peerId });
    return this.keyPair;
  }

  private generateAndStoreKeys(
    identityPath: string,
    encryptedKeyPath: string,
    passwordPath: string,
    providedPassword?: string
  ): NodeKeyPair {
    // Generate new keypair
    this.keyPair = generateED25519Keypair();

    // Generate or use provided password
    this.password = providedPassword ?? generateKeyPassword();

    // Save identity file
    const identity: NodeIdentityFile = {
      peerId: this.keyPair.cryptoPeerId,
      publicKey: this.keyPair.publicKeyBase64,
      createdAt: Date.now(),
    };
    writeFileSync(identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });

    // Encrypt and save private key
    const encrypted = encryptPrivateKey(this.keyPair.privateKey, this.password);
    writeFileSync(encryptedKeyPath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });

    // Save password hash (for auto-loading later)
    const passwordHash = createHash('sha256').update(this.password).digest('hex');
    writeFileSync(passwordPath, JSON.stringify({
      hash: passwordHash,
      plaintext: this.password, // Stored locally only - not shared
    }, null, 2), { mode: 0o600 });

    logger.info('Generated new node keys', { peerId: this.keyPair.cryptoPeerId });
    return this.keyPair;
  }

  private loadPassword(passwordPath: string): string | null {
    if (!existsSync(passwordPath)) return null;
    try {
      const data = JSON.parse(readFileSync(passwordPath, 'utf-8'));
      return data.plaintext ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Rotate signing keys. Old key enters grace period.
   */
  async rotateKeys(): Promise<NodeKeyPair> {
    if (!this.keyPair || !this.password) {
      throw new Error('Key manager not initialized');
    }

    const oldEntry: KeyRotationEntry = {
      publicKey: this.keyPair.publicKeyBase64,
      cryptoPeerId: this.keyPair.cryptoPeerId,
      createdAt: Date.now() - 2592000000, // approximate
      rotatedAt: Date.now(),
      gracePeriodUntil: Date.now() + 604800000, // 7 days
      status: 'secondary',
    };

    this.keyHistory.push(oldEntry);

    // Generate new keypair
    this.keyPair = generateED25519Keypair();

    // Save updated files
    const identityPath = join(this.keyDir, 'node-id.json');
    const encryptedKeyPath = join(this.keyDir, 'private-key.encrypted');
    const historyPath = join(this.keyDir, 'key-rotation-history.json');

    // Save new identity
    const identity: NodeIdentityFile = {
      peerId: this.keyPair.cryptoPeerId,
      publicKey: this.keyPair.publicKeyBase64,
      createdAt: Date.now(),
    };
    writeFileSync(identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });

    // Encrypt and save new private key
    const encrypted = encryptPrivateKey(this.keyPair.privateKey, this.password);
    writeFileSync(encryptedKeyPath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });

    // Clean up old keys beyond retention
    this.keyHistory = this.keyHistory
      .filter(k => k.status === 'secondary' && Date.now() < k.gracePeriodUntil)
      .slice(-3); // Keep max 3 old keys

    // Save rotation history
    writeFileSync(historyPath, JSON.stringify(this.keyHistory, null, 2), { mode: 0o600 });

    // Backup old encrypted key
    const backupDir = join(this.keyDir, 'backups');
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    const backupPath = join(backupDir, `private-key-${new Date().toISOString().slice(0, 10)}.encrypted`);
    writeFileSync(backupPath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });

    logger.info('Signing keys rotated', {
      newPeerId: this.keyPair.cryptoPeerId,
      oldKeysRetained: this.keyHistory.length,
    });

    return this.keyPair;
  }

  /**
   * Get the current keypair.
   */
  getKeyPair(): NodeKeyPair | null {
    return this.keyPair;
  }

  /**
   * Get the current crypto peer ID.
   */
  getCryptoPeerId(): string | null {
    return this.keyPair?.cryptoPeerId ?? null;
  }

  /**
   * Get old public keys that are still in their grace period.
   * Used for verifying messages signed with recently-rotated keys.
   */
  getGracePeriodKeys(): KeyRotationEntry[] {
    return this.keyHistory.filter(
      k => k.status === 'secondary' && Date.now() < k.gracePeriodUntil
    );
  }

  /**
   * Check if a public key (base64) matches either the current key or a grace-period key.
   */
  isKnownPublicKey(publicKeyBase64: string): boolean {
    if (this.keyPair?.publicKeyBase64 === publicKeyBase64) return true;
    return this.keyHistory.some(
      k => k.publicKey === publicKeyBase64 && Date.now() < k.gracePeriodUntil
    );
  }
}
