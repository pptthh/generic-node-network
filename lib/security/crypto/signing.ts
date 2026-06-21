/**
 * Phase 3: Message Signing & Verification
 *
 * - Signs messages using Ed25519 private key
 * - Verifies message signatures using Ed25519 public key
 * - Supports timestamp-based replay attack prevention
 */

import { createHash, sign, verify, createPrivateKey, createPublicKey } from 'crypto';
import type { GNNMessage, SignedGNNMessage } from '../../types/messages.js';
import { canonicalStringify } from './canonical.js';
import { logger } from '../../utils/logger.js';

/** Maximum message age (5 minutes) before it's considered a replay */
const MAX_MESSAGE_AGE_MS = 300000;

/**
 * Create the signing payload from a message.
 * Excludes the signature field itself (since that's what we're computing).
 */
function createSigningPayload(message: GNNMessage): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  // Copy all fields except signature
  for (const [key, value] of Object.entries(message)) {
    if (key === 'signature') continue;
    if (key === 'payload') {
      // Serialize payload to string for consistent hashing
      payload[key] = JSON.stringify(value);
    } else {
      payload[key] = value;
    }
  }

  // Ensure version is set
  if (!payload.version) {
    payload.version = 2;
  }

  return payload;
}

/**
 * Compute the hash of a message for signing.
 */
function computeMessageHash(message: GNNMessage): Buffer {
  const signingPayload = createSigningPayload(message);
  const canonical = canonicalStringify(signingPayload);
  return createHash('sha256').update(canonical).digest();
}

/**
 * Sign a message with the node's Ed25519 private key.
 * Returns a new message object with publicKey, signature, and version fields added.
 */
export function signMessage(
  message: GNNMessage,
  privateKey: Buffer,
  publicKeyBase64: string
): SignedGNNMessage {
  // Add public key and version to message before signing
  const messageToSign: GNNMessage = {
    ...message,
    publicKey: publicKeyBase64,
    version: 2,
  };

  // Compute message hash
  const messageHash = computeMessageHash(messageToSign);

  // Create private key object from DER buffer
  const privateKeyObj = createPrivateKey({
    key: privateKey,
    format: 'der',
    type: 'pkcs8',
  });

  // Sign the hash
  const signature = sign(null, messageHash, privateKeyObj);

  return {
    ...messageToSign,
    publicKey: publicKeyBase64,
    signature: signature.toString('base64'),
    version: 2,
  } as SignedGNNMessage;
}

/**
 * Verify a signed message's signature.
 * Does NOT check timestamp (caller should do that separately if needed).
 */
export function verifySignature(
  message: SignedGNNMessage,
  publicKeyBuffer?: Buffer
): boolean {
  try {
    if (!message.signature || !message.publicKey) {
      return false;
    }

    // Reconstruct signing payload (message without signature)
    const messageWithoutSig: GNNMessage = { ...message };
    delete (messageWithoutSig as Record<string, unknown>).signature;

    // Compute message hash
    const messageHash = computeMessageHash(messageWithoutSig);

    // Use provided public key or extract from message
    const pubKeyBuf = publicKeyBuffer ?? Buffer.from(message.publicKey, 'base64');

    // Create public key object from DER buffer
    const publicKeyObj = createPublicKey({
      key: pubKeyBuf,
      format: 'der',
      type: 'spki',
    });

    // Verify signature
    const signatureBuffer = Buffer.from(message.signature, 'base64');
    const isValid = verify(null, messageHash, publicKeyObj, signatureBuffer);

    return isValid;
  } catch (error) {
    logger.debug('Signature verification error', { error: (error as Error).message });
    return false;
  }
}

/**
 * Verify a message is not a replay attack based on its timestamp.
 * Returns true if the message is fresh (within MAX_MESSAGE_AGE_MS).
 */
export function verifyTimestamp(timestamp: number, maxAgeMs: number = MAX_MESSAGE_AGE_MS): boolean {
  const now = Date.now();
  const messageAge = now - timestamp;

  // Reject messages that are too old
  if (messageAge > maxAgeMs) {
    return false;
  }

  // Also reject messages from the future (>30 seconds tolerance for clock skew)
  if (messageAge < -30000) {
    return false;
  }

  return true;
}

/**
 * Full message verification: signature + timestamp.
 * Returns an object with the verification result and details.
 */
export function verifyMessage(
  message: SignedGNNMessage,
  publicKeyBuffer?: Buffer,
  options: { checkTimestamp?: boolean; maxAgeMs?: number } = {}
): { valid: boolean; reason?: string } {
  const { checkTimestamp = true, maxAgeMs = MAX_MESSAGE_AGE_MS } = options;

  // Check required fields
  if (!message.signature) {
    return { valid: false, reason: 'missing_signature' };
  }
  if (!message.publicKey) {
    return { valid: false, reason: 'missing_public_key' };
  }

  // Verify timestamp first (cheaper check)
  if (checkTimestamp && !verifyTimestamp(message.timestamp, maxAgeMs)) {
    return { valid: false, reason: 'timestamp_expired' };
  }

  // Verify signature
  if (!verifySignature(message, publicKeyBuffer)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  return { valid: true };
}

/**
 * Check if a message is signed (has version 2 fields).
 */
export function isSignedMessage(message: GNNMessage): message is SignedGNNMessage {
  return (
    message.version === 2 &&
    typeof message.publicKey === 'string' &&
    typeof message.signature === 'string'
  );
}
