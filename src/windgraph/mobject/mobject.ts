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

export abstract class Mobject {
  position: [number, number] = [0, 0];
  rotation = 0;
  scaleX = 1;
  scaleY = 1;
  opacity = 1;
  visible = true;
  children: Mobject[] = [];
  private _ops: DrawOp[] | null = null;

  /** Subclasses produce their local-space geometry here. */
  protected abstract build(): DrawOp[];

  /** Call when a parameter changes so geometry is rebuilt on next emit. */
  markDirty() { this._ops = null; }

  add(...m: Mobject[]): this { this.children.push(...m); return this; }

  localMatrix(): Aff { return fromTRS(this.position[0], this.position[1], this.rotation, this.scaleX, this.scaleY); }

  moveTo(x: number, y: number): this { this.position = [x, y]; return this; }

  emit(ctx: RenderCtx, parent: Aff = identity()) {
    if (!this.visible) return;
    const m = mul(parent, this.localMatrix());
    if (!this._ops) this._ops = this.build();
    for (const op of this._ops) emitOp(ctx, op, m, this.opacity);
    for (const c of this.children) c.emit(ctx, m);
  }
}

function withAlpha(c: number[], a: number): number[] { return a >= 1 ? c : [c[0], c[1], c[2], c[3] * a]; }
function tp(m: Aff, p: Pt): Pt { return apply(m, p[0], p[1]); }
function tq(m: Aff, quads: number[]): number[] { const o: number[] = []; for (let i = 0; i < quads.length; i += 2) { const [x, y] = apply(m, quads[i], quads[i + 1]); o.push(x, y); } return o; }

function emitOp(ctx: RenderCtx, op: DrawOp, m: Aff, opacity: number) {
  const { inst, crv, rws } = ctx;
  if (op.kind === 'fill') {
    fillQuads(tq(m, op.quads), withAlpha(op.color, opacity), inst, crv, rws);
  } else if (op.kind === 'stroke') {
    const col = withAlpha(op.color, opacity);
    // width follows the transform scale so stroke weight is consistent in world units
    const style: StrokeStyle = { ...op.style, width: op.style.width * scaleOf(m) };
    if (op.quads) { const q: number[] = []; strokeQuadPath(tq(m, op.quads), style, op.closed ?? false, q); fillQuads(q, col, inst, crv, rws); }
    else if (op.points) { strokeInto(op.points.map((p) => tp(m, p)), style, col, inst, crv, rws); }
  } else if (op.kind === 'text') {
    const s = scaleOf(m);
    let [x, y] = apply(m, op.x, op.y);
    if (op.anchor && op.anchor !== 'start') {
      const w = tw(op.text, ctx.font, op.size * s);
      x -= op.anchor === 'middle' ? w / 2 : w;
    }
    layoutStr(inst, op.text, withAlpha(op.color, opacity), ctx.atlas.table, ctx.font, { x, y, size: op.size * s });
  }
}

/** A plain container that only composes transforms over its children. */
export class Group extends Mobject {
  protected build(): DrawOp[] { return []; }
}
