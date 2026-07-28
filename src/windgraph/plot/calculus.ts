// ── windgraph · calculus constructions (Phase 4 · A5/A6/A7) ──────────────────
// Numeric differentiation, tangent/normal lines, the accumulation function
// F(x)=∫ₐˣ f, and Riemann/trapezoid/Simpson quadrature with an error readout.
// Data-space helpers; the resolver wraps them in Mobjects.

import type { Pt } from '../stroke/stroke';

export function derivative(f: (x: number) => number, x: number, h = 1e-5): number {
  return (f(x + h) - f(x - h)) / (2 * h);
}

export function secondDerivative(f: (x: number) => number, x: number, h = 1e-4): number {
  return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
}

export function sampleFn(f: (x: number) => number, x0: number, x1: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n);
    const y = f(x);
    if (isFinite(y)) out.push([x, y]);
  }
  return out;
}

export function tangentLine(f: (x: number) => number, at: number, half: number): Pt[] {
  const y = f(at), m = derivative(f, at);
  return [[at - half, y - m * half], [at + half, y + m * half]];
}

export function normalLine(f: (x: number) => number, at: number, half: number): Pt[] {
  const y = f(at), m = derivative(f, at);
  const nm = Math.abs(m) < 1e-9 ? 1e9 : -1 / m;
  return [[at - half, y - nm * half], [at + half, y + nm * half]];
}

/** Trapezoid integral ∫_from^to f; the sign follows (to-from), so integrating
 *  backwards (to < from) yields a negative value. */
function trapTo(f: (x: number) => number, from: number, to: number, steps = 256): number {
  if (to === from) return 0;
  const h = (to - from) / steps;
  let s = 0;
  let prev = f(from);
  for (let i = 1; i <= steps; i++) {
    const cur = f(from + i * h);
    s += 0.5 * (prev + cur) * h;
    prev = cur;
  }
  return s;
}

/** Accumulation F(x) = ∫ₐˣ f(t) dt over [x0, x1]. F(a) = 0; F is negative for
 *  x < a (the integral runs backwards). Built as G(x) − G(a) where G is the
 *  cumulative trapezoid from x0, so the sign is correct on both sides of a. */
export function accumulation(f: (x: number) => number, a: number, x0: number, x1: number, n: number): Pt[] {
  const h = (x1 - x0) / n;
  const out: Pt[] = [];
  const G: number[] = new Array(n + 1).fill(0);
  let prev = f(x0);
  for (let i = 1; i <= n; i++) {
    const cur = f(x0 + i * h);
    G[i] = G[i - 1] + 0.5 * (prev + cur) * h;
    prev = cur;
  }
  const Ga = trapTo(f, x0, a);
  for (let i = 0; i <= n; i++) out.push([x0 + i * h, G[i] - Ga]);
  return out;
}

export type QuadMode = 'left' | 'right' | 'midpoint' | 'trapezoid' | 'simpson';

export function quadrature(f: (x: number) => number, x0: number, x1: number, n: number, mode: QuadMode): number {
  const h = (x1 - x0) / n;
  if (mode === 'simpson') {
    const m = n % 2 === 0 ? n : n + 1;
    const hh = (x1 - x0) / m;
    let s = f(x0) + f(x1);
    for (let i = 1; i < m; i++) s += f(x0 + i * hh) * (i % 2 === 0 ? 2 : 4);
    return (s * hh) / 3;
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * h, xb = xa + h;
    if (mode === 'left') s += f(xa) * h;
    else if (mode === 'right') s += f(xb) * h;
    else if (mode === 'midpoint') s += f((xa + xb) / 2) * h;
    else s += 0.5 * (f(xa) + f(xb)) * h;
  }
  return s;
}

export interface QuadColumn { x: number; y: number; w: number; }

export function quadratureColumns(f: (x: number) => number, x0: number, x1: number, n: number, mode: QuadMode): QuadColumn[] {
  const h = (x1 - x0) / n;
  const out: QuadColumn[] = [];
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * h, xb = xa + h;
    let y: number;
    if (mode === 'left') y = f(xa);
    else if (mode === 'right') y = f(xb);
    else if (mode === 'midpoint') y = f((xa + xb) / 2);
    else if (mode === 'trapezoid') y = 0.5 * (f(xa) + f(xb));
    else y = f((xa + xb) / 2);
    if (isFinite(y)) out.push({ x: xa, y, w: h });
  }
  return out;
}
