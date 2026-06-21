import { describe, it, expect, beforeEach } from 'vitest';
import { PrometheusExporter } from '../../lib/metrics/prometheus.js';
import { Histogram } from '../../lib/metrics/histogram.js';

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------
describe('Histogram', () => {
  it('records values and reports correct count/sum', () => {
    const h = new Histogram();
    h.record(10);
    h.record(20);
    h.record(30);
    expect(h.count()).toBe(3);
    expect(h.sum()).toBe(60);
    expect(h.mean()).toBe(20);
  });

  it('tracks min and max', () => {
    const h = new Histogram();
    h.record(5);
    h.record(100);
    h.record(50);
    expect(h.min()).toBe(5);
    expect(h.max()).toBe(100);
  });

  it('computes p50 correctly', () => {
    const h = new Histogram([10, 20, 50, 100, 500]);
    for (let i = 0; i < 100; i++) h.record(i);
    const p50 = h.percentile(50);
    expect(p50).toBeGreaterThanOrEqual(50);
  });

  it('computes p99 within known range', () => {
    const h = new Histogram([10, 50, 100, 500, 1000]);
    for (let i = 1; i <= 100; i++) h.record(i);
    const p99 = h.percentile(99);
    expect(p99).toBeGreaterThanOrEqual(99);
  });

  it('returns 0 when no values recorded', () => {
    const h = new Histogram();
    expect(h.count()).toBe(0);
    expect(h.mean()).toBe(0);
    expect(h.percentile(50)).toBe(0);
    expect(h.min()).toBe(0);
    expect(h.max()).toBe(0);
  });

  it('resets cleanly', () => {
    const h = new Histogram();
    h.record(100);
    h.reset();
    expect(h.count()).toBe(0);
    expect(h.sum()).toBe(0);
  });

  it('exports buckets in ascending order', () => {
    const h = new Histogram([10, 50, 100]);
    h.record(5);
    h.record(30);
    h.record(75);
    const buckets = h.getBuckets();
    expect(buckets[0].le).toBe(10);
    expect(buckets[1].le).toBe(50);
    expect(buckets[2].le).toBe(100);
    expect(buckets[3].le).toBe('+Inf');
    // Cumulative counts
    expect(buckets[0].count).toBe(1);  // only 5
    expect(buckets[1].count).toBe(2);  // 5 + 30
    expect(buckets[2].count).toBe(3);  // all
    expect(buckets[3].count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// PrometheusExporter
// ---------------------------------------------------------------------------
describe('PrometheusExporter', () => {
  let exporter: PrometheusExporter;

  beforeEach(() => {
    exporter = new PrometheusExporter();
  });

  it('exports a counter in Prometheus text format', () => {
    exporter.incCounter('messages_published_total', { topic: 'test' }, 5, 'Total messages published');
    const output = exporter.export();
    expect(output).toContain('# HELP gnn_messages_published_total Total messages published');
    expect(output).toContain('# TYPE gnn_messages_published_total counter');
    expect(output).toContain('gnn_messages_published_total{topic="test"} 5');
  });

  it('increments the same counter label multiple times', () => {
    exporter.incCounter('messages_published_total', { topic: 'abc' });
    exporter.incCounter('messages_published_total', { topic: 'abc' });
    exporter.incCounter('messages_published_total', { topic: 'abc' }, 3);
    expect(exporter.getCounterValue('messages_published_total', { topic: 'abc' })).toBe(5);
  });

  it('exports a gauge', () => {
    exporter.setGauge('peers_connected', 25, {}, 'Number of connected peers');
    const output = exporter.export();
    expect(output).toContain('# TYPE gnn_peers_connected gauge');
    expect(output).toContain('gnn_peers_connected 25');
  });

  it('exports multiple label variants for the same metric', () => {
    exporter.incCounter('queries_sent_total', { status: 'success' }, 456);
    exporter.incCounter('queries_sent_total', { status: 'timeout' }, 23);
    const output = exporter.export();
    expect(output).toContain('gnn_queries_sent_total{status="success"} 456');
    expect(output).toContain('gnn_queries_sent_total{status="timeout"} 23');
  });

  it('exports a histogram with buckets, sum, and count', () => {
    exporter.recordHistogram('message_latency_seconds', 23, {}, 'Message latency');
    exporter.recordHistogram('message_latency_seconds', 145, {});
    const output = exporter.export();
    expect(output).toContain('# TYPE gnn_message_latency_seconds histogram');
    expect(output).toContain('gnn_message_latency_seconds_sum');
    expect(output).toContain('gnn_message_latency_seconds_count 2');
    expect(output).toContain('_bucket{le=');
  });

  it('exports a no-label counter correctly', () => {
    exporter.incCounter('restarts_total', {}, 3);
    const output = exporter.export();
    expect(output).toContain('gnn_restarts_total 3');
  });

  it('resets to empty state', () => {
    exporter.incCounter('foo', {}, 100);
    exporter.reset();
    const output = exporter.export();
    // After reset, only trailing newline expected
    expect(output.trim()).toBe('');
  });

  it('exports all standard GNN metric names from prompt4', () => {
    // Set up the metrics described in prompt4.md
    exporter.incCounter('messages_published_total', { topic: 'sensor/temp' }, 1234);
    exporter.incCounter('messages_received_total', { sender: 'node-a' }, 5678);
    exporter.incCounter('messages_invalid_total', { reason: 'bad_signature' }, 12);
    exporter.incCounter('queries_sent_total', { status: 'success' }, 456);
    exporter.incCounter('queries_sent_total', { status: 'timeout' }, 23);
    exporter.incCounter('retries_total', { reason: 'network_error' }, 45);
    exporter.setGauge('peers_connected', 25);
    exporter.setGauge('peer_reputation', 85, { peer: 'node-a' });
    exporter.setGauge('memory_usage_bytes', 52428800);
    exporter.setGauge('db_size_bytes', 1073741824);
    exporter.setGauge('message_queue_size', 234);
    exporter.recordHistogram('message_latency_seconds', 23);
    exporter.recordHistogram('query_latency_seconds', 42);

    const output = exporter.export();
    expect(output).toContain('gnn_messages_published_total');
    expect(output).toContain('gnn_peers_connected 25');
    expect(output).toContain('gnn_memory_usage_bytes 52428800');
    expect(output).toContain('gnn_message_latency_seconds_count');
  });
});
