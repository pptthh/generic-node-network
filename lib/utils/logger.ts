/**
 * Phase 4 enhanced logger: supports dual output (human-readable + JSON),
 * configurable file destinations, and log rotation.
 *
 * Backward compatible: the same `logger` export is used everywhere.
 */
import { appendFileSync, existsSync, renameSync, statSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pino from 'pino';
import type { LoggingConfig } from '../types/config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ---------------------------------------------------------------------------
// Pino-backed JSON logger (existing behaviour)
// ---------------------------------------------------------------------------

let _pinoLogger: ReturnType<typeof pino> | null = null;

function createPinoLogger(config?: Partial<LoggingConfig>): ReturnType<typeof pino> {
  const level = config?.level ?? (process.env.GNN_LOG_LEVEL as pino.LevelWithSilent) ?? 'error';
  const logFile = config?.file ?? process.env.GNN_LOG_FILE ?? null;

  // If Phase 4 dual-format is configured, the pino logger writes to the JSON file
  const jsonFilePath = config?.files?.json ?? logFile;

  const transport = jsonFilePath
    ? pino.transport({
        targets: [
          { target: 'pino/file', options: { destination: jsonFilePath }, level },
          { target: 'pino/file', options: { destination: 1 }, level },
        ],
      })
    : undefined;

  return pino({ level }, transport);
}

// ---------------------------------------------------------------------------
// Human-readable formatter
// ---------------------------------------------------------------------------

let _humanFilePath: string | null = null;
let _humanLevel: LogLevel = 'info';
let _rotationConfig: { maxSizeKB: number; retentionDays: number } | null = null;
let _activeLevel: LogLevel = 'error';

function formatHuman(level: string, message: string, context?: unknown): string {
  const timestamp = new Date().toISOString();
  let output = `[${level.toUpperCase()}] ${timestamp} ${message}\n`;

  if (context !== undefined && context !== null) {
    const entries =
      typeof context === 'object' && !Array.isArray(context)
        ? Object.entries(context as Record<string, unknown>)
        : [['data', context]];

    const lines = entries
      .map(([k, v]) => {
        const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `        ${k}: ${val}`;
      })
      .join('\n');
    output += lines + '\n';
  }

  return output;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function maybeRotate(filePath: string): void {
  if (!_rotationConfig) return;
  if (!existsSync(filePath)) return;

  const stat = statSync(filePath);
  const sizeKB = stat.size / 1024;

  if (sizeKB >= _rotationConfig.maxSizeKB) {
    const rotated = `${filePath}.${Date.now()}.bak`;
    renameSync(filePath, rotated);
  }
}

function writeHuman(level: LogLevel, message: string, context?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[_humanLevel]) return;

  const formatted = formatHuman(level, message, context);

  if (_humanFilePath) {
    try {
      ensureDir(_humanFilePath);
      maybeRotate(_humanFilePath);
      appendFileSync(_humanFilePath, formatted, 'utf-8');
    } catch {
      // If file write fails, fall back to stderr silently
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initLogger(config: Partial<LoggingConfig>): void {
  _pinoLogger = createPinoLogger(config);
  _activeLevel = config.level ?? 'error';

  // Phase 4: human-readable output
  if (config.formats?.includes('human') && config.files?.human) {
    _humanFilePath = config.files.human;
    _humanLevel = config.levels?.human ?? config.level ?? 'info';
    _rotationConfig = config.rotation ?? null;
  } else {
    _humanFilePath = null;
  }
}

function getPino(): ReturnType<typeof pino> {
  if (!_pinoLogger) {
    _pinoLogger = createPinoLogger();
  }
  return _pinoLogger;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[_activeLevel];
}

export const logger = {
  debug(message: string, data?: unknown): void {
    if (!shouldLog('debug')) return;
    if (data !== undefined) getPino().debug(data as object, message);
    else getPino().debug(message);
    writeHuman('debug', message, data);
  },
  info(message: string, data?: unknown): void {
    if (!shouldLog('info')) return;
    if (data !== undefined) getPino().info(data as object, message);
    else getPino().info(message);
    writeHuman('info', message, data);
  },
  warn(message: string, data?: unknown): void {
    if (!shouldLog('warn')) return;
    if (data !== undefined) getPino().warn(data as object, message);
    else getPino().warn(message);
    writeHuman('warn', message, data);
  },
  error(message: string, error?: Error | unknown): void {
    if (!shouldLog('error')) return;
    if (error instanceof Error) {
      getPino().error({ err: error }, message);
      writeHuman('error', message, { error: error.message, stack: error.stack });
    } else if (error !== undefined) {
      getPino().error({ data: error }, message);
      writeHuman('error', message, { data: error });
    } else {
      getPino().error(message);
      writeHuman('error', message);
    }
  },
};

// ---------------------------------------------------------------------------
// Exported for Phase 4 dual-log formatting (used directly by health checks etc.)
// ---------------------------------------------------------------------------

export { formatHuman };
