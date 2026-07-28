import type { Distribution } from './distributions';

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
  density: number;
}

export function sample(dist: Distribution, n: number, rng: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(inverseSample(dist, rng()));
  return out;
}

function inverseSample(dist: Distribution, u: number): number {
  let lo = -100, hi = 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (dist.cdf(mid) < u) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function histogram(data: number[], bins: number): HistogramBin[] {
  if (data.length === 0) return [];
  let min = Infinity, max = -Infinity;
  for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
  if (max === min) { max = min + 1; }
  const width = (max - min) / bins;
  const out: HistogramBin[] = [];
  for (let i = 0; i < bins; i++) {
    out.push({ x0: min + i * width, x1: min + (i + 1) * width, count: 0, density: 0 });
  }
  for (const v of data) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    out[idx].count++;
  }
  const total = data.length * width;
  for (const b of out) b.density = b.count / total;
  return out;
}

export function sturgesBins(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(n) + 1));
}

export function freedmanDiaconisBins(data: number[]): number {
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 4) return 1;
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  if (iqr === 0) return sturgesBins(n);
  const width = 2 * iqr * Math.pow(n, -1 / 3);
  return Math.max(1, Math.ceil((sorted[n - 1] - sorted[0]) / width));
}

export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  let s = 0;
  for (const v of data) s += v;
  return s / data.length;
}

export function variance(data: number[]): number {
  if (data.length < 2) return 0;
  const m = mean(data);
  let s = 0;
  for (const v of data) s += (v - m) * (v - m);
  return s / (data.length - 1);
}

export function stdDev(data: number[]): number {
  return Math.sqrt(variance(data));
}

export function median(data: number[]): number {
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function quantile(data: number[], q: number): number {
  const sorted = [...data].sort((a, b) => a - b);
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}
