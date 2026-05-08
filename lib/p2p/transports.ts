// Transport configuration helpers
export interface TransportConfig {
  tcp: { port: number };
  websocket?: { port: number };
}

export function buildListenAddresses(config: TransportConfig): string[] {
  const addrs = [`/ip4/0.0.0.0/tcp/${config.tcp.port}`];
  if (config.websocket) {
    addrs.push(`/ip4/0.0.0.0/tcp/${config.websocket.port}/ws`);
  }
  return addrs;
}
