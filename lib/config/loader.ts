import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { NodeConfig } from '../types/config.js';
import { getDefaults } from './defaults.js';

function parseCLIArgs(): Partial<NodeConfig> {
  const args = process.argv.slice(2);
  const result: Record<string, unknown> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const eqIdx = arg.indexOf('=');
    let key: string;
    let value: string;

    if (eqIdx !== -1) {
      key = arg.slice(2, eqIdx);
      value = arg.slice(eqIdx + 1);
    } else {
      key = arg.slice(2);
      value = args[i + 1] ?? 'true';
      if (!value.startsWith('--')) i++;
      else value = 'true';
    }

    switch (key) {
      case 'node-id': result.nodeId = value; break;
      case 'api-port': result.apiPort = parseInt(value, 10); break;
      case 'p2p-port': result.p2pPort = parseInt(value, 10); break;
      case 'api-token': result.apiToken = value; break;
      case 'config-file': result.configFile = value; break;
      case 'db-path': result.dbPath = value; break;
      case 'log-level':
        result.logging = { ...(result.logging as object ?? {}), level: value };
        break;
      case 'log-file':
        result.logging = { ...(result.logging as object ?? {}), file: value };
        break;
      case 'message-retention-days':
        result.message = { ...(result.message as object ?? {}), retentionDays: parseInt(value, 10) };
        break;
      case 'peer-ttl-days':
        result.peer = { ...(result.peer as object ?? {}), ttlDays: parseInt(value, 10) };
        break;
      case 'bootstrap-peers':
        result.bootstrapPeers = value.split(',').map(s => s.trim()).filter(Boolean);
        break;

      // Phase 2: NAT Traversal
      case 'nat-enabled':
        result.natTraversal = { ...(result.natTraversal as object ?? {}), enabled: value !== 'false' };
        break;
      case 'nat-methods':
        result.natTraversal = { ...(result.natTraversal as object ?? {}), methods: value.split(',').map(s => s.trim()) };
        break;
      case 'upnp-enabled':
        result.natTraversal = {
          ...(result.natTraversal as object ?? {}),
          upnp: { ...(((result.natTraversal as any)?.upnp) ?? {}), enabled: value !== 'false' },
        };
        break;
      case 'pmp-enabled':
        result.natTraversal = {
          ...(result.natTraversal as object ?? {}),
          pmp: { enabled: value !== 'false' },
        };
        break;
      case 'stun-servers':
        result.natTraversal = {
          ...(result.natTraversal as object ?? {}),
          stun: { ...(((result.natTraversal as any)?.stun) ?? {}), servers: value.split(',').map(s => s.trim()) },
        };
        break;
      case 'relay-servers':
        result.natTraversal = {
          ...(result.natTraversal as object ?? {}),
          relay: { ...(((result.natTraversal as any)?.relay) ?? {}), relayServers: value.split(',').map(s => s.trim()) },
        };
        break;
      case 'relay-auto-register':
        result.natTraversal = {
          ...(result.natTraversal as object ?? {}),
          relay: { ...(((result.natTraversal as any)?.relay) ?? {}), autoRegister: value !== 'false' },
        };
        break;

      // Phase 2: Transports
      case 'webtransport-enabled':
        result.transports = {
          ...(result.transports as object ?? {}),
          webTransport: { ...(((result.transports as any)?.webTransport) ?? {}), enabled: value !== 'false' },
        };
        break;
      case 'webtransport-cert':
        result.transports = {
          ...(result.transports as object ?? {}),
          webTransport: { ...(((result.transports as any)?.webTransport) ?? {}), tlsCertPath: value },
        };
        break;
      case 'webtransport-key':
        result.transports = {
          ...(result.transports as object ?? {}),
          webTransport: { ...(((result.transports as any)?.webTransport) ?? {}), tlsKeyPath: value },
        };
        break;
      case 'websocket-enabled':
        result.transports = {
          ...(result.transports as object ?? {}),
          webSocket: { ...(((result.transports as any)?.webSocket) ?? {}), enabled: value !== 'false' },
        };
        break;
      case 'websocket-tls':
        result.transports = {
          ...(result.transports as object ?? {}),
          webSocket: { ...(((result.transports as any)?.webSocket) ?? {}), tls: value !== 'false' },
        };
        break;

      // Phase 2: Discovery
      case 'dht-mode':
        result.discovery = {
          ...(result.discovery as object ?? {}),
          dht: { ...(((result.discovery as any)?.dht) ?? {}), mode: value },
        };
        break;

      // Phase 2: Performance
      case 'connection-pooling':
        result.performance = {
          ...(result.performance as object ?? {}),
          connectionPooling: { ...(((result.performance as any)?.connectionPooling) ?? {}), enabled: value !== 'false' },
        };
        break;
      case 'max-pool-size':
        result.performance = {
          ...(result.performance as object ?? {}),
          connectionPooling: { ...(((result.performance as any)?.connectionPooling) ?? {}), maxPoolSize: parseInt(value, 10) },
        };
        break;

      // Phase 2: Bootstrap
      case 'bootstrap-nodes':
        result.bootstrapPeers = value.split(',').map(s => s.trim()).filter(Boolean);
        break;
    }
  }

  return result as Partial<NodeConfig>;
}

function loadEnv(): Partial<NodeConfig> {
  const result: Record<string, unknown> = {};
  const e = process.env;

  if (e.GNN_NODE_ID) result.nodeId = e.GNN_NODE_ID;
  if (e.GNN_API_TOKEN) result.apiToken = e.GNN_API_TOKEN;
  if (e.GNN_API_PORT) result.apiPort = parseInt(e.GNN_API_PORT, 10);
  if (e.GNN_P2P_PORT) result.p2pPort = parseInt(e.GNN_P2P_PORT, 10);
  if (e.GNN_CONFIG_FILE) result.configFile = e.GNN_CONFIG_FILE;
  if (e.GNN_DB_PATH) result.dbPath = e.GNN_DB_PATH;
  if (e.GNN_BOOTSTRAP_PEERS) {
    result.bootstrapPeers = e.GNN_BOOTSTRAP_PEERS.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (e.GNN_LOG_LEVEL || e.GNN_LOG_FILE || e.GNN_LOG_MAX_SIZE_KB || e.GNN_LOG_RETENTION_DAYS) {
    result.logging = {
      level: e.GNN_LOG_LEVEL ?? 'error',
      file: e.GNN_LOG_FILE ?? null,
      maxSizeKB: e.GNN_LOG_MAX_SIZE_KB ? parseInt(e.GNN_LOG_MAX_SIZE_KB, 10) : 100,
      retentionDays: e.GNN_LOG_RETENTION_DAYS ? parseInt(e.GNN_LOG_RETENTION_DAYS, 10) : 1,
    };
  }
  if (e.GNN_MESSAGE_RETENTION_DAYS || e.GNN_MAX_PAYLOAD_SIZE) {
    result.message = {
      retentionDays: e.GNN_MESSAGE_RETENTION_DAYS ? parseInt(e.GNN_MESSAGE_RETENTION_DAYS, 10) : 28,
      maxPayloadSize: e.GNN_MAX_PAYLOAD_SIZE ? parseInt(e.GNN_MAX_PAYLOAD_SIZE, 10) : 31744,
    };
  }
  if (e.GNN_PEER_TTL_DAYS) {
    result.peer = { ttlDays: parseInt(e.GNN_PEER_TTL_DAYS, 10), autoCleanupInterval: '24h' };
  }
  if (e.GNN_QUERY_TIMEOUT_MS || e.GNN_BROADCAST_TIMEOUT_MS) {
    result.timeouts = {
      queryMs: e.GNN_QUERY_TIMEOUT_MS ? parseInt(e.GNN_QUERY_TIMEOUT_MS, 10) : 100,
      broadcastMs: e.GNN_BROADCAST_TIMEOUT_MS ? parseInt(e.GNN_BROADCAST_TIMEOUT_MS, 10) : 1000,
      peerCheckIntervalSec: 30,
    };
  }

  // Phase 2: NAT Traversal env vars
  if (e.GNN_NAT_ENABLED !== undefined || e.GNN_NAT_METHODS || e.GNN_UPNP_ENABLED ||
      e.GNN_PMP_ENABLED || e.GNN_STUN_SERVERS || e.GNN_RELAY_SERVERS || e.GNN_RELAY_AUTO_REGISTER) {
    const nat: Record<string, unknown> = {};
    if (e.GNN_NAT_ENABLED !== undefined) nat.enabled = e.GNN_NAT_ENABLED !== 'false';
    if (e.GNN_NAT_METHODS) nat.methods = e.GNN_NAT_METHODS.split(',').map(s => s.trim());
    if (e.GNN_UPNP_ENABLED !== undefined) nat.upnp = { enabled: e.GNN_UPNP_ENABLED !== 'false' };
    if (e.GNN_PMP_ENABLED !== undefined) nat.pmp = { enabled: e.GNN_PMP_ENABLED !== 'false' };
    if (e.GNN_STUN_SERVERS) nat.stun = { servers: e.GNN_STUN_SERVERS.split(',').map(s => s.trim()) };
    if (e.GNN_RELAY_SERVERS) nat.relay = { relayServers: e.GNN_RELAY_SERVERS.split(',').map(s => s.trim()) };
    if (e.GNN_RELAY_AUTO_REGISTER !== undefined) {
      nat.relay = { ...(nat.relay as object ?? {}), autoRegister: e.GNN_RELAY_AUTO_REGISTER !== 'false' };
    }
    result.natTraversal = nat;
  }

  // Phase 2: Transport env vars
  if (e.GNN_WEBTRANSPORT_ENABLED !== undefined || e.GNN_WEBTRANSPORT_PORT ||
      e.GNN_WEBTRANSPORT_TLS_CERT || e.GNN_WEBTRANSPORT_TLS_KEY || e.GNN_WEBTRANSPORT_SELF_SIGNED) {
    const wt: Record<string, unknown> = {};
    if (e.GNN_WEBTRANSPORT_ENABLED !== undefined) wt.enabled = e.GNN_WEBTRANSPORT_ENABLED !== 'false';
    if (e.GNN_WEBTRANSPORT_PORT) wt.port = parseInt(e.GNN_WEBTRANSPORT_PORT, 10);
    if (e.GNN_WEBTRANSPORT_TLS_CERT) wt.tlsCertPath = e.GNN_WEBTRANSPORT_TLS_CERT;
    if (e.GNN_WEBTRANSPORT_TLS_KEY) wt.tlsKeyPath = e.GNN_WEBTRANSPORT_TLS_KEY;
    if (e.GNN_WEBTRANSPORT_SELF_SIGNED) wt.generateSelfSigned = e.GNN_WEBTRANSPORT_SELF_SIGNED !== 'false';
    result.transports = { ...(result.transports as object ?? {}), webTransport: wt };
  }

  // Phase 2: Discovery env vars
  if (e.GNN_DHT_MODE) {
    result.discovery = { ...(result.discovery as object ?? {}), dht: { mode: e.GNN_DHT_MODE } };
  }
  if (e.GNN_DNS_ENABLED !== undefined || e.GNN_DNS_SERVERS) {
    const dns: Record<string, unknown> = {};
    if (e.GNN_DNS_ENABLED !== undefined) dns.enabled = e.GNN_DNS_ENABLED !== 'false';
    if (e.GNN_DNS_SERVERS) dns.servers = e.GNN_DNS_SERVERS.split(',').map(s => s.trim());
    result.discovery = { ...(result.discovery as object ?? {}), dns };
  }

  // Phase 2: Performance env vars
  if (e.GNN_CONNECTION_POOLING !== undefined || e.GNN_MAX_POOL_SIZE || e.GNN_MULTIPLEXING_ENABLED) {
    const perf: Record<string, unknown> = {};
    if (e.GNN_CONNECTION_POOLING !== undefined || e.GNN_MAX_POOL_SIZE) {
      const cp: Record<string, unknown> = {};
      if (e.GNN_CONNECTION_POOLING !== undefined) cp.enabled = e.GNN_CONNECTION_POOLING !== 'false';
      if (e.GNN_MAX_POOL_SIZE) cp.maxPoolSize = parseInt(e.GNN_MAX_POOL_SIZE, 10);
      perf.connectionPooling = cp;
    }
    if (e.GNN_MULTIPLEXING_ENABLED !== undefined || e.GNN_MAX_STREAMS_PER_CONN) {
      const mx: Record<string, unknown> = {};
      if (e.GNN_MAX_STREAMS_PER_CONN) mx.maxStreamsPerConnection = parseInt(e.GNN_MAX_STREAMS_PER_CONN, 10);
      perf.multiplexing = mx;
    }
    result.performance = perf;
  }

  return result as Partial<NodeConfig>;
}

function loadConfigFile(filePath: string): Partial<NodeConfig> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Partial<NodeConfig>;
  } catch {
    return {};
  }
}

function generateToken(): string {
  return 'token_' + randomBytes(24).toString('hex');
}

function deepMerge<T extends object>(...sources: Partial<T>[]): T {
  const result: Record<string, unknown> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          result[key] = deepMerge(
            (result[key] as object ?? {}),
            value as object
          );
        } else {
          result[key] = value;
        }
      }
    }
  }
  return result as T;
}

let _cachedConfig: NodeConfig | null = null;

export async function loadConfig(): Promise<NodeConfig> {
  if (_cachedConfig) return _cachedConfig;

  const cliConfig = parseCLIArgs();
  const envConfig = loadEnv();

  // Resolve nodeId first (needed for default paths and port derivation)
  const nodeId = (cliConfig.nodeId ?? envConfig.nodeId ?? uuidv4()) as string;

  const defaults = await getDefaults(nodeId);

  const defaultConfigFile = `./gnn-conf-${nodeId}.json`;
  const defaultDbPath = `./.next/${nodeId}/dev/data-base`;

  const configFilePath = cliConfig.configFile
    ?? process.env.GNN_CONFIG_FILE
    ?? defaultConfigFile;

  const fileConfig = existsSync(configFilePath) ? loadConfigFile(configFilePath) : {};

  // Load DB config lazily (avoid circular dependency with storage)
  let dbConfig: Partial<NodeConfig> = {};
  const dbPath = cliConfig.dbPath
    ?? process.env.GNN_DB_PATH
    ?? (fileConfig.dbPath as string | undefined)
    ?? defaultDbPath;

  try {
    const { Database } = await import('../storage/database.js');
    const db = new Database(dbPath);
    await db.open();
    const storedNodeId = await db.get('config:nodeId').catch(() => null);
    const storedToken = await db.get('config:apiToken').catch(() => null);
    const storedBootstrap = await db.get('config:bootstrapPeers').catch(() => null);
    if (storedNodeId) dbConfig.nodeId = storedNodeId as string;
    if (storedToken) dbConfig.apiToken = storedToken as string;
    if (storedBootstrap) dbConfig.bootstrapPeers = storedBootstrap as string[];
    await db.close();
  } catch {
    // DB not yet initialized, ignore
  }

  const merged = deepMerge<NodeConfig>(
    defaults as NodeConfig,
    dbConfig,
    fileConfig as Partial<NodeConfig>,
    envConfig,
    cliConfig,
    { nodeId, configFile: configFilePath, dbPath } as Partial<NodeConfig>
  );

  // Ensure apiToken exists
  if (!merged.apiToken) {
    merged.apiToken = generateToken();
  }

  _cachedConfig = merged;
  return merged;
}

export function resetConfigCache(): void {
  _cachedConfig = null;
}

export function getCachedConfig(): NodeConfig | null {
  return _cachedConfig;
}
