import type { Database } from '../storage/database.js';
import { logger } from '../utils/logger.js';

export interface RecoveryDependencies {
  database: Database;
  /** Reconnect to previously-known peers */
  reconnectPeer?: (multiaddr: string) => Promise<void>;
  /** Re-enqueue a pending message */
  requeueMessage?: (message: unknown) => Promise<void>;
}

/**
 * RestartRecovery restores previously-saved node state on startup:
 *  - Reconnects to known peers from the last session
 *  - Retries messages that were in-flight during the last shutdown
 */
export class RestartRecovery {
  private readonly deps: RecoveryDependencies;

  constructor(deps: RecoveryDependencies) {
    this.deps = deps;
  }

  async recover(): Promise<void> {
    logger.info('Starting restart recovery');

    await this.recoverPeers();
    await this.recoverPendingMessages();
    await this.updateRestartState();

    logger.info('Restart recovery complete');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async recoverPeers(): Promise<void> {
    if (!this.deps.reconnectPeer) return;

    let savedPeers: Array<{ peerId: string; multiaddr: string }> = [];
    try {
      savedPeers = (await this.deps.database.get('peers:saved')) as typeof savedPeers ?? [];
    } catch {
      savedPeers = [];
    }

    if (savedPeers.length === 0) return;
    logger.info('Restoring saved peers', { count: savedPeers.length });

    const reconnect = this.deps.reconnectPeer;
    await Promise.allSettled(
      savedPeers.map(async (peer) => {
        try {
          await reconnect(peer.multiaddr);
          logger.debug('Reconnected to peer', { peerId: peer.peerId });
        } catch (err) {
          logger.debug('Failed to reconnect to peer (may be offline)', {
            peerId: peer.peerId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  private async recoverPendingMessages(): Promise<void> {
    if (!this.deps.requeueMessage) return;

    let pendingMessages: unknown[] = [];
    try {
      pendingMessages = (await this.deps.database.get('messages:pending')) as unknown[] ?? [];
    } catch {
      pendingMessages = [];
    }

    if (pendingMessages.length === 0) return;
    logger.info('Retrying pending messages', { count: pendingMessages.length });

    const requeue = this.deps.requeueMessage;
    await Promise.allSettled(
      pendingMessages.map(async (msg) => {
        try {
          await requeue(msg);
        } catch (err) {
          logger.warn('Failed to requeue pending message', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    // Clear pending queue after recovery attempt
    try {
      await this.deps.database.put('messages:pending', []);
    } catch {
      // Non-fatal
    }
  }

  private async updateRestartState(): Promise<void> {
    try {
      const now = Date.now();
      const restartCount =
        ((await this.deps.database.get('state:restart_count').catch(() => 0)) as number) + 1;

      await this.deps.database.put('state:restarted_at', now);
      await this.deps.database.put('state:restart_count', restartCount);
    } catch (err) {
      logger.warn('Failed to update restart state', err);
    }
  }
}
