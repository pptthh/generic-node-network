// Message utilities for serialization/deserialization (Phase 4: compression-aware)
import type { PublishedMessage, QueryMessage, ResponseMessage, GNNMessage, SignedGNNMessage } from '../types/messages.js';
import { PublishedMessageSchema, QueryMessageSchema, ResponseMessageSchema } from '../types/messages.js';
import { isSignedMessage } from '../security/crypto/signing.js';
import type { CompressionManager } from '../compression/manager.js';
import type { CompressionAlgorithm } from '../compression/types.js';

export function encodeMessage(msg: PublishedMessage | QueryMessage | ResponseMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodePublishedMessage(data: Uint8Array): PublishedMessage {
  const json = new TextDecoder().decode(data);
  return PublishedMessageSchema.parse(JSON.parse(json));
}

export function decodeQueryMessage(data: Uint8Array): QueryMessage {
  const json = new TextDecoder().decode(data);
  return QueryMessageSchema.parse(JSON.parse(json));
}

export function decodeResponseMessage(data: Uint8Array): ResponseMessage {
  const json = new TextDecoder().decode(data);
  return ResponseMessageSchema.parse(JSON.parse(json));
}

export function validatePayloadSize(payload: unknown, maxSize: number): boolean {
  return JSON.stringify(payload).length <= maxSize;
}

/**
 * Decode any GNN message from raw bytes (handles all message types).
 */
export function decodeMessage(data: Uint8Array): GNNMessage {
  const json = new TextDecoder().decode(data);
  const parsed = JSON.parse(json);

  switch (parsed.type) {
    case 'publish':
      return PublishedMessageSchema.parse(parsed);
    case 'query':
      return QueryMessageSchema.parse(parsed);
    case 'response':
      return ResponseMessageSchema.parse(parsed);
    default:
      throw new Error(`Unknown message type: ${parsed.type}`);
  }
}

/**
 * Check if a decoded message is a signed Phase 3 message.
 */
export function isSignedGNNMessage(msg: GNNMessage): msg is SignedGNNMessage {
  return isSignedMessage(msg);
}

// ---------------------------------------------------------------------------
// Phase 4: Compression-aware encode/decode for publish messages
// ---------------------------------------------------------------------------

/**
 * Encode a PublishedMessage with optional payload compression.
 * When compression is used, `payload` is replaced with a base64 string of
 * the compressed bytes and compression metadata is attached to the envelope.
 */
export async function encodeMessageWithCompression(
  msg: PublishedMessage,
  compressionMgr: CompressionManager | null,
  peerId: string = '_global',
): Promise<Uint8Array> {
  if (!compressionMgr) {
    return encodeMessage(msg);
  }

  const payloadStr = JSON.stringify(msg.payload);
  const decision = compressionMgr.shouldCompress(payloadStr, 'application/json', peerId);

  if (!decision.shouldCompress) {
    return encodeMessage(msg);
  }

  const { data, header } = await compressionMgr.compressPayload(
    msg.payload,
    decision.algorithm,
    peerId,
  );

  // Replace payload with base64-encoded compressed bytes
  const compressed: PublishedMessage = {
    ...msg,
    payload: data.toString('base64'),
    compressed: true,
    compressionAlgorithm: header.algorithm,
    originalSize: header.originalSize,
    compressedSize: header.compressedSize,
  };

  return encodeMessage(compressed);
}

/**
 * Decode a PublishedMessage, decompressing the payload if needed.
 */
export async function decodePublishedMessageWithDecompression(
  data: Uint8Array,
  compressionMgr: CompressionManager | null,
): Promise<PublishedMessage> {
  const msg = decodePublishedMessage(data);

  if (!msg.compressed || !msg.compressionAlgorithm || !compressionMgr) {
    return msg;
  }

  const algorithm = msg.compressionAlgorithm as CompressionAlgorithm;
  const compressedBytes = Buffer.from(msg.payload as string, 'base64');
  const decompressedPayload = await compressionMgr.decompressPayload(compressedBytes, algorithm);

  return {
    ...msg,
    payload: decompressedPayload,
    // Clear compression metadata on decoded message
    compressed: undefined,
    compressionAlgorithm: undefined,
    originalSize: undefined,
    compressedSize: undefined,
  };
}
