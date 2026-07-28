// ── windgraph · statistical plots (Phase 4 · A12/A13/A14/A16) ────────────────
// Histogram auto-binning (Sturges / Freedman–Diaconis), box/violin/strip stats,
// hexbin aggregation, and a regression suite (linear/poly/exp/logistic/power)
// with R². Pure data-space helpers; the resolver builds the Mobjects.

import type { Pt } from '../stroke/stroke';

export type BinMethod = 'sturges' | 'fd';

export interface HistBin { x0: number; x1: number; count: number; }

export function histogram(data: number[], method: BinMethod = 'fd', bins?: number): HistBin[] {
  const xs = data.filter((v) => isFinite(v));
  if (xs.length === 0) return [];
  const lo = Math.min(...xs), hi = Math.max(...xs);
  if (lo === hi) return [{ x0: lo - 0.5, x1: hi + 0.5, count: xs.length }];
  let k = bins ?? 0;
  if (!k) {
    if (method === 'sturges') k = Math.ceil(Math.log2(xs.length) + 1);
    else {
      const sorted = [...xs].sort((a, b) => a - b);
      const q1 = quantileSorted(sorted, 0.25), q3 = quantileSorted(sorted, 0.75);
      const iqr = q3 - q1;
      const h = 2 * iqr * Math.pow(xs.length, -1 / 3);
      k = h > 0 ? Math.ceil((hi - lo) / h) : Math.ceil(Math.log2(xs.length) + 1);
    }
    k = Math.max(1, Math.min(k, 200));
  }
  const w = (hi - lo) / k;
  const out: HistBin[] = [];
  for (let i = 0; i < k; i++) out.push({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 });
  for (const v of xs) {
    let idx = Math.floor((v - lo) / w);
    if (idx >= k) idx = k - 1;
    if (idx < 0) idx = 0;
    out[idx].count++;
  }
  return out;
}

function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function quantile(data: number[], p: number): number {
  return quantileSorted([...data].sort((a, b) => a - b), p);
}

export interface BoxStats { min: number; q1: number; median: number; q3: number; max: number; outliers: number[]; }

export function boxStats(data: number[]): BoxStats {
  const sorted = [...data].filter((v) => isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [] };
  const q1 = quantileSorted(sorted, 0.25), med = quantileSorted(sorted, 0.5), q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
  const inliers = sorted.filter((v) => v >= loF && v <= hiF);
  const outliers = sorted.filter((v) => v < loF || v > hiF);
  return { min: inliers.length ? inliers[0] : sorted[0], q1, median: med, q3, max: inliers.length ? inliers[inliers.length - 1] : sorted[sorted.length - 1], outliers };
}

export function kde(data: number[], points: number[], bandwidth?: number): number[] {
  const n = data.length;
  if (n === 0) return points.map(() => 0);
  const sd = stddev(data);
  const h = bandwidth ?? (1.06 * (sd || 1) * Math.pow(n, -1 / 5));
  return points.map((x) => {
    let s = 0;
    for (const d of data) {
      const u = (x - d) / h;
      s += Math.exp(-0.5 * u * u);
    }
    return s / (n * h * Math.sqrt(Math.PI * 2));
  });
}

export function mean(data: number[]): number { return data.reduce((a, b) => a + b, 0) / (data.length || 1); }
export function stddev(data: number[]): number {
  const m = mean(data);
  return Math.sqrt(data.reduce((a, b) => a + (b - m) * (b - m), 0) / (data.length || 1));
}

export function beeswarm(values: number[], radius: number, axis: 'x' | 'y' = 'x'): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const placed: { v: number; off: number }[] = [];
  const offs = new Array(values.length).fill(0);
  const d = radius * 2;
  for (const { v, i } of order) {
    let off = 0, dir = 1, step = 0;
    for (;;) {
      const clash = placed.some((p) => Math.abs(p.v - v) < d && Math.abs(p.off - off) < d);
      if (!clash) break;
      step++;
      off = dir * step * d;
      dir = -dir;
    }
    placed.push({ v, off });
    offs[i] = off;
  }
  void axis;
  return offs;
}

export interface HexCell { cx: number; cy: number; count: number; }

export function hexbin(points: Pt[], size: number): HexCell[] {
  const map = new Map<string, HexCell>();
  const h = size * Math.sqrt(3);
  for (const [x, y] of points) {
    const q = (2 / 3 * x) / size;
    const r = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / size;
    let rq = Math.round(q), rr = Math.round(r);
    const rs = Math.round(-q - r);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - (-q - r));
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    const key = `${rq},${rr}`;
    const cx = size * 3 / 2 * rq;
    const cy = h * (rr + rq / 2);
    const cell = map.get(key);
    if (cell) cell.count++;
    else map.set(key, { cx, cy, count: 1 });
  }
  return [...map.values()];
}

export type RegKind = 'linear' | 'poly' | 'exp' | 'logistic' | 'power';

export interface RegResult { kind: RegKind; coeffs: number[]; fn: (x: number) => number; r2: number; }

export function rSquared(points: Pt[], fn: (x: number) => number): number {
  const ys = points.map((p) => p[1]);
  const my = mean(ys);
  let ssTot = 0, ssRes = 0;
  for (const [x, y] of points) {
    const yh = fn(x);
    ssTot += (y - my) * (y - my);
    ssRes += (y - yh) * (y - yh);
  }
  return ssTot < 1e-12 ? 1 : 1 - ssRes / ssTot;
}

export function linearReg(points: Pt[]): RegResult {
  const n = points.length;
  const mx = mean(points.map((p) => p[0])), my = mean(points.map((p) => p[1]));
  let num = 0, den = 0;
  for (const [x, y] of points) { num += (x - mx) * (y - my); den += (x - mx) * (x - mx); }
  const m = den < 1e-12 ? 0 : num / den;
  const b = my - m * mx;
  const fn = (x: number) => m * x + b;
  return { kind: 'linear', coeffs: [m, b], fn, r2: rSquared(points, fn) };
}

export function polyReg(points: Pt[], degree: number): RegResult {
  const d = Math.min(degree, points.length - 1);
  const size = d + 1;
  const A: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const B: number[] = new Array(size).fill(0);
  for (const [x, y] of points) {
    for (let i = 0; i < size; i++) {
      B[i] += y * Math.pow(x, i);
      for (let j = 0; j < size; j++) A[i][j] += Math.pow(x, i + j);
    }
  }
  const coeffs = solve(A, B);
  const fn = (x: number) => coeffs.reduce((s, c, i) => s + c * Math.pow(x, i), 0);
  return { kind: 'poly', coeffs, fn, r2: rSquared(points, fn) };
}

export function expReg(points: Pt[]): RegResult {
  const lin = linearReg(points.filter((p) => p[1] > 0).map((p) => [p[0], Math.log(p[1])] as Pt));
  const A = Math.exp(lin.coeffs[1]), k = lin.coeffs[0];
  const fn = (x: number) => A * Math.exp(k * x);
  return { kind: 'exp', coeffs: [A, k], fn, r2: rSquared(points, fn) };
}

export function powerReg(points: Pt[]): RegResult {
  const pos = points.filter((p) => p[0] > 0 && p[1] > 0);
  const lin = linearReg(pos.map((p) => [Math.log(p[0]), Math.log(p[1])] as Pt));
  const A = Math.exp(lin.coeffs[1]), k = lin.coeffs[0];
  const fn = (x: number) => A * Math.pow(x, k);
  return { kind: 'power', coeffs: [A, k], fn, r2: rSquared(points, fn) };
}

export function logisticReg(points: Pt[]): RegResult {
  const L = Math.max(...points.map((p) => p[1])) * 1.05 || 1;
  const lin = linearReg(points.filter((p) => p[1] > 0 && p[1] < L).map((p) => [p[0], Math.log(L / p[1] - 1)] as Pt));
  const k = -lin.coeffs[0], x0 = lin.coeffs[1] / (k || 1);
  const fn = (x: number) => L / (1 + Math.exp(-k * (x - x0)));
  return { kind: 'logistic', coeffs: [L, k, x0], fn, r2: rSquared(points, fn) };
}

export function regression(points: Pt[], kind: RegKind, degree = 2): RegResult {
  if (kind === 'linear') return linearReg(points);
  if (kind === 'poly') return polyReg(points, degree);
  if (kind === 'exp') return expReg(points);
  if (kind === 'power') return powerReg(points);
  return logisticReg(points);
}

export function residuals(points: Pt[], fn: (x: number) => number): Pt[] {
  return points.map(([x, y]) => [x, y - fn(x)] as Pt);
}

function solve(A: number[][], B: number[]): number[] {
  const n = B.length;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(M[i][i]) < 1e-12 ? 0 : row[n] / row[i]));
}
