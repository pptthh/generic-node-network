import { withAuth } from '../../../../lib/api/middleware.js';
import { getNodeContext } from '../../../../lib/api/handlers.js';

export async function GET(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node } = getNodeContext();
    const url = new URL(req.url);
    const status = url.searchParams.get('status') as 'online' | 'offline' | null;
    const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);

    let peers = node.getPeers();
    if (status) {
      peers = peers.filter(p => p.status === status);
    }
    peers = peers.slice(0, limit);

    return Response.json(peers.map(peer => ({
      peerId: peer.peerId,
      alias: peer.metadata?.alias ?? null,
      multiaddr: peer.multiaddr,
      status: peer.status,
      lastSeen: new Date(peer.lastSeen).toISOString(),
      discoveryMethod: peer.discoveryMethod,
      apiPort: peer.metadata?.apiPort ?? null,
    })));
  });
}
