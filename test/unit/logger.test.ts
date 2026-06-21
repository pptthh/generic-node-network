import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatHuman, initLogger, logger } from '../../lib/utils/logger.js';

// ---------------------------------------------------------------------------
// formatHuman (pure function, no file I/O)
// ---------------------------------------------------------------------------
describe('formatHuman', () => {
  it('formats a bare message', () => {
    const out = formatHuman('INFO', 'Hello world');
    expect(out).toMatch(/\[INFO\]/);
    expect(out).toMatch(/Hello world/);
    expect(out).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });

  it('includes context key-value pairs', () => {
    const out = formatHuman('WARN', 'Peer dropped', { peerId: 'abc', reason: 'timeout' });
    expect(out).toContain('peerId: abc');
    expect(out).toContain('reason: timeout');
  });

  it('stringifies object values in context', () => {
    const out = formatHuman('DEBUG', 'test', { nested: { a: 1 } });
    expect(out).toContain('nested:');
    expect(out).toContain('"a":1');
  });
});

// ---------------------------------------------------------------------------
// initLogger + human file output
// ---------------------------------------------------------------------------
describe('initLogger - human file output', () => {
  const tmpDir = join(tmpdir(), 'gnn-logger-test-' + Date.now());
  const humanLog = join(tmpDir, 'gnn.log');
  const jsonLog = join(tmpDir, 'gnn.json.log');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    for (const f of [humanLog, jsonLog]) {
      if (existsSync(f)) unlinkSync(f);
    }
  });

  it('writes human-readable log entries to file', () => {
    initLogger({
      level: 'debug',
      file: null,
      maxSizeKB: 100,
      retentionDays: 7,
      formats: ['human', 'json'],
      levels: { human: 'debug', json: 'debug' },
      files: { human: humanLog, json: jsonLog },
    });

    logger.info('Test message', { key: 'value' });

    // Give pino's async transport a moment (not needed for human since it's sync)
    expect(existsSync(humanLog)).toBe(true);
    const content = readFileSync(humanLog, 'utf-8');
    expect(content).toContain('[INFO]');
    expect(content).toContain('Test message');
    expect(content).toContain('key: value');
  });

  it('writes warn-level entries', () => {
    initLogger({
      level: 'warn',
      file: null,
      maxSizeKB: 100,
      retentionDays: 7,
      formats: ['human'],
      files: { human: humanLog, json: jsonLog },
    });

    logger.warn('Warning message', { code: 42 });
    expect(existsSync(humanLog)).toBe(true);
    const content = readFileSync(humanLog, 'utf-8');
    expect(content).toContain('[WARN]');
    expect(content).toContain('code: 42');
  });

  it('does not write below configured level', () => {
    initLogger({
      level: 'warn',
      file: null,
      maxSizeKB: 100,
      retentionDays: 7,
      formats: ['human'],
      files: { human: humanLog, json: jsonLog },
    });

    logger.debug('Debug should be suppressed');
    logger.info('Info should also be suppressed');

    // Human log should not exist (no writes)
    const content = existsSync(humanLog) ? readFileSync(humanLog, 'utf-8') : '';
    expect(content).not.toContain('Debug should be suppressed');
    expect(content).not.toContain('Info should also be suppressed');
  });

  it('appends error with Error object', () => {
    initLogger({
      level: 'error',
      file: null,
      maxSizeKB: 100,
      retentionDays: 7,
      formats: ['human'],
      files: { human: humanLog, json: jsonLog },
    });

    logger.error('Something failed', new Error('boom'));
    const content = readFileSync(humanLog, 'utf-8');
    expect(content).toContain('[ERROR]');
    expect(content).toContain('boom');
  });
});

// ---------------------------------------------------------------------------
// Log rotation
// ---------------------------------------------------------------------------
describe('initLogger - log rotation', () => {
  const tmpDir = join(tmpdir(), 'gnn-rotation-test-' + Date.now());
  const humanLog = join(tmpDir, 'gnn.log');
  const jsonLog = join(tmpDir, 'gnn.json.log');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test files
    const { readdirSync } = require('node:fs');
    for (const f of readdirSync(tmpDir)) {
      try { unlinkSync(join(tmpDir, f)); } catch {}
    }
  });

  it('rotates log file when maxSizeKB is exceeded', () => {
    // Very small rotation threshold
    initLogger({
      level: 'info',
      file: null,
      maxSizeKB: 0,  // effectively 0 KB = rotate on every write
      retentionDays: 7,
      formats: ['human'],
      files: { human: humanLog, json: jsonLog },
      rotation: { maxSizeKB: 0, retentionDays: 7 },
    });

    // Write enough to trigger rotation
    logger.info('First entry');
    logger.info('Second entry (should rotate)');

    // After two writes with 0KB threshold, there should be a .bak file
    const { readdirSync } = require('node:fs');
    const files = readdirSync(tmpDir).filter((f: string) => f.endsWith('.bak'));
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});
