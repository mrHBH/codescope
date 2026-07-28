// ── windgraph · Fourier series & epicycles (Phase 4 · A11) ───────────────────
// Fourier partial sums of a periodic f(x) and the epicycle construction
// (rotating arcs whose tip traces the curve). Coefficients via quadrature.

import type { Pt } from '../stroke/stroke';

export interface FourierCoeff { n: number; a: number; b: number; }

export function fourierCoeffs(f: (x: number) => number, terms: number, period = Math.PI * 2, samples = 512): FourierCoeff[] {
  const out: FourierCoeff[] = [];
  const w = (Math.PI * 2) / period;
  const dx = period / samples;
  for (let n = 0; n <= terms; n++) {
    let a = 0, b = 0;
    for (let i = 0; i < samples; i++) {
      const x = i * dx;
      const y = f(x);
      a += y * Math.cos(n * w * x) * dx;
      b += y * Math.sin(n * w * x) * dx;
    }
    a *= 2 / period; b *= 2 / period;
    if (n === 0) a *= 0.5;
    out.push({ n, a, b });
  }
  return out;
}

export function fourierSum(coeffs: FourierCoeff[], x: number, period = Math.PI * 2): number {
  const w = (Math.PI * 2) / period;
  let s = 0;
  for (const c of coeffs) s += c.a * Math.cos(c.n * w * x) + c.b * Math.sin(c.n * w * x);
  return s;
}

export function fourierCurve(coeffs: FourierCoeff[], x0: number, x1: number, n: number, period = Math.PI * 2): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n);
    out.push([x, fourierSum(coeffs, x, period)]);
  }
  return out;
}

export interface Epicycle { cx: number; cy: number; r: number; phase: number; }

export function epicycles(coeffs: FourierCoeff[], t: number, period = Math.PI * 2): Epicycle[] {
  const w = (Math.PI * 2) / period;
  const out: Epicycle[] = [];
  let cx = 0, cy = 0;
  for (const c of coeffs) {
    if (c.n === 0) { cy += c.a; continue; }
    const r = Math.hypot(c.a, c.b);
    if (r < 1e-9) continue;
    const phase = c.n * w * t - Math.atan2(c.b, c.a);
    out.push({ cx, cy, r, phase });
    cx += r * Math.cos(phase);
    cy += r * Math.sin(phase);
  }
  return out;
}
