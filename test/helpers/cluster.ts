/**
 * MockNode: a lightweight in-process simulation of a GNN P2P node.
 * Uses an in-memory message bus instead of real libp2p — fast and CI-friendly.
 */
import { EventEmitter } from 'events';
import { Histogram } from '../../lib/metrics/histogram.js';

export interface MockMessage {
  topic: string;
  payload: unknown;
  sender: string;
  timestamp: number;
  seq: number;
}

export interface MockNodeOptions {
  nodeId: string;
  /** Introduce artificial latency for message delivery (ms) */
  latencyMs?: number;
  /** Packet loss probability 0–1 */
  packetLoss?: number;
  /** If true, node sends messages with bad signatures */
  byzantine?: boolean;
  /** How many messages/sec the node can receive before dropping */
  rateLimitPerSec?: number;
}

// Shared message bus: topic → Set of subscriber callbacks
const BUS = new Map<string, Set<(msg: MockMessage) => void>>();

function busPublish(topic: string, msg: MockMessage): void {
  const subs = BUS.get(topic);
  if (!subs) return;
  for (const cb of subs) cb(msg);
}

function busSubscribe(topic: string, cb: (msg: MockMessage) => void): () => void {
  if (!BUS.has(topic)) BUS.set(topic, new Set());
  BUS.get(topic)!.add(cb);
  return () => BUS.get(topic)?.delete(cb);
}

export function resetBus(): void {
  BUS.clear();
}

let _globalSeq = 0;

/**
 * MockNode simulates a GNN node using an in-memory message bus.
 */
export class MockNode extends EventEmitter {
  readonly nodeId: string;
  private readonly opts: MockNodeOptions;
  private running = false;
  private subscriptions = new Set<string>();
  private unsubscribers: Array<() => void> = [];
  private receivedMessages: MockMessage[] = [];
  private messagesSent = 0;
  private messagesDropped = 0;
  private receiveCount = 0;
  private receiveWindowStart = 0;
  public latencyHistogram = new Histogram([1, 5, 10, 25, 50, 100, 250, 500, 1000]);

  constructor(opts: MockNodeOptions) {
    super();
    this.nodeId = opts.nodeId;
    this.opts = opts;
  }

  start(): void {
    this.running = true;
    this.receiveWindowStart = Date.now();
  }

  stop(): void {
    this.running = false;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.subscriptions.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  subscribe(topic: string): void {
    if (this.subscriptions.has(topic)) return;
    this.subscriptions.add(topic);

    const unsub = busSubscribe(topic, (msg) => this.onReceive(msg));
    this.unsubscribers.push(unsub);
  }

  async publish(topic: string, payload: unknown): Promise<MockMessage> {
    if (!this.running) throw new Error(`Node ${this.nodeId} is not running`);

    const msg: MockMessage = {
      topic,
      payload,
      sender: this.nodeId,
      timestamp: Date.now(),
      seq: ++_globalSeq,
    };

    this.messagesSent++;

    // Simulate packet loss
    if (this.opts.packetLoss && Math.random() < this.opts.packetLoss) {
      this.messagesDropped++;
      return msg; // silently drop
    }

    // Simulate latency
    const latency = this.opts.latencyMs ?? 0;
    if (latency > 0) {
      await new Promise((r) => setTimeout(r, latency + Math.random() * latency * 0.2));
    }

    busPublish(topic, msg);
    return msg;
  }

  getReceivedMessages(topic?: string): MockMessage[] {
    if (!topic) return this.receivedMessages;
    return this.receivedMessages.filter((m) => m.topic === topic);
  }

  getStats() {
    return {
      nodeId: this.nodeId,
      messagesSent: this.messagesSent,
      messagesReceived: this.receivedMessages.length,
      messagesDropped: this.messagesDropped,
      isRunning: this.running,
    };
  }

  // ---------------------------------------------------------------------------

  private onReceive(msg: MockMessage): void {
    if (!this.running) return;
    if (msg.sender === this.nodeId) return; // don't receive own messages

    // Rate limiting simulation
    if (this.opts.rateLimitPerSec) {
      const now = Date.now();
      if (now - this.receiveWindowStart >= 1000) {
        this.receiveCount = 0;
        this.receiveWindowStart = now;
      }
      if (this.receiveCount >= this.opts.rateLimitPerSec) return;
      this.receiveCount++;
    }

    this.receivedMessages.push(msg);
    this.emit('message', msg);
  }
}
