import type { WebSocketEvent } from '../types/index.js';

export function buildMessagePublishedEvent(msg: {
  messageId: string;
  topic: string;
  payload: unknown;
  sender: string;
  timestamp: number;
}): WebSocketEvent {
  return {
    type: 'message_published',
    message: {
      type: 'publish',
      messageId: msg.messageId,
      topic: msg.topic,
      payload: msg.payload,
      sender: msg.sender,
      timestamp: msg.timestamp,
    },
  };
}

export function buildPeerOnlineEvent(peerId: string, multiaddr: string): WebSocketEvent {
  return {
    type: 'peer_online',
    peerId,
    multiaddr,
    timestamp: new Date().toISOString(),
  };
}

export function buildPeerOfflineEvent(peerId: string): WebSocketEvent {
  return {
    type: 'peer_offline',
    peerId,
    timestamp: new Date().toISOString(),
  };
}
