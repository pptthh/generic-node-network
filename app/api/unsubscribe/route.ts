import { getNodeContext } from '../../../lib/api/handlers';
import { errorResponse, withAuth } from '../../../lib/api/middleware';
import { nowIso } from '../../../lib/utils/time';

export async function POST(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node, schema, config } = getNodeContext();
    const body = await req.json() as { topic?: string };

    if (!body.topic || typeof body.topic !== 'string') {
      return errorResponse('INVALID_TOPIC', 'topic is required');
    }

    await node.unsubscribe(body.topic);
    await schema.removeSubscription(body.topic, config.nodeId);

    return Response.json({
      status: 'unsubscribed',
      topic: body.topic,
      timestamp: nowIso(),
    });
  });
}
