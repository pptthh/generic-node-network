import pino from 'pino';
import type { LoggingConfig } from '../types/config.js';

let _logger: ReturnType<typeof pino> | null = null;

function createLogger(config?: Partial<LoggingConfig>): ReturnType<typeof pino> {
  const level = config?.level ?? (process.env.GNN_LOG_LEVEL as pino.LevelWithSilent) ?? 'error';
  const logFile = config?.file ?? process.env.GNN_LOG_FILE ?? null;

  const transport = logFile
    ? pino.transport({
        targets: [
          { target: 'pino/file', options: { destination: logFile }, level },
          { target: 'pino/file', options: { destination: 1 }, level },
        ],
      })
    : undefined;

  return pino({ level }, transport);
}

export function initLogger(config: Partial<LoggingConfig>): void {
  _logger = createLogger(config);
}

function getLogger(): ReturnType<typeof pino> {
  if (!_logger) {
    _logger = createLogger();
  }
  return _logger;
}

export const logger = {
  debug(message: string, data?: unknown): void {
    if (data !== undefined) getLogger().debug(data as object, message);
    else getLogger().debug(message);
  },
  info(message: string, data?: unknown): void {
    if (data !== undefined) getLogger().info(data as object, message);
    else getLogger().info(message);
  },
  warn(message: string, data?: unknown): void {
    if (data !== undefined) getLogger().warn(data as object, message);
    else getLogger().warn(message);
  },
  error(message: string, error?: Error | unknown): void {
    if (error instanceof Error) {
      getLogger().error({ err: error }, message);
    } else if (error !== undefined) {
      getLogger().error({ data: error }, message);
    } else {
      getLogger().error(message);
    }
  },
};
