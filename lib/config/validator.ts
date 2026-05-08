import { z } from 'zod';
import type { NodeConfig } from '../types/config.js';

const NodeConfigSchema = z.object({
  nodeId: z.string().min(1),
  apiToken: z.string().min(32),
  apiPort: z.number().int().min(1024).max(65535),
  p2pPort: z.number().int().min(1024).max(65535),
  bootstrapPeers: z.array(z.string()),
  configFile: z.string(),
  dbPath: z.string(),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    file: z.string().nullable(),
    maxSizeKB: z.number().positive(),
    retentionDays: z.number().positive(),
  }),
  message: z.object({
    retentionDays: z.number().positive(),
    maxPayloadSize: z.number().positive(),
  }),
  peer: z.object({
    ttlDays: z.number().positive(),
    autoCleanupInterval: z.string(),
  }),
  timeouts: z.object({
    queryMs: z.number().positive(),
    broadcastMs: z.number().positive(),
    peerCheckIntervalSec: z.number().positive(),
  }),
  discovery: z.object({
    mdnsEnabled: z.boolean(),
    dhtEnabled: z.boolean(),
  }),
});

export function validateConfig(config: unknown): NodeConfig {
  return NodeConfigSchema.parse(config) as NodeConfig;
}
