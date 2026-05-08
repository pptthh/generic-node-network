// Discovery utilities - the main logic is in node.ts
// This module provides helpers for peer address resolution

export function extractApiPort(multiaddr: string): number | null {
  // Convention: P2P port + 3000 offset = API port (e.g., 28111 -> 25111)
  // Or use metadata if available
  const match = multiaddr.match(/\/tcp\/(\d+)/);
  if (!match) return null;
  const p2pPort = parseInt(match[1], 10);
  return p2pPort - 3000; // 28111 -> 25111
}

export function isLocalAddress(multiaddr: string): boolean {
  return multiaddr.includes('/ip4/127.0.0.1/') ||
    multiaddr.includes('/ip4/192.168.') ||
    multiaddr.includes('/ip4/10.') ||
    multiaddr.includes('/ip4/172.16.');
}
