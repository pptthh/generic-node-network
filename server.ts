import { createServer } from 'http';
import next from 'next';
import { parse } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { setNodeContext } from './lib/api/handlers.js';
import { setApiConfig, setTokenManager } from './lib/api/middleware.js';
import { loadConfig } from './lib/config/loader.js';
import { GracefulShutdownManager } from './lib/lifecycle/shutdown.js';
import { RestartRecovery } from './lib/lifecycle/recovery.js';
import { HealthChecker } from './lib/lifecycle/health.js';
import { globalMetrics } from './lib/metrics/prometheus.js';
import { MetricsServer } from './lib/metrics/server.js';
import { GNNNode } from './lib/p2p/node.js';
import { Database } from './lib/storage/database.js';
import { initializeDatabase } from './lib/storage/migrations.js';
import { Schema } from './lib/storage/schema.js';
import { initLogger, logger } from './lib/utils/logger.js';
import { WebSocketManager, setWebSocketManager } from './lib/websocket/server.js';
import { TokenRotationManager } from './lib/security/tokens/rotation.js';

const isDev = process.env.NODE_ENV !== 'production';

async function main() {
  // 1. Load configuration (CLI + env + file + DB + defaults)
  const config = await loadConfig();

  // 2. Initialize logger (Phase 4: dual format support)
  initLogger(config.logging);

  logger.info(`Starting GNN Node: ${config.nodeId}`);
  logger.info(`Config file: ${config.configFile}`);
  logger.info(`Data path: ${config.dbPath}`);
  logger.info(`API port: ${config.apiPort}`);
  logger.info(`P2P port: ${config.p2pPort}`);

  // 3. Initialize database
  const db = new Database(config.dbPath);
  await db.open();
  await initializeDatabase(db, config);
  const schema = new Schema(db);

  logger.info('Database initialized');

  // 3b. Restart recovery (Phase 4)
  const recovery = new RestartRecovery({ database: db });
  await recovery.recover().catch((err) => logger.warn('Restart recovery failed', err));

  // 4. Initialize P2P node (pass database for Phase 3 security)
  const node = new GNNNode(config, db);

  // 5. Set up context for API routes
  setNodeContext({ node, db, schema, config });
  setApiConfig(config);

  // 5b. Initialize token rotation (Phase 3)
  let tokenManager: TokenRotationManager | null = null;
  if (config.apiTokens?.rotationEnabled) {
    tokenManager = new TokenRotationManager(config.apiTokens, db);
    await tokenManager.initialize(config.apiToken);
    tokenManager.startRotationScheduler();
    setTokenManager(tokenManager);
    logger.info('Token rotation manager initialized');
  }

  // 6. Set up WebSocket manager
  const wsManager = new WebSocketManager(config);
  wsManager.attachNode(node);
  setWebSocketManager(wsManager);

  // 7. Start P2P node
  await node.start();

  // Restore subscriptions from DB
  const savedTopics = await schema.getSubscriptions(config.nodeId);
  for (const topic of savedTopics) {
    await node.subscribe(topic);
    logger.info(`Restored subscription: ${topic}`);
  }

  // Broadcast node restart event
  wsManager.broadcast({ type: 'node_restarted', uptime: 0 });

  // 7b. Phase 4: Start Prometheus metrics server
  let metricsServer: MetricsServer | null = null;
  if (config.metricsExport?.enabled) {
    metricsServer = new MetricsServer(config.metricsExport, globalMetrics);
    metricsServer.start();
  }

  // 8. Initialize Next.js app
  process.env.GNN_NODE_ID = config.nodeId;
  const app = next({ dev: isDev, hostname: 'localhost', port: config.apiPort });
  const handle = app.getRequestHandler();

  await app.prepare();

  // 9. Create HTTP server with WebSocket + health check support
  const healthChecker = config.healthChecks
    ? new HealthChecker(config.healthChecks, {
        checkP2P: () => {
          const peers = node.getPeerCount?.() ?? 0;
          return { healthy: true, details: { peerCount: peers } };
        },
        checkDatabase: async () => {
          try {
            await db.put('health:check', Date.now());
            return { healthy: true, details: { readable: true, writable: true } };
          } catch (err) {
            return { healthy: false, error: err instanceof Error ? err.message : String(err) };
          }
        },
        checkMemory: () => HealthChecker.memoryCheck(),
        checkPeers: () => {
          const peers = node.getPeerCount?.() ?? 0;
          return { healthy: peers >= 0, details: { peerCount: peers } };
        },
      })
    : null;

  const server = createServer(async (req, res) => {
    try {
      // Health checks take priority
      if (healthChecker && req.method === 'GET') {
        const handled = await healthChecker.handle(req, res);
        if (handled) return;
      }

      const parsedUrl = parse(req.url ?? '/', true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error('HTTP handler error', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Handle WebSocket upgrade
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://localhost:${config.apiPort}`);

    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // Authenticate via token query param
    const token = url.searchParams.get('token');
    if (!wsManager.validateToken(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const { WebSocketServer } = require('ws');
    const wss = new WebSocketServer({ noServer: true });
    const clientId = uuidv4();
    logger.debug(`WebSocket client ${process.env.GNN_NODE_ID} wss.handleUpgrade: ${clientId}`);
    wss.handleUpgrade(req, socket, head, (ws: {
      on: (event: string, handler: (data?: unknown) => void) => void;
      send: (data: string) => void;
      readyState: number;
    }) => {
      logger.debug(`WebSocket client ${process.env.GNN_NODE_ID} connecting: ${clientId}`);

      wsManager.addClient(clientId, {
        id: clientId,
        send: (data: string) => ws.send(data),
        readyState: ws.readyState,
      });

      ws.on('close', () => wsManager.removeClient(clientId));

      logger.debug(`WebSocket client connected: ${clientId}`);
    });
  });

  server.listen(config.apiPort, () => {
    logger.info(`REST API on http://localhost:${config.apiPort}`);
    logger.info(`Dashboard: http://localhost:${config.apiPort}/dashboard`);
    logger.info(`WebSocket: ws://localhost:${config.apiPort}/ws`);
    if (config.healthChecks?.enabled) {
      logger.info(`Liveness: http://localhost:${config.apiPort}${config.healthChecks.liveness.path}`);
      logger.info(`Readiness: http://localhost:${config.apiPort}${config.healthChecks.readiness.path}`);
    }

    const multiaddrs = node.getMultiaddrs();
    for (const addr of multiaddrs) {
      logger.info(`P2P listening on: ${addr}`);
    }

    // Print API token for initial setup
    const token = config.apiToken;
    process.stdout.write(`\n[GNN] Node ID: ${config.nodeId}\n`);
    process.stdout.write(`[GNN] API Token: ${token}\n`);
    process.stdout.write(`[GNN] Dashboard: http://localhost:${config.apiPort}/dashboard\n\n`);
  });

  // Start daily maintenance
  const maintenanceInterval = setInterval(async () => {
    try {
      const deleted = await schema.pruneOldMessages(config.message.retentionDays);
      if (deleted > 0) logger.info(`Pruned ${deleted} old messages`);

      const peersPruned = await schema.deleteStalePeers(config.peer.ttlDays);
      if (peersPruned > 0) logger.info(`Pruned ${peersPruned} stale peers`);

      // Persist uptime
      await schema.setState('uptime', Math.floor((Date.now() - node.startedAt) / 1000));
    } catch (err) {
      logger.error('Maintenance error', err);
    }
  }, 24 * 60 * 60 * 1000);

  // Phase 4: Graceful shutdown manager
  const shutdownMgr = new GracefulShutdownManager(
    {
      stopBackgroundServices: async () => {
        clearInterval(maintenanceInterval);
        if (tokenManager) tokenManager.stopRotationScheduler();
      },
      flushMessageQueue: async () => {
        // Node's internal message queue drains automatically on stop
      },
      closeP2PConnections: async () => {
        await node.stop();
      },
      persistState: async () => {
        await schema.setState('last_shutdown', Date.now());
        await schema.setState('uptime', Math.floor((Date.now() - node.startedAt) / 1000));
        // Save current peer list for restart recovery
        const peers = node.getKnownPeers?.() ?? [];
        await db.put('peers:saved', peers);
      },
      closeApiServer: () =>
        new Promise<void>((resolve) => {
          server.close(() => {
            logger.info('HTTP server closed');
            resolve();
          });
        }),
      closeMetricsServer: async () => {
        if (metricsServer) await metricsServer.stop();
      },
      closeDatabase: async () => {
        await db.close();
      },
    },
    config.shutdown,
  );

  shutdownMgr.registerSignalHandlers();
}

main().catch((err) => {
  console.error('Failed to start GNN node:', err);
  process.exit(1);
});
