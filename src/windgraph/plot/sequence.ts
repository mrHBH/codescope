// ── windgraph · sequences & cobweb (Phase 4 · A3) ────────────────────────────
// Discrete sequence samples aₙ = f(n) and the cobweb/staircase construction for
// xₙ₊₁ = f(xₙ). Data-space points; the resolver maps to world + builds dots/stems.

import type { Pt } from '../stroke/stroke';

export function sequenceSamples(f: (n: number) => number, n0: number, n1: number): Pt[] {
  const out: Pt[] = [];
  for (let n = Math.ceil(n0); n <= Math.floor(n1); n++) {
    const y = f(n);
    if (isFinite(y)) out.push([n, y]);
  }
  return out;
}

export function cobweb(f: (x: number) => number, x0: number, iters: number, lo: number, hi: number): Pt[] {
  const out: Pt[] = [[x0, 0]];
  let x = x0;
  for (let i = 0; i < iters; i++) {
    const y = f(x);
    if (!isFinite(y)) break;
    out.push([x, y]);
    out.push([y, y]);
    x = y;
    if (x < lo - 1 || x > hi + 1) break;
  }
  out.push([x, 0]);
  return out;
}
