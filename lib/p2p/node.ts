import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import type { Libp2p } from '@libp2p/interface';
import { kadDHT } from '@libp2p/kad-dht';
import { mdns } from '@libp2p/mdns';
import { ping } from '@libp2p/ping';
import { tcp } from '@libp2p/tcp';
import { multiaddr } from '@multiformats/multiaddr';
import { EventEmitter } from 'events';
import { createLibp2p } from 'libp2p';
import { v4 as uuidv4 } from 'uuid';
import type { NodeConfig } from '../types/config.js';
import type { PeerResponse, PublishedMessage } from '../types/messages.js';
import type { Peer } from '../types/peers.js';
import { logger } from '../utils/logger.js';
import { nowMs } from '../utils/time.js';
import { GNN_RPC_PROTOCOL, type RpcRequest, type RpcResponse } from './types.js';

const MAX_QUEUE_SIZE = 1000;

export class GNNNode extends EventEmitter {
  private libp2p: Libp2p | null = null;
  private readonly config: NodeConfig;
  private readonly peers: Map<string, Peer> = new Map();
  private readonly pendingQueries: Map<string, {
    resolve: (val: RpcResponse) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private messageQueue: PublishedMessage[] = [];
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  public readonly startedAt: number;

  constructor(config: NodeConfig) {
    super();
    this.config = config;
    this.startedAt = nowMs();
  }

  async start(): Promise<void> {
    const listenAddr = `/ip4/0.0.0.0/tcp/${this.config.p2pPort}`;

    this.libp2p = await createLibp2p({
      addresses: {
        listen: [listenAddr],
      },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: this.config.discovery.mdnsEnabled ? [mdns()] : [],
      services: {
        identify: identify(),
        ping: ping(),
        ...(this.config.discovery.dhtEnabled ? {
          dht: kadDHT({ clientMode: false }),
        } : {}),
        pubsub: gossipsub({
          emitSelf: false,
          allowPublishToZeroTopicPeers: true,
        }),
      },
    });

    // Handle peer discovery
    this.libp2p.addEventListener('peer:discovery', async (evt) => {
      const peerInfo = evt.detail;
      const peerId = peerInfo.id.toString();
      logger.info(`Peer discovered: ${peerId}`);

      try {
        await this.libp2p!.dial(peerInfo.multiaddrs);
      } catch (err) {
        logger.debug(`Failed to dial discovered peer ${peerId}`, err);
      }
    });

    // Handle peer connect
    this.libp2p.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail.toString();
      const existing = this.peers.get(peerId);
      const multiaddrs = this.libp2p!.getMultiaddrs();
      const addr = multiaddrs[0]?.toString() ?? '';

      const peer: Peer = {
        peerId,
        multiaddr: addr,
        status: 'online',
        lastSeen: nowMs(),
        discoveryMethod: existing?.discoveryMethod ?? 'mDNS',
        metadata: existing?.metadata,
      };

      this.peers.set(peerId, peer);
      this.emit('peer:online', peer);
      logger.info(`Peer connected: ${peerId}`);
    });

    // Handle peer disconnect
    this.libp2p.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString();
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.status = 'offline';
        peer.lastSeen = nowMs();
        this.emit('peer:offline', peer);
        logger.info(`Peer disconnected: ${peerId}`);
      }
    });

    // Handle incoming pub-sub messages
    const pubsub = (this.libp2p.services as Record<string, unknown>).pubsub as {
      subscribe: (topic: string) => void;
      publish: (topic: string, data: Uint8Array) => Promise<unknown>;
      addEventListener: (event: string, handler: (evt: { detail: unknown }) => void) => void;
    };

    pubsub.addEventListener('message', (evt) => {
      try {
        const msg = evt.detail as { topic: string; data: Uint8Array };
        const decoded = JSON.parse(new TextDecoder().decode(msg.data)) as PublishedMessage;
        if (decoded.type === 'publish') {
          if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
            this.messageQueue.shift();
          }
          this.messageQueue.push(decoded);
          this.emit('message', decoded);
          logger.debug(`Received published message on topic: ${decoded.topic}`);
        }
      } catch (err) {
        logger.error('Failed to decode pubsub message', err);
      }
    });

    // Handle incoming RPC requests
    await this.libp2p.handle(GNN_RPC_PROTOCOL, async ({ stream }) => {
      try {
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream.source) {
          chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk.subarray()));
        }
        const data = Buffer.concat(chunks).toString('utf-8');
        const req = JSON.parse(data) as RpcRequest;

        logger.debug(`Received RPC request: ${req.action} (queryId: ${req.queryId})`);

        const response = await this.handleRpcRequest(req);
        const encoded = new TextEncoder().encode(JSON.stringify(response));
        await stream.sink([encoded]);
      } catch (err) {
        logger.error('RPC handler error', err);
      }
    });

    await this.libp2p.start();

    // Connect bootstrap peers
    for (const addr of this.config.bootstrapPeers) {
      try {
        await this.libp2p.dial(multiaddr(addr));
        logger.info(`Connected to bootstrap peer: ${addr}`);
      } catch (err) {
        logger.warn(`Failed to connect to bootstrap peer: ${addr}`, err);
      }
    }

    // Start cleanup interval
    this.cleanupTimer = setInterval(() => this.periodicCleanup(), 30_000);

    logger.info(`GNN Node started: ${this.config.nodeId}`);
    logger.info(`Listening on: ${this.libp2p.getMultiaddrs().map(m => m.toString()).join(', ')}`);
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Cancel pending queries
    for (const [queryId, pending] of this.pendingQueries) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Node stopping'));
      this.pendingQueries.delete(queryId);
    }

    if (this.libp2p) {
      await this.libp2p.stop();
      this.libp2p = null;
    }
    logger.info(`GNN Node stopped: ${this.config.nodeId}`);
  }

  async publish(topic: string, payload: unknown, ttl?: number): Promise<string> {
    const pubsub = this.getPubsub();
    const messageId = `msg_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const msg: PublishedMessage = {
      type: 'publish',
      messageId,
      topic,
      payload,
      sender: this.config.nodeId,
      timestamp: nowMs(),
      ttl: ttl ?? null,
    };

    const encoded = new TextEncoder().encode(JSON.stringify(msg));
    await pubsub.publish(topic, encoded);

    if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
      this.messageQueue.shift();
    }
    this.messageQueue.push(msg);
    this.emit('message', msg);

    logger.debug(`Published message: ${messageId} on topic: ${topic}`);
    return messageId;
  }

  async subscribe(topic: string): Promise<void> {
    this.getPubsub().subscribe(topic);
    logger.info(`Subscribed to topic: ${topic}`);
  }

  async unsubscribe(topic: string): Promise<void> {
    const pubsub = this.getPubsub();
    if ('unsubscribe' in pubsub) {
      (pubsub as { unsubscribe: (t: string) => void }).unsubscribe(topic);
    }
    logger.info(`Unsubscribed from topic: ${topic}`);
  }

  async query(targetNodeId: string, request: { action: string; params?: Record<string, unknown> }, timeout?: number): Promise<RpcResponse> {
    if (!this.libp2p) throw new Error('Node not started');

    const targetPeer = [...this.peers.values()].find(
      p => p.peerId === targetNodeId || p.metadata?.alias === targetNodeId
    );

    if (!targetPeer) {
      throw new Error(`Peer not found: ${targetNodeId}`);
    }

    const queryId = `qry_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const timeoutMs = timeout ?? this.config.timeouts.queryMs;

    return new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error(`Query timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingQueries.set(queryId, { resolve, reject, timer });

      this.sendRpcRequest(targetPeer.peerId, {
        queryId,
        action: request.action,
        params: request.params,
        sender: this.config.nodeId,
        timestamp: nowMs(),
        target: targetNodeId,
      }).then(response => {
        clearTimeout(timer);
        this.pendingQueries.delete(queryId);
        resolve(response);
      }).catch(err => {
        clearTimeout(timer);
        this.pendingQueries.delete(queryId);
        reject(err as Error);
      });
    });
  }

  async broadcastQuery(request: { action: string; params?: Record<string, unknown> }, timeout?: number): Promise<{
    broadcastId: string;
    responses: PeerResponse[];
    respondedCount: number;
    timeoutCount: number;
    averageResponseTime: number;
  }> {
    const broadcastId = `bcast_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const timeoutMs = timeout ?? this.config.timeouts.broadcastMs;
    const onlinePeers = [...this.peers.values()].filter(p => p.status === 'online');

    const queryPromises = onlinePeers.map(async (peer): Promise<PeerResponse> => {
      const start = nowMs();
      try {
        const rpcResp = await this.sendRpcRequest(peer.peerId, {
          queryId: broadcastId,
          action: request.action,
          params: request.params,
          sender: this.config.nodeId,
          timestamp: nowMs(),
        });
        return {
          peerId: peer.peerId,
          status: 'success',
          response: rpcResp.response,
          responseTime: nowMs() - start,
        };
      } catch {
        return {
          peerId: peer.peerId,
          status: 'timeout',
          responseTime: timeoutMs,
        };
      }
    });

    const localStart = nowMs();
    const localResponse = await this.handleRpcRequest({
      queryId: broadcastId,
      action: request.action,
      params: request.params,
      sender: this.config.nodeId,
      timestamp: nowMs(),
    });

    const timeoutPromise = new Promise<PeerResponse[]>(resolve =>
      setTimeout(() => resolve([]), timeoutMs)
    );

    const peerResponses = await Promise.race([
      Promise.all(queryPromises),
      timeoutPromise,
    ]) as PeerResponse[];

    const allResponses: PeerResponse[] = [
      {
        peerId: this.config.nodeId,
        status: 'success',
        response: localResponse.response,
        responseTime: nowMs() - localStart,
      },
      ...peerResponses,
    ];

    const respondedCount = allResponses.filter(r => r.status === 'success').length;
    const timeoutCount = allResponses.filter(r => r.status === 'timeout').length;
    const avgTime = allResponses.reduce((sum, r) => sum + r.responseTime, 0) / allResponses.length;

    return {
      broadcastId,
      responses: allResponses,
      respondedCount,
      timeoutCount,
      averageResponseTime: Math.round(avgTime),
    };
  }

  async addBootstrapPeer(addr: string): Promise<void> {
    if (!this.libp2p) throw new Error('Node not started');
    await this.libp2p.dial(multiaddr(addr));
    logger.info(`Added bootstrap peer: ${addr}`);
  }

  getPeers(): Peer[] {
    return [...this.peers.values()];
  }

  getMultiaddrs(): string[] {
    return this.libp2p?.getMultiaddrs().map(m => m.toString()) ?? [];
  }

  getNodeId(): string {
    return this.config.nodeId;
  }

  getPeerId(): string {
    return this.libp2p?.peerId.toString() ?? '';
  }

  isRunning(): boolean {
    return this.libp2p !== null;
  }

  private getPubsub(): {
    subscribe: (topic: string) => void;
    publish: (topic: string, data: Uint8Array) => Promise<unknown>;
    addEventListener: (event: string, handler: (evt: { detail: unknown }) => void) => void;
    unsubscribe?: (topic: string) => void;
  } {
    if (!this.libp2p) throw new Error('Node not started');
    const services = this.libp2p.services as Record<string, unknown>;
    return services.pubsub as ReturnType<typeof this.getPubsub>;
  }

  private async sendRpcRequest(targetPeerId: string, req: RpcRequest): Promise<RpcResponse> {
    if (!this.libp2p) throw new Error('Node not started');
    const { peerIdFromString } = await import('@libp2p/peer-id');
    const peerId = peerIdFromString(targetPeerId);
    const stream = await this.libp2p.dialProtocol(peerId, GNN_RPC_PROTOCOL);

    const encoded = new TextEncoder().encode(JSON.stringify(req));
    await stream.sink([encoded]);

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream.source) {
      chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk.subarray()));
    }

    const data = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(data) as RpcResponse;
  }

  private async handleRpcRequest(req: RpcRequest): Promise<RpcResponse> {
    const { action } = req;
    let response: unknown;

    switch (action) {
      case 'get_state':
        response = {
          nodeId: this.config.nodeId,
          uptime: Math.floor((nowMs() - this.startedAt) / 1000),
          peerCount: this.getPeers().filter(p => p.status === 'online').length,
        };
        break;
      case 'count_messages':
        response = { count: this.messageQueue.length };
        break;
      case 'ping':
        response = { pong: true, timestamp: nowMs() };
        break;
      default:
        // Emit for custom handlers
        response = await new Promise(resolve => {
          const handled = this.emit('rpc:request', req, resolve);
          if (!handled) resolve({ error: `Unknown action: ${action}` });
        });
    }

    return {
      queryId: req.queryId,
      status: 'success',
      response,
      sender: this.config.nodeId,
      timestamp: nowMs(),
    };
  }

  private periodicCleanup(): void {
    const now = nowMs();
    // Remove stale peers from in-memory map (>5 min offline)
    for (const [peerId, peer] of this.peers) {
      if (peer.status === 'offline' && now - peer.lastSeen > 5 * 60 * 1000) {
        this.peers.delete(peerId);
      }
    }
  }
}
