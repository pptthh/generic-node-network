import { describe, test, expect, beforeEach } from 'vitest';
import {
  setApiConfig,
  getApiConfig,
  authenticateRequest,
  unauthorizedResponse,
  errorResponse,
  notFoundResponse,
  withAuth,
} from '../../lib/api/middleware.js';
import type { NodeConfig } from '../../lib/types/config.js';

function makeConfig(overrides: Partial<NodeConfig> = {}): NodeConfig {
  return {
    nodeId: 'test-node',
    apiToken: 'token_' + 'a'.repeat(32),
    apiPort: 25111,
    p2pPort: 28111,
    bootstrapPeers: [],
    configFile: './gnn-conf-test.json',
    dbPath: './gnn-data-test',
    logging: { level: 'error', file: null, maxSizeKB: 100, retentionDays: 1 },
    message: { retentionDays: 28, maxPayloadSize: 31744 },
    peer: { ttlDays: 14, autoCleanupInterval: '24h' },
    timeouts: { queryMs: 100, broadcastMs: 1000, peerCheckIntervalSec: 30 },
    discovery: { mdnsEnabled: true, dhtEnabled: true },
    ...overrides,
  };
}

function makeRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers['Authorization'] = token;
  }
  return new Request('http://localhost:25111/api/test', { headers });
}

describe('setApiConfig / getApiConfig', () => {
  test('should store and retrieve the config', () => {
    const config = makeConfig();
    setApiConfig(config);
    expect(getApiConfig()).toBe(config);
  });

  test('should throw if config has not been initialized', () => {
    const prev = globalThis.__gnnApiConfig;
    globalThis.__gnnApiConfig = undefined;
    expect(() => getApiConfig()).toThrow('API config not initialized');
    globalThis.__gnnApiConfig = prev;
  });
});

describe('authenticateRequest', () => {
  beforeEach(() => {
    setApiConfig(makeConfig());
  });

  test('should return true for a valid Bearer token', () => {
    const config = getApiConfig();
    const req = makeRequest(`Bearer ${config.apiToken}`);
    expect(authenticateRequest(req)).toBe(true);
  });

  test('should return false when Authorization header is missing', () => {
    const req = makeRequest();
    expect(authenticateRequest(req)).toBe(false);
  });

  test('should return false for a wrong token', () => {
    const req = makeRequest('Bearer wrong_token_xyz');
    expect(authenticateRequest(req)).toBe(false);
  });

  test('should return false for Authorization without Bearer prefix', () => {
    const config = getApiConfig();
    const req = makeRequest(config.apiToken); // no "Bearer " prefix
    expect(authenticateRequest(req)).toBe(false);
  });

  test('should return false for an empty Bearer token', () => {
    const req = makeRequest('Bearer ');
    expect(authenticateRequest(req)).toBe(false);
  });
});

describe('unauthorizedResponse', () => {
  test('should return a 401 response', async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
  });

  test('should return a JSON body with UNAUTHORIZED error code', async () => {
    const res = unauthorizedResponse();
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('UNAUTHORIZED');
    expect(typeof body.message).toBe('string');
  });
});

describe('errorResponse', () => {
  test('should return a 400 response by default', async () => {
    setApiConfig(makeConfig());
    const res = errorResponse('SOME_ERROR', 'something went wrong');
    expect(res.status).toBe(400);
  });

  test('should embed error and message in the body', async () => {
    setApiConfig(makeConfig());
    const res = errorResponse('BAD_INPUT', 'invalid value');
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('BAD_INPUT');
    expect(body.message).toBe('invalid value');
  });

  test('should respect the provided HTTP status code', async () => {
    setApiConfig(makeConfig());
    const res = errorResponse('SERVER_ERR', 'oops', 500);
    expect(res.status).toBe(500);
  });

  test('should include extra fields in the body', async () => {
    setApiConfig(makeConfig());
    const res = errorResponse('CONFLICT', 'duplicate key', 409, { key: 'abc', hint: 'use different id' });
    const body = await res.json() as Record<string, unknown>;
    expect(body.key).toBe('abc');
    expect(body.hint).toBe('use different id');
  });
});

describe('notFoundResponse', () => {
  test('should return a 404 response', async () => {
    const res = notFoundResponse();
    expect(res.status).toBe(404);
  });

  test('should include NOT_FOUND error code in the body', async () => {
    const res = notFoundResponse();
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('NOT_FOUND');
  });

  test('should use the default message when none is provided', async () => {
    const res = notFoundResponse();
    const body = await res.json() as Record<string, unknown>;
    expect(body.message).toBe('Not found');
  });

  test('should use a custom message when provided', async () => {
    const res = notFoundResponse('Peer not found');
    const body = await res.json() as Record<string, unknown>;
    expect(body.message).toBe('Peer not found');
  });
});

describe('withAuth', () => {
  beforeEach(() => {
    setApiConfig(makeConfig());
  });

  test('should call the handler when token is valid', async () => {
    const config = getApiConfig();
    const req = makeRequest(`Bearer ${config.apiToken}`);
    let called = false;
    const res = await withAuth(req, async () => {
      called = true;
      return Response.json({ ok: true });
    });
    expect(called).toBe(true);
    expect(res.status).toBe(200);
  });

  test('should return 401 when token is missing', async () => {
    const req = makeRequest();
    const res = await withAuth(req, async () => Response.json({ ok: true }));
    expect(res.status).toBe(401);
  });

  test('should return 401 when token is wrong', async () => {
    const req = makeRequest('Bearer wrong_token_here');
    const res = await withAuth(req, async () => Response.json({ ok: true }));
    expect(res.status).toBe(401);
  });

  test('should return 500 when the handler throws', async () => {
    const config = getApiConfig();
    const req = makeRequest(`Bearer ${config.apiToken}`);
    const res = await withAuth(req, async () => {
      throw new Error('handler blew up');
    });
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('handler blew up');
  });
});
