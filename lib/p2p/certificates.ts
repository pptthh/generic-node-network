import { generateKeyPairSync, createSign, randomBytes } from 'crypto';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Generate a self-signed TLS certificate for WebSocket Secure (WSS) connections.
 * Uses RSA 2048-bit key with a self-signed X.509 certificate.
 */

interface CertificateInfo {
  certPath: string;
  keyPath: string;
  cert: string;
  key: string;
}

/**
 * Create a minimal self-signed X.509 certificate using Node.js crypto.
 * This produces PEM-encoded cert and key files suitable for TLS.
 */
function createSelfSignedCert(
  commonName: string,
  durationDays: number = 365
): { cert: string; key: string } {
  // Generate RSA key pair
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Create a self-signed certificate using the built-in X509Certificate support
  // Since Node.js doesn't have a built-in cert generation API without openssl,
  // we'll create a basic ASN.1 DER structure manually.
  const cert = generateMinimalSelfSignedCert(publicKey, privateKey, commonName, durationDays);

  return { cert, key: privateKey };
}

/**
 * Generate a minimal self-signed X.509 v3 certificate.
 * This is a simplified implementation using ASN.1 DER encoding.
 */
function generateMinimalSelfSignedCert(
  publicKeyPem: string,
  privateKeyPem: string,
  commonName: string,
  durationDays: number
): string {
  // Extract the raw public key DER from PEM
  const pubKeyDer = pemToDer(publicKeyPem, 'PUBLIC KEY');

  // Build TBSCertificate
  const serialNumber = randomBytes(16);
  serialNumber[0] = serialNumber[0] & 0x7f; // Ensure positive

  const now = new Date();
  const notBefore = encodeDateUTC(now);
  const notAfter = encodeDateUTC(new Date(now.getTime() + durationDays * 86400000));

  // Subject/Issuer: CN=commonName
  const nameRDN = encodeRDN('2.5.4.3', commonName); // OID for CN

  // TBSCertificate structure
  const version = Buffer.from([0xa0, 0x03, 0x02, 0x01, 0x02]); // v3
  const serial = encodeInteger(serialNumber);
  const signatureAlgorithm = encodeAlgorithmIdentifier(); // sha256WithRSAEncryption
  const issuer = encodeSequence(nameRDN);
  const validity = encodeSequence(Buffer.concat([notBefore, notAfter]));
  const subject = encodeSequence(nameRDN);
  const subjectPublicKeyInfo = Buffer.from(pubKeyDer);

  const tbsCertificate = encodeSequence(Buffer.concat([
    version,
    serial,
    signatureAlgorithm,
    issuer,
    validity,
    subject,
    subjectPublicKeyInfo,
  ]));

  // Sign the TBSCertificate
  const signer = createSign('SHA256');
  signer.update(tbsCertificate);
  const signature = signer.sign(privateKeyPem);

  // Wrap signature in BIT STRING
  const signatureBitString = encodeBitString(signature);

  // Build full Certificate
  const certificate = encodeSequence(Buffer.concat([
    tbsCertificate,
    signatureAlgorithm,
    signatureBitString,
  ]));

  return derToPem(certificate, 'CERTIFICATE');
}

// --- ASN.1 DER Encoding Helpers ---

function encodeLength(length: number): Buffer {
  if (length < 128) {
    return Buffer.from([length]);
  } else if (length < 256) {
    return Buffer.from([0x81, length]);
  } else if (length < 65536) {
    return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  }
  throw new Error('Length too large for DER encoding');
}

function encodeSequence(content: Buffer): Buffer {
  const len = encodeLength(content.length);
  return Buffer.concat([Buffer.from([0x30]), len, content]);
}

function encodeInteger(value: Buffer): Buffer {
  // Ensure positive by prepending 0x00 if high bit set
  let data = value;
  if (data[0] & 0x80) {
    data = Buffer.concat([Buffer.from([0x00]), data]);
  }
  const len = encodeLength(data.length);
  return Buffer.concat([Buffer.from([0x02]), len, data]);
}

function encodeBitString(content: Buffer): Buffer {
  // Prepend 0x00 (no unused bits)
  const data = Buffer.concat([Buffer.from([0x00]), content]);
  const len = encodeLength(data.length);
  return Buffer.concat([Buffer.from([0x03]), len, data]);
}

function encodeUTF8String(str: string): Buffer {
  const content = Buffer.from(str, 'utf-8');
  const len = encodeLength(content.length);
  return Buffer.concat([Buffer.from([0x0c]), len, content]);
}

function encodeOID(oid: string): Buffer {
  const parts = oid.split('.').map(Number);
  const bytes: number[] = [];

  // First two components encoded as 40*a + b
  bytes.push(40 * parts[0] + parts[1]);

  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val < 128) {
      bytes.push(val);
    } else {
      const encoded: number[] = [];
      encoded.unshift(val & 0x7f);
      val >>= 7;
      while (val > 0) {
        encoded.unshift((val & 0x7f) | 0x80);
        val >>= 7;
      }
      bytes.push(...encoded);
    }
  }

  const content = Buffer.from(bytes);
  const len = encodeLength(content.length);
  return Buffer.concat([Buffer.from([0x06]), len, content]);
}

function encodeAlgorithmIdentifier(): Buffer {
  // sha256WithRSAEncryption OID: 1.2.840.113549.1.1.11
  const oid = encodeOID('1.2.840.113549.1.1.11');
  const nullParam = Buffer.from([0x05, 0x00]);
  return encodeSequence(Buffer.concat([oid, nullParam]));
}

function encodeRDN(oidStr: string, value: string): Buffer {
  const oid = encodeOID(oidStr);
  const val = encodeUTF8String(value);
  const attrTypeAndValue = encodeSequence(Buffer.concat([oid, val]));
  // SET OF AttributeTypeAndValue
  const len = encodeLength(attrTypeAndValue.length);
  return Buffer.concat([Buffer.from([0x31]), len, attrTypeAndValue]);
}

function encodeDateUTC(date: Date): Buffer {
  const year = date.getUTCFullYear();
  let dateStr: string;

  if (year >= 2050) {
    // GeneralizedTime for year >= 2050
    dateStr = date.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
    const content = Buffer.from(dateStr, 'ascii');
    const len = encodeLength(content.length);
    return Buffer.concat([Buffer.from([0x18]), len, content]);
  }

  // UTCTime
  dateStr = date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
  const content = Buffer.from(dateStr, 'ascii');
  const len = encodeLength(content.length);
  return Buffer.concat([Buffer.from([0x17]), len, content]);
}

function pemToDer(pem: string, label: string): Buffer {
  const base64 = pem
    .replace(`-----BEGIN ${label}-----`, '')
    .replace(`-----END ${label}-----`, '')
    .replace(/\s/g, '');
  return Buffer.from(base64, 'base64');
}

function derToPem(der: Buffer, label: string): string {
  const base64 = der.toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.slice(i, i + 64));
  }
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

// --- Public API ---

/**
 * Generate self-signed TLS certificates for a GNN node.
 * Checks if certificates already exist before generating new ones.
 */
export async function generateSelfSignedCertificates(
  nodeId: string,
  certPath: string,
  keyPath: string,
  durationDays: number = 365
): Promise<CertificateInfo> {
  // Resolve template paths
  const resolvedCertPath = certPath.replace('${node-id}', nodeId);
  const resolvedKeyPath = keyPath.replace('${node-id}', nodeId);

  // Check if certificates already exist
  if (existsSync(resolvedCertPath) && existsSync(resolvedKeyPath)) {
    logger.info('Using existing TLS certificates', {
      certPath: resolvedCertPath,
      keyPath: resolvedKeyPath,
    });

    return {
      certPath: resolvedCertPath,
      keyPath: resolvedKeyPath,
      cert: readFileSync(resolvedCertPath, 'utf-8'),
      key: readFileSync(resolvedKeyPath, 'utf-8'),
    };
  }

  // Ensure directories exist
  const certDir = dirname(resolvedCertPath);
  const keyDir = dirname(resolvedKeyPath);
  if (!existsSync(certDir)) mkdirSync(certDir, { recursive: true });
  if (!existsSync(keyDir)) mkdirSync(keyDir, { recursive: true });

  // Generate new certificates
  logger.info('Generating self-signed TLS certificates...', {
    nodeId,
    durationDays,
  });

  const { cert, key } = createSelfSignedCert(nodeId, durationDays);

  // Write files with restricted permissions
  writeFileSync(resolvedCertPath, cert, { mode: 0o600 });
  writeFileSync(resolvedKeyPath, key, { mode: 0o600 });

  logger.info('TLS certificates generated', {
    certPath: resolvedCertPath,
    keyPath: resolvedKeyPath,
  });

  return {
    certPath: resolvedCertPath,
    keyPath: resolvedKeyPath,
    cert,
    key,
  };
}

/**
 * Check if TLS certificate files exist for a given node.
 */
export function certificatesExist(certPath: string, keyPath: string, nodeId: string): boolean {
  const resolvedCertPath = certPath.replace('${node-id}', nodeId);
  const resolvedKeyPath = keyPath.replace('${node-id}', nodeId);
  return existsSync(resolvedCertPath) && existsSync(resolvedKeyPath);
}
