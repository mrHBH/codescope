// ── windgraph · contours (Phase 4 · A15) ─────────────────────────────────────
// Line contours (reusing the marching-squares implicit extractor), filled
// isobands (per-triangle linear slab clipping — exact for the bilinear grid),
// and label anchor positions for billboarded MathTex level labels.

import { fillQuads, polygonQuads, type Pt } from '../stroke/stroke';
import type { NumberPlane, PlaneView, PlaneCtx } from '../coords/numberPlane';
import { plotImplicit } from './implicit';

export interface ContourStyle { color: number[]; widthPx?: number; gridRes?: number; }

export function contourLevels(F: (x: number, y: number) => number, plane: NumberPlane, count: number): number[] {
  let lo = Infinity, hi = -Infinity;
  const N = 24;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = plane.xMin + (plane.xMax - plane.xMin) * (i / N);
      const y = plane.yMin + (plane.yMax - plane.yMin) * (j / N);
      const v = F(x, y);
      if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
  }
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [];
  const out: number[] = [];
  for (let k = 1; k <= count; k++) out.push(lo + (hi - lo) * (k / (count + 1)));
  return out;
}

export function plotContourLines(F: (x: number, y: number) => number, levels: number[], plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, style: ContourStyle) {
  for (const level of levels) {
    plotImplicit(F, plane, view, ctx, { color: style.color, widthPx: style.widthPx, level, gridRes: style.gridRes });
  }
}

function clipTriBand(p: Pt[], v: number[], lo: number, hi: number): Pt[] {
  const clip = (poly: Pt[], vals: number[], thr: number, keepAbove: boolean): { p: Pt[]; v: number[] } => {
    const np: Pt[] = [], nv: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], va = vals[i];
      const b = poly[(i + 1) % poly.length], vb = vals[(i + 1) % poly.length];
      const ain = keepAbove ? va >= thr : va <= thr;
      const bin = keepAbove ? vb >= thr : vb <= thr;
      if (ain) { np.push(a); nv.push(va); }
      if (ain !== bin) {
        const t = (thr - va) / (vb - va);
        np.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        nv.push(thr);
      }
    }
    return { p: np, v: nv };
  };
  let poly = p.slice(), vals = v.slice();
  const a = clip(poly, vals, lo, true);
  poly = a.p; vals = a.v;
  const b = clip(poly, vals, hi, false);
  return b.p;
}

export function plotFilledContours(F: (x: number, y: number) => number, levels: number[], palette: number[][], plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, gridRes = 0.5) {
  const bands = levels.length + 1;
  const bounds = [-Infinity, ...levels, Infinity];
  const dxMin = Math.max(plane.xMin, (view.left - plane.worldX0) / plane.unitX);
  const dxMax = Math.min(plane.xMax, (view.right - plane.worldX0) / plane.unitX);
  const dyMin = Math.max(plane.yMin, (plane.worldY0 - view.bottom) / plane.unitY);
  const dyMax = Math.min(plane.yMax, (plane.worldY0 - view.top) / plane.unitY);
  if (dxMin > dxMax || dyMin > dyMax) return;
  const cell = 1 / gridRes;
  const cols = Math.ceil((dxMax - dxMin) * gridRes);
  const rows = Math.ceil((dyMax - dyMin) * gridRes);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = dxMin + c * cell, y0 = dyMin + r * cell;
      const x1 = x0 + cell, y1 = y0 + cell;
      const v00 = F(x0, y0), v10 = F(x1, y0), v11 = F(x1, y1), v01 = F(x0, y1);
      if (![v00, v10, v11, v01].every(isFinite)) continue;
      const W = (x: number, y: number): Pt => [plane.dToWx(x), plane.dToWy(y)];
      const tris: { p: Pt[]; v: number[] }[] = [
        { p: [W(x0, y0), W(x1, y0), W(x1, y1)], v: [v00, v10, v11] },
        { p: [W(x0, y0), W(x1, y1), W(x0, y1)], v: [v00, v11, v01] },
      ];
      for (let bi = 0; bi < bands; bi++) {
        const col = palette[bi % palette.length];
        for (const tri of tris) {
          const tp = tri.p, tv = tri.v;
          const poly = clipTriBand(tp, tv, bounds[bi], bounds[bi + 1]);
          if (poly.length >= 3) fillQuads(polygonQuads(poly, true), col, ctx.inst, ctx.crv, ctx.rws);
        }
      }
    }
  }
}

export function contourLabelAnchors(F: (x: number, y: number) => number, levels: number[], plane: NumberPlane, spacing = 3): { pos: Pt; level: number }[] {
  const out: { pos: Pt; level: number }[] = [];
  const N = 60;
  for (const level of levels) {
    let since = spacing;
    for (let i = 0; i < N; i++) {
      const x = plane.xMin + (plane.xMax - plane.xMin) * (i / N);
      const y = plane.yMin + (plane.yMax - plane.yMin) * 0.5;
      const va = F(x, y), vb = F(x + (plane.xMax - plane.xMin) / N, y);
      if ((va - level) * (vb - level) < 0) {
        if (since >= spacing) { out.push({ pos: [x, y], level }); since = 0; }
      }
      since++;
    }
  }
  return out;
}
