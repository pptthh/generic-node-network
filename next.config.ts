import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow server-side access to node context
  serverExternalPackages: ['libp2p', 'level', '@libp2p/tcp', '@libp2p/mdns', '@chainsafe/libp2p-gossipsub'],
};

export default nextConfig;
