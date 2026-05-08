import { z } from 'zod';

export const PublishedMessageSchema = z.object({
  type: z.literal('publish'),
  messageId: z.string(),
  topic: z.string(),
  payload: z.unknown(),
  sender: z.string(),
  timestamp: z.number(),
  ttl: z.number().nullable().optional(),
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
});

export const ResponseMessageSchema = z.object({
  type: z.literal('response'),
  queryId: z.string(),
  status: z.enum(['success', 'error', 'timeout']),
  response: z.unknown().optional(),
  error: z.string().optional(),
  sender: z.string(),
  timestamp: z.number(),
});

export type PublishedMessage = z.infer<typeof PublishedMessageSchema>;
export type QueryMessage = z.infer<typeof QueryMessageSchema>;
export type ResponseMessage = z.infer<typeof ResponseMessageSchema>;

export type GNNMessage = PublishedMessage | QueryMessage | ResponseMessage;

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
