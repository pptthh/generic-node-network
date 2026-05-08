// Message utilities for serialization/deserialization
import type { PublishedMessage, QueryMessage, ResponseMessage } from '../types/messages.js';
import { PublishedMessageSchema, QueryMessageSchema, ResponseMessageSchema } from '../types/messages.js';

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
