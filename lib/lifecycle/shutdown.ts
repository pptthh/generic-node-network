import type { ShutdownConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

export interface ShutdownDependencies {
  /** Flush and stop the message queue */
  flushMessageQueue?: () => Promise<void>;
  /** Stop accepting new P2P connections and close existing ones */
  closeP2PConnections?: () => Promise<void>;
  /** Persist current node state to the database */
  persistState?: () => Promise<void>;
  /** Close the database */
  closeDatabase?: () => Promise<void>;
  /** Close the HTTP API server */
  closeApiServer?: () => Promise<void>;
  /** Stop the metrics server */
  closeMetricsServer?: () => Promise<void>;
  /** Stop background services (token rotation, metrics collection, etc.) */
  stopBackgroundServices?: () => Promise<void>;
}

const DEFAULT_CONFIG: ShutdownConfig = {
  gracefulTimeout: 30000,
  timeoutAction: 'force_kill',
  signalHandlers: true,
  cleanupSteps: [
    'flush_in_memory_queues',
    'close_connections',
    'persist_state',
    'close_database',
  ],
};

/**
 * GracefulShutdownManager orchestrates an ordered, timed shutdown sequence.
 * It ensures all in-flight messages are flushed, the database is persisted,
 * and all resources are released before the process exits.
 */
export class GracefulShutdownManager {
  private readonly config: ShutdownConfig;
  private readonly deps: ShutdownDependencies;
  private shutdownInProgress = false;

  constructor(deps: ShutdownDependencies, config?: Partial<ShutdownConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deps = deps;
  }

  /**
   * Register SIGTERM / SIGINT handlers.
   */
  registerSignalHandlers(): void {
    if (!this.config.signalHandlers) return;

    const handler = (signal: string) => {
      this.shutdown(signal).catch((err) => {
        logger.error('Shutdown error', err);
        process.exit(1);
      });
    };

    process.on('SIGTERM', () => handler('SIGTERM'));
    process.on('SIGINT', () => handler('SIGINT'));
  }

  /**
   * Execute the shutdown sequence.
   * Resolves when complete or rejects if the graceful timeout is exceeded.
   */
  async shutdown(signal: string = 'manual'): Promise<void> {
    if (this.shutdownInProgress) {
      logger.warn('Shutdown already in progress, ignoring duplicate signal');
      return;
    }
    this.shutdownInProgress = true;

    logger.info('Graceful shutdown initiated', { signal });
    const startTime = Date.now();

    const timeoutHandle = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      logger.error('Graceful shutdown timeout exceeded', {
        elapsedMs: elapsed,
        gracefulTimeout: this.config.gracefulTimeout,
        action: this.config.timeoutAction,
      });

      if (this.config.timeoutAction === 'force_kill') {
        process.exit(1);
      }
    }, this.config.gracefulTimeout);

    // Prevent the timeout itself from keeping the process alive
    if (typeof timeoutHandle.unref === 'function') timeoutHandle.unref();

    try {
      await this.runCleanupSteps();
      clearTimeout(timeoutHandle);

      const duration = Date.now() - startTime;
      logger.info('Graceful shutdown complete', { durationMs: duration });
    } catch (err) {
      clearTimeout(timeoutHandle);
      logger.error('Graceful shutdown encountered an error', err);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async runCleanupSteps(): Promise<void> {
    const steps = this.config.cleanupSteps;

    // 1. Stop background services first (not in the "steps" list but always run first)
    if (this.deps.stopBackgroundServices) {
      logger.debug('Stopping background services');
      await this.deps.stopBackgroundServices().catch((e) =>
        logger.warn('Failed to stop background services', e),
      );
    }

    // 2. Close API server (stop accepting new requests)
    if (this.deps.closeApiServer) {
      logger.debug('Closing API server');
      await this.deps.closeApiServer().catch((e) =>
        logger.warn('Failed to close API server', e),
      );
    }

    // 3. Stop metrics server
    if (this.deps.closeMetricsServer) {
      logger.debug('Closing metrics server');
      await this.deps.closeMetricsServer().catch((e) =>
        logger.warn('Failed to close metrics server', e),
      );
    }

    // 4. Flush queues
    if (steps.includes('flush_in_memory_queues') && this.deps.flushMessageQueue) {
      logger.debug('Flushing message queue');
      await this.deps.flushMessageQueue().catch((e) =>
        logger.warn('Failed to flush message queue', e),
      );
    }

    // 5. Close P2P connections
    if (steps.includes('close_connections') && this.deps.closeP2PConnections) {
      logger.debug('Closing P2P connections');
      await this.deps.closeP2PConnections().catch((e) =>
        logger.warn('Failed to close P2P connections', e),
      );
    }

    // 6. Persist state
    if (steps.includes('persist_state') && this.deps.persistState) {
      logger.debug('Persisting node state');
      await this.deps.persistState().catch((e) =>
        logger.warn('Failed to persist state', e),
      );
    }

    // 7. Close database last
    if (steps.includes('close_database') && this.deps.closeDatabase) {
      logger.debug('Closing database');
      await this.deps.closeDatabase().catch((e) =>
        logger.warn('Failed to close database', e),
      );
    }
  }
}
