// ── windgraph · geometric constraints (Phase 5) ──────────────────────────────
// Concrete graph objects: free points and derived constructions (midpoint,
// centroid, circumcircle, line intersection, glider-on-host, reflection,
// perpendicular/parallel lines, angle + distance measures). Each holds resolved
// world-space values and recomputes from its inputs; the reactive graph drives
// the recompute order.

import { GObject } from './graph';

export type Vec2 = [number, number];

// ── points ─────────────────────────────────────────────────────────────────
export class GPoint extends GObject {
  constructor(public x: number, public y: number, free = true) { super(); this.free = free; }
  recompute() { /* free point: user-controlled */ }
  set(x: number, y: number) { this.x = x; this.y = y; }
  /** Move in response to a drag (free point follows the pointer directly). */
  moveTo(wx: number, wy: number) { this.set(wx, wy); }
  get pos(): Vec2 { return [this.x, this.y]; }
}

export class Midpoint extends GPoint {
  constructor(public a: GPoint, public b: GPoint) { super(0, 0, false); this.inputs = [a, b]; this.recompute(); }
  recompute() { this.x = (this.a.x + this.b.x) / 2; this.y = (this.a.y + this.b.y) / 2; }
}

export class Centroid extends GPoint {
  constructor(public pts: GPoint[]) { super(0, 0, false); this.inputs = [...pts]; this.recompute(); }
  recompute() {
    let sx = 0, sy = 0;
    for (const p of this.pts) { sx += p.x; sy += p.y; }
    const n = this.pts.length || 1;
    this.x = sx / n; this.y = sy / n;
  }
}

// Reflection of `p` across `line`.
export class Reflection extends GPoint {
  constructor(public p: GPoint, public line: GLine) { super(0, 0, false); this.inputs = [p, line]; this.recompute(); }
  recompute() {
    const { x0, y0, dx, dy } = this.line;
    const vx = this.p.x - x0, vy = this.p.y - y0;
    const t = vx * dx + vy * dy;            // projection scalar (dir is unit)
    const px = x0 + dx * t, py = y0 + dy * t; // foot of perpendicular
    this.x = 2 * px - this.p.x;
    this.y = 2 * py - this.p.y;
  }
}

// Intersection of two lines (falls back to a far-off point when parallel).
export class Intersection extends GPoint {
  ok = true;
  constructor(public l1: GLine, public l2: GLine) { super(0, 0, false); this.inputs = [l1, l2]; this.recompute(); }
  recompute() {
    // l: (x0,y0) + t (dx,dy). Solve l1 = l2.
    const { x0: ax, y0: ay, dx: adx, dy: ady } = this.l1;
    const { x0: bx, y0: by, dx: bdx, dy: bdy } = this.l2;
    const det = adx * (-bdy) - ady * (-bdx);
    if (Math.abs(det) < 1e-9) { this.ok = false; return; }
    const rx = bx - ax, ry = by - ay;
    const t = (rx * (-bdy) - ry * (-bdx)) / det;
    this.ok = true;
    this.x = ax + adx * t; this.y = ay + ady * t;
  }
}

// A point constrained to a host (line or circle). Dragging projects the pointer
// onto the host; the parameter is stored so it stays exactly on the host.
export type Host = GLine | GCircle;
export class Glider extends GPoint {
  t = 0; // param: signed distance along a line, or angle (rad) on a circle
  constructor(public host: Host, t = 0) { super(0, 0, false); this.inputs = [host]; this.t = t; this.recompute(); }
  recompute() {
    if (this.host instanceof GCircle) {
      this.x = this.host.cx + this.host.r * Math.cos(this.t);
      this.y = this.host.cy + this.host.r * Math.sin(this.t);
    } else {
      const l = this.host as GLine;
      this.x = l.x0 + l.dx * this.t;
      this.y = l.y0 + l.dy * this.t;
    }
  }
  /** Project a world point onto the host and store the resulting parameter. */
  projectFrom(wx: number, wy: number) {
    if (this.host instanceof GCircle) {
      this.t = Math.atan2(wy - this.host.cy, wx - this.host.cx);
    } else {
      const l = this.host as GLine;
      this.t = (wx - l.x0) * l.dx + (wy - l.y0) * l.dy; // dir is unit
    }
    this.recompute();
  }
  override moveTo(wx: number, wy: number) { this.projectFrom(wx, wy); }
}

// ── lines ────────────────────────────────────────────────────────────────
export class GLine extends GObject {
  x0 = 0; y0 = 0; dx = 1; dy = 0;    // point + UNIT direction
  recompute() { /* base line is not derived */ }
  protected setFromPoints(ax: number, ay: number, bx: number, by: number) {
    this.x0 = ax; this.y0 = ay;
    let dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    this.dx = dx / len; this.dy = dy / len;
  }
}

export class LineThrough extends GLine {
  constructor(public a: GPoint, public b: GPoint) { super(); this.inputs = [a, b]; this.recompute(); }
  recompute() { this.setFromPoints(this.a.x, this.a.y, this.b.x, this.b.y); }
}

// Line through `p` perpendicular to `ref`.
export class Perpendicular extends GLine {
  constructor(public p: GPoint, public ref: GLine) { super(); this.inputs = [p, ref]; this.recompute(); }
  recompute() { this.x0 = this.p.x; this.y0 = this.p.y; this.dx = -this.ref.dy; this.dy = this.ref.dx; }
}

// Line through `p` parallel to `ref`.
export class Parallel extends GLine {
  constructor(public p: GPoint, public ref: GLine) { super(); this.inputs = [p, ref]; this.recompute(); }
  recompute() { this.x0 = this.p.x; this.y0 = this.p.y; this.dx = this.ref.dx; this.dy = this.ref.dy; }
}

// ── circles ────────────────────────────────────────────────────────────────
export class GCircle extends GObject {
  cx = 0; cy = 0; r = 0;
  recompute() { /* base circle is not derived */ }
}

export class Circumcircle extends GCircle {
  ok = true;
  constructor(public a: GPoint, public b: GPoint, public c: GPoint) { super(); this.inputs = [a, b, c]; this.recompute(); }
  recompute() {
    const { x: ax, y: ay } = this.a, { x: bx, y: by } = this.b, { x: cx, y: cy } = this.c;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-9) { this.ok = false; this.r = 0; return; }
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    this.cx = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    this.cy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    this.r = Math.hypot(ax - this.cx, ay - this.cy);
    this.ok = true;
  }
}

// ── measures (scalars) ──────────────────────────────────────────────────────
export class Distance extends GObject {
  value = 0;
  constructor(public a: GPoint, public b: GPoint) { super(); this.inputs = [a, b]; this.recompute(); }
  recompute() { this.value = Math.hypot(this.a.x - this.b.x, this.a.y - this.b.y); }
}

// Interior angle at `vertex` between rays to `a` and `b` (radians + start/end).
export class Angle extends GObject {
  value = 0; a0 = 0; a1 = 0;
  constructor(public a: GPoint, public vertex: GPoint, public b: GPoint) { super(); this.inputs = [a, vertex, b]; this.recompute(); }
  recompute() {
    const ang0 = Math.atan2(this.a.y - this.vertex.y, this.a.x - this.vertex.x);
    const ang1 = Math.atan2(this.b.y - this.vertex.y, this.b.x - this.vertex.x);
    let d = ang1 - ang0;
    while (d <= -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    this.value = Math.abs(d);
    this.a0 = ang0; this.a1 = ang0 + d;
  }
}

// ── triangle centers (B1) ───────────────────────────────────────────────────

export class Circumcenter extends GPoint {
  ok = true;
  constructor(public a: GPoint, public b: GPoint, public c: GPoint) { super(0, 0, false); this.inputs = [a, b, c]; this.recompute(); }
  recompute() {
    const { x: ax, y: ay } = this.a, { x: bx, y: by } = this.b, { x: cx, y: cy } = this.c;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-9) { this.ok = false; return; }
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    this.x = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    this.y = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    this.ok = true;
  }
}

export class Incenter extends GPoint {
  constructor(public a: GPoint, public b: GPoint, public c: GPoint) { super(0, 0, false); this.inputs = [a, b, c]; this.recompute(); }
  recompute() {
    const { x: ax, y: ay } = this.a, { x: bx, y: by } = this.b, { x: cx, y: cy } = this.c;
    const sa = Math.hypot(bx - cx, by - cy), sb = Math.hypot(cx - ax, cy - ay), sc = Math.hypot(ax - bx, ay - by);
    const s = sa + sb + sc || 1;
    this.x = (sa * ax + sb * bx + sc * cx) / s;
    this.y = (sa * ay + sb * by + sc * cy) / s;
  }
}

export class Orthocenter extends GPoint {
  ok = true;
  constructor(public a: GPoint, public b: GPoint, public c: GPoint) { super(0, 0, false); this.inputs = [a, b, c]; this.recompute(); }
  recompute() {
    const { x: ax, y: ay } = this.a, { x: bx, y: by } = this.b, { x: cx, y: cy } = this.c;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-9) { this.ok = false; return; }
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ox = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const oy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    this.x = ax + bx + cx - 2 * ox;
    this.y = ay + by + cy - 2 * oy;
    this.ok = true;
  }
}

export class Excenter extends GPoint {
  constructor(public a: GPoint, public b: GPoint, public c: GPoint, public which: 0 | 1 | 2 = 0) { super(0, 0, false); this.inputs = [a, b, c]; this.recompute(); }
  recompute() {
    const { x: ax, y: ay } = this.a, { x: bx, y: by } = this.b, { x: cx, y: cy } = this.c;
    const sa = Math.hypot(bx - cx, by - cy), sb = Math.hypot(cx - ax, cy - ay), sc = Math.hypot(ax - bx, ay - by);
    const signs = [[-1, 1, 1], [1, -1, 1], [1, 1, -1]][this.which];
    const w = signs[0] * sa + signs[1] * sb + signs[2] * sc;
    if (Math.abs(w) < 1e-9) return;
    this.x = (signs[0] * sa * ax + signs[1] * sb * bx + signs[2] * sc * cx) / w;
    this.y = (signs[0] * sa * ay + signs[1] * sb * by + signs[2] * sc * cy) / w;
  }
}

export class EulerLine extends GLine {
  constructor(public circumcenter: GPoint, public orthocenter: GPoint) { super(); this.inputs = [circumcenter, orthocenter]; this.recompute(); }
  recompute() { this.setFromPoints(this.circumcenter.x, this.circumcenter.y, this.orthocenter.x, this.orthocenter.y); }
}

export class NinePointCircle extends GCircle {
  constructor(public circumcenter: GPoint, public orthocenter: GPoint, public circumcircle: GCircle) { super(); this.inputs = [circumcenter, orthocenter, circumcircle]; this.recompute(); }
  recompute() {
    this.cx = (this.circumcenter.x + this.orthocenter.x) / 2;
    this.cy = (this.circumcenter.y + this.orthocenter.y) / 2;
    this.r = this.circumcircle.r / 2;
  }
}

// ── bisectors, medians, altitudes, tangents (B2) ────────────────────────────

export class PerpBisector extends GLine {
  constructor(public a: GPoint, public b: GPoint) { super(); this.inputs = [a, b]; this.recompute(); }
  recompute() {
    this.x0 = (this.a.x + this.b.x) / 2; this.y0 = (this.a.y + this.b.y) / 2;
    let dx = this.b.x - this.a.x, dy = this.b.y - this.a.y;
    const len = Math.hypot(dx, dy) || 1;
    this.dx = -dy / len; this.dy = dx / len;
  }
}

export class AngleBisector extends GLine {
  constructor(public a: GPoint, public vertex: GPoint, public b: GPoint) { super(); this.inputs = [a, vertex, b]; this.recompute(); }
  recompute() {
    const a0 = Math.atan2(this.a.y - this.vertex.y, this.a.x - this.vertex.x);
    const a1 = Math.atan2(this.b.y - this.vertex.y, this.b.x - this.vertex.x);
    let d = a1 - a0;
    while (d <= -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    const mid = a0 + d / 2;
    this.x0 = this.vertex.x; this.y0 = this.vertex.y;
    this.dx = Math.cos(mid); this.dy = Math.sin(mid);
  }
}

export class Median extends GLine {
  constructor(public vertex: GPoint, public a: GPoint, public b: GPoint) { super(); this.inputs = [vertex, a, b]; this.recompute(); }
  recompute() { this.setFromPoints(this.vertex.x, this.vertex.y, (this.a.x + this.b.x) / 2, (this.a.y + this.b.y) / 2); }
}

export class Altitude extends GLine {
  constructor(public vertex: GPoint, public opposite: GLine) { super(); this.inputs = [vertex, opposite]; this.recompute(); }
  recompute() { this.x0 = this.vertex.x; this.y0 = this.vertex.y; this.dx = -this.opposite.dy; this.dy = this.opposite.dx; }
}

export class TangentToCircle extends GLine {
  constructor(public circle: GCircle, public point: GPoint) { super(); this.inputs = [circle, point]; this.recompute(); }
  recompute() {
    let dx = this.point.x - this.circle.cx, dy = this.point.y - this.circle.cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    this.x0 = this.point.x; this.y0 = this.point.y;
    this.dx = -dy; this.dy = dx;
  }
}

export class TangentsFromPoint extends GObject {
  lines: [GLine, GLine] | null = null;
  ok = true;
  constructor(public circle: GCircle, public point: GPoint) { super(); this.inputs = [circle, point]; this.recompute(); }
  recompute() {
    const dx = this.point.x - this.circle.cx, dy = this.point.y - this.circle.cy;
    const d = Math.hypot(dx, dy);
    if (d <= this.circle.r + 1e-9) { this.ok = false; this.lines = null; return; }
    this.ok = true;
    const a = Math.atan2(dy, dx);
    const spread = Math.acos(this.circle.r / d);
    const mk = (ang: number): GLine => {
      const tx = this.circle.cx + this.circle.r * Math.cos(ang);
      const ty = this.circle.cy + this.circle.r * Math.sin(ang);
      const l = new GLine();
      l.x0 = tx; l.y0 = ty;
      let ddx = this.point.x - tx, ddy = this.point.y - ty;
      const len = Math.hypot(ddx, ddy) || 1;
      l.dx = ddx / len; l.dy = ddy / len;
      return l;
    };
    this.lines = [mk(a + spread), mk(a - spread)];
  }
}

// ── more circles (B3) ───────────────────────────────────────────────────────

export class CircleByDiameter extends GCircle {
  constructor(public a: GPoint, public b: GPoint) { super(); this.inputs = [a, b]; this.recompute(); }
  recompute() {
    this.cx = (this.a.x + this.b.x) / 2; this.cy = (this.a.y + this.b.y) / 2;
    this.r = Math.hypot(this.a.x - this.b.x, this.a.y - this.b.y) / 2;
  }
}

export class Incircle extends GCircle {
  constructor(public a: GPoint, public b: GPoint, public c: GPoint) { super(); this.inputs = [a, b, c]; this.recompute(); }
  recompute() {
    const { x: ax, y: ay } = this.a, { x: bx, y: by } = this.b, { x: cx, y: cy } = this.c;
    const sa = Math.hypot(bx - cx, by - cy), sb = Math.hypot(cx - ax, cy - ay), sc = Math.hypot(ax - bx, ay - by);
    const s = sa + sb + sc || 1;
    this.cx = (sa * ax + sb * bx + sc * cx) / s;
    this.cy = (sa * ay + sb * by + sc * cy) / s;
    const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    this.r = area / (s / 2);
  }
}

export class Excircle extends GCircle {
  constructor(public a: GPoint, public b: GPoint, public c: GPoint, public which: 0 | 1 | 2 = 0) { super(); this.inputs = [a, b, c]; this.recompute(); }
  recompute() {
    const { x: ax, y: ay } = this.a, { x: bx, y: by } = this.b, { x: cx, y: cy } = this.c;
    const sa = Math.hypot(bx - cx, by - cy), sb = Math.hypot(cx - ax, cy - ay), sc = Math.hypot(ax - bx, ay - by);
    const signs = [[-1, 1, 1], [1, -1, 1], [1, 1, -1]][this.which];
    const w = signs[0] * sa + signs[1] * sb + signs[2] * sc;
    if (Math.abs(w) < 1e-9) { this.r = 0; return; }
    this.cx = (signs[0] * sa * ax + signs[1] * sb * bx + signs[2] * sc * cx) / w;
    this.cy = (signs[0] * sa * ay + signs[1] * sb * by + signs[2] * sc * cy) / w;
    const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    const semi = (sa + sb + sc) / 2;
    const denom = [semi - sa, semi - sb, semi - sc][this.which];
    this.r = Math.abs(denom) > 1e-9 ? area / Math.abs(denom) : 0;
  }
}

// ── circle relations (B4) ───────────────────────────────────────────────────

export class RadicalAxis extends GLine {
  ok = true;
  constructor(public c1: GCircle, public c2: GCircle) { super(); this.inputs = [c1, c2]; this.recompute(); }
  recompute() {
    const { cx: x1, cy: y1, r: r1 } = this.c1, { cx: x2, cy: y2, r: r2 } = this.c2;
    const dx = x2 - x1, dy = y2 - y1;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) { this.ok = false; return; }
    this.ok = true;
    const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
    const px = x1 + a * dx / d, py = y1 + a * dy / d;
    this.x0 = px; this.y0 = py;
    this.dx = -dy / d; this.dy = dx / d;
  }
}

export class PolarLine extends GLine {
  constructor(public circle: GCircle, public point: GPoint) { super(); this.inputs = [circle, point]; this.recompute(); }
  recompute() {
    const { cx, cy, r } = this.circle;
    const px = this.point.x - cx, py = this.point.y - cy;
    const r2 = r * r;
    this.x0 = cx + r2 * px / (px * px + py * py || 1);
    this.y0 = cy + r2 * py / (px * px + py * py || 1);
    this.dx = -py; this.dy = px;
    const len = Math.hypot(this.dx, this.dy) || 1;
    this.dx /= len; this.dy /= len;
  }
}

export class PolePoint extends GPoint {
  constructor(public circle: GCircle, public line: GLine) { super(0, 0, false); this.inputs = [circle, line]; this.recompute(); }
  recompute() {
    const { cx, cy, r } = this.circle;
    const { x0, y0, dx, dy } = this.line;
    const nx = -(y0 - cy), ny = x0 - cx;
    const dot = nx * (-dy) + ny * dx;
    if (Math.abs(dot) < 1e-9) return;
    const t = ((x0 - cx) * (-dy) + (y0 - cy) * dx) / dot;
    const footX = x0 + (-dy) * t - cx, footY = y0 + dx * t - cy;
    const d2 = footX * footX + footY * footY || 1;
    this.x = cx + r * r * footX / d2;
    this.y = cy + r * r * footY / d2;
  }
}

export class CommonTangents extends GObject {
  lines: GLine[] = [];
  constructor(public c1: GCircle, public c2: GCircle) { super(); this.inputs = [c1, c2]; this.recompute(); }
  recompute() {
    this.lines = [];
    const { cx: x1, cy: y1, r: r1 } = this.c1, { cx: x2, cy: y2, r: r2 } = this.c2;
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
    if (d < 1e-9) return;
    const base = Math.atan2(dy, dx);
    const addPair = (cosA: number) => {
      if (Math.abs(cosA) > 1) return;
      const sinA = Math.sqrt(1 - cosA * cosA);
      for (const s of [sinA, -sinA]) {
        const nx = Math.cos(base) * cosA - Math.sin(base) * s;
        const ny = Math.sin(base) * cosA + Math.cos(base) * s;
        const l = new GLine();
        l.x0 = x1 + r1 * nx; l.y0 = y1 + r1 * ny;
        l.dx = -ny; l.dy = nx;
        this.lines.push(l);
      }
    };
    addPair((r1 - r2) / d);
    addPair((r1 + r2) / d);
  }
}

export class ApolloniusCircle extends GCircle {
  ok = true;
  constructor(public a: GPoint, public b: GPoint, public ratio: number) { super(); this.inputs = [a, b]; this.recompute(); }
  recompute() {
    const k = this.ratio;
    if (Math.abs(k - 1) < 1e-9) { this.ok = false; this.r = 0; return; }
    this.ok = true;
    const k2 = k * k;
    const { x: ax, y: ay } = this.a, { x: bx, y: by } = this.b;
    this.cx = (ax - k2 * bx) / (1 - k2);
    this.cy = (ay - k2 * by) / (1 - k2);
    this.r = k * Math.hypot(ax - bx, ay - by) / Math.abs(1 - k2);
  }
}

// ── conics (B5) ─────────────────────────────────────────────────────────────

export type ConicKind = 'ellipse' | 'parabola' | 'hyperbola' | 'degenerate';

export class GConic extends GObject {
  A = 0; B = 0; C = 0; D = 0; E = 0; F = 0;
  kind: ConicKind = 'degenerate';
  recompute() {}
  classify() {
    const disc = this.B * this.B - 4 * this.A * this.C;
    this.kind = disc < -1e-9 ? 'ellipse' : disc > 1e-9 ? 'hyperbola' : 'parabola';
  }
  sample(n: number): Vec2[] {
    const pts: Vec2[] = [];
    if (this.kind === 'ellipse') {
      const { cx, cy, rx, ry, rot } = this.ellipseParams();
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * 2 * Math.PI;
        const x = rx * Math.cos(t), y = ry * Math.sin(t);
        pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
      }
    } else if (this.kind === 'hyperbola') {
      const { cx, cy, rx, ry, rot } = this.ellipseParams();
      for (let i = 0; i <= n; i++) {
        const t = -3 + (6 * i) / n;
        const x = rx * Math.cosh(t), y = ry * Math.sinh(t);
        pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
        const x2 = -rx * Math.cosh(t);
        pts.push([cx + x2 * Math.cos(rot) - y * Math.sin(rot), cy + x2 * Math.sin(rot) + y * Math.cos(rot)]);
      }
    } else {
      const { cx, cy, p, rot } = this.parabolaParams();
      for (let i = 0; i <= n; i++) {
        const t = -5 + (10 * i) / n;
        const x = t * t * p, y = t;
        pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
      }
    }
    return pts;
  }
  protected ellipseParams() {
    const { A, B, C, D, E, F } = this;
    const det = B * B - 4 * A * C;
    const cx = (2 * C * D - B * E) / det;
    const cy = (2 * A * E - B * D) / det;
    const f = A * cx * cx + B * cx * cy + C * cy * cy + D * cx + E * cy + F;
    const disc = Math.sqrt((A - C) * (A - C) + B * B);
    const l1 = (A + C + disc) / 2, l2 = (A + C - disc) / 2;
    const rx = Math.sqrt(Math.abs(-f / l1)) || 0;
    const ry = Math.sqrt(Math.abs(-f / l2)) || 0;
    const rot = Math.abs(B) < 1e-12 ? (A < C ? 0 : Math.PI / 2) : Math.atan2(l1 - A, B);
    return { cx, cy, rx, ry, rot };
  }
  protected parabolaParams() {
    const { A, B, C, D, E, F } = this;
    const cx = -(B * E - 2 * C * D) / (B * B - 4 * A * C || 1);
    const cy = -(B * D - 2 * A * E) / (B * B - 4 * A * C || 1);
    const rot = Math.abs(B) < 1e-12 ? (Math.abs(A) < Math.abs(C) ? 0 : Math.PI / 2) : Math.atan2(-B, A - C) / 2;
    const p = 1 / (4 * (Math.abs(A) > Math.abs(C) ? A : C) || 1);
    return { cx, cy, p: Math.abs(p), rot };
  }
}

export class EllipseFromFoci extends GConic {
  constructor(public f1: GPoint, public f2: GPoint, public semiMajor: number) { super(); this.inputs = [f1, f2]; this.recompute(); }
  recompute() {
    const cx = (this.f1.x + this.f2.x) / 2, cy = (this.f1.y + this.f2.y) / 2;
    const c = Math.hypot(this.f2.x - this.f1.x, this.f2.y - this.f1.y) / 2;
    const a = Math.max(this.semiMajor, c + 1e-6);
    const b = Math.sqrt(a * a - c * c);
    const rot = Math.atan2(this.f2.y - this.f1.y, this.f2.x - this.f1.x);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    this.A = cos * cos / (a * a) + sin * sin / (b * b);
    this.B = 2 * cos * sin * (1 / (a * a) - 1 / (b * b));
    this.C = sin * sin / (a * a) + cos * cos / (b * b);
    this.D = -2 * this.A * cx - this.B * cy;
    this.E = -this.B * cx - 2 * this.C * cy;
    this.F = this.A * cx * cx + this.B * cx * cy + this.C * cy * cy - 1;
    this.kind = 'ellipse';
  }
  override sample(n: number): Vec2[] {
    const cx = (this.f1.x + this.f2.x) / 2, cy = (this.f1.y + this.f2.y) / 2;
    const c = Math.hypot(this.f2.x - this.f1.x, this.f2.y - this.f1.y) / 2;
    const a = Math.max(this.semiMajor, c + 1e-6);
    const b = Math.sqrt(a * a - c * c);
    const rot = Math.atan2(this.f2.y - this.f1.y, this.f2.x - this.f1.x);
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * 2 * Math.PI;
      const x = a * Math.cos(t), y = b * Math.sin(t);
      pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    return pts;
  }
}

export class ParabolaFromFocusDirectrix extends GConic {
  constructor(public focus: GPoint, public directrix: GLine) { super(); this.inputs = [focus, directrix]; this.recompute(); }
  recompute() {
    const { x0, y0, dx, dy } = this.directrix;
    const vx = this.focus.x - x0, vy = this.focus.y - y0;
    const t = vx * dx + vy * dy;
    const footX = x0 + dx * t, footY = y0 + dy * t;
    const p = Math.hypot(this.focus.x - footX, this.focus.y - footY) / 2;
    const vx2 = (this.focus.x + footX) / 2, vy2 = (this.focus.y + footY) / 2;
    const axDir = this.focus.x - footX, ayDir = this.focus.y - footY;
    const len = Math.hypot(axDir, ayDir) || 1;
    const ux = axDir / len, uy = ayDir / len;
    const cos = ux, sin = uy;
    this.A = sin * sin; this.B = -2 * sin * cos; this.C = cos * cos;
    this.D = -2 * this.A * vx2 - this.B * vy2 + cos / (2 * p || 1);
    this.E = -this.B * vx2 - 2 * this.C * vy2 + sin / (2 * p || 1);
    this.F = this.A * vx2 * vx2 + this.B * vx2 * vy2 + this.C * vy2 * vy2;
    this.kind = 'parabola';
  }
  override sample(n: number): Vec2[] {
    const { x0, y0, dx, dy } = this.directrix;
    const vx = this.focus.x - x0, vy = this.focus.y - y0;
    const t = vx * dx + vy * dy;
    const footX = x0 + dx * t, footY = y0 + dy * t;
    const vtxX = (this.focus.x + footX) / 2, vtxY = (this.focus.y + footY) / 2;
    const p = Math.hypot(this.focus.x - footX, this.focus.y - footY) / 2;
    const axDir = this.focus.x - footX, ayDir = this.focus.y - footY;
    const len = Math.hypot(axDir, ayDir) || 1;
    const ux = axDir / len, uy = ayDir / len;
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const s = -5 + (10 * i) / n;
      const along = s * s * p, perp = s * 2 * p;
      pts.push([vtxX + along * ux - perp * (-uy), vtxY + along * uy - perp * ux]);
    }
    return pts;
  }
}

export class HyperbolaFromFoci extends GConic {
  constructor(public f1: GPoint, public f2: GPoint, public semiMajor: number) { super(); this.inputs = [f1, f2]; this.recompute(); }
  recompute() {
    const cx = (this.f1.x + this.f2.x) / 2, cy = (this.f1.y + this.f2.y) / 2;
    const c = Math.hypot(this.f2.x - this.f1.x, this.f2.y - this.f1.y) / 2;
    const a = Math.min(this.semiMajor, c - 1e-6);
    const b = Math.sqrt(c * c - a * a);
    const rot = Math.atan2(this.f2.y - this.f1.y, this.f2.x - this.f1.x);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    this.A = cos * cos / (a * a) - sin * sin / (b * b);
    this.B = 2 * cos * sin * (1 / (a * a) + 1 / (b * b));
    this.C = sin * sin / (a * a) - cos * cos / (b * b);
    this.D = -2 * this.A * cx - this.B * cy;
    this.E = -this.B * cx - 2 * this.C * cy;
    this.F = this.A * cx * cx + this.B * cx * cy + this.C * cy * cy - 1;
    this.kind = 'hyperbola';
  }
  override sample(n: number): Vec2[] {
    const cx = (this.f1.x + this.f2.x) / 2, cy = (this.f1.y + this.f2.y) / 2;
    const c = Math.hypot(this.f2.x - this.f1.x, this.f2.y - this.f1.y) / 2;
    const a = Math.min(this.semiMajor, c - 1e-6);
    const b = Math.sqrt(c * c - a * a);
    const rot = Math.atan2(this.f2.y - this.f1.y, this.f2.x - this.f1.x);
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = -3 + (6 * i) / n;
      for (const sign of [1, -1]) {
        const x = sign * a * Math.cosh(t), y = b * Math.sinh(t);
        pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
      }
    }
    return pts;
  }
}

export class ConicThrough5Points extends GConic {
  ok = true;
  constructor(public pts: [GPoint, GPoint, GPoint, GPoint, GPoint]) { super(); this.inputs = [...pts]; this.recompute(); }
  recompute() {
    const m = this.pts.map(p => [p.x * p.x, p.x * p.y, p.y * p.y, p.x, p.y]);
    const n = 5;
    const aug: number[][] = m.map((row, i) => [...row, -1]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[piv][col])) piv = r;
      if (Math.abs(aug[piv][col]) < 1e-12) { this.ok = false; return; }
      [aug[col], aug[piv]] = [aug[piv], aug[col]];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = aug[r][col] / aug[col][col];
        for (let c = col; c <= n; c++) aug[r][c] -= f * aug[col][c];
      }
    }
    this.ok = true;
    this.A = aug[0][5] / aug[0][0]; this.B = aug[1][5] / aug[1][1]; this.C = aug[2][5] / aug[2][2];
    this.D = aug[3][5] / aug[3][3]; this.E = aug[4][5] / aug[4][4]; this.F = 1;
    this.classify();
  }
}

// ── transforms (B6) ─────────────────────────────────────────────────────────

export class RotatedPoint extends GPoint {
  constructor(public p: GPoint, public center: GPoint, public angle: number) { super(0, 0, false); this.inputs = [p, center]; this.recompute(); }
  recompute() {
    const dx = this.p.x - this.center.x, dy = this.p.y - this.center.y;
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    this.x = this.center.x + dx * cos - dy * sin;
    this.y = this.center.y + dx * sin + dy * cos;
  }
}

export class TranslatedPoint extends GPoint {
  constructor(public p: GPoint, public dx: number, public dy: number) { super(0, 0, false); this.inputs = [p]; this.recompute(); }
  recompute() { this.x = this.p.x + this.dx; this.y = this.p.y + this.dy; }
}

export class DilatedPoint extends GPoint {
  constructor(public p: GPoint, public center: GPoint, public scale: number) { super(0, 0, false); this.inputs = [p, center]; this.recompute(); }
  recompute() {
    this.x = this.center.x + (this.p.x - this.center.x) * this.scale;
    this.y = this.center.y + (this.p.y - this.center.y) * this.scale;
  }
}

// ── inversion & Möbius (B7) ─────────────────────────────────────────────────

export class CircleInversion extends GPoint {
  ok = true;
  constructor(public p: GPoint, public circle: GCircle) { super(0, 0, false); this.inputs = [p, circle]; this.recompute(); }
  recompute() {
    const dx = this.p.x - this.circle.cx, dy = this.p.y - this.circle.cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-12) { this.ok = false; return; }
    this.ok = true;
    const k = this.circle.r * this.circle.r / d2;
    this.x = this.circle.cx + dx * k;
    this.y = this.circle.cy + dy * k;
  }
}

export class MobiusPoint extends GPoint {
  ok = true;
  constructor(public p: GPoint, public a: Vec2, public b: Vec2, public c: Vec2, public d: Vec2) { super(0, 0, false); this.inputs = [p]; this.recompute(); }
  recompute() {
    const [ar, ai] = this.a, [br, bi] = this.b, [cr, ci] = this.c, [dr, di] = this.d;
    const zx = this.p.x, zy = this.p.y;
    const nzx = ar * zx - ai * zy + br, nzy = ar * zy + ai * zx + bi;
    const dzx = cr * zx - ci * zy + dr, dzy = cr * zy + ci * zx + di;
    const den = dzx * dzx + dzy * dzy;
    if (den < 1e-12) { this.ok = false; return; }
    this.ok = true;
    this.x = (nzx * dzx + nzy * dzy) / den;
    this.y = (nzy * dzx - nzx * dzy) / den;
  }
}

export function invertCircle(c: GCircle, inv: GCircle): GCircle | GLine {
  const dx = c.cx - inv.cx, dy = c.cy - inv.cy;
  const d2 = dx * dx + dy * dy;
  const r2 = inv.r * inv.r;
  if (Math.abs(d2 - c.r * c.r) < 1e-9) {
    const l = new GLine();
    const k = r2 / (2 * (d2 - c.r * c.r) || 1);
    l.x0 = inv.cx + dx * k; l.y0 = inv.cy + dy * k;
    l.dx = -dy; l.dy = dx;
    const len = Math.hypot(l.dx, l.dy) || 1;
    l.dx /= len; l.dy /= len;
    return l;
  }
  const denom = d2 - c.r * c.r;
  const newCx = inv.cx + r2 * dx / denom;
  const newCy = inv.cy + r2 * dy / denom;
  const newR = r2 * c.r / Math.abs(denom);
  const out = new GCircle();
  out.cx = newCx; out.cy = newCy; out.r = newR;
  return out;
}

// ── trace & locus (B8) ──────────────────────────────────────────────────────

export class TraceRecorder {
  trail: Vec2[] = [];
  constructor(public maxLen = 500) {}
  record(x: number, y: number) {
    this.trail.push([x, y]);
    if (this.trail.length > this.maxLen) this.trail.shift();
  }
  clear() { this.trail.length = 0; }
}

export class LocusCurve extends GObject {
  points: Vec2[] = [];
  constructor(public driver: GPoint, public dependent: GPoint, public graph: { update(): void }, public samples = 200) { super(); this.inputs = [driver, dependent]; }
  recompute() {}
  sweep(path: Vec2[]) {
    this.points = [];
    const saved: Vec2 = [this.driver.x, this.driver.y];
    for (const [px, py] of path) {
      this.driver.set(px, py);
      this.graph.update();
      this.points.push([this.dependent.x, this.dependent.y]);
    }
    this.driver.set(saved[0], saved[1]);
    this.graph.update();
  }
  sweepCircle(cx: number, cy: number, r: number) {
    const path: Vec2[] = [];
    for (let i = 0; i <= this.samples; i++) {
      const t = (i / this.samples) * 2 * Math.PI;
      path.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    this.sweep(path);
  }
  sweepLine(x0: number, y0: number, x1: number, y1: number) {
    const path: Vec2[] = [];
    for (let i = 0; i <= this.samples; i++) {
      const t = i / this.samples;
      path.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
    this.sweep(path);
  }
}

// ── drag constraints (B9) ───────────────────────────────────────────────────

export class HLockedPoint extends GPoint {
  constructor(x: number, y: number) { super(x, y, true); }
  override moveTo(wx: number, _wy: number) { this.x = wx; }
}

export class VLockedPoint extends GPoint {
  constructor(x: number, y: number) { super(x, y, true); }
  override moveTo(_wx: number, wy: number) { this.y = wy; }
}

export class GridSnappedPoint extends GPoint {
  constructor(x: number, y: number, public gridSize = 1) { super(x, y, true); }
  override moveTo(wx: number, wy: number) {
    this.x = Math.round(wx / this.gridSize) * this.gridSize;
    this.y = Math.round(wy / this.gridSize) * this.gridSize;
  }
}

export class AngleSnappedPoint extends GPoint {
  constructor(x: number, y: number, public origin: GPoint, public snapAngle = Math.PI / 12) { super(x, y, true); }
  override moveTo(wx: number, wy: number) {
    const dx = wx - this.origin.x, dy = wy - this.origin.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.round(Math.atan2(dy, dx) / this.snapAngle) * this.snapAngle;
    this.x = this.origin.x + dist * Math.cos(ang);
    this.y = this.origin.y + dist * Math.sin(ang);
  }
}

// ── measurements (B10) ──────────────────────────────────────────────────────

export class LengthMeasure extends GObject {
  value = 0; text = '';
  constructor(public a: GPoint, public b: GPoint, public precision = 2) { super(); this.inputs = [a, b]; this.recompute(); }
  recompute() {
    this.value = Math.hypot(this.a.x - this.b.x, this.a.y - this.b.y);
    this.text = this.value.toFixed(this.precision);
  }
}

export class AngleMeasure extends GObject {
  degrees = 0; text = '';
  constructor(public a: GPoint, public vertex: GPoint, public b: GPoint, public precision = 1) { super(); this.inputs = [a, vertex, b]; this.recompute(); }
  recompute() {
    const a0 = Math.atan2(this.a.y - this.vertex.y, this.a.x - this.vertex.x);
    const a1 = Math.atan2(this.b.y - this.vertex.y, this.b.x - this.vertex.x);
    let d = a1 - a0;
    while (d <= -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    this.degrees = Math.abs(d) * 180 / Math.PI;
    this.text = this.degrees.toFixed(this.precision) + '°';
  }
}

export class AreaMeasure extends GObject {
  value = 0; text = '';
  constructor(public pts: GPoint[], public precision = 2) { super(); this.inputs = [...pts]; this.recompute(); }
  recompute() {
    let area = 0;
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += this.pts[i].x * this.pts[j].y - this.pts[j].x * this.pts[i].y;
    }
    this.value = Math.abs(area) / 2;
    this.text = this.value.toFixed(this.precision);
  }
}

export class SlopeMeasure extends GObject {
  value = 0; text = ''; infinite = false;
  constructor(public a: GPoint, public b: GPoint, public precision = 2) { super(); this.inputs = [a, b]; this.recompute(); }
  recompute() {
    const dx = this.b.x - this.a.x;
    if (Math.abs(dx) < 1e-9) { this.infinite = true; this.text = '∞'; return; }
    this.infinite = false;
    this.value = (this.b.y - this.a.y) / dx;
    this.text = this.value.toFixed(this.precision);
  }
}

export class RadiusMeasure extends GObject {
  value = 0; text = '';
  constructor(public circle: GCircle, public precision = 2) { super(); this.inputs = [circle]; this.recompute(); }
  recompute() { this.value = this.circle.r; this.text = this.circle.r.toFixed(this.precision); }
}

// ── construction protocol (B11) ─────────────────────────────────────────────

export interface ConstructionStep {
  description: string;
  objects: GObject[];
}

export class ConstructionProtocol {
  steps: ConstructionStep[] = [];
  private visible = new Set<GObject>();
  currentStep = -1;

  addStep(description: string, objects: GObject[]) {
    this.steps.push({ description, objects });
  }
  reset() { this.currentStep = -1; this.visible.clear(); }
  stepForward(): ConstructionStep | null {
    if (this.currentStep >= this.steps.length - 1) return null;
    this.currentStep++;
    for (const o of this.steps[this.currentStep].objects) this.visible.add(o);
    return this.steps[this.currentStep];
  }
  stepBack(): ConstructionStep | null {
    if (this.currentStep < 0) return null;
    for (const o of this.steps[this.currentStep].objects) this.visible.delete(o);
    this.currentStep--;
    return this.currentStep >= 0 ? this.steps[this.currentStep] : null;
  }
  jumpTo(step: number) {
    this.reset();
    for (let i = 0; i <= Math.min(step, this.steps.length - 1); i++) this.stepForward();
  }
  isVisible(o: GObject) { return this.visible.has(o); }
  get progress() { return this.steps.length ? (this.currentStep + 1) / this.steps.length : 0; }
}

// ── regular polygon (B12) ───────────────────────────────────────────────────

export class RegularPolygon extends GObject {
  vertices: Vec2[] = [];
  constructor(public center: GPoint, public radius: number, public n = 6, public rotation = 0) { super(); this.inputs = [center]; this.recompute(); }
  recompute() {
    this.vertices = [];
    const n = Math.max(3, Math.round(this.n));
    for (let i = 0; i < n; i++) {
      const t = this.rotation + (i / n) * 2 * Math.PI;
      this.vertices.push([this.center.x + this.radius * Math.cos(t), this.center.y + this.radius * Math.sin(t)]);
    }
  }
  get perimeter() {
    const n = this.vertices.length;
    let p = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      p += Math.hypot(this.vertices[j][0] - this.vertices[i][0], this.vertices[j][1] - this.vertices[i][1]);
    }
    return p;
  }
  get area() {
    const n = this.vertices.length;
    let a = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += this.vertices[i][0] * this.vertices[j][1] - this.vertices[j][0] * this.vertices[i][1];
    }
    return Math.abs(a) / 2;
  }
}
