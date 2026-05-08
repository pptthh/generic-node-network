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

let _ctx: NodeContext | null = null;

export function setNodeContext(ctx: NodeContext): void {
  _ctx = ctx;
}

export function getNodeContext(): NodeContext {
  if (!_ctx) throw new Error('Node context not initialized');
  return _ctx;
}

export function isContextReady(): boolean {
  return _ctx !== null && _ctx.node.isRunning();
}
