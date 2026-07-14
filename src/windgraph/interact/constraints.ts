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
