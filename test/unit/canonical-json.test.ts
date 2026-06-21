import { describe, it, expect } from 'vitest';
import { canonicalStringify } from '../../lib/security/crypto/canonical.js';

describe('Canonical JSON Serialization', () => {
  it('should sort object keys alphabetically', () => {
    const obj = { z: 1, a: 2, m: 3 };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('should handle nested objects', () => {
    const obj = { b: { z: 1, a: 2 }, a: 1 };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });

  it('should handle arrays without sorting', () => {
    const obj = { arr: [3, 1, 2] };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"arr":[3,1,2]}');
  });

  it('should handle strings with escaping', () => {
    const obj = { key: 'hello "world"' };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"key":"hello \\"world\\""}');
  });

  it('should handle null values', () => {
    const obj = { a: null, b: 1 };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"a":null,"b":1}');
  });

  it('should handle boolean values', () => {
    const obj = { a: true, b: false };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"a":true,"b":false}');
  });

  it('should handle empty objects', () => {
    expect(canonicalStringify({})).toBe('{}');
  });

  it('should handle empty arrays', () => {
    expect(canonicalStringify([])).toBe('[]');
  });

  it('should omit undefined values', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"a":1,"c":3}');
  });

  it('should handle numbers including negative and float', () => {
    const obj = { neg: -1, float: 3.14, zero: 0 };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"float":3.14,"neg":-1,"zero":0}');
  });

  it('should handle NaN and Infinity as null', () => {
    expect(canonicalStringify(NaN)).toBe('null');
    expect(canonicalStringify(Infinity)).toBe('null');
    expect(canonicalStringify(-Infinity)).toBe('null');
  });

  it('should produce deterministic output regardless of key insertion order', () => {
    const obj1 = { type: 'publish', sender: 'node-a', timestamp: 1000 };
    const obj2 = { sender: 'node-a', timestamp: 1000, type: 'publish' };
    const obj3 = { timestamp: 1000, type: 'publish', sender: 'node-a' };

    const result1 = canonicalStringify(obj1);
    const result2 = canonicalStringify(obj2);
    const result3 = canonicalStringify(obj3);

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it('should handle deeply nested structures', () => {
    const obj = {
      level1: {
        level2: {
          level3: {
            z: 'deep',
            a: 'value',
          },
        },
      },
    };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"level1":{"level2":{"level3":{"a":"value","z":"deep"}}}}');
  });

  it('should handle arrays of objects', () => {
    const obj = { items: [{ b: 2, a: 1 }, { d: 4, c: 3 }] };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"items":[{"a":1,"b":2},{"c":3,"d":4}]}');
  });
});
