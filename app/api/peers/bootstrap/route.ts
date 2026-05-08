import { withAuth, errorResponse } from '../../../../lib/api/middleware.js';
import { getNodeContext } from '../../../../lib/api/handlers.js';
import { nowIso } from '../../../../lib/utils/time.js';

export async function POST(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node, schema } = getNodeContext();
    const body = await req.json() as { peers?: string[] };

    if (!Array.isArray(body.peers) || body.peers.length === 0) {
      return errorResponse('INVALID_PEERS', 'peers must be a non-empty array of multiaddrs');
    }

    const results = await Promise.allSettled(
      body.peers.map(addr => node.addBootstrapPeer(addr))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Persist bootstrap peers
    const existing = await schema.getConfig('bootstrapPeers') as string[] ?? [];
    const updated = [...new Set([...existing, ...body.peers])];
    await schema.setConfig('bootstrapPeers', updated);

    return Response.json({
      status: 'peers_added',
      count: succeeded,
      failed,
      timestamp: nowIso(),
    });
  });
}
