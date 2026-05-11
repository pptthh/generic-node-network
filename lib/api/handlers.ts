import type { GNNNode } from '../p2p/node.js';
import type { Database } from '../storage/database.js';
import type { Schema } from '../storage/schema.js';
import type { NodeConfig } from '../types/config.js';

export interface NodeContext {
  node: GNNNode;
  db: Database;
  schema: Schema;
  config: NodeConfig;
}

declare global {
  // eslint-disable-next-line no-var
  var __gnnNodeContext: NodeContext | undefined;
}

export function setNodeContext(ctx: NodeContext): void {
  globalThis.__gnnNodeContext = ctx;
}

export function getNodeContext(): NodeContext {
  if (!globalThis.__gnnNodeContext) throw new Error('Node context not initialized');
  return globalThis.__gnnNodeContext;
}

export function isContextReady(): boolean {
  return !!globalThis.__gnnNodeContext?.node.isRunning();
}
