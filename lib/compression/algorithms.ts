/**
 * Compression algorithm implementations using built-in Node.js/Bun APIs
 * and WebAssembly-based zstd.
 */
import { gzip, gunzip, brotliCompress, brotliDecompress, constants } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

// Lazy-initialised zstd wasm module
let zstdModule: typeof import('@bokuweb/zstd-wasm') | null = null;
let zstdInitialised = false;

async function getZstd(): Promise<typeof import('@bokuweb/zstd-wasm')> {
  if (!zstdInitialised) {
    zstdModule = await import('@bokuweb/zstd-wasm');
    await zstdModule.init();
    zstdInitialised = true;
  }
  return zstdModule!;
}

// ---- gzip ----

export async function gzipCompress(data: Buffer, level: number = 6): Promise<Buffer> {
  return gzipAsync(data, { level }) as Promise<Buffer>;
}

export async function gzipDecompress(data: Buffer): Promise<Buffer> {
  return gunzipAsync(data) as Promise<Buffer>;
}

// ---- brotli ----

export async function brotliCompressData(data: Buffer, level: number = 6): Promise<Buffer> {
  return brotliCompressAsync(data, {
    params: { [constants.BROTLI_PARAM_QUALITY]: level },
  }) as Promise<Buffer>;
}

export async function brotliDecompressData(data: Buffer): Promise<Buffer> {
  return brotliDecompressAsync(data) as Promise<Buffer>;
}

// ---- zstd ----

export async function zstdCompress(data: Buffer, level: number = 3): Promise<Buffer> {
  const z = await getZstd();
  const input = new Uint8Array(data);
  const output = z.compress(input, level);
  return Buffer.from(output);
}

export async function zstdDecompress(data: Buffer): Promise<Buffer> {
  const z = await getZstd();
  const input = new Uint8Array(data);
  const output = z.decompress(input);
  return Buffer.from(output);
}
