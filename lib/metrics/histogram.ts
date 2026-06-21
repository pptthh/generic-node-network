/**
 * Lightweight fixed-size histogram for tracking latency/size distributions.
 * Uses exponentially-spaced buckets.
 */
export class Histogram {
  private readonly buckets: number[];
  private readonly counts: number[];
  private totalCount = 0;
  private totalSum = 0;
  private minValue = Infinity;
  private maxValue = -Infinity;

  constructor(buckets?: number[]) {
    // Default buckets: 1ms to 10s exponentially spaced
    this.buckets = buckets ?? [
      1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
    ];
    this.counts = new Array(this.buckets.length + 1).fill(0);
  }

  record(value: number): void {
    this.totalCount++;
    this.totalSum += value;
    if (value < this.minValue) this.minValue = value;
    if (value > this.maxValue) this.maxValue = value;

    // Find bucket (index of first bucket >= value)
    let idx = this.buckets.findIndex((b) => value <= b);
    if (idx === -1) idx = this.buckets.length; // overflow bucket
    this.counts[idx]++;
  }

  count(): number {
    return this.totalCount;
  }

  sum(): number {
    return this.totalSum;
  }

  mean(): number {
    return this.totalCount > 0 ? this.totalSum / this.totalCount : 0;
  }

  min(): number {
    return this.totalCount > 0 ? this.minValue : 0;
  }

  max(): number {
    return this.totalCount > 0 ? this.maxValue : 0;
  }

  /**
   * Calculate the value at the given percentile (0–100).
   */
  percentile(p: number): number {
    if (this.totalCount === 0) return 0;

    const target = Math.ceil((p / 100) * this.totalCount);
    let cumulative = 0;

    for (let i = 0; i < this.counts.length; i++) {
      cumulative += this.counts[i];
      if (cumulative >= target) {
        // Return the upper bound of this bucket
        return i < this.buckets.length ? this.buckets[i] : this.maxValue;
      }
    }

    return this.maxValue;
  }

  reset(): void {
    this.counts.fill(0);
    this.totalCount = 0;
    this.totalSum = 0;
    this.minValue = Infinity;
    this.maxValue = -Infinity;
  }

  getBuckets(): Array<{ le: number | '+Inf'; count: number }> {
    let cumulative = 0;
    const result: Array<{ le: number | '+Inf'; count: number }> = [];

    for (let i = 0; i < this.buckets.length; i++) {
      cumulative += this.counts[i];
      result.push({ le: this.buckets[i], count: cumulative });
    }
    cumulative += this.counts[this.buckets.length];
    result.push({ le: '+Inf', count: cumulative });

    return result;
  }
}
