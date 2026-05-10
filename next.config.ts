import type { NextConfig } from 'next';

const nodeId = process.env.GNN_NODE_ID;

const nextConfig: NextConfig = {
  distDir: nodeId ? `.next-${nodeId}` : '.next',
  serverExternalPackages: ['libp2p', 'level', '@libp2p/tcp', '@libp2p/mdns', '@chainsafe/libp2p-gossipsub'],
};

export default nextConfig;
