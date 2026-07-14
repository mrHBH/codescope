// ── windgraph · function plotting (Phase 3) ──────────────────────────────────
// Adaptive Bézier-sampled function curves: y=f(x), parametric, polar.
// Sample points adaptively by chord deflection, then fit quadratic Béziers via
// tangent intersection so the boundary is a smooth curve at any zoom.

import { strokeInto, strokeQuadPath, fillQuads, type Pt } from '../stroke/stroke';
import type { NumberPlane, PlaneView, PlaneCtx } from '../coords/numberPlane';

export interface PlotStyle { color: number[]; widthPx?: number; tol?: number; }

// ── adaptive sampling ──────────────────────────────────────────────────────
function sample(f: (x: number) => number, x0: number, x1: number, tol: number): Pt[] {
  const pts: Pt[] = [];
  const y0 = f(x0), y1 = f(x1);
  const rec = (xa: number, ya: number, xb: number, yb: number, depth: number) => {
    const xm = (xa + xb) / 2, ym = f(xm);
    const chord = ya + (yb - ya) * ((xm - xa) / (xb - xa));
    const dev = Math.abs(ym - chord);
    const finite = isFinite(ym) && isFinite(ya) && isFinite(yb);
    if (depth < 22 && (depth < 4 || (finite && dev > tol))) {
      rec(xa, ya, xm, ym, depth + 1);
      pts.push([xm, ym]);
      rec(xm, ym, xb, yb, depth + 1);
    }
  };
  pts.push([x0, y0]);
  rec(x0, y0, x1, y1, 0);
  pts.push([x1, y1]);
  return pts;
}

// ── quadratic Bézier fit ───────────────────────────────────────────────────
function curveQuads(f: (x: number) => number, samples: Pt[], plane: NumberPlane, span: number): number[][] {
  const h = span * 1e-4;
  const slope = (x: number) => (f(x + h) - f(x - h)) / (2 * h);
  const runs: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const [x0, y0] = samples[i], [x1, y1] = samples[i + 1];
    if (!isFinite(y0) || !isFinite(y1)) { if (cur.length) { runs.push(cur); cur = []; } continue; }
    const m0 = slope(x0), m1 = slope(x1);
    let cx: number, cy: number;
    if (!isFinite(m0) || !isFinite(m1) || Math.abs(m0 - m1) < 1e-9) { cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; }
    else { cx = (y1 - y0 - m1 * x1 + m0 * x0) / (m0 - m1); if (cx < x0 || cx > x1) { cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; } else cy = y0 + m0 * (cx - x0); }
    cur.push(plane.dToWx(x0), plane.dToWy(y0), plane.dToWx(cx), plane.dToWy(cy), plane.dToWx(x1), plane.dToWy(y1));
  }
  if (cur.length) runs.push(cur);
  return runs;
}

function widthWorld(view: PlaneView, px = 2.5): number { return Math.max(px / Math.max(view.zoom, 1e-6), 0.4); }

// ── y = f(x) ──────────────────────────────────────────────────────────────
export function plotFunction(f: (x: number) => number, plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, style: PlotStyle) {
  const xMin = plane.xMin, xMax = plane.xMax;
  const tol = style.tol ?? (plane.yMax - plane.yMin) * 0.0015;
  const runs = curveQuads(f, sample(f, xMin, xMax, tol), plane, xMax - xMin);
  const w = widthWorld(view, style.widthPx);
  for (const run of runs) { const q: number[] = []; strokeQuadPath(run, { width: w, cap: 'round', join: 'round' }, false, q); fillQuads(q, style.color, ctx.inst, ctx.crv, ctx.rws); }
}

// ── parametric (px(t), py(t)) ───────────────────────────────────────────────
export function plotParametric(px: (t: number) => number, py: (t: number) => number, tMin: number, tMax: number, plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, style: PlotStyle) {
  const N = 200;
  const q: number[] = [];
  const P = (t: number): Pt => [plane.dToWx(px(t)), plane.dToWy(py(t))];
  for (let i = 0; i < N; i++) {
    const t0 = tMin + (tMax - tMin) * (i / N), t1 = tMin + (tMax - tMin) * ((i + 1) / N), tm = (t0 + t1) / 2;
    const p0 = P(t0), p2 = P(t1), pm = P(tm);
    const cx = 2 * pm[0] - (p0[0] + p2[0]) / 2, cy = 2 * pm[1] - (p0[1] + p2[1]) / 2;
    q.push(p0[0], p0[1], cx, cy, p2[0], p2[1]);
  }
  const out: number[] = [];
  strokeQuadPath(q, { width: widthWorld(view, style.widthPx), cap: 'round', join: 'round' }, false, out);
  fillQuads(out, style.color, ctx.inst, ctx.crv, ctx.rws);
}

// ── polar r(θ) ──────────────────────────────────────────────────────────────
export function plotPolar(r: (t: number) => number, tMin: number, tMax: number, plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, style: PlotStyle) {
  plotParametric((t) => r(t) * Math.cos(t), (t) => r(t) * Math.sin(t), tMin, tMax, plane, view, ctx, style);
}

// ── area fills ──────────────────────────────────────────────────────────────
/** Fill under f(x) down to baseline y0. */
export function areaUnder(f: (x: number) => number, plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, color: number[], baseline = 0) {
  const tol = (plane.yMax - plane.yMin) * 0.0015;
  const runs = curveQuads(f, sample(f, plane.xMin, plane.xMax, tol), plane, plane.xMax - plane.xMin);
  const wy = plane.dToWy(baseline);
  for (const run of runs) {
    if (run.length < 6) continue;
    const contour = run.slice();
    const ex = run[run.length - 2], ey = run[run.length - 1];
    const sx = run[0], sy = run[1];
    contour.push(ex, ey, (ex + ex) / 2, (ey + wy) / 2, ex, wy);
    contour.push(ex, wy, (ex + sx) / 2, wy, sx, wy);
    contour.push(sx, wy, (sx + sx) / 2, (wy + sy) / 2, sx, sy);
    fillQuads(contour, color, ctx.inst, ctx.crv, ctx.rws);
  }
  void view;
}

/** Fill between two functions f(x) and g(x). f is "upper", g is "lower". */
export function areaBetween(f: (x: number) => number, g: (x: number) => number, plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, color: number[]) {
  const tol = (plane.yMax - plane.yMin) * 0.0015;
  const span = plane.xMax - plane.xMin;
  const fSamples = sample(f, plane.xMin, plane.xMax, tol);
  const gSamples = sample(g, plane.xMin, plane.xMax, tol);
  // Build runs for both, handling discontinuities
  const fRuns = curveQuads(f, fSamples, plane, span);
  const gRuns = curveQuads(g, gSamples, plane, span);
  // For simplicity, work with the first continuous run of each
  // (multi-run areaBetween is a stretch goal)
  for (let ri = 0; ri < Math.min(fRuns.length, gRuns.length); ri++) {
    const fq = fRuns[ri], gq = gRuns[ri];
    if (fq.length < 6 || gq.length < 6) continue;
    // Build closed contour: f-run forward, g-run reversed
    const contour = fq.slice();
    for (let i = gq.length - 6; i >= 0; i -= 6) {
      contour.push(gq[i], gq[i + 1], gq[i + 2], gq[i + 3], gq[i + 4], gq[i + 5]);
    }
    fillQuads(contour, color, ctx.inst, ctx.crv, ctx.rws);
  }
  void view;
}
