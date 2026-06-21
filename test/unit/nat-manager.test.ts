import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NatManager } from '../../lib/p2p/nat/manager.js';
import type { NatTraversalConfig } from '../../lib/types/config.js';

// Mock the stun and upnp modules
vi.mock('../../lib/p2p/nat/stun.js', () => ({
  detectPublicIP: vi.fn().mockResolvedValue({
    address: '203.0.113.50',
    port: 28111,
    natType: 'Unknown',
    reachable: true,
    detectedAt: Date.now(),
    source: 'stun',
  }),
  detectNatType: vi.fn().mockResolvedValue('FullCone'),
  clearSTUNCache: vi.fn(),
}));

vi.mock('../../lib/p2p/nat/upnp.js', () => ({
  setupPortMapping: vi.fn().mockResolvedValue(null), // UPnP fails in test
  removePortMapping: vi.fn().mockResolvedValue(undefined),
  getActiveMapping: vi.fn().mockReturnValue(null),
}));

const defaultConfig: NatTraversalConfig = {
  enabled: true,
  methods: ['upnp', 'pmp', 'stun', 'holepunching', 'relay'],
  upnp: { enabled: true, description: 'Test', ttl: 3600 },
  pmp: { enabled: true },
  stun: { enabled: true, servers: ['stun1.l.google.com:19302', 'stun2.l.google.com:19302'], checkInterval: 0, timeout: 5000 },
  relay: { enabled: true, relayServers: [], autoRegister: true, registrationInterval: 60000 },
  holepunching: { enabled: true, timeout: 3000 },
};

describe('NatManager', () => {
  let manager: NatManager;

  beforeEach(() => {
    manager = new NatManager(defaultConfig);
  });

  afterEach(async () => {
    await manager.stop();
  });

  it('should initialize without errors', () => {
    expect(manager).toBeDefined();
    expect(manager.isStarted()).toBe(false);
  });

  it('should start and detect public IP via STUN fallback', async () => {
    const result = await manager.start(28111);

    expect(manager.isStarted()).toBe(true);
    expect(result).toBeDefined();
    expect(result.publicAddress).toBeDefined();
    expect(result.publicAddress!.address).toBe('203.0.113.50');
    expect(result.method).toBe('stun'); // UPnP mocked to fail
    expect(result.natType).toBe('FullCone');
    expect(result.reachable).toBe(true);
    expect(result.relayRequired).toBe(false);
  });

  it('should return null result when disabled', async () => {
    const disabledManager = new NatManager({ ...defaultConfig, enabled: false });
    const result = await disabledManager.start(28111);

    expect(result.publicAddress).toBeNull();
    expect(result.method).toBe('none');
    expect(result.relayRequired).toBe(true);
    await disabledManager.stop();
  });

  it('should generate public multiaddr', async () => {
    await manager.start(28111);

    const multiaddr = manager.getPublicMultiaddr(28111, 'QmTest123');
    expect(multiaddr).toBe('/ip4/203.0.113.50/tcp/28111/p2p/QmTest123');
  });

  it('should indicate relay required for symmetric NAT', async () => {
    const { detectNatType } = await import('../../lib/p2p/nat/stun.js');
    (detectNatType as ReturnType<typeof vi.fn>).mockResolvedValueOnce('Symmetric');

    const symmetricManager = new NatManager(defaultConfig);
    const result = await symmetricManager.start(28111);

    expect(result.natType).toBe('Symmetric');
    expect(result.reachable).toBe(false);
    expect(result.relayRequired).toBe(true);
    await symmetricManager.stop();
  });

  it('should emit events during traversal', async () => {
    const events: string[] = [];
    manager.on('nat:public-ip-detected', () => events.push('public-ip'));
    manager.on('nat:type-detected', () => events.push('type'));

    await manager.start(28111);

    expect(events).toContain('public-ip');
    expect(events).toContain('type');
  });

  it('should stop cleanly', async () => {
    await manager.start(28111);
    expect(manager.isStarted()).toBe(true);

    await manager.stop();
    expect(manager.isStarted()).toBe(false);
  });
});
