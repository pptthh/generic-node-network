import { describe, expect, it } from 'vitest';
import { getTransportFromMultiaddr } from '../../lib/p2p/transports.js';
import { buildListenAddresses, buildAnnounceAddresses } from '../../lib/p2p/transports.js';
import type { NodeConfig } from '../../lib/types/config.js';

describe('Transport Utilities', () => {
  describe('getTransportFromMultiaddr', () => {
    it('should detect TCP transport', () => {
      expect(getTransportFromMultiaddr('/ip4/192.168.1.1/tcp/28111/p2p/Qm123')).toBe('tcp');
    });

    it('should detect WebSocket transport', () => {
      expect(getTransportFromMultiaddr('/ip4/192.168.1.1/tcp/28112/ws/p2p/Qm123')).toBe('ws');
    });

    it('should detect WSS transport', () => {
      expect(getTransportFromMultiaddr('/ip4/192.168.1.1/tcp/443/wss/p2p/Qm123')).toBe('wss');
    });

    it('should detect relay transport', () => {
      expect(getTransportFromMultiaddr('/ip4/relay.io/tcp/28111/p2p/QmRelay/p2p-circuit/p2p/QmMe')).toBe('relay');
    });

    it('should return unknown for unrecognized addresses', () => {
      expect(getTransportFromMultiaddr('/dns4/example.com')).toBe('unknown');
    });
  });

  describe('buildListenAddresses', () => {
    it('should build TCP and WS addresses from default config', () => {
      const config = {
        p2pPort: 28111,
      } as NodeConfig;

      const addrs = buildListenAddresses(config);
      expect(addrs).toContain('/ip4/0.0.0.0/tcp/28111');
      expect(addrs).toContain('/ip4/0.0.0.0/tcp/28112/ws');
    });

    it('should build custom addresses from explicit config', () => {
      const config = {
        p2pPort: 28111,
        transports: {
          tcp: { enabled: true, port: 9000, maxConnections: 100, connectionTimeout: 5000 },
          webSocket: { enabled: true, port: 9001, path: '/ws', timeout: 3000, tls: true, tlsCertPath: '', tlsKeyPath: '', generateSelfSigned: true },
          webTransport: { enabled: false, port: 9002, tlsCertPath: '', tlsKeyPath: '', generateSelfSigned: true, timeout: 3000 },
        },
      } as NodeConfig;

      const addrs = buildListenAddresses(config);
      expect(addrs).toContain('/ip4/0.0.0.0/tcp/9000');
      expect(addrs).toContain('/ip4/0.0.0.0/tcp/9001/wss');
    });

    it('should omit TCP when disabled', () => {
      const config = {
        p2pPort: 28111,
        transports: {
          tcp: { enabled: false, port: 28111, maxConnections: 100, connectionTimeout: 5000 },
          webSocket: { enabled: true, port: 28112, path: '/ws', timeout: 3000, tls: false, tlsCertPath: '', tlsKeyPath: '', generateSelfSigned: true },
          webTransport: { enabled: false, port: 28113, tlsCertPath: '', tlsKeyPath: '', generateSelfSigned: true, timeout: 3000 },
        },
      } as NodeConfig;

      const addrs = buildListenAddresses(config);
      expect(addrs).not.toContain('/ip4/0.0.0.0/tcp/28111');
      expect(addrs).toContain('/ip4/0.0.0.0/tcp/28112/ws');
    });
  });

  describe('buildAnnounceAddresses', () => {
    it('should return empty array when no public IP', () => {
      const config = { p2pPort: 28111 } as NodeConfig;
      const addrs = buildAnnounceAddresses(config, null);
      expect(addrs).toHaveLength(0);
    });

    it('should build announce addresses with public IP', () => {
      const config = {
        p2pPort: 28111,
        transports: {
          tcp: { enabled: true, port: 28111, maxConnections: 100, connectionTimeout: 5000 },
          webSocket: { enabled: true, port: 28112, path: '/ws', timeout: 3000, tls: false, tlsCertPath: '', tlsKeyPath: '', generateSelfSigned: true },
          webTransport: { enabled: false, port: 28113, tlsCertPath: '', tlsKeyPath: '', generateSelfSigned: true, timeout: 3000 },
        },
      } as NodeConfig;

      const addrs = buildAnnounceAddresses(config, '203.0.113.50', 'QmTest123');
      expect(addrs).toContain('/ip4/203.0.113.50/tcp/28111/p2p/QmTest123');
      expect(addrs).toContain('/ip4/203.0.113.50/tcp/28112/ws/p2p/QmTest123');
    });
  });
});

describe('Failover Strategy', () => {
  it('should sort addresses by priority', async () => {
    // Import dynamically to avoid libp2p init issues in unit test
    const { getTransportFromMultiaddr } = await import('../../lib/p2p/transports.js');

    const addresses = [
      '/ip4/1.2.3.4/tcp/28111/p2p-circuit/p2p/QmA',   // relay (priority 4)
      '/ip4/1.2.3.4/tcp/28112/ws/p2p/QmA',             // ws (priority 2)
      '/ip4/1.2.3.4/tcp/28111/p2p/QmA',                // tcp (priority 1)
      '/ip4/1.2.3.4/tcp/443/wss/p2p/QmA',              // wss (priority 3)
    ];

    const transports = [
      { name: 'tcp', timeout: 3000, priority: 1 },
      { name: 'ws', timeout: 3000, priority: 2 },
      { name: 'wss', timeout: 3000, priority: 3 },
      { name: 'relay', timeout: 10000, priority: 4 },
    ];

    const sorted = addresses
      .map(addr => ({
        address: addr,
        transport: getTransportFromMultiaddr(addr),
        priority: transports.find(t => t.name === getTransportFromMultiaddr(addr))?.priority ?? 99,
      }))
      .sort((a, b) => a.priority - b.priority);

    expect(sorted[0].transport).toBe('tcp');
    expect(sorted[1].transport).toBe('ws');
    expect(sorted[2].transport).toBe('wss');
    expect(sorted[3].transport).toBe('relay');
  });
});
