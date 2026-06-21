import { describe, it, expect, beforeEach } from 'vitest';
import { CompressionManager } from '../../lib/compression/manager.js';
import { gzipCompress, gzipDecompress, brotliCompressData, brotliDecompressData, zstdCompress, zstdDecompress } from '../../lib/compression/algorithms.js';
import type { CompressionConfig } from '../../lib/types/config.js';

function makeConfig(overrides: Partial<CompressionConfig> = {}): CompressionConfig {
  return {
    enabled: true,
    algorithm: 'auto',
    algorithms: {
      gzip:   { enabled: true, level: 6, threshold: 2048 },
      brotli: { enabled: true, level: 6, threshold: 2048 },
      zstd:   { enabled: true, level: 6, threshold: 2048 },
    },
    selectionStrategy: 'adaptive',
    compressionThreshold: 2048,
    blacklist: ['application/octet-stream', 'image/*', 'video/*'],
    ...overrides,
  };
}

describe('Compression Algorithms', () => {
  it('should round-trip gzip', async () => {
    const data = Buffer.from('hello world '.repeat(200));
    const compressed = await gzipCompress(data, 6);
    expect(compressed.length).toBeLessThan(data.length);
    const result = await gzipDecompress(compressed);
    expect(result.toString()).toBe(data.toString());
  });

  it('should round-trip brotli', async () => {
    const data = Buffer.from('hello world '.repeat(200));
    const compressed = await brotliCompressData(data, 6);
    expect(compressed.length).toBeLessThan(data.length);
    const result = await brotliDecompressData(compressed);
    expect(result.toString()).toBe(data.toString());
  });

  it('should round-trip zstd', async () => {
    const data = Buffer.from('hello world '.repeat(200));
    const compressed = await zstdCompress(data, 3);
    expect(compressed.length).toBeLessThan(data.length);
    const result = await zstdDecompress(compressed);
    expect(result.toString()).toBe(data.toString());
  });
});

describe('CompressionManager - shouldCompress', () => {
  let mgr: CompressionManager;

  beforeEach(() => {
    mgr = new CompressionManager(makeConfig());
  });

  it('returns below_threshold for small payloads', () => {
    const decision = mgr.shouldCompress('small', 'application/json');
    expect(decision.shouldCompress).toBe(false);
    if (!decision.shouldCompress) expect(decision.reason).toBe('below_threshold');
  });

  it('returns blacklisted for image/* content type', () => {
    const large = 'x'.repeat(4096);
    const decision = mgr.shouldCompress(large, 'image/png');
    expect(decision.shouldCompress).toBe(false);
    if (!decision.shouldCompress) expect(decision.reason).toBe('blacklisted');
  });

  it('returns blacklisted for video/* content type', () => {
    const large = 'x'.repeat(4096);
    const decision = mgr.shouldCompress(large, 'video/mp4');
    expect(decision.shouldCompress).toBe(false);
    if (!decision.shouldCompress) expect(decision.reason).toBe('blacklisted');
  });

  it('returns shouldCompress=true for large JSON payloads', () => {
    const largeJson = JSON.stringify({ data: Array(1000).fill({ test: 'data', value: 12345 }) });
    const decision = mgr.shouldCompress(largeJson, 'application/json');
    expect(decision.shouldCompress).toBe(true);
    if (decision.shouldCompress) {
      expect(['gzip', 'brotli', 'zstd']).toContain(decision.algorithm);
    }
  });

  it('returns disabled when compression is off', () => {
    mgr = new CompressionManager(makeConfig({ enabled: false }));
    const large = 'x'.repeat(4096);
    const decision = mgr.shouldCompress(large);
    expect(decision.shouldCompress).toBe(false);
    if (!decision.shouldCompress) expect(decision.reason).toBe('disabled');
  });
});

describe('CompressionManager - compress/decompress round-trips', () => {
  let mgr: CompressionManager;

  beforeEach(() => {
    mgr = new CompressionManager(makeConfig());
  });

  const largePaylad = { data: Array(500).fill({ test: 'data', value: 12345, name: 'hello' }) };

  it('should compress and decompress with gzip', async () => {
    const { data, header } = await mgr.compressPayload(largePaylad, 'gzip');
    expect(header.algorithm).toBe('gzip');
    expect(header.compressed).toBe(true);
    expect(data.length).toBeLessThan(header.originalSize);

    const restored = await mgr.decompressPayload(data, 'gzip');
    expect(JSON.stringify(restored)).toBe(JSON.stringify(largePaylad));
  });

  it('should compress and decompress with brotli', async () => {
    const { data, header } = await mgr.compressPayload(largePaylad, 'brotli');
    expect(header.algorithm).toBe('brotli');
    const restored = await mgr.decompressPayload(data, 'brotli');
    expect(JSON.stringify(restored)).toBe(JSON.stringify(largePaylad));
  });

  it('should compress and decompress with zstd', async () => {
    const { data, header } = await mgr.compressPayload(largePaylad, 'zstd');
    expect(header.algorithm).toBe('zstd');
    const restored = await mgr.decompressPayload(data, 'zstd');
    expect(JSON.stringify(restored)).toBe(JSON.stringify(largePaylad));
  });

  it('should achieve ≥50% reduction for large JSON (gzip)', async () => {
    const { data, header } = await mgr.compressPayload(largePaylad, 'gzip');
    const ratio = data.length / header.originalSize;
    expect(ratio).toBeLessThan(0.5);
  });

  it('should achieve ≥50% reduction for large JSON (brotli)', async () => {
    const { data, header } = await mgr.compressPayload(largePaylad, 'brotli');
    const ratio = data.length / header.originalSize;
    expect(ratio).toBeLessThan(0.5);
  });

  it('should achieve ≥50% reduction for large JSON (zstd)', async () => {
    const { data, header } = await mgr.compressPayload(largePaylad, 'zstd');
    const ratio = data.length / header.originalSize;
    expect(ratio).toBeLessThan(0.5);
  });
});

describe('CompressionManager - stats', () => {
  it('should track per-peer compression statistics', async () => {
    const mgr = new CompressionManager(makeConfig());
    const payload = { data: Array(200).fill({ x: 'hello world' }) };

    await mgr.compressPayload(payload, 'gzip', 'peer-abc');
    await mgr.compressPayload(payload, 'gzip', 'peer-abc');

    const stats = mgr.getStats('peer-abc');
    expect(stats.messagesCompressed).toBe(2);
    expect(stats.originalBytes).toBeGreaterThan(0);
    expect(stats.compressedBytes).toBeGreaterThan(0);
    expect(stats.compressedBytes).toBeLessThan(stats.originalBytes);
  });

  it('should track ratio by algorithm', async () => {
    const mgr = new CompressionManager(makeConfig());
    const payload = { data: Array(200).fill({ x: 'hello world' }) };

    await mgr.compressPayload(payload, 'brotli', 'peer-xyz');
    const stats = mgr.getStats('peer-xyz');
    expect(stats.ratioByAlgorithm.brotli).toBeDefined();
    expect(stats.ratioByAlgorithm.brotli!).toBeLessThan(0.5);
  });
});

describe('CompressionManager - peer capabilities', () => {
  it('should respect peer capabilities when selecting algorithm', () => {
    const mgr = new CompressionManager(makeConfig({ selectionStrategy: 'adaptive' }));
    mgr.setPeerCapabilities('peer-limited', ['gzip']);

    const large = JSON.stringify({ data: Array(500).fill({ x: 'hello world' }) });
    const decision = mgr.shouldCompress(large, 'application/json', 'peer-limited');
    if (decision.shouldCompress) {
      expect(decision.algorithm).toBe('gzip');
    }
  });
});
