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
  // Phase 3: Cryptographic identity
  publicKey: z.string().optional(),
  cryptoPeerId: z.string().optional(),
});

export type Peer = z.infer<typeof PeerSchema>;

export interface PeerEvent {
  type: 'peer_online' | 'peer_offline';
  peerId: string;
  multiaddr?: string;
  timestamp: string;
}

// Phase 3: Reputation-related peer info
export interface PeerReputationInfo {
  peerId: string;
  score: number;
  lastUpdate: number;
  validMessages: number;
  invalidMessages: number;
  spamReports: number;
  avgLatency: number;
  uptime: number;
}
