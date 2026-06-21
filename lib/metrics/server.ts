import { createServer, type Server } from 'http';
import type { MetricsExportConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { type PrometheusExporter } from './prometheus.js';

/**
 * Standalone HTTP server that exposes a Prometheus /metrics scrape endpoint
 * on the configured metricsPort (default 9090).
 */
export class MetricsServer {
  private readonly config: MetricsExportConfig;
  private readonly exporter: PrometheusExporter;
  private server: Server | null = null;
  private exportInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MetricsExportConfig, exporter: PrometheusExporter) {
    this.config = config;
    this.exporter = exporter;
  }

  start(): void {
    if (!this.config.enabled) {
      logger.debug('Metrics server disabled by config');
      return;
    }

    this.server = createServer((req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }

      const url = new URL(req.url ?? '/', `http://localhost:${this.config.metricsPort}`);

      if (url.pathname === '/metrics') {
        const body = this.exporter.export();
        res.writeHead(200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.server.listen(this.config.metricsPort, () => {
      logger.info(`Metrics server listening on port ${this.config.metricsPort}`);
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Metrics port ${this.config.metricsPort} already in use, metrics endpoint unavailable`);
      } else {
        logger.error('Metrics server error', err);
      }
    });
  }

  stop(): Promise<void> {
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
      this.exportInterval = null;
    }

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.server = null;
        logger.debug('Metrics server stopped');
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }
}
