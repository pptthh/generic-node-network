import { withAuth, errorResponse } from '../../../lib/api/middleware.js';
import { getNodeContext } from '../../../lib/api/handlers.js';
import { nowIso } from '../../../lib/utils/time.js';

export async function POST(req: Request): Promise<Response> {
  return withAuth(req, async () => {
    const { node, schema } = getNodeContext();
    const body = await req.json() as {
      target?: string;
      request?: { action: string; params?: Record<string, unknown> };
      timeout?: number;
    };

    if (!body.target) return errorResponse('MISSING_TARGET', 'target peer ID is required');
    if (!body.request?.action) return errorResponse('MISSING_ACTION', 'request.action is required');

    const timeoutMs = body.timeout ?? 100;

    try {
      const result = await node.query(body.target, body.request, timeoutMs);

      // Save query to DB
      const queryMsg = {
        type: 'query' as const,
        queryId: result.queryId,
        target: body.target,
        request: body.request,
        sender: node.getNodeId(),
        timestamp: Date.now(),
        timeout: timeoutMs,
      };
      await schema.saveQueryMessage(queryMsg);

      // Save response to DB
      const responseMsg = {
        type: 'response' as const,
        queryId: result.queryId,
        status: result.status,
        response: result.response,
        sender: result.sender,
        timestamp: Date.now(),
      };
      await schema.saveResponseMessage(responseMsg);

      return Response.json({
        queryId: result.queryId,
        status: result.status,
        response: result.response,
        from: result.sender,
        timestamp: nowIso(),
      });
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('timeout')) {
        return Response.json({
          error: 'QUERY_TIMEOUT',
          target: body.target,
          timeoutMs,
          message: 'No response from target peer',
        }, { status: 408 });
      }
      if (error.message.includes('not found')) {
        return errorResponse('PEER_NOT_FOUND', error.message, 404);
      }
      throw error;
    }
  });
}
