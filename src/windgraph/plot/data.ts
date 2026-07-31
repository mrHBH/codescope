// ── windgraph · discrete data series (Phase 3) ───────────────────────────────
// Scatter plots, line series, bar charts, step series, error bars, and
// Riemann rectangles — all rendered through the stroke/fill engine so they
// stay crisp at any zoom.

import { strokeInto, fillQuads, circleQuads, type Pt } from '../stroke/stroke';
import type { NumberPlane, PlaneView, PlaneCtx } from '../coords/numberPlane';
import type { PlotStyle } from './functions';

function widthWorld(view: PlaneView, px = 2.5): number { return Math.max(px / Math.max(view.zoom, 1e-6), 0.4); }

// ── scatter ───────────────────────────────────────────────────────────────
export function scatter(points: Pt[], plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, color: number[], radiusPx = 5) {
  const r = radiusPx / Math.max(view.zoom, 1e-6);
  for (const [dx, dy] of points) fillQuads(circleQuads(plane.dToWx(dx), plane.dToWy(dy), r, 16), color, ctx.inst, ctx.crv, ctx.rws);
}

// ── line series ───────────────────────────────────────────────────────────
export function lineSeries(points: Pt[], plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, style: PlotStyle) {
  const w = points.map(([dx, dy]) => [plane.dToWx(dx), plane.dToWy(dy)] as Pt);
  strokeInto(w, { width: widthWorld(view, style.widthPx), cap: 'round', join: 'round' }, style.color, ctx.inst, ctx.crv, ctx.rws);
}

// ── step series (horizontal then vertical) ─────────────────────────────────
export function stepSeries(points: Pt[], plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, style: PlotStyle) {
  if (points.length < 2) return;
  const w: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [dx, dy] = points[i];
    const [dx1] = points[i + 1];
    w.push([plane.dToWx(dx), plane.dToWy(dy)]);           // current point
    w.push([plane.dToWx(dx1), plane.dToWy(dy)]);           // horizontal step
  }
  // final point
  const last = points[points.length - 1];
  w.push([plane.dToWx(last[0]), plane.dToWy(last[1])]);
  strokeInto(w, { width: widthWorld(view, style.widthPx), cap: 'butt', join: 'miter' }, style.color, ctx.inst, ctx.crv, ctx.rws);
}

// ── bar chart ─────────────────────────────────────────────────────────────
export function bars(points: Pt[], plane: NumberPlane, ctx: PlaneCtx, color: number[], barWidthData = 0.6, baseline = 0) {
  const wy0 = plane.dToWy(baseline);
  for (const [dx, dy] of points) {
    const x0 = plane.dToWx(dx - barWidthData / 2), x1 = plane.dToWx(dx + barWidthData / 2), wy = plane.dToWy(dy);
    const q = [x0, wy0, (x0 + x1) / 2, wy0, x1, wy0, x1, wy0, x1, (wy0 + wy) / 2, x1, wy, x1, wy, (x0 + x1) / 2, wy, x0, wy, x0, wy, x0, (wy + wy0) / 2, x0, wy0];
    fillQuads(q, color, ctx.inst, ctx.crv, ctx.rws);
  }
}

// ── error bars ────────────────────────────────────────────────────────────
export interface ErrorBar {
  dx: number; dy: number;         // data point
  errY: number;                   // error in y (symmetric ±)
  errX?: number;                  // error in x (optional, symmetric ±)
}

export function errorBars(errors: ErrorBar[], plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, color: number[], capPx = 6, stemPx = 2) {
  const z = Math.max(view.zoom, 1e-6);
  const stem = stemPx / z;
  const cap = capPx / z;
  for (const e of errors) {
    const wx = plane.dToWx(e.dx), wy = plane.dToWy(e.dy);
    const errW = e.errY / z; // world units for error magnitude
    // Vertical stem
    strokeInto([[wx, wy - errW], [wx, wy + errW]], { width: stem, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
    // Top cap
    strokeInto([[wx - cap, wy - errW], [wx + cap, wy - errW]], { width: stem, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
    // Bottom cap
    strokeInto([[wx - cap, wy + errW], [wx + cap, wy + errW]], { width: stem, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
    // Horizontal error bars
    if (e.errX) {
      const errXW = e.errX / z;
      strokeInto([[wx - errXW, wy], [wx + errXW, wy]], { width: stem, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
      strokeInto([[wx - errXW, wy - cap], [wx - errXW, wy + cap]], { width: stem, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
      strokeInto([[wx + errXW, wy - cap], [wx + errXW, wy + cap]], { width: stem, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
    }
  }
}

// ── Riemann rectangles ────────────────────────────────────────────────────
export function riemannRectangles(
  f: (x: number) => number,
  xMin: number, xMax: number, n: number,
  plane: NumberPlane, ctx: PlaneCtx,
  color: number[], baseline = 0, mode: 'left' | 'right' | 'midpoint' = 'midpoint'
) {
  const dx = (xMax - xMin) / n;
  const wy0 = plane.dToWy(baseline);
  for (let i = 0; i < n; i++) {
    let x: number;
    if (mode === 'left') x = xMin + i * dx;
    else if (mode === 'right') x = xMin + (i + 1) * dx;
    else x = xMin + (i + 0.5) * dx;
    const y = f(x);
    if (!isFinite(y)) continue;
    const x0 = plane.dToWx(xMin + i * dx);
    const x1 = plane.dToWx(xMin + (i + 1) * dx);
    const wy = plane.dToWy(y);
    const q = [x0, wy0, (x0 + x1) / 2, wy0, x1, wy0, x1, wy0, x1, (wy0 + wy) / 2, x1, wy, x1, wy, (x0 + x1) / 2, wy, x0, wy, x0, wy, x0, (wy + wy0) / 2, x0, wy0];
    fillQuads(q, color, ctx.inst, ctx.crv, ctx.rws);
  }
}
