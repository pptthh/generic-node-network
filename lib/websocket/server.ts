import type { GNNNode } from '../p2p/node.js';
import type { NodeConfig } from '../types/config.js';
import type { WebSocketEvent } from '../types/index.js';
import type { PublishedMessage } from '../types/messages.js';
import type { Peer } from '../types/peers.js';
import { logger } from '../utils/logger.js';
import { buildMessagePublishedEvent, buildPeerOfflineEvent, buildPeerOnlineEvent } from './events.js';

export interface WebSocketClient {
  id: string;
  send: (data: string) => void;
  readyState: number;
}

export class WebSocketManager {
  private clients: Map<string, WebSocketClient> = new Map();
  private readonly config: NodeConfig;
  private node: GNNNode | null = null;

  constructor(config: NodeConfig) {
    this.config = config;
  }

  attachNode(node: GNNNode): void {
    this.node = node;

    node.on('message', (msg: PublishedMessage) => {
      this.broadcast(buildMessagePublishedEvent(msg));
    });

    node.on('peer:online', (peer: Peer) => {
      this.broadcast(buildPeerOnlineEvent(peer.peerId, peer.multiaddr));
    });

    node.on('peer:offline', (peer: Peer) => {
      this.broadcast(buildPeerOfflineEvent(peer.peerId));
    });
  }

  addClient(id: string, client: WebSocketClient): void {
    this.clients.set(id, client);
    logger.debug(`WebSocket client connected: ${id}`);
  }

  removeClient(id: string): void {
    this.clients.delete(id);
    logger.debug(`WebSocket client disconnected: ${id}`);
  }

  broadcast(event: WebSocketEvent): void {
    const data = JSON.stringify(event);
    const dead: string[] = [];

    for (const [id, client] of this.clients) {
      if (client.readyState !== 1) {
        dead.push(id);
        continue;
      }
      try {
        client.send(data);
      } catch (err) {
        logger.error(`Failed to send WS event to ${id}`, err);
        dead.push(id);
      }
    }

    for (const id of dead) {
      this.clients.delete(id);
    }
  }

  validateToken(token: string | null): boolean {
    if (!token) return false;
    const clean = token.startsWith('Bearer ') ? token.slice(7) : token;
    return clean === this.config.apiToken;
  }

  clientCount(): number {
    return this.clients.size;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __gnnWsManager: WebSocketManager | undefined;
}

export function getWebSocketManager(): WebSocketManager | null {
  return globalThis.__gnnWsManager ?? null;
}

export function setWebSocketManager(manager: WebSocketManager): void {
  globalThis.__gnnWsManager = manager;
}
