import { getNodeContext } from '../../../../lib/api/handlers';
import { withAuth } from '../../../../lib/api/middleware';

export async function GET(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node } = getNodeContext();

    const connectivity = node.getConnectivity();

    if (!connectivity) {
      const peers = node.getPeers();
      const onlinePeers = peers.filter(p => p.status === 'online');
      const relayPeers = onlinePeers.filter(p => p.discoveryMethod === 'relay');

      return Response.json({
        connected: onlinePeers.length > 0,
        peerCount: onlinePeers.length,
        directConnections: onlinePeers.length - relayPeers.length,
        relayConnections: relayPeers.length,
        relayUsagePercentage: onlinePeers.length > 0
          ? Math.round((relayPeers.length / onlinePeers.length) * 1000) / 10
          : 0,
        bandwidth: { inRate: 0, outRate: 0 },
      });
    }

    return Response.json(connectivity);
  });
}
