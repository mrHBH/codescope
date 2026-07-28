// ── windgraph · Mobject model (Phase 1) ──────────────────────────────────────
// A Mobject is the animatable/renderable object. It produces local-space draw
// ops (filled contours, stroked paths, text); `emit` composes transforms down
// the tree and renders each op through the stroke/fill engine + windfoil text.

import { type Aff, identity, mul, apply, fromTRS, scaleOf } from './affine';
import { strokeInto, strokeQuadPath, fillQuads, type StrokeStyle, type Pt } from '../stroke/stroke';
import { layoutStr, tw } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';

// `xf` (optional) is a parallel per-instance 3D-transform buffer in the shader's
// `fxXforms` layout (8 floats/instance: rotX, rotY, z, scale, qx, qy, qz, qw).
// When present, emit writes the mobject's accumulated elevation/faceTilt into it
// so elevated content rises in the orbit camera WITHOUT the IDE FX system (D10).
export interface RenderCtx { font: FontFace; atlas: any; inst: number[]; crv: number[]; rws: number[]; xf?: number[]; }

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
  /** Per-instance 3D (D10, animatable): elevation lifts the whole mobject along z;
   *  faceTilt rotates it about the x axis (toward a tilted camera); extrude is the
   *  prism height for primitives that support it (Polygon/Circle). Zero at rest. */
  elevation = 0;
  faceTilt = 0;
  extrude = 0;
  /** Cast an analytic contact shadow on the ground plane (task 2.5). */
  castShadow = false;
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

  emit(ctx: RenderCtx, parent: Aff = identity(), pz = 0, prx = 0, pry = 0) {
    if (!this.visible || this.opacity <= 0.0005 || this.reveal <= 0.0005) {
      // Still descend so children with their own opacity render (a hidden group
      // is fully hidden though).
      if (!this.visible) return;
    }
    const m = mul(parent, this.localMatrix());
    // Per-instance 3D accumulates down the tree (a group's elevation lifts its
    // children too); z is additive, faceTilt composes about x.
    const z = pz + this.elevation;
    const rx = prx + this.faceTilt;
    const ry = pry;
    if (!this._ops) this._ops = this.build();
    for (const op of this._ops) emitOp(ctx, op, m, this.opacity, this.reveal, z, rx, ry);
    for (const c of this.children) c.emit(ctx, m, z, rx, ry);
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

// Pad ctx.xf to cover instances [i0, i1) and, when the mobject is elevated/tilted,
// write its (rotX, rotY, z, scale) into the shader's fxXforms layout (Euler path;
// quaternion slots stay 0 → the shader falls to Euler when |A.xyz| > 1e-6). Flat
// instances get zeros (a no-op transform even with fxActive on).
function writeXf(xf: number[], i0: number, i1: number, z: number, rx: number, ry: number) {
  const need = i1 * 8;
  while (xf.length < need) xf.push(0);
  if (z === 0 && rx === 0 && ry === 0) return;
  for (let k = i0; k < i1; k++) {
    const b = k * 8;
    xf[b] = rx; xf[b + 1] = ry; xf[b + 2] = z; xf[b + 3] = 1;
  }
}

function emitOp(ctx: RenderCtx, op: DrawOp, m: Aff, opacity: number, reveal = 1, z = 0, rx = 0, ry = 0) {
  const { inst, crv, rws } = ctx;
  const i0 = inst.length >> 4;
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
  if (ctx.xf) writeXf(ctx.xf, i0, inst.length >> 4, z, rx, ry);
}

/** A plain container that only composes transforms over its children. */
export class Group extends Mobject {
  protected build(): DrawOp[] { return []; }
}
