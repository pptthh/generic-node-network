import { Histogram } from './histogram.js';
import { logger } from '../utils/logger.js';

type Labels = Record<string, string>;

function labelsToString(labels: Labels): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

function buildKey(name: string, labels: Labels): string {
  return `${name}${labelsToString(labels)}`;
}

interface CounterEntry {
  name: string;
  labels: Labels;
  help?: string;
  value: number;
}

interface GaugeEntry {
  name: string;
  labels: Labels;
  help?: string;
  value: number;
}

interface HistogramEntry {
  name: string;
  labels: Labels;
  help?: string;
  histogram: Histogram;
}

/**
 * PrometheusExporter collects counters, gauges, and histograms and exports
 * them in the Prometheus text format (OpenMetrics compatible).
 *
 * All metric names are automatically prefixed with "gnn_".
 */
export class PrometheusExporter {
  private readonly counters = new Map<string, CounterEntry>();
  private readonly gauges = new Map<string, GaugeEntry>();
  private readonly histograms = new Map<string, HistogramEntry>();
  private readonly metaHelp = new Map<string, string>();

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  /**
   * Increment a counter by delta (default 1).
   */
  incCounter(name: string, labels: Labels = {}, delta = 1, help?: string): void {
    const key = buildKey(name, labels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += delta;
    } else {
      this.counters.set(key, { name, labels, help, value: delta });
    }
  }

  /**
   * Set a gauge to an absolute value.
   */
  setGauge(name: string, value: number, labels: Labels = {}, help?: string): void {
    const key = buildKey(name, labels);
    this.gauges.set(key, { name, labels, help, value });
  }

  /**
   * Increment a gauge.
   */
  incGauge(name: string, labels: Labels = {}, delta = 1): void {
    const key = buildKey(name, labels);
    const existing = this.gauges.get(key);
    if (existing) {
      existing.value += delta;
    } else {
      this.gauges.set(key, { name, labels, value: delta });
    }
  }

  /**
   * Record a value in a histogram.
   */
  recordHistogram(name: string, value: number, labels: Labels = {}, help?: string): void {
    const key = buildKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, { name, labels, help, histogram: new Histogram() });
    }
    this.histograms.get(key)!.histogram.record(value);
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  /**
   * Export all metrics in Prometheus text format.
   */
  export(): string {
    const lines: string[] = [];

    // Counters
    const counterGroups = this.groupByName(this.counters);
    for (const [name, entries] of counterGroups) {
      const help = entries[0].help;
      if (help) lines.push(`# HELP gnn_${name} ${help}`);
      lines.push(`# TYPE gnn_${name} counter`);
      for (const e of entries) {
        lines.push(`gnn_${e.name}${labelsToString(e.labels)} ${e.value}`);
      }
    }

    // Gauges
    const gaugeGroups = this.groupByName(this.gauges);
    for (const [name, entries] of gaugeGroups) {
      const help = entries[0].help;
      if (help) lines.push(`# HELP gnn_${name} ${help}`);
      lines.push(`# TYPE gnn_${name} gauge`);
      for (const e of entries) {
        lines.push(`gnn_${e.name}${labelsToString(e.labels)} ${e.value}`);
      }
    }

    // Histograms
    const histGroups = this.groupByName(this.histograms);
    for (const [name, entries] of histGroups) {
      const help = entries[0].help;
      if (help) lines.push(`# HELP gnn_${name} ${help}`);
      lines.push(`# TYPE gnn_${name} histogram`);
      for (const e of entries) {
        const { histogram, labels } = e;
        const labelStr = labelsToString(labels);

        // Buckets
        for (const { le, count } of histogram.getBuckets()) {
          const leStr = le === '+Inf' ? '+Inf' : String(le);
          const bucketLabels = { ...labels, le: leStr };
          lines.push(`gnn_${name}_bucket${labelsToString(bucketLabels)} ${count}`);
        }

        // Sum and count
        lines.push(`gnn_${name}_sum${labelStr} ${histogram.sum()}`);
        lines.push(`gnn_${name}_count${labelStr} ${histogram.count()}`);
      }
    }

    lines.push(''); // trailing newline
    return lines.join('\n');
  }

  /**
   * Reset all metrics (useful for tests).
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  // ---------------------------------------------------------------------------
  // Snapshot helpers (for /api/metrics JSON endpoint)
  // ---------------------------------------------------------------------------

  getCounterValue(name: string, labels: Labels = {}): number {
    return this.counters.get(buildKey(name, labels))?.value ?? 0;
  }

  getGaugeValue(name: string, labels: Labels = {}): number {
    return this.gauges.get(buildKey(name, labels))?.value ?? 0;
  }

  getHistogram(name: string, labels: Labels = {}): Histogram | null {
    return this.histograms.get(buildKey(name, labels))?.histogram ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private groupByName<T extends { name: string }>(
    map: Map<string, T>,
  ): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const entry of map.values()) {
      const arr = groups.get(entry.name) ?? [];
      arr.push(entry);
      groups.set(entry.name, arr);
    }
    return groups;
  }
}

// Singleton exporter shared across the process
export const globalMetrics = new PrometheusExporter();
