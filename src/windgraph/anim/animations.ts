// ── windgraph · animations (Phase 4) ─────────────────────────────────────────
// Time-based animations that drive Mobject parameters. Each Animation is seeked
// with an ABSOLUTE local time (seconds from its own start) so the timeline is
// deterministic and scrub-safe: state = f(t), never an accumulation that can
// drift or pop. `onBegin` captures the pre-animation state exactly once.

import type { Mobject } from '../mobject/mobject';
import type { Pt } from '../stroke/stroke';
import { type Easing, clamp01, smootherstep, easeOutCubic } from './easing';

export interface AnimOpts { duration?: number; easing?: Easing; }

export abstract class Animation {
  duration: number;
  easing: Easing;
  target: Mobject;
  private begun = false;
  private done = false;

  constructor(target: Mobject, opts: AnimOpts = {}) {
    this.target = target;
    this.duration = opts.duration ?? 1;
    this.easing = opts.easing ?? smootherstep;
  }

  protected onBegin() {}
  protected abstract apply(a: number): void;
  protected onFinish() {}

  /** Reset so the animation can be replayed from scratch (loop). */
  reset() { this.begun = false; this.done = false; }

  begin() { if (!this.begun) { this.begun = true; this.onBegin(); } }

  /** Seek to absolute local time (seconds from this animation's start). */
  seek(localT: number) {
    if (localT < 0) return;            // hasn't started yet — leave target alone
    this.begin();
    const raw = this.duration <= 0 ? 1 : clamp01(localT / this.duration);
    this.apply(this.easing(raw));
    if (raw >= 1 && !this.done) { this.done = true; this.onFinish(); }
  }
}

// ── fades ────────────────────────────────────────────────────────────────
export class FadeIn extends Animation {
  private from = 0;
  protected onBegin() { this.from = 0; this.target.visible = true; this.target.opacity = 0; }
  protected apply(a: number) { this.target.opacity = this.from + (1 - this.from) * a; }
}

export class FadeOut extends Animation {
  private from = 1;
  protected onBegin() { this.from = this.target.opacity; }
  protected apply(a: number) { this.target.opacity = this.from * (1 - a); }
  protected onFinish() { this.target.visible = false; }
}

// ── draw-on (Create) ───────────────────────────────────────────────────────
export class Create extends Animation {
  constructor(target: Mobject, opts: AnimOpts = {}) { super(target, { easing: opts.easing ?? easeOutCubic, ...opts }); }
  protected onBegin() { this.target.visible = true; this.target.reveal = 0; this.target.opacity = 1; }
  protected apply(a: number) { this.target.reveal = a; }
  protected onFinish() { this.target.reveal = 1; }
}

// ── transforms ─────────────────────────────────────────────────────────────
export class Shift extends Animation {
  private start: [number, number] = [0, 0];
  constructor(target: Mobject, private dx: number, private dy: number, opts: AnimOpts = {}) { super(target, opts); }
  protected onBegin() { this.start = [this.target.position[0], this.target.position[1]]; }
  protected apply(a: number) { this.target.position = [this.start[0] + this.dx * a, this.start[1] + this.dy * a]; }
}

export class MoveTo extends Animation {
  private start: [number, number] = [0, 0];
  constructor(target: Mobject, private x: number, private y: number, opts: AnimOpts = {}) { super(target, opts); }
  protected onBegin() { this.start = [this.target.position[0], this.target.position[1]]; }
  protected apply(a: number) { this.target.position = [this.start[0] + (this.x - this.start[0]) * a, this.start[1] + (this.y - this.start[1]) * a]; }
}

export class ScaleTo extends Animation {
  private sx = 1; private sy = 1;
  constructor(target: Mobject, private fx: number, private fy: number = fx, opts: AnimOpts = {}) { super(target, opts); }
  protected onBegin() { this.sx = this.target.scaleX; this.sy = this.target.scaleY; }
  protected apply(a: number) { this.target.scaleX = this.sx + (this.fx - this.sx) * a; this.target.scaleY = this.sy + (this.fy - this.sy) * a; }
}

export class Rotate extends Animation {
  private start = 0;
  constructor(target: Mobject, private dAngle: number, opts: AnimOpts = {}) { super(target, opts); }
  protected onBegin() { this.start = this.target.rotation; }
  protected apply(a: number) { this.target.rotation = this.start + this.dAngle * a; }
}

// A mobject exposing an editable polyline (for morph / move-along-path).
export interface HasPoints extends Mobject { points: Pt[]; markDirty(): void; }

export class MoveAlongPath extends Animation {
  constructor(target: Mobject, private path: Pt[], opts: AnimOpts = {}) { super(target, opts); }
  protected apply(a: number) { const p = pointAtFraction(this.path, a); this.target.position = [p[0], p[1]]; }
}

// Morph one polyline mobject's points into another's (arc-length correspondence).
export class Transform extends Animation {
  private a0: Pt[] = []; private b0: Pt[] = [];
  constructor(target: HasPoints, private dest: Pt[], opts: AnimOpts = {}) { super(target, opts); }
  protected onBegin() {
    const src = (this.target as HasPoints).points;
    const n = Math.max(src.length, this.dest.length, 2);
    this.a0 = resample(src, n);
    this.b0 = resample(this.dest, n);
  }
  protected apply(a: number) {
    const t = this.target as HasPoints;
    const out: Pt[] = new Array(this.a0.length);
    for (let i = 0; i < this.a0.length; i++) {
      out[i] = [this.a0[i][0] + (this.b0[i][0] - this.a0[i][0]) * a, this.a0[i][1] + (this.b0[i][1] - this.a0[i][1]) * a];
    }
    t.points = out; t.markDirty();
  }
}

// ── path utilities ─────────────────────────────────────────────────────────
export function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]] as Pt);
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(total); }
  if (total < 1e-12) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]] as Pt);
  const out: Pt[] = [];
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    while (seg < pts.length - 2 && cum[seg + 1] < target) seg++;
    const t = (target - cum[seg]) / Math.max(cum[seg + 1] - cum[seg], 1e-12);
    out.push([pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t, pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t]);
  }
  return out;
}

export function pointAtFraction(pts: Pt[], frac: number): Pt {
  if (pts.length === 0) return [0, 0];
  if (pts.length === 1) return pts[0];
  frac = clamp01(frac);
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  if (total < 1e-12) return pts[0];
  const target = total * frac;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = seg[i - 1];
    if (acc + d >= target) { const t = d < 1e-9 ? 0 : (target - acc) / d; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
    acc += d;
  }
  return pts[pts.length - 1];
}
