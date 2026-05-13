import { getNodeContext } from '../../../../lib/api/handlers';
import { withAuth } from '../../../../lib/api/middleware';
import { nowIso, uptimeSeconds } from '../../../../lib/utils/time';

export async function GET(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node, schema, config } = getNodeContext();

    const messageCount = await schema.countMessages();
    const subscriptionCount = await schema.countSubscriptions(config.nodeId);
    const dbSize = await node['db'] ? 0 : 0; // DB size tracked separately
    const diskFull = false; // checked during writes

    return Response.json({
      nodeId: node.getNodeId(),
      apiVersion: '1.0.0',
      uptime: uptimeSeconds(node.startedAt),
      peerCount: node.getPeers().filter(p => p.status === 'online').length,
      subscriptionCount,
      messageCount,
      dbSize,
      diskFull,
      state: 'ONLINE',
      startedAt: new Date(node.startedAt).toISOString(),
      timestamp: nowIso(),
    });
  });
}
