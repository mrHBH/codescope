// ── windgraph · Mobject model (Phase 1) ──────────────────────────────────────
// A Mobject is the animatable/renderable object. It produces local-space draw
// ops (filled contours, stroked paths, text); `emit` composes transforms down
// the tree and renders each op through the stroke/fill engine + windfoil text.

import { type Aff, identity, mul, apply, fromTRS, scaleOf } from './affine';
import { strokeInto, strokeQuadPath, fillQuads, type StrokeStyle, type Pt } from '../stroke/stroke';
import { layoutStr, tw } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';

export interface RenderCtx { font: FontFace; atlas: any; inst: number[]; crv: number[]; rws: number[]; }

export interface FillOp { kind: 'fill'; quads: number[]; color: number[]; }
export interface StrokeOp { kind: 'stroke'; points?: Pt[]; quads?: number[]; closed?: boolean; style: StrokeStyle; color: number[]; }
export interface TextOp { kind: 'text'; text: string; x: number; y: number; size: number; color: number[]; anchor?: 'start' | 'middle' | 'end'; }
export type DrawOp = FillOp | StrokeOp | TextOp;

export type Updater = (m: Mobject, t: number, dt: number) => void;

export abstract class Mobject {
  position: [number, number] = [0, 0];
  rotation = 0;
  scaleX = 1;
  scaleY = 1;
  opacity = 1;
  visible = true;
  /** Draw-on fraction 0..1 (Create/Draw): trims strokes by arc length, fades fills. */
  reveal = 1;
  /** Per-frame callbacks (dependent animation); run by the Scene each tick. */
  updaters: Updater[] = [];
  children: Mobject[] = [];
  private _ops: DrawOp[] | null = null;

  /** Subclasses produce their local-space geometry here. */
  protected abstract build(): DrawOp[];

  /** Call when a parameter changes so geometry is rebuilt on next emit. */
  markDirty() { this._ops = null; }

  add(...m: Mobject[]): this { this.children.push(...m); return this; }

  addUpdater(fn: Updater): this { this.updaters.push(fn); return this; }
  clearUpdaters(): this { this.updaters.length = 0; return this; }

  /** Recursively run every updater (Scene drives this before emit). */
  tick(t: number, dt: number) {
    for (const u of this.updaters) u(this, t, dt);
    for (const c of this.children) c.tick(t, dt);
  }

  localMatrix(): Aff { return fromTRS(this.position[0], this.position[1], this.rotation, this.scaleX, this.scaleY); }

  moveTo(x: number, y: number): this { this.position = [x, y]; return this; }

  emit(ctx: RenderCtx, parent: Aff = identity()) {
    if (!this.visible || this.opacity <= 0.0005 || this.reveal <= 0.0005) {
      // Still descend so children with their own opacity render (a hidden group
      // is fully hidden though).
      if (!this.visible) return;
    }
    const m = mul(parent, this.localMatrix());
    if (!this._ops) this._ops = this.build();
    for (const op of this._ops) emitOp(ctx, op, m, this.opacity, this.reveal);
    for (const c of this.children) c.emit(ctx, m);
  }
}

function withAlpha(c: number[], a: number): number[] { return a >= 1 ? c : [c[0], c[1], c[2], c[3] * a]; }
function tp(m: Aff, p: Pt): Pt { return apply(m, p[0], p[1]); }
function tq(m: Aff, quads: number[]): number[] { const o: number[] = []; for (let i = 0; i < quads.length; i += 2) { const [x, y] = apply(m, quads[i], quads[i + 1]); o.push(x, y); } return o; }

// Flatten a flat quadratic-Bézier path [x0,y0,cx,cy,x1,y1, ...] into a polyline.
function flattenQuads(quads: number[], stepsPer = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < quads.length; i += 6) {
    const x0 = quads[i], y0 = quads[i + 1], cx = quads[i + 2], cy = quads[i + 3], x1 = quads[i + 4], y1 = quads[i + 5];
    if (i === 0) out.push([x0, y0]);
    for (let s = 1; s <= stepsPer; s++) {
      const t = s / stepsPer, u = 1 - t;
      out.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
    }
  }
  return out;
}

// Trim a polyline to the first `frac` of its total arc length (for draw-on reveal).
function trimPolyline(pts: Pt[], frac: number): Pt[] {
  if (frac >= 1 || pts.length < 2) return pts;
  if (frac <= 0) return [];
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  const target = total * frac;
  const out: Pt[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = seg[i - 1];
    if (acc + d >= target) {
      const t = d < 1e-9 ? 0 : (target - acc) / d;
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
      break;
    }
    out.push(pts[i]); acc += d;
  }
  return out;
}

function emitOp(ctx: RenderCtx, op: DrawOp, m: Aff, opacity: number, reveal = 1) {
  const { inst, crv, rws } = ctx;
  if (op.kind === 'fill') {
    // Fills fade in during a draw-on reveal (clipping a fill is ill-defined).
    fillQuads(tq(m, op.quads), withAlpha(op.color, opacity * reveal), inst, crv, rws);
  } else if (op.kind === 'stroke') {
    const col = withAlpha(op.color, opacity);
    // width follows the transform scale so stroke weight is consistent in world units
    const style: StrokeStyle = { ...op.style, width: op.style.width * scaleOf(m) };
    if (reveal < 1) {
      // Draw-on: flatten to a polyline and trim to `reveal` of the arc length.
      const base = op.quads ? flattenQuads(op.quads) : (op.points ?? []);
      const world = base.map((p) => tp(m, p));
      const trimmed = trimPolyline(world, reveal);
      if (trimmed.length >= 2) strokeInto(trimmed, { ...style, cap: op.style.cap ?? 'round' }, col, inst, crv, rws);
    } else if (op.quads) { const q: number[] = []; strokeQuadPath(tq(m, op.quads), style, op.closed ?? false, q); fillQuads(q, col, inst, crv, rws); }
    else if (op.points) { strokeInto(op.points.map((p) => tp(m, p)), style, col, inst, crv, rws); }
  } else if (op.kind === 'text') {
    const s = scaleOf(m);
    let [x, y] = apply(m, op.x, op.y);
    if (op.anchor && op.anchor !== 'start') {
      const w = tw(op.text, ctx.font, op.size * s);
      x -= op.anchor === 'middle' ? w / 2 : w;
    }
    layoutStr(inst, op.text, withAlpha(op.color, opacity * reveal), ctx.atlas.table, ctx.font, { x, y, size: op.size * s });
  }
}

/** A plain container that only composes transforms over its children. */
export class Group extends Mobject {
  protected build(): DrawOp[] { return []; }
}
