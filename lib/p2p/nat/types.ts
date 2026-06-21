export type NatType =
  | 'FullCone'
  | 'RestrictedCone'
  | 'PortRestricted'
  | 'Symmetric'
  | 'Open'
  | 'Unknown';

export interface PublicAddressInfo {
  address: string;
  port: number;
  natType: NatType;
  reachable: boolean;
  detectedAt: number;
  source: 'upnp' | 'pmp' | 'stun';
}

export interface PortMapping {
  internalPort: number;
  externalPort: number;
  externalAddress: string;
  protocol: 'TCP' | 'UDP';
  ttl: number;
  createdAt: number;
  description: string;
}

export interface NatTraversalResult {
  publicAddress: PublicAddressInfo | null;
  portMapping: PortMapping | null;
  natType: NatType;
  reachable: boolean;
  method: 'upnp' | 'pmp' | 'stun' | 'relay' | 'none';
  relayRequired: boolean;
}

export interface NatManagerEvents {
  'nat:mapped': PortMapping;
  'nat:public-ip-detected': PublicAddressInfo;
  'nat:type-detected': NatType;
  'nat:unreachable': void;
  'nat:error': Error;
}
