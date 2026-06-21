/**
 * MockNetwork: simulates network conditions (latency, jitter, packet loss)
 * without needing real TCP/libp2p infrastructure.
 *
 * Used to inject configurable delays and loss into MockNode message delivery.
 */

export interface NetworkConditions {
  latency?: { min: number; max: number };
  jitter?: number;
  packetLoss?: number;
}

/**
 * Calculate a simulated delay given network conditions.
 */
export function simulateDelay(conditions: NetworkConditions): number {
  const { latency, jitter } = conditions;

  if (!latency) return 0;

  const base = latency.min + Math.random() * (latency.max - latency.min);
  const jitterOffset = jitter ? (Math.random() - 0.5) * 2 * jitter : 0;

  return Math.max(0, base + jitterOffset);
}

/**
 * Returns true if the packet should be dropped given the loss probability.
 */
export function shouldDrop(packetLoss: number = 0): boolean {
  return Math.random() < packetLoss;
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Measure throughput: returns msg/sec given a message count and elapsed ms.
 */
export function measuredThroughput(messageCount: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return messageCount / (elapsedMs / 1000);
}

/**
 * Calculate error rate as a fraction.
 */
export function errorRate(errors: number, total: number): number {
  if (total <= 0) return 0;
  return errors / total;
}
