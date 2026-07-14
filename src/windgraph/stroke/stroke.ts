// ── windgraph · stroke→fill engine (Phase 0) ─────────────────────────────────
// windfoil FILLS closed quadratic-Bézier contours; a graphing library mostly
// draws STROKES. This module converts stroked polylines and Bézier paths into
// filled ribbon contours that windfoil renders — so lines/curves get width,
// caps, joins and dashes while staying analytic and razor-sharp at any zoom.
//
// Strategy: emit the stroke as a UNION of consistently-wound closed pieces
// (segment ribbons + round/miter/bevel joins + caps). windfoil's nonzero fill
// rule saturates overlaps to full coverage, so the union renders with no holes
// as long as every piece is wound the same direction (here: CW / negative area).
// Curved strokes offset each centerline quad into a curved ribbon (2 Bézier
// sides + 2 straight ends) with round joins hiding the per-piece tangent kinks,
// so the boundary stays a smooth curve — never a faceted polyline — at any zoom.

import { pushMonotonePieces, quadsBBox } from '../../windfoil/geometry';
import { bandPieces } from '../../windfoil/bands';

export type Cap = 'butt' | 'round' | 'square';
export type Join = 'miter' | 'round' | 'bevel';
export interface StrokeStyle {
  width: number;
  cap?: Cap;
  join?: Join;
  miterLimit?: number;   // default 4
  dash?: number[];       // dash pattern in world units (on, off, on, ...)
  dashOffset?: number;
}

export type Pt = [number, number];

// ── low-level quad emit (out is a flat [x0,y0,cx,cy,x1,y1,...] array) ─────────
function lineQuad(out: number[], x0: number, y0: number, x1: number, y1: number) {
  out.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1);
}

// Signed area (shoelace) of a point loop — sign only (orientation test).
function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a * 0.5;
}

// Emit a straight closed polygon as CW (negative-area) line-quads.
function polyLoopCW(out: number[], pts: Pt[]) {
  if (pts.length < 3) return;
  const loop = signedArea(pts) > 0 ? [...pts].reverse() : pts;
  for (let i = 0; i < loop.length; i++) {
    const [x0, y0] = loop[i], [x1, y1] = loop[(i + 1) % loop.length];
    lineQuad(out, x0, y0, x1, y1);
  }
}

// A disc (round join / cap), wound CW (decreasing angle) as quadratic arcs.
function discCW(out: number[], cx: number, cy: number, r: number, segs = 24) {
  if (r <= 0) return;
  const step = (Math.PI * 2) / segs;
  const k = 1 / Math.cos(step / 2); // control-point radius so the arc is tangent
  for (let i = 0; i < segs; i++) {
    const a0 = -i * step, a1 = -(i + 1) * step, am = (a0 + a1) / 2;
    out.push(
      cx + r * Math.cos(a0), cy + r * Math.sin(a0),
      cx + r * k * Math.cos(am), cy + r * k * Math.sin(am),
      cx + r * Math.cos(a1), cy + r * Math.sin(a1),
    );
  }
}

function norm(dx: number, dy: number): Pt {
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

// One straight segment as a filled rectangle ribbon.
function segRect(out: number[], ax: number, ay: number, bx: number, by: number, hw: number) {
  const [dx, dy] = norm(bx - ax, by - ay);
  const nx = -dy, ny = dx; // left normal
  polyLoopCW(out, [
    [ax + nx * hw, ay + ny * hw],
    [bx + nx * hw, by + ny * hw],
    [bx - nx * hw, by - ny * hw],
    [ax - nx * hw, ay - ny * hw],
  ]);
}

// A join filling the gap at interior vertex V between incoming dir dPrev and
// outgoing dir dNext (both unit). Round → disc (added by caller). Here: miter/bevel.
function addStraightJoin(out: number[], v: Pt, dPrev: Pt, dNext: Pt, hw: number, join: Join, miterLimit: number) {
  // Outer side is opposite the turn direction. Cross product sign picks it.
  const cross = dPrev[0] * dNext[1] - dPrev[1] * dNext[0];
  if (Math.abs(cross) < 1e-9) return; // collinear — nothing to fill
  const s = cross > 0 ? -1 : 1; // normal sign toward the outer side
  const nPrev: Pt = [(-dPrev[1]) * s, dPrev[0] * s];
  const nNext: Pt = [(-dNext[1]) * s, dNext[0] * s];
  const aPrev: Pt = [v[0] + nPrev[0] * hw, v[1] + nPrev[1] * hw]; // outer offset, incoming edge
  const aNext: Pt = [v[0] + nNext[0] * hw, v[1] + nNext[1] * hw]; // outer offset, outgoing edge
  if (join === 'bevel') {
    polyLoopCW(out, [v, aPrev, aNext]);
    return;
  }
  // miter: intersect the two outer offset lines (aPrev along dPrev, aNext along dNext).
  const den = dPrev[0] * dNext[1] - dPrev[1] * dNext[0];
  const t = ((aNext[0] - aPrev[0]) * dNext[1] - (aNext[1] - aPrev[1]) * dNext[0]) / den;
  const mx = aPrev[0] + dPrev[0] * t, my = aPrev[1] + dPrev[1] * t;
  const miterLen = Math.hypot(mx - v[0], my - v[1]) / hw;
  if (miterLen > miterLimit) { polyLoopCW(out, [v, aPrev, aNext]); return; } // clip to bevel
  polyLoopCW(out, [v, aPrev, [mx, my], aNext]);
}

// ── polyline stroking ────────────────────────────────────────────────────────
export function strokePolyline(points: Pt[], style: StrokeStyle, out: number[] = []): number[] {
  const hw = style.width / 2;
  const cap = style.cap ?? 'butt';
  const join = style.join ?? 'round';
  const miterLimit = style.miterLimit ?? 4;
  // drop consecutive duplicates
  const pts: Pt[] = [];
  for (const p of points) { const last = pts[pts.length - 1]; if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-9) pts.push(p); }
  if (pts.length === 0) return out;
  if (pts.length === 1) { if (cap === 'round') discCW(out, pts[0][0], pts[0][1], hw); return out; }

  for (let i = 0; i < pts.length - 1; i++) segRect(out, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], hw);

  for (let i = 1; i < pts.length - 1; i++) {
    if (join === 'round') { discCW(out, pts[i][0], pts[i][1], hw); continue; }
    const dPrev = norm(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const dNext = norm(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    addStraightJoin(out, pts[i], dPrev, dNext, hw, join, miterLimit);
  }

  const a = pts[0], a2 = pts[1], b = pts[pts.length - 1], b2 = pts[pts.length - 2];
  if (cap === 'round') { discCW(out, a[0], a[1], hw); discCW(out, b[0], b[1], hw); }
  else if (cap === 'square') { squareCap(out, a2, a, hw); squareCap(out, b2, b, hw); }
  return out;
}

// Extend a butt end by hw beyond the endpoint `end` (coming from `prev`).
function squareCap(out: number[], prev: Pt, end: Pt, hw: number) {
  const [dx, dy] = norm(end[0] - prev[0], end[1] - prev[1]);
  const ex = end[0] + dx * hw, ey = end[1] + dy * hw;
  segRect(out, end[0], end[1], ex, ey, hw);
}

// ── curved (Bézier) stroking ────────────────────────────────────────────────
// Offsets each centerline quad into a curved ribbon so the boundary stays smooth
// (not faceted) at any zoom; round joins between pieces hide tangent kinks.
export function strokeQuadPath(quads: number[], style: StrokeStyle, closed = false, out: number[] = []): number[] {
  const hw = style.width / 2;
  const n = quads.length / 6;
  for (let i = 0; i < n; i++) strokeQuadPiece(out, quads, i * 6, hw);
  // Round joins at every shared endpoint hide the C1 kinks between pieces.
  for (let i = 0; i < n; i++) {
    const b = i * 6;
    discCW(out, quads[b], quads[b + 1], hw);           // piece start
  }
  const last = (n - 1) * 6;
  if (closed) discCW(out, quads[last + 4], quads[last + 5], hw);
  else {
    const cap = style.cap ?? 'butt';
    if (cap === 'round') discCW(out, quads[last + 4], quads[last + 5], hw); // far end
    // (start already gets a disc from the join loop above; butt/square TODO for curves)
  }
  return out;
}

function strokeQuadPiece(out: number[], q: number[], b: number, hw: number) {
  const x0 = q[b], y0 = q[b + 1], cx = q[b + 2], cy = q[b + 3], x1 = q[b + 4], y1 = q[b + 5];
  const n0 = norm(-(2 * (cy - y0)), 2 * (cx - x0));   // left normal at P0 (⟂ tangent 2(C−P0))
  const n2 = norm(-(2 * (y1 - cy)), 2 * (x1 - cx));   // left normal at P2
  let nbx = n0[0] + n2[0], nby = n0[1] + n2[1];
  const nb = norm(nbx, nby);                          // bisector normal at the control point
  const L0: Pt = [x0 + n0[0] * hw, y0 + n0[1] * hw], Lc: Pt = [cx + nb[0] * hw, cy + nb[1] * hw], L2: Pt = [x1 + n2[0] * hw, y1 + n2[1] * hw];
  const R0: Pt = [x0 - n0[0] * hw, y0 - n0[1] * hw], Rc: Pt = [cx - nb[0] * hw, cy - nb[1] * hw], R2: Pt = [x1 - n2[0] * hw, y1 - n2[1] * hw];
  // Closed ribbon: left curve (L0→L2), end line (L2→R2), right curve reversed (R2→R0), end line (R0→L0).
  // Orientation check via the endpoint quad; swap sides if it came out CCW.
  const cw = signedArea([L0, L2, R2, R0]) < 0;
  const a0 = cw ? L0 : R0, ac = cw ? Lc : Rc, a2 = cw ? L2 : R2;
  const z0 = cw ? R0 : L0, zc = cw ? Rc : Lc, z2 = cw ? R2 : L2;
  out.push(a0[0], a0[1], ac[0], ac[1], a2[0], a2[1]);          // side A (quad)
  lineQuad(out, a2[0], a2[1], z2[0], z2[1]);                   // end
  out.push(z2[0], z2[1], zc[0], zc[1], z0[0], z0[1]);          // side B reversed (quad)
  lineQuad(out, z0[0], z0[1], a0[0], a0[1]);                   // end
}

// ── dashes ────────────────────────────────────────────────────────────────
// Split a polyline into the "on" runs of a dash pattern (world units).
export function dashPolyline(points: Pt[], dash: number[], offset = 0): Pt[][] {
  if (!dash.length) return [points];
  const runs: Pt[][] = [];
  const total = dash.reduce((a, b) => a + b, 0);
  if (total <= 0) return [points];
  let di = 0, rem = dash[0], on = true;
  // apply offset
  let off = ((offset % total) + total) % total;
  while (off > 0) { const t = Math.min(off, rem); rem -= t; off -= t; if (rem <= 1e-9) { di = (di + 1) % dash.length; rem = dash[di]; on = !on; } }
  let cur: Pt[] = on ? [points[0]] : [];
  for (let i = 0; i < points.length - 1; i++) {
    let [x0, y0] = points[i]; const [x1, y1] = points[i + 1];
    let segLen = Math.hypot(x1 - x0, y1 - y0);
    const [dx, dy] = norm(x1 - x0, y1 - y0);
    while (segLen > 1e-9) {
      const t = Math.min(rem, segLen);
      const nx = x0 + dx * t, ny = y0 + dy * t;
      if (on) cur.push([nx, ny]);
      x0 = nx; y0 = ny; segLen -= t; rem -= t;
      if (rem <= 1e-9) {
        if (on && cur.length > 1) runs.push(cur);
        on = !on; di = (di + 1) % dash.length; rem = dash[di];
        cur = on ? [[x0, y0]] : [];
      }
    }
  }
  if (on && cur.length > 1) runs.push(cur);
  return runs;
}

// ── render adaptor: fill a contour (quads) as one windfoil instance ──────────
export function fillQuads(quads: number[], color: number[], inst: number[], crv: number[], rws: number[]) {
  if (quads.length < 6) return;
  const ps: number[] = [];
  const one: number[] = [];
  for (let i = 0; i < quads.length; i += 6) {
    one.length = 0;
    for (let j = 0; j < 6; j++) one.push(quads[i + j]);
    pushMonotonePieces(one, ps);
  }
  const bb = quadsBBox(quads);
  if (!bb) return;
  const h = bandPieces(ps, bb[1], bb[3], crv, rws);
  inst.push(0, 0, 1, 0, bb[0], bb[1], bb[2], bb[3], color[0], color[1], color[2], color[3], h.rowBase, h.bandCount, h.bandH, h.invH);
}

// Convenience: stroke a polyline (with optional dashes) straight into instances.
export function strokeInto(points: Pt[], style: StrokeStyle, color: number[], inst: number[], crv: number[], rws: number[]) {
  const runs = style.dash && style.dash.length ? dashPolyline(points, style.dash, style.dashOffset ?? 0) : [points];
  const q: number[] = [];
  for (const run of runs) strokePolyline(run, style, q);
  fillQuads(q, color, inst, crv, rws);
}

// ── shared path builders (used by primitives) ────────────────────────────────
// A circle centerline as quadratic-Bézier arcs (CW), for stroking or filling.
export function circleQuads(cx: number, cy: number, r: number, segs = 16): number[] {
  const out: number[] = [];
  const step = (Math.PI * 2) / segs;
  const k = 1 / Math.cos(step / 2);
  for (let i = 0; i < segs; i++) {
    const a0 = -i * step, a1 = -(i + 1) * step, am = (a0 + a1) / 2;
    out.push(
      cx + r * Math.cos(a0), cy + r * Math.sin(a0),
      cx + r * k * Math.cos(am), cy + r * k * Math.sin(am),
      cx + r * Math.cos(a1), cy + r * Math.sin(a1),
    );
  }
  return out;
}

// An arc centerline (from a0→a1 radians) as quadratic-Bézier pieces (≤ ~45°/piece).
export function arcQuads(cx: number, cy: number, r: number, a0: number, a1: number): number[] {
  const out: number[] = [];
  const span = a1 - a0;
  const segs = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 4)));
  const step = span / segs;
  const k = 1 / Math.cos(step / 2);
  for (let i = 0; i < segs; i++) {
    const b0 = a0 + i * step, b1 = a0 + (i + 1) * step, bm = (b0 + b1) / 2;
    out.push(
      cx + r * Math.cos(b0), cy + r * Math.sin(b0),
      cx + r * k * Math.cos(bm), cy + r * k * Math.sin(bm),
      cx + r * Math.cos(b1), cy + r * Math.sin(b1),
    );
  }
  return out;
}

// A polygon outline as straight line-quads (closed by default).
export function polygonQuads(pts: Pt[], closed = true): number[] {
  const out: number[] = [];
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    lineQuad(out, x0, y0, x1, y1);
  }
  return out;
}
