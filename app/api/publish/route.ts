import { getNodeContext } from '../../../lib/api/handlers';
import { errorResponse, withAuth } from '../../../lib/api/middleware';
import type { PublishedMessage } from '../../../lib/types/messages';
import { nowIso } from '../../../lib/utils/time';
import { getPayloadSize, isPayloadTooLarge } from '../../../lib/utils/validation';

export async function POST(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node, schema, config } = getNodeContext();
    const body = await req.json() as { topic?: string; payload?: unknown; ttl?: number | null };

    if (!body.topic || typeof body.topic !== 'string') {
      return errorResponse('INVALID_TOPIC', 'topic is required');
    }
    if (body.payload === undefined) {
      return errorResponse('INVALID_PAYLOAD', 'payload is required');
    }

    const maxSize = config.message.maxPayloadSize;
    if (isPayloadTooLarge(body.payload, maxSize)) {
      return errorResponse(
        'PAYLOAD_TOO_LARGE',
        'Payload exceeds maximum size',
        413,
        { maxSize, actualSize: getPayloadSize(body.payload) }
      );
    }

    const messageId = await node.publish(body.topic, body.payload, body.ttl ?? undefined);

    // Persist to DB
    const msg: PublishedMessage = {
      type: 'publish',
      messageId,
      topic: body.topic,
      payload: body.payload,
      sender: node.getNodeId(),
      timestamp: Date.now(),
      ttl: body.ttl ?? null,
    };
    await schema.savePublishedMessage(msg);

    return Response.json({
      messageId,
      status: 'published',
      timestamp: nowIso(),
    });
  });
}
