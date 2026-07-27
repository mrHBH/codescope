// ── windgraph · implicit curve plotting (Phase 3) ────────────────────────────
// Marching-squares contour extraction for F(x,y) = 0.
// Evaluates F on a uniform grid, finds zero-crossings on cell edges, and
// connects them into polylines → stroked through windfoil.
//
// Strategy:
//   - Adaptive-resolution: coarse grid first; subdivide cells near the contour.
//   - Handles saddle ambiguity by preferring consistent connectivity.
//   - Multiple contour levels (not just zero) via optional parameter.

import { strokeInto, type Pt } from '../stroke/stroke';
import type { NumberPlane, PlaneView, PlaneCtx } from '../coords/numberPlane';

/** Interpolate zero crossing along an edge from (ax,ay, av) to (bx,by, bv). */
function interpZero(ax: number, ay: number, av: number, bx: number, by: number, bv: number): Pt {
  if (Math.abs(av - bv) < 1e-15) return [(ax + bx) / 2, (ay + by) / 2];
  const t = -av / (bv - av);
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

interface GridCell {
  x: number; y: number;   // grid indices
  v: number[];            // values at corners: TL, TR, BR, BL (row-major)
}

// Given a grid cell and the four corner values, extract contour segments.
// Each cell can produce 0, 1, or 2 segments (saddle case → 2).
// Returns polyline points in data space.
function cellSegments(cx: number, cy: number, gx: number, gy: number, v: number[], level: number): Pt[][] {
  const sx = gx, sy = gy; // cell size in data coords
  // Corner positions (TL, TR, BR, BL)
  const px = [cx, cx + sx, cx + sx, cx];
  const py = [cy, cy, cy + sy, cy + sy];
  // Corner values vs level: sign bits (0 = below/on, 1 = above)
  const bits = v.map((f) => (f >= level ? 1 : 0));
  const code = bits[0] | (bits[1] << 1) | (bits[2] << 2) | (bits[3] << 3);
  if (code === 0 || code === 15) return []; // all same side

  // Edge crossings: edge i→j gives midpoint interp
  const edges: (() => Pt)[] = [
    () => interpZero(px[0], py[0], v[0], px[1], py[1], v[1]), // top
    () => interpZero(px[1], py[1], v[1], px[2], py[2], v[2]), // right
    () => interpZero(px[2], py[2], v[2], px[3], py[3], v[3]), // bottom
    () => interpZero(px[3], py[3], v[3], px[0], py[0], v[0]), // left
  ];

  // Which edges have crossings? (edge index that separates 0→1 or 1→0)
  const crossing: number[] = [];
  for (let e = 0; e < 4; e++) {
    const n = (e + 1) % 4;
    if (bits[e] !== bits[n]) crossing.push(e);
  }

  if (crossing.length < 2) return []; // shouldn't happen for non-trivial cases

  // For the saddle case (code 5 or 10), pick the "alt" pairing based on the
  // average of opposite corners to disambiguate
  let pairs: [number, number][];
  if (code === 5 || code === 10) {
    const avgDiag1 = (v[0] + v[2]) / 2; // TL + BR
    const avgDiag2 = (v[1] + v[3]) / 2; // TR + BL
    if (code === 5) { // TL and BR are same
      pairs = avgDiag1 < avgDiag2 ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
    } else { // TR and BL are same
      pairs = avgDiag2 < avgDiag1 ? [[1, 2], [0, 3]] : [[0, 1], [2, 3]];
    }
  } else {
    // Simple case: pair crossings in order
    pairs = [[crossing[0], crossing[1]]];
    if (crossing.length === 4) pairs.push([crossing[2], crossing[3]]);
  }

  return pairs.map(([a, b]) => [edges[a](), edges[b]()]);
}

// ── marching squares entry point ─────────────────────────────────────────
export interface ImplicitStyle {
  color: number[];
  widthPx?: number;
  level?: number;
  gridRes?: number;    // cells per data unit (default 0.5 → 2-unit cells)
  adapt?: boolean;     // adaptive refinement near contour (default true)
}

export function plotImplicit(F: (x: number, y: number) => number, plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, style: ImplicitStyle) {
  const level = style.level ?? 0;
  const res = style.gridRes ?? 0.5; // cells per data unit
  const adapt = style.adapt ?? true;

  // Visible data range (add margin for contours that enter the view)
  const margin = 2;
  const dxMin = Math.max(plane.xMin, (view.left - plane.worldX0) / plane.unitX - margin);
  const dxMax = Math.min(plane.xMax, (view.right - plane.worldX0) / plane.unitX + margin);
  const dyMin = Math.max(plane.yMin, (plane.worldY0 - view.bottom) / plane.unitY - margin);
  const dyMax = Math.min(plane.yMax, (plane.worldY0 - view.top) / plane.unitY + margin);
  if (dxMin > dxMax || dyMin > dyMax) return;

  const cellSize = 1 / res;
  const cols = Math.ceil((dxMax - dxMin) * res);
  const rows = Math.ceil((dyMax - dyMin) * res);
  if (cols < 1 || rows < 1) return;

  // Evaluate grid (cached per cell)
  const grid: number[][] = [];
  for (let r = 0; r <= rows; r++) {
    grid[r] = [];
    for (let c = 0; c <= cols; c++) {
      const dx = dxMin + c * cellSize;
      const dy = dyMin + r * cellSize;
      grid[r][c] = F(dx, dy);
    }
  }

  // Adaptive refinement: subdivide cells that straddle the level
  const refine = (r: number, c: number, depth: number): { pts: Pt[][]; subs: { segs: Pt[][] }[] } | null => {
    const v = [
      grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]
    ];
    const above = v.some(f => f >= level);
    const below = v.some(f => f < level);
    if (!above || !below || depth >= 3) {
      const segs = cellSegments(dxMin + c * cellSize, dyMin + r * cellSize, cellSize, cellSize, v, level);
      return { pts: segs, subs: [] };
    }
    // split into 4 sub-cells
    // We need mid-edge values and a center value
    const h = cellSize / 2;
    const x0 = dxMin + c * cellSize;
    const y0 = dyMin + r * cellSize;
    const mx = x0 + h;
    const my = y0 + h;
    const vm = F(mx, my);
    const vt = F(mx, y0);            // top-mid
    const vr = F(x0 + cellSize, my); // right-mid
    const vb = F(mx, y0 + cellSize); // bottom-mid
    const vl = F(x0, my);            // left-mid

    // 4 sub-cells: TL, TR, BR, BL — each with its OWN origin (top-left corner).
    const subs = [
      { ox: x0, oy: y0, v: [v[0], vt, vm, vl] }, // TL
      { ox: mx, oy: y0, v: [vt, v[1], vr, vm] }, // TR
      { ox: mx, oy: my, v: [vm, vr, v[2], vb] }, // BR
      { ox: x0, oy: my, v: [vl, vm, vb, v[3]] }, // BL
    ];
    const segs: Pt[][] = [];
    for (const sub of subs) {
      segs.push(...cellSegments(sub.ox, sub.oy, h, h, sub.v, level));
    }
    return { pts: segs, subs: [] };
  };

  // Collect contour segments, connect them into polylines
  const segments: Pt[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const result = refine(r, c, 0);
      if (result) segments.push(...result.pts);
    }
  }

  // Connect segments into polylines and stroke
  const w = Math.max(style.widthPx ?? 2.5 / Math.max(view.zoom, 1e-6), 0.4);
  const used = new Array(segments.length).fill(false);
  for (let i = 0; i < segments.length; i++) {
    if (used[i] || segments[i].length < 2) continue;
    used[i] = true;
    const polyline: Pt[] = [segments[i][0], segments[i][1]];
    if (segments[i].length === 2) {
      const eps = cellSize * 0.25;
      // Extend forward from the tail.
      let grown = true;
      while (grown) {
        grown = false;
        const last = polyline[polyline.length - 1];
        for (let j = 0; j < segments.length; j++) {
          if (used[j] || segments[j].length < 2) continue;
          const a = segments[j][0], b = segments[j][1];
          const dA = Math.hypot(a[0] - last[0], a[1] - last[1]);
          const dB = Math.hypot(b[0] - last[0], b[1] - last[1]);
          if (dA < eps) { polyline.push(b); used[j] = true; grown = true; }
          else if (dB < eps) { polyline.push(a); used[j] = true; grown = true; }
        }
      }
      // Extend backward from the head (prepend), so closed contours join fully.
      grown = true;
      while (grown) {
        grown = false;
        const first = polyline[0];
        for (let j = 0; j < segments.length; j++) {
          if (used[j] || segments[j].length < 2) continue;
          const a = segments[j][0], b = segments[j][1];
          const dA = Math.hypot(a[0] - first[0], a[1] - first[1]);
          const dB = Math.hypot(b[0] - first[0], b[1] - first[1]);
          if (dA < eps) { polyline.unshift(b); used[j] = true; grown = true; }
          else if (dB < eps) { polyline.unshift(a); used[j] = true; grown = true; }
        }
      }
    }
    if (polyline.length >= 2) {
      const wpts = polyline.map(([dx, dy]) => [plane.dToWx(dx), plane.dToWy(dy)] as Pt);
      // Miter joins — round joins would spend a 24-quad disc on every contour
      // vertex (the instance-count dominator); miter is identical at contour
      // widths and the engine's miter limit guards sharp corners.
      strokeInto(wpts, { width: w, cap: 'round', join: 'miter' }, style.color, ctx.inst, ctx.crv, ctx.rws);
    }
  }
  void view;
}
