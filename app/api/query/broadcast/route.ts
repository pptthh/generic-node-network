import { getNodeContext } from '../../../../lib/api/handlers';
import { errorResponse, withAuth } from '../../../../lib/api/middleware';
import { nowIso } from '../../../../lib/utils/time';

export async function POST(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node } = getNodeContext();
    const body = await req.json() as {
      request?: { action: string; params?: Record<string, unknown> };
      timeout?: number;
    };

    if (!body.request?.action) {
      return errorResponse('MISSING_ACTION', 'request.action is required');
    }

    const timeoutMs = body.timeout ?? 1000;
    const result = await node.broadcastQuery(body.request, timeoutMs);

    return Response.json({
      broadcastId: result.broadcastId,
      status: 'complete',
      responses: result.responses,
      respondedCount: result.respondedCount,
      timeoutCount: result.timeoutCount,
      averageResponseTime: result.averageResponseTime,
      timestamp: nowIso(),
    });
  });
}
