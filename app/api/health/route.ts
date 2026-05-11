import { getNodeContext, isContextReady } from '../../../lib/api/handlers';
import { nowMs, uptimeSeconds } from '../../../lib/utils/time';

export async function GET(): Promise<Response> {
  if (!isContextReady()) {
    return Response.json({ status: 'starting', timestamp: nowMs() }, { status: 503 });
  }

  const { node } = getNodeContext();
  return Response.json({
    status: 'ok',
    nodeId: node.getNodeId(),
    uptime: uptimeSeconds(node.startedAt),
    timestamp: Math.floor(Date.now() / 1000),
  });
}
