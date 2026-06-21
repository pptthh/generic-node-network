/**
 * Phase 3: Security Module - Public API
 *
 * Re-exports all security components for easy imports.
 */

// Crypto
export { canonicalStringify } from './crypto/canonical.js';
export {
  generateED25519Keypair,
  deriveCryptoPeerId,
  encryptPrivateKey,
  decryptPrivateKey,
  generateKeyPassword,
  KeyManager,
} from './crypto/keys.js';
export type { KeyStorageOptions } from './crypto/keys.js';
export {
  signMessage,
  verifySignature,
  verifyTimestamp,
  verifyMessage,
  isSignedMessage,
} from './crypto/signing.js';

// Reputation
export { ReputationSystem } from './reputation/system.js';
export type { ReputationAction } from './reputation/system.js';

// Blocklist
export { BlocklistManager } from './blocklist/manager.js';

// Rate Limiting
export { RateLimiter, TokenBucket } from './ratelimit/limiter.js';

// Token Rotation
export { TokenRotationManager } from './tokens/rotation.js';

// Verification Pipeline
export { MessageVerificationPipeline } from './verification/pipeline.js';
export type { VerificationPipelineOptions } from './verification/pipeline.js';

// Types
export type {
  NodeKeyPair,
  EncryptedKeyFile,
  NodeIdentityFile,
  KeyRotationEntry,
  ReputationEventType,
  ReputationEvent,
  ReputationHistoryEntry,
  ReputationRecord,
  BlocklistReason,
  BlocklistSource,
  BlocklistEvidence,
  BlocklistEntry,
  TokenStatus,
  TokenRecord,
  RateLimitResult,
  VerificationResult,
  VerificationContext,
} from './types.js';
