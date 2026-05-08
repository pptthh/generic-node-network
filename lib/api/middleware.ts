import type { NodeConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

let _config: NodeConfig | null = null;

export function setApiConfig(config: NodeConfig): void {
  _config = config;
}

export function getApiConfig(): NodeConfig {
  if (!_config) throw new Error('API config not initialized');
  return _config;
}

export function authenticateRequest(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === _config?.apiToken;
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { error: 'UNAUTHORIZED', message: 'Valid Bearer token required' },
    { status: 401 }
  );
}

export function errorResponse(error: string, message: string, status = 400, extra?: Record<string, unknown>): Response {
  const body: Record<string, unknown> = { error, message, ...extra };
  logger.error(`API error: ${error} - ${message}`);
  return Response.json(body, { status });
}

export function notFoundResponse(message = 'Not found'): Response {
  return Response.json({ error: 'NOT_FOUND', message }, { status: 404 });
}

export function withAuth(
  req: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  if (!authenticateRequest(req)) {
    return Promise.resolve(unauthorizedResponse());
  }
  return handler().catch((err: Error) => {
    logger.error('API handler error', err);
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  });
}
