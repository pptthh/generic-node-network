import { z } from 'zod';

export const PublishedMessageSchema = z.object({
  type: z.literal('publish'),
  messageId: z.string(),
  topic: z.string(),
  payload: z.unknown(),
  sender: z.string(),
  timestamp: z.number(),
  ttl: z.number().nullable().optional(),
  // Phase 3: Cryptographic signing (optional for backward compat)
  publicKey: z.string().optional(),
  signature: z.string().optional(),
  version: z.number().optional(),
  // Phase 4: Compression metadata (optional)
  compressed: z.boolean().optional(),
  compressionAlgorithm: z.enum(['gzip', 'brotli', 'zstd']).optional(),
  originalSize: z.number().optional(),
  compressedSize: z.number().optional(),
});

export const QueryMessageSchema = z.object({
  type: z.literal('query'),
  queryId: z.string(),
  target: z.string().optional(),
  request: z.object({
    action: z.string(),
    params: z.record(z.unknown()).optional(),
  }),
  sender: z.string(),
  timestamp: z.number(),
  timeout: z.number().optional(),
  // Phase 3: Cryptographic signing (optional for backward compat)
  publicKey: z.string().optional(),
  signature: z.string().optional(),
  version: z.number().optional(),
});

export const ResponseMessageSchema = z.object({
  type: z.literal('response'),
  queryId: z.string(),
  status: z.enum(['success', 'error', 'timeout']),
  response: z.unknown().optional(),
  error: z.string().optional(),
  sender: z.string(),
  timestamp: z.number(),
  // Phase 3: Cryptographic signing (optional for backward compat)
  publicKey: z.string().optional(),
  signature: z.string().optional(),
  version: z.number().optional(),
});

export type PublishedMessage = z.infer<typeof PublishedMessageSchema>;
export type QueryMessage = z.infer<typeof QueryMessageSchema>;
export type ResponseMessage = z.infer<typeof ResponseMessageSchema>;

export type GNNMessage = PublishedMessage | QueryMessage | ResponseMessage;

// Phase 3: Signed message type (messages with guaranteed signature fields)
export interface SignedMessageFields {
  publicKey: string;
  signature: string;
  version: 2;
}

export type SignedPublishedMessage = PublishedMessage & SignedMessageFields;
export type SignedQueryMessage = QueryMessage & SignedMessageFields;
export type SignedResponseMessage = ResponseMessage & SignedMessageFields;
export type SignedGNNMessage = SignedPublishedMessage | SignedQueryMessage | SignedResponseMessage;

export interface BroadcastResponse {
  broadcastId: string;
  status: 'pending' | 'complete';
  responses: PeerResponse[];
  respondedCount: number;
  timeoutCount: number;
  averageResponseTime: number;
  timestamp: string;
}

export interface PeerResponse {
  peerId: string;
  status: 'success' | 'timeout' | 'error';
  response?: unknown;
  responseTime: number;
}
