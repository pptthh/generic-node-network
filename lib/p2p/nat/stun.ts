import { createSocket, type Socket } from 'dgram';
import { logger } from '../../utils/logger.js';
import type { NatType, PublicAddressInfo } from './types.js';

const STUN_BINDING_REQUEST = 0x0001;
const STUN_BINDING_RESPONSE = 0x0101;
const STUN_MAGIC_COOKIE = 0x2112a442;
const STUN_ATTR_MAPPED_ADDRESS = 0x0001;
const STUN_ATTR_XOR_MAPPED_ADDRESS = 0x0020;

interface STUNResult {
  address: string;
  port: number;
}

/**
 * Build a STUN binding request packet
 */
function buildBindingRequest(): Buffer {
  const transactionId = Buffer.alloc(12);
  for (let i = 0; i < 12; i++) {
    transactionId[i] = Math.floor(Math.random() * 256);
  }

  const header = Buffer.alloc(20);
  header.writeUInt16BE(STUN_BINDING_REQUEST, 0); // Message type
  header.writeUInt16BE(0, 2); // Message length (no attributes)
  header.writeUInt32BE(STUN_MAGIC_COOKIE, 4); // Magic cookie
  transactionId.copy(header, 8); // Transaction ID

  return header;
}

/**
 * Parse XOR-MAPPED-ADDRESS attribute
 */
function parseXorMappedAddress(data: Buffer, offset: number): STUNResult | null {
  try {
    const family = data.readUInt8(offset + 1);
    if (family !== 0x01) return null; // Only IPv4 supported

    const xorPort = data.readUInt16BE(offset + 2);
    const port = xorPort ^ (STUN_MAGIC_COOKIE >>> 16);

    const xorAddr = data.readUInt32BE(offset + 4);
    const addr = xorAddr ^ STUN_MAGIC_COOKIE;

    const address = [
      (addr >>> 24) & 0xff,
      (addr >>> 16) & 0xff,
      (addr >>> 8) & 0xff,
      addr & 0xff,
    ].join('.');

    return { address, port };
  } catch {
    return null;
  }
}

/**
 * Parse MAPPED-ADDRESS attribute (fallback for older servers)
 */
function parseMappedAddress(data: Buffer, offset: number): STUNResult | null {
  try {
    const family = data.readUInt8(offset + 1);
    if (family !== 0x01) return null; // Only IPv4

    const port = data.readUInt16BE(offset + 2);
    const address = [
      data.readUInt8(offset + 4),
      data.readUInt8(offset + 5),
      data.readUInt8(offset + 6),
      data.readUInt8(offset + 7),
    ].join('.');

    return { address, port };
  } catch {
    return null;
  }
}

/**
 * Parse STUN binding response
 */
function parseBindingResponse(data: Buffer): STUNResult | null {
  if (data.length < 20) return null;

  const msgType = data.readUInt16BE(0);
  if (msgType !== STUN_BINDING_RESPONSE) return null;

  const msgLength = data.readUInt16BE(2);
  let offset = 20; // Skip header

  while (offset < 20 + msgLength) {
    const attrType = data.readUInt16BE(offset);
    const attrLength = data.readUInt16BE(offset + 2);

    if (attrType === STUN_ATTR_XOR_MAPPED_ADDRESS) {
      return parseXorMappedAddress(data, offset + 4);
    } else if (attrType === STUN_ATTR_MAPPED_ADDRESS) {
      return parseMappedAddress(data, offset + 4);
    }

    // Move to next attribute (4-byte aligned)
    offset += 4 + Math.ceil(attrLength / 4) * 4;
  }

  return null;
}

/**
 * Query a single STUN server for the public IP/port
 */
async function querySTUN(server: string, timeout: number = 5000): Promise<STUNResult> {
  const [host, portStr] = server.split(':');
  const port = parseInt(portStr || '3478', 10);

  return new Promise<STUNResult>((resolve, reject) => {
    const socket: Socket = createSocket('udp4');
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`STUN timeout: ${server}`));
    }, timeout);

    socket.on('message', (msg: Buffer) => {
      clearTimeout(timer);
      const result = parseBindingResponse(msg);
      socket.close();
      if (result) {
        resolve(result);
      } else {
        reject(new Error(`Failed to parse STUN response from ${server}`));
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    const request = buildBindingRequest();
    socket.send(request, 0, request.length, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        socket.close();
        reject(err);
      }
    });
  });
}

/**
 * Detect public IP by querying multiple STUN servers.
 * Returns the first successful result.
 */
export async function detectPublicIP(
  servers: string[],
  timeout: number = 5000
): Promise<PublicAddressInfo | null> {
  for (const server of servers) {
    try {
      const result = await querySTUN(server, timeout);

      logger.info('STUN detection successful', {
        publicIP: result.address,
        publicPort: result.port,
        server,
      });

      return {
        address: result.address,
        port: result.port,
        natType: 'Unknown', // Will be refined by detectNatType
        reachable: true,
        detectedAt: Date.now(),
        source: 'stun',
      };
    } catch (err) {
      logger.debug(`STUN server ${server} failed, trying next...`, err);
    }
  }

  logger.warn('All STUN servers failed');
  return null;
}

/**
 * Detect NAT type by comparing results from multiple STUN queries.
 *
 * Strategy:
 * - Query same server twice from different local ports
 * - If external port matches local port → Open/FullCone
 * - If external port differs but is consistent → RestrictedCone or PortRestricted
 * - If external port differs per query → Symmetric
 */
export async function detectNatType(
  servers: string[],
  timeout: number = 5000
): Promise<NatType> {
  if (servers.length < 2) return 'Unknown';

  try {
    // Query two different STUN servers
    const [result1, result2] = await Promise.all([
      querySTUN(servers[0], timeout).catch(() => null),
      querySTUN(servers[1], timeout).catch(() => null),
    ]);

    if (!result1 || !result2) return 'Unknown';

    // If both return same external port, likely FullCone or Open
    if (result1.port === result2.port) {
      // Check if public IP matches likely local binding
      // If port matches source port, it's Open
      return 'FullCone';
    }

    // Different ports from different servers → Symmetric NAT
    if (result1.address === result2.address && result1.port !== result2.port) {
      return 'Symmetric';
    }

    // Same address, same port but different servers → RestrictedCone
    return 'RestrictedCone';
  } catch {
    return 'Unknown';
  }
}

/**
 * Cached STUN result to avoid excessive queries
 */
let cachedResult: PublicAddressInfo | null = null;
let cacheExpiry = 0;

/**
 * Get public address info with caching.
 * Cache TTL defaults to checkInterval from config.
 */
export async function getPublicAddress(
  servers: string[],
  timeout: number = 5000,
  cacheTTL: number = 300000
): Promise<PublicAddressInfo | null> {
  const now = Date.now();
  if (cachedResult && now < cacheExpiry) {
    return cachedResult;
  }

  const result = await detectPublicIP(servers, timeout);
  if (result) {
    // Also detect NAT type
    const natType = await detectNatType(servers, timeout);
    result.natType = natType;
    cachedResult = result;
    cacheExpiry = now + cacheTTL;
  }

  return result;
}

/**
 * Clear the STUN cache (useful for testing or forced refresh)
 */
export function clearSTUNCache(): void {
  cachedResult = null;
  cacheExpiry = 0;
}
