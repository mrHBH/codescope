// ── windgraph · inequality shading (Phase 4 · A2) ────────────────────────────
// Shades the region where F(x,y) satisfies a comparison (default > 0), and the
// intersection of a system of inequalities. Per-triangle linear clipping keeps
// the boundary on the interpolated zero contour — crisp under the line overlay.

import { fillQuads, polygonQuads, type Pt } from '../stroke/stroke';
import type { NumberPlane, PlaneView, PlaneCtx } from '../coords/numberPlane';

export type Cmp = '>' | '<' | '>=' | '<=';

function clipHalf(p: Pt[], v: number[], keepAbove: boolean): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], va = v[i];
    const b = p[(i + 1) % p.length], vb = v[(i + 1) % p.length];
    const ain = keepAbove ? va >= 0 : va <= 0;
    const bin = keepAbove ? vb >= 0 : vb <= 0;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = -va / (vb - va);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export function plotInequality(Fs: ((x: number, y: number) => number)[], cmps: Cmp[], plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, color: number[], gridRes = 0.5) {
  const dxMin = Math.max(plane.xMin, (view.left - plane.worldX0) / plane.unitX);
  const dxMax = Math.min(plane.xMax, (view.right - plane.worldX0) / plane.unitX);
  const dyMin = Math.max(plane.yMin, (plane.worldY0 - view.bottom) / plane.unitY);
  const dyMax = Math.min(plane.yMax, (plane.worldY0 - view.top) / plane.unitY);
  if (dxMin > dxMax || dyMin > dyMax) return;
  const cell = 1 / gridRes;
  const cols = Math.ceil((dxMax - dxMin) * gridRes);
  const rows = Math.ceil((dyMax - dyMin) * gridRes);
  const above = cmps.map((c) => c === '>' || c === '>=');
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = dxMin + c * cell, y0 = dyMin + r * cell;
      const x1 = x0 + cell, y1 = y0 + cell;
      const corners: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const tris: Pt[][] = [[corners[0], corners[1], corners[2]], [corners[0], corners[2], corners[3]]];
      for (const tri of tris) {
        let poly = tri.slice();
        let ok = true;
        for (let fi = 0; fi < Fs.length && ok; fi++) {
          const vals = poly.map((p) => Fs[fi](p[0], p[1]));
          if (!vals.every(isFinite)) { ok = false; break; }
          poly = clipHalf(poly, vals, above[fi]);
          if (poly.length < 3) { ok = false; break; }
        }
        if (ok && poly.length >= 3) {
          const w = poly.map((p) => [plane.dToWx(p[0]), plane.dToWy(p[1])] as Pt);
          fillQuads(polygonQuads(w, true), color, ctx.inst, ctx.crv, ctx.rws);
        }
      }
    }
  }
}
