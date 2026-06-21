/**
 * Phase 3: Security module types
 */

// --- Cryptographic Identity ---

export interface NodeKeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
  publicKeyBase64: string;
  cryptoPeerId: string; // Qm<base32(SHA256(publicKey))>
}

export interface EncryptedKeyFile {
  algorithm: 'aes-256-gcm';
  kdf: 'scrypt';
  kdfParams: {
    N: number;
    r: number;
    p: number;
    salt: string; // hex
  };
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // hex
}

export interface NodeIdentityFile {
  peerId: string;
  publicKey: string; // base64
  createdAt: number;
}

export interface KeyRotationEntry {
  publicKey: string; // base64
  cryptoPeerId: string;
  createdAt: number;
  rotatedAt: number;
  gracePeriodUntil: number;
  status: 'secondary' | 'expired';
}

// --- Reputation ---

export type ReputationEventType =
  | 'valid_message'
  | 'invalid_message'
  | 'invalid_signature'
  | 'identity_fraud'
  | 'duplicate_message'
  | 'rate_limit_exceeded'
  | 'spam'
  | 'timeout'
  | 'processing_error'
  | 'connection_success'
  | 'connection_failure';

export interface ReputationEvent {
  type: ReputationEventType;
  details?: Record<string, unknown>;
}

export interface ReputationHistoryEntry {
  score: number;
  timestamp: number;
  reason: ReputationEventType;
  details?: Record<string, unknown>;
}

export interface ReputationRecord {
  score: number;
  lastUpdate: number;
  validMessages: number;
  invalidMessages: number;
  spamReports: number;
  avgLatency: number;
  uptime: number;
  history: ReputationHistoryEntry[];
}

// --- Blocklist ---

export type BlocklistReason = 'spam' | 'malicious' | 'unresponsive' | 'policy' | 'identity_fraud';
export type BlocklistSource = 'manual' | 'reputation' | 'community';

export interface BlocklistEvidence {
  type: string;
  timestamp: number;
  count: number;
}

export interface BlocklistEntry {
  peerId: string;
  reason: BlocklistReason;
  addedAt: number;
  expiresAt: number | null; // null = permanent
  source: BlocklistSource;
  evidence: BlocklistEvidence[];
}

// --- Token Rotation ---

export type TokenStatus = 'active' | 'secondary' | 'deprecated' | 'expired';

export interface TokenRecord {
  hash: string;
  createdAt: number;
  expiresAt: number;
  status: TokenStatus;
  rotatedAt?: number;
  gracePeriodUntil?: number;
}

// --- Rate Limiting ---

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// --- Verification Pipeline ---

export type VerificationResult =
  | { accepted: true }
  | { accepted: false; reason: string; penalty?: number };

export interface VerificationContext {
  peerId: string;
  messageId: string;
  timestamp: number;
}
