import type { Database } from './database.js';
import type { NodeConfig } from '../types/config.js';

export async function initializeDatabase(db: Database, config: NodeConfig): Promise<void> {
  // Persist core config values
  await db.put('config:nodeId', config.nodeId);
  await db.put('config:apiToken', config.apiToken);
  if (config.bootstrapPeers.length > 0) {
    await db.put('config:bootstrapPeers', config.bootstrapPeers);
  }
  await db.put('config:nodeState', { diskFull: false, uptime: 0 });

  // Initialize state counters
  const existing = await db.get('state:messageCount').catch(() => null);
  if (existing === null) {
    await db.put('state:messageCount', 0);
    await db.put('state:uptime', 0);
    await db.put('state:lastPublishTime', 0);
    await db.put('state:dbSize', 0);
  }
}
