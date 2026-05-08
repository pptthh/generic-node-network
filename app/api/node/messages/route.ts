import { withAuth } from '../../../../lib/api/middleware.js';
import { getNodeContext } from '../../../../lib/api/handlers.js';

export async function GET(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { schema } = getNodeContext();
    const url = new URL(req.url);

    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const topic = url.searchParams.get('topic') ?? undefined;
    const type = url.searchParams.get('type') as 'publish' | 'query' | 'response' | null;
    const order = (url.searchParams.get('order') ?? 'desc') as 'asc' | 'desc';

    const { messages, total } = await schema.getMessages({
      type: type ?? undefined,
      topic,
      limit: Math.min(limit, 100),
      offset,
      order,
    });

    return Response.json({
      messages,
      total,
      limit: Math.min(limit, 100),
      offset,
      hasMore: offset + limit < total,
    });
  });
}
