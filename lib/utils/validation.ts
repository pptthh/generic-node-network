export function isValidTopic(topic: string): boolean {
  return typeof topic === 'string' && topic.length > 0 && topic.length <= 256;
}

export function isValidNodeId(nodeId: string): boolean {
  return typeof nodeId === 'string' && /^[a-zA-Z0-9_-]+$/.test(nodeId);
}

export function isPayloadTooLarge(payload: unknown, maxSize: number): boolean {
  return JSON.stringify(payload).length > maxSize;
}

export function getPayloadSize(payload: unknown): number {
  return JSON.stringify(payload).length;
}
