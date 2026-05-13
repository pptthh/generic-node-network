import { describe, expect, it } from 'vitest';
import {
  decodePublishedMessage,
  encodeMessage,
  validatePayloadSize,
} from '../../lib/p2p/messaging.js';
import type { PublishedMessage } from '../../lib/types/messages.js';
import { getPayloadSize, isPayloadTooLarge, isValidTopic } from '../../lib/utils/validation.js';

describe('Message encoding', () => {
  it('should encode and decode a published message', () => {
    const msg: PublishedMessage = {
      type: 'publish',
      messageId: 'msg_test001',
      topic: 'sensor/temperature',
      payload: { temp: 23.5, unit: 'celsius' },
      sender: 'node-a',
      timestamp: 1715000000000,
      ttl: null,
    };

    const encoded = encodeMessage(msg);
    expect(encoded).toBeInstanceOf(Uint8Array);

    const decoded = decodePublishedMessage(encoded);
    expect(decoded.messageId).toBe(msg.messageId);
    expect(decoded.topic).toBe(msg.topic);
    expect((decoded.payload as { temp: number }).temp).toBe(23.5);
  });

  it('should validate payload size', () => {
    const smallPayload = { temp: 23.5 };
    expect(validatePayloadSize(smallPayload, 31744)).toBe(true);

    const largePayload = { data: 'x'.repeat(32000) };
    expect(validatePayloadSize(largePayload, 31744)).toBe(false);
  });
});

describe('Validation utilities', () => {
  it('should detect oversized payloads', () => {
    const small = { data: 'hello' };
    expect(isPayloadTooLarge(small, 31744)).toBe(false);

    const large = { data: 'x'.repeat(40000) };
    expect(isPayloadTooLarge(large, 31744)).toBe(true);
  });

  it('should calculate payload size accurately', () => {
    const payload = { key: 'value' };
    const size = getPayloadSize(payload);
    expect(size).toBe(JSON.stringify(payload).length);
  });

  it('should validate topic names', () => {
    expect(isValidTopic('sensor/temperature')).toBe(true);
    expect(isValidTopic('test')).toBe(true);
    expect(isValidTopic('')).toBe(false);
    expect(isValidTopic('a'.repeat(300))).toBe(false);
  });
});
