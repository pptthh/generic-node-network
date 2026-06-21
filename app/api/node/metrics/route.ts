import { getNodeContext } from '../../../../lib/api/handlers';
import { withAuth } from '../../../../lib/api/middleware';

export async function GET(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node } = getNodeContext();

    const metrics = node.getMetrics();

    if (!metrics) {
      return Response.json({
        node: {
          publicIP: null,
          natType: node.getNatType(),
          reachabilityStatus: node.getReachabilityStatus(),
          uptime: Math.floor((Date.now() - node.startedAt) / 1000),
          avgLatency: 0,
          connectionSuccessRate: 1,
          failoverEventsCount: 0,
          relayUsagePercentage: 0,
        },
        connections: [],
        dht: {
          peersKnown: node.getPeers().length,
          peersReachable: node.getPeers().filter(p => p.status === 'online').length,
          discoveryLatency: 0,
        },
      });
    }

    return Response.json(metrics);
  });
}
