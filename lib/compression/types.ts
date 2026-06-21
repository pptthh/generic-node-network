export type CompressionAlgorithm = 'gzip' | 'brotli' | 'zstd';

export interface CompressionDecision {
  shouldCompress: false;
  reason: 'below_threshold' | 'blacklisted' | 'not_worth_it' | 'disabled';
}

export interface CompressionApproved {
  shouldCompress: true;
  algorithm: CompressionAlgorithm;
  estimatedSize: number;
}

export type CompressionResult = CompressionDecision | CompressionApproved;

export interface CompressionStats {
  messagesCompressed: number;
  messagesSkipped: number;
  originalBytes: number;
  compressedBytes: number;
  ratioByAlgorithm: Partial<Record<CompressionAlgorithm, number>>;
}

export interface CompressionHeader {
  compressed: true;
  algorithm: CompressionAlgorithm;
  originalSize: number;
  compressedSize: number;
}
