import { withAuth, errorResponse } from '../../../lib/api/middleware';
import { getNodeContext } from '../../../lib/api/handlers';
import { nowIso } from '../../../lib/utils/time';

export async function POST(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node, schema, config } = getNodeContext();
    const body = await req.json() as { topic?: string };

    if (!body.topic || typeof body.topic !== 'string') {
      return errorResponse('INVALID_TOPIC', 'topic is required');
    }

    await node.subscribe(body.topic);
    await schema.saveSubscription(body.topic, config.nodeId);

    return Response.json({
      status: 'subscribed',
      topic: body.topic,
      timestamp: nowIso(),
    });
  });
}
