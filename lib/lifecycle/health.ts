import type { IncomingMessage, ServerResponse } from 'http';
import type { HealthChecksConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

export interface HealthCheckResult {
  healthy: boolean;
  details?: Record<string, unknown>;
  error?: string;
}

export interface HealthCheckProviders {
  /** Check P2P connectivity */
  checkP2P: () => HealthCheckResult | Promise<HealthCheckResult>;
  /** Check database read/write */
  checkDatabase: () => HealthCheckResult | Promise<HealthCheckResult>;
  /** Check memory usage */
  checkMemory: () => HealthCheckResult | Promise<HealthCheckResult>;
  /** Check that at least one peer is reachable */
  checkPeers: () => HealthCheckResult | Promise<HealthCheckResult>;
}

/**
 * HealthChecker handles /healthz (liveness) and /readyz (readiness) requests.
 *
 * - Liveness (/healthz): is the process alive and responding?
 * - Readiness (/readyz): is the node ready to accept traffic (P2P, DB, memory)?
 */
export class HealthChecker {
  private readonly config: HealthChecksConfig;
  private readonly providers: HealthCheckProviders;
  private readonly startedAt: number;

  constructor(config: HealthChecksConfig, providers: HealthCheckProviders) {
    this.config = config;
    this.providers = providers;
    this.startedAt = Date.now();
  }

  /**
   * Handle an incoming HTTP request, routing to the correct health check.
   * Returns true if the request was handled, false otherwise.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (!this.config.enabled) return false;

    const url = req.url ?? '/';

    if (this.config.liveness.enabled && url === this.config.liveness.path) {
      await this.handleLiveness(res);
      return true;
    }

    if (this.config.readiness.enabled && url === this.config.readiness.path) {
      await this.handleReadiness(res);
      return true;
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Liveness
  // ---------------------------------------------------------------------------

  async handleLiveness(res: ServerResponse): Promise<void> {
    const uptime = (Date.now() - this.startedAt) / 1000;
    const isAlive = uptime >= 0;

    const body = JSON.stringify({
      status: isAlive ? 'healthy' : 'unhealthy',
      uptime,
      timestamp: Date.now(),
    });

    res.writeHead(isAlive ? 200 : 503, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  // ---------------------------------------------------------------------------
  // Readiness
  // ---------------------------------------------------------------------------

  async handleReadiness(res: ServerResponse): Promise<void> {
    const [p2p, database, memory, peers] = await Promise.all([
      this.safeCheck('p2p', this.providers.checkP2P),
      this.safeCheck('database', this.providers.checkDatabase),
      this.safeCheck('memory', this.providers.checkMemory),
      this.safeCheck('peers', this.providers.checkPeers),
    ]);

    const checks = { p2p, database, memory, peers };
    const isReady = Object.values(checks).every((c) => c.healthy);

    const body = JSON.stringify({
      status: isReady ? 'ready' : 'not_ready',
      checks,
      timestamp: Date.now(),
    });

    res.writeHead(isReady ? 200 : 503, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  // ---------------------------------------------------------------------------
  // Default provider implementations (convenience helpers)
  // ---------------------------------------------------------------------------

  static memoryCheck(): HealthCheckResult {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
    return {
      healthy: heapUsedPercent < 90,
      details: {
        heapUsedPercent: parseFloat(heapUsedPercent.toFixed(1)),
        heapUsedMB: parseFloat((usage.heapUsed / 1024 / 1024).toFixed(1)),
        heapTotalMB: parseFloat((usage.heapTotal / 1024 / 1024).toFixed(1)),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async safeCheck(
    name: string,
    check: () => HealthCheckResult | Promise<HealthCheckResult>,
  ): Promise<HealthCheckResult> {
    try {
      return await check();
    } catch (err) {
      logger.warn(`Health check '${name}' threw an error`, err);
      return {
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
