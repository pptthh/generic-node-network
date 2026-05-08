import { z } from 'zod';

export const PeerSchema = z.object({
  peerId: z.string(),
  multiaddr: z.string(),
  status: z.enum(['online', 'offline']),
  lastSeen: z.number(),
  discoveryMethod: z.enum(['mDNS', 'DHT', 'bootstrap', 'manual']),
  metadata: z.object({
    alias: z.string().optional(),
    apiPort: z.number().optional(),
  }).optional(),
});

export type Peer = z.infer<typeof PeerSchema>;

export interface PeerEvent {
  type: 'peer_online' | 'peer_offline';
  peerId: string;
  multiaddr?: string;
  timestamp: string;
}
