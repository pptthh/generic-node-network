import type { NodeConfig } from '../types/config.js';
import type { TokenRotationManager } from '../security/tokens/rotation.js';
import { logger } from '../utils/logger.js';

declare global {
  // eslint-disable-next-line no-var
  var __gnnApiConfig: NodeConfig | undefined;
  // eslint-disable-next-line no-var
  var __gnnTokenManager: TokenRotationManager | undefined;
}

export function setApiConfig(config: NodeConfig): void {
  globalThis.__gnnApiConfig = config;
}

export function getApiConfig(): NodeConfig {
  if (!globalThis.__gnnApiConfig) throw new Error('API config not initialized');
  return globalThis.__gnnApiConfig;
}

export function setTokenManager(tokenManager: TokenRotationManager): void {
  globalThis.__gnnTokenManager = tokenManager;
}

export function getTokenManager(): TokenRotationManager | undefined {
  return globalThis.__gnnTokenManager;
}

export function authenticateRequest(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === globalThis.__gnnApiConfig?.apiToken;
}

/**
 * Authenticate request using token rotation manager (Phase 3).
 * Falls back to plain comparison if token rotation is not configured.
 */
export async function authenticateRequestAsync(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);

  // Use token rotation manager if available
  const tokenManager = globalThis.__gnnTokenManager;
  if (tokenManager) {
    return tokenManager.validateToken(token);
  }

  // Fallback to plain text comparison (backward compat)
  return token === globalThis.__gnnApiConfig?.apiToken;
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

/**
 * Phase 3: Async auth middleware that supports token rotation.
 */
export async function withAuthAsync(
  req: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  const isAuthenticated = await authenticateRequestAsync(req);
  if (!isAuthenticated) {
    return unauthorizedResponse();
  }
  try {
    return await handler();
  } catch (err: unknown) {
    logger.error('API handler error', err);
    return errorResponse('INTERNAL_ERROR', (err as Error).message, 500);
  }
}
