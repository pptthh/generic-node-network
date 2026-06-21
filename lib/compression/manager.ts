import type { CompressionConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import {
  gzipCompress,
  gzipDecompress,
  brotliCompressData,
  brotliDecompressData,
  zstdCompress,
  zstdDecompress,
} from './algorithms.js';
import type {
  CompressionAlgorithm,
  CompressionResult,
  CompressionStats,
  CompressionHeader,
} from './types.js';

/**
 * Expected compression ratios (compressed / original) by algorithm and content type.
 * Used to estimate whether compression is worthwhile before attempting it.
 */
const EXPECTED_RATIOS: Record<CompressionAlgorithm, Record<string, number>> = {
  gzip: { json: 0.25, text: 0.30, binary: 0.90 },
  brotli: { json: 0.20, text: 0.25, binary: 0.88 },
  zstd: { json: 0.22, text: 0.28, binary: 0.85 },
};

/**
 * CompressionManager decides whether to compress a payload, selects the best
 * algorithm for each peer, and tracks per-peer compression statistics.
 */
export class CompressionManager {
  private readonly config: CompressionConfig;
  private readonly peerStats: Map<string, CompressionStats> = new Map();
  private readonly peerCapabilities: Map<string, CompressionAlgorithm[]> = new Map();

  // Algorithms that are enabled in config, in preference order
  private readonly preferenceOrder: CompressionAlgorithm[] = ['brotli', 'zstd', 'gzip'];

  constructor(config: CompressionConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Decision
  // ---------------------------------------------------------------------------

  /**
   * Determine whether a payload should be compressed and which algorithm to use.
   */
  shouldCompress(
    serialized: string,
    contentType: string = 'application/json',
    peerId: string = '_global',
  ): CompressionResult {
    if (!this.config.enabled) {
      return { shouldCompress: false, reason: 'disabled' };
    }

    // 1. Size threshold
    if (serialized.length < this.config.compressionThreshold) {
      return { shouldCompress: false, reason: 'below_threshold' };
    }

    // 2. Blacklist check
    if (this.isBlacklisted(contentType)) {
      return { shouldCompress: false, reason: 'blacklisted' };
    }

    // 3. Select algorithm
    const algorithm = this.selectAlgorithm(peerId);

    // 4. Estimate ratio — skip compression if savings < 10%
    const estimatedRatio = this.getEstimatedRatio(algorithm, contentType);
    const estimatedSize = serialized.length * estimatedRatio;
    if (estimatedSize > serialized.length * 0.9) {
      return { shouldCompress: false, reason: 'not_worth_it' };
    }

    return { shouldCompress: true, algorithm, estimatedSize };
  }

  // ---------------------------------------------------------------------------
  // Compress / Decompress
  // ---------------------------------------------------------------------------

  async compressPayload(
    payload: unknown,
    algorithm: CompressionAlgorithm,
    peerId: string = '_global',
  ): Promise<{ data: Buffer; header: CompressionHeader }> {
    const serialized = JSON.stringify(payload);
    const raw = Buffer.from(serialized, 'utf-8');

    const level = this.config.algorithms[algorithm]?.level ?? 6;
    let compressed: Buffer;

    switch (algorithm) {
      case 'gzip':
        compressed = await gzipCompress(raw, level);
        break;
      case 'brotli':
        compressed = await brotliCompressData(raw, level);
        break;
      case 'zstd':
        compressed = await zstdCompress(raw, level);
        break;
    }

    // Update stats
    this.recordStats(peerId, algorithm, raw.length, compressed.length, true);

    logger.debug('Payload compressed', {
      algorithm,
      originalSize: raw.length,
      compressedSize: compressed.length,
      ratio: ((compressed.length / raw.length) * 100).toFixed(1) + '%',
      peerId,
    });

    const header: CompressionHeader = {
      compressed: true,
      algorithm,
      originalSize: raw.length,
      compressedSize: compressed.length,
    };

    return { data: compressed, header };
  }

  async decompressPayload(
    compressed: Buffer,
    algorithm: CompressionAlgorithm,
  ): Promise<unknown> {
    let decompressed: Buffer;

    switch (algorithm) {
      case 'gzip':
        decompressed = await gzipDecompress(compressed);
        break;
      case 'brotli':
        decompressed = await brotliDecompressData(compressed);
        break;
      case 'zstd':
        decompressed = await zstdDecompress(compressed);
        break;
    }

    return JSON.parse(decompressed.toString('utf-8'));
  }

  // ---------------------------------------------------------------------------
  // Peer Capabilities
  // ---------------------------------------------------------------------------

  /**
   * Record what compression algorithms a peer supports (from DHT metadata or
   * capability exchange).
   */
  setPeerCapabilities(peerId: string, algorithms: CompressionAlgorithm[]): void {
    this.peerCapabilities.set(peerId, algorithms);
  }

  getPeerCapabilities(peerId: string): CompressionAlgorithm[] {
    return this.peerCapabilities.get(peerId) ?? ['gzip', 'brotli', 'zstd'];
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats(peerId: string = '_global'): CompressionStats {
    return (
      this.peerStats.get(peerId) ?? {
        messagesCompressed: 0,
        messagesSkipped: 0,
        originalBytes: 0,
        compressedBytes: 0,
        ratioByAlgorithm: {},
      }
    );
  }

  getAllStats(): Record<string, CompressionStats> {
    const result: Record<string, CompressionStats> = {};
    for (const [peerId, stats] of this.peerStats) {
      result[peerId] = stats;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private selectAlgorithm(peerId: string): CompressionAlgorithm {
    const caps = this.getPeerCapabilities(peerId);

    if (this.config.selectionStrategy === 'static') {
      const algo = this.config.algorithm;
      if (algo !== 'auto' && caps.includes(algo)) return algo;
      // Fall through to adaptive
    }

    // Adaptive: prefer algorithm with best historical ratio for this peer
    const stats = this.peerStats.get(peerId);
    let best: CompressionAlgorithm = 'gzip';
    let bestRatio = Infinity;

    for (const algo of this.preferenceOrder) {
      if (!this.config.algorithms[algo]?.enabled) continue;
      if (!caps.includes(algo)) continue;

      const historical = stats?.ratioByAlgorithm?.[algo];
      const ratio = historical ?? EXPECTED_RATIOS[algo].json;

      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = algo;
      }
    }

    return best;
  }

  private getEstimatedRatio(algorithm: CompressionAlgorithm, contentType: string): number {
    const type = contentType.includes('json') ? 'json' : 'text';
    return EXPECTED_RATIOS[algorithm]?.[type] ?? 0.5;
  }

  private isBlacklisted(contentType: string): boolean {
    return this.config.blacklist.some((pattern) => {
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -2);
        return contentType.startsWith(prefix);
      }
      return contentType === pattern;
    });
  }

  private recordStats(
    peerId: string,
    algorithm: CompressionAlgorithm,
    originalBytes: number,
    compressedBytes: number,
    compressed: boolean,
  ): void {
    const existing = this.peerStats.get(peerId) ?? {
      messagesCompressed: 0,
      messagesSkipped: 0,
      originalBytes: 0,
      compressedBytes: 0,
      ratioByAlgorithm: {},
    };

    if (compressed) {
      existing.messagesCompressed++;
      existing.originalBytes += originalBytes;
      existing.compressedBytes += compressedBytes;

      // Exponential moving average of ratio per algorithm
      const newRatio = compressedBytes / originalBytes;
      const prev = existing.ratioByAlgorithm[algorithm];
      existing.ratioByAlgorithm[algorithm] =
        prev === undefined ? newRatio : prev * 0.8 + newRatio * 0.2;
    } else {
      existing.messagesSkipped++;
    }

    this.peerStats.set(peerId, existing);
  }
}
