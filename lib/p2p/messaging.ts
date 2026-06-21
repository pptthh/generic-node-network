// Message utilities for serialization/deserialization
import type { PublishedMessage, QueryMessage, ResponseMessage, GNNMessage, SignedGNNMessage } from '../types/messages.js';
import { PublishedMessageSchema, QueryMessageSchema, ResponseMessageSchema } from '../types/messages.js';
import { isSignedMessage } from '../security/crypto/signing.js';

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
