import { readFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
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
  const defaults = getDefaults();

  // Resolve nodeId first (needed for default paths)
  const nodeId = (cliConfig.nodeId ?? envConfig.nodeId ?? uuidv4()) as string;

  const defaultConfigFile = `./gnn-conf-${nodeId}.json`;
  const defaultDbPath = `./gnn-data-${nodeId}`;

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
