/**
 * Phase 3: Canonical JSON Serialization
 *
 * Ensures deterministic JSON output regardless of key insertion order.
 * Required for consistent message signing/verification across nodes.
 */

/**
 * Serialize an object to a canonical (deterministic) JSON string.
 * Object keys are sorted alphabetically at all levels.
 * Uses standard JSON escaping for strings.
 */
export function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'boolean') {
    return obj ? 'true' : 'false';
  }

  if (typeof obj === 'number') {
    if (!isFinite(obj)) {
      return 'null'; // NaN, Infinity → null (per JSON spec)
    }
    return JSON.stringify(obj);
  }

  if (typeof obj === 'string') {
    return JSON.stringify(obj); // Handles escaping
  }

  if (Array.isArray(obj)) {
    const items = obj.map(item => canonicalStringify(item));
    return '[' + items.join(',') + ']';
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys
      .filter(key => (obj as Record<string, unknown>)[key] !== undefined)
      .map(key => {
        const value = (obj as Record<string, unknown>)[key];
        return JSON.stringify(key) + ':' + canonicalStringify(value);
      });
    return '{' + pairs.join(',') + '}';
  }

  // Fallback for other types (symbols, functions, etc.) - skip them
  return 'null';
}
