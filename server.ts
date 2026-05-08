import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from './lib/config/loader.js';
import { initLogger, logger } from './lib/utils/logger.js';
import { Database } from './lib/storage/database.js';
import { Schema } from './lib/storage/schema.js';
import { initializeDatabase } from './lib/storage/migrations.js';
import { GNNNode } from './lib/p2p/node.js';
import { setNodeContext } from './lib/api/handlers.js';
import { setApiConfig } from './lib/api/middleware.js';
import { WebSocketManager, setWebSocketManager } from './lib/websocket/server.js';

const isDev = process.env.NODE_ENV !== 'production';

async function main() {
  // 1. Load configuration (CLI + env + file + DB + defaults)
  const config = await loadConfig();

  // 2. Initialize logger
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

  // 4. Initialize P2P node
  const node = new GNNNode(config);

  // 5. Set up context for API routes
  setNodeContext({ node, db, schema, config });
  setApiConfig(config);

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

  // 8. Initialize Next.js app
  const app = next({ dev: isDev, hostname: 'localhost', port: config.apiPort });
  const handle = app.getRequestHandler();

  await app.prepare();

  // 9. Create HTTP server with WebSocket support
  const server = createServer(async (req, res) => {
    try {
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

    wss.handleUpgrade(req, socket, head, (ws: {
      on: (event: string, handler: (data?: unknown) => void) => void;
      send: (data: string) => void;
      readyState: number;
    }) => {
      const clientId = uuidv4();

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

    const multiaddrs = node.getMultiaddrs();
    for (const addr of multiaddrs) {
      logger.info(`P2P listening on: ${addr}`);
    }

    // Print API token for initial setup
    const token = config.apiToken;
    // Only print if log level allows
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
  }, 24 * 60 * 60 * 1000); // every 24 hours

  // Graceful shutdown
  async function shutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down...`);
    clearInterval(maintenanceInterval);

    await node.stop();
    await db.close();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 5000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start GNN node:', err);
  process.exit(1);
});
