// ── windgraph · geometry primitives (Phase 1) ────────────────────────────────
// Concrete Mobjects. Each builds local-space draw ops; the Mobject transform
// (position/rotation/scale, composed through groups) places them in the world.

import { Mobject, type DrawOp, type RenderCtx } from './mobject';
import { type Aff, identity, mul, apply, scaleOf } from './affine';
import { circleQuads, arcQuads, polygonQuads, type Pt, type StrokeStyle } from '../stroke/stroke';
import { emitPrism } from '../space3d/extrude';
import { orbitPolar, isEnabled } from '../../camera/orbit';
import { MathTex } from '../math/mathtex';

const DEFAULT_STROKE = 3;

export interface StrokeProps { color: number[]; width?: number; cap?: StrokeStyle['cap']; join?: StrokeStyle['join']; dash?: number[]; }
export interface FillProps { color: number[]; }

function stroke(props: StrokeProps): StrokeStyle & { color: number[] } {
  return { color: props.color, width: props.width ?? DEFAULT_STROKE, cap: props.cap ?? 'round', join: props.join ?? 'round', dash: props.dash };
}

// Near top-down the 3D body's mesh top cap is flat-on and would alias a curved
// silhouette (cylinder) at deep zoom, so we overlay the razor-sharp ANALYTIC top
// there (no wall is visible to seam with). Once tilted, the closed mesh solid takes
// over entirely — a flat-colored 3D top gains nothing from the coverage integral,
// and the hybrid was the source of the analytic/mesh silhouette seam (D16 round 4).
function nearTopDown(): boolean { return !isEnabled() || orbitPolar() < 0.06; }

// The analytic top is lifted this many world px above the mesh wall top so it always
// wins the depth test at the shared silhouette (camera is above the horizon, so a
// higher point is nearer). 1.5px is invisible against a 100px extrusion but kills
// the coplanar z-fight sliver. Applied to the extruded-text top (the box/cylinder
// tops are mesh caps when tilted, so they need no plug).
const EXTRUDE_PLUG_EPS = 1.5;

// ── points ───────────────────────────────────────────────────────────────
export class Dot extends Mobject {
  constructor(x: number, y: number, public radius = 5, public color = [0.9, 0.92, 0.98, 1]) { super(); this.position = [x, y]; }
  protected build(): DrawOp[] { return [{ kind: 'fill', quads: circleQuads(0, 0, this.radius, 20), color: this.color }]; }
}

// ── lines ────────────────────────────────────────────────────────────────
export class Segment extends Mobject {
  constructor(public a: Pt, public b: Pt, public props: StrokeProps) { super(); }
  protected build(): DrawOp[] { const s = stroke(this.props); return [{ kind: 'stroke', points: [this.a, this.b], style: s, color: this.props.color }]; }
}

export class Polyline extends Mobject {
  constructor(public points: Pt[], public props: StrokeProps) { super(); }
  protected build(): DrawOp[] { const s = stroke(this.props); return [{ kind: 'stroke', points: this.points, style: s, color: this.props.color }]; }
}

export class Polygon extends Mobject {
  constructor(public points: Pt[], public props: StrokeProps, public fill?: FillProps) { super(); }
  protected build(): DrawOp[] {
    const ops: DrawOp[] = [];
    if (this.fill) ops.push({ kind: 'fill', quads: polygonQuads(this.points, true), color: this.fill.color });
    const closed = [...this.points, this.points[0]];
    ops.push({ kind: 'stroke', points: closed, style: stroke(this.props), color: this.props.color });
    return ops;
  }
  emit(ctx: RenderCtx, parent: Aff = identity(), pz = 0, prx = 0, pry = 0) {
    if (this.extrude > 0 && this.fill && this.visible) {
      // 3D body (walls + caps) is a closed depth-tested mesh built by the board.
      // Here we only add the sharp analytic top when (near) top-down.
      if (nearTopDown()) {
        const m = mul(parent, this.localMatrix());
        const world = this.points.map((p) => apply(m, p[0], p[1]) as Pt);
        emitPrism(ctx, world, {
          h: this.extrude, baseZ: pz + this.elevation, color: this.fill.color,
          opacity: this.opacity * this.reveal,
          outline: this.props.color, outlineWidth: (this.props.width ?? DEFAULT_STROKE) * scaleOf(m),
        });
      }
      const z = pz + this.elevation + this.extrude;
      for (const c of this.children) c.emit(ctx, mul(parent, this.localMatrix()), z, prx + this.faceTilt, pry);
      return;
    }
    super.emit(ctx, parent, pz, prx, pry);
  }
  /** World-space outline contour(s) for the cached depth-tested wall mesh. */
  wallLoops(parent: Aff = identity()): number[][] {
    const m = mul(parent, this.localMatrix());
    return [this.points.flatMap((p) => { const [x, y] = apply(m, p[0], p[1]); return [x, y]; })];
  }
}

// ── arrows / vectors ──────────────────────────────────────────────────────
export class Vector extends Mobject {
  headLength = 20; headWidth = 16;
  constructor(public a: Pt, public b: Pt, public props: StrokeProps) { super(); }
  protected build(): DrawOp[] {
    const [dx, dy] = [this.b[0] - this.a[0], this.b[1] - this.a[1]];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const hl = Math.min(this.headLength, len * 0.6), hw = this.headWidth;
    const baseX = this.b[0] - ux * hl, baseY = this.b[1] - uy * hl;
    const head: Pt[] = [this.b, [baseX + px * hw / 2, baseY + py * hw / 2], [baseX - px * hw / 2, baseY - py * hw / 2]];
    return [
      { kind: 'stroke', points: [this.a, [baseX, baseY]], style: stroke({ ...this.props, cap: 'butt' }), color: this.props.color },
      { kind: 'fill', quads: polygonQuads(head, true), color: this.props.color },
    ];
  }
}

// ── circles / arcs / ellipses ─────────────────────────────────────────────
export class Circle extends Mobject {
  constructor(x: number, y: number, public radius: number, public props: StrokeProps, public fill?: FillProps) { super(); this.position = [x, y]; }
  protected build(): DrawOp[] {
    const ops: DrawOp[] = [];
    if (this.fill) ops.push({ kind: 'fill', quads: circleQuads(0, 0, this.radius, 32), color: this.fill.color });
    ops.push({ kind: 'stroke', quads: circleQuads(0, 0, this.radius, 32), closed: true, style: stroke(this.props), color: this.props.color });
    return ops;
  }
  emit(ctx: RenderCtx, parent: Aff = identity(), pz = 0, prx = 0, pry = 0) {
    if (this.extrude > 0 && this.fill && this.visible) {
      if (nearTopDown()) {
        const m = mul(parent, this.localMatrix());
        emitPrism(ctx, this.loopPts(m), {
          h: this.extrude, baseZ: pz + this.elevation, color: this.fill.color,
          opacity: this.opacity * this.reveal,
        });
      }
      const z = pz + this.elevation + this.extrude;
      for (const c of this.children) c.emit(ctx, mul(parent, this.localMatrix()), z, prx + this.faceTilt, pry);
      return;
    }
    super.emit(ctx, parent, pz, prx, pry);
  }
  private loopPts(m: Aff): Pt[] {
    const segs = 64;
    const world: Pt[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      world.push(apply(m, Math.cos(a) * this.radius, Math.sin(a) * this.radius) as Pt);
    }
    return world;
  }
  /** World-space outline contour for the cached depth-tested wall mesh. */
  wallLoops(parent: Aff = identity()): number[][] {
    return [this.loopPts(mul(parent, this.localMatrix())).flatMap((p) => [p[0], p[1]])];
  }
}

export class Arc extends Mobject {
  constructor(x: number, y: number, public radius: number, public a0: number, public a1: number, public props: StrokeProps) { super(); this.position = [x, y]; }
  protected build(): DrawOp[] { return [{ kind: 'stroke', quads: arcQuads(0, 0, this.radius, this.a0, this.a1), closed: false, style: stroke(this.props), color: this.props.color }]; }
}

export class Ellipse extends Mobject {
  // A unit circle scaled to (rx, ry) via the Mobject transform.
  constructor(x: number, y: number, rx: number, ry: number, public props: StrokeProps, public fill?: FillProps) {
    super(); this.position = [x, y]; this.scaleX = rx; this.scaleY = ry;
  }
  protected build(): DrawOp[] {
    const ops: DrawOp[] = [];
    if (this.fill) ops.push({ kind: 'fill', quads: circleQuads(0, 0, 1, 40), color: this.fill.color });
    ops.push({ kind: 'stroke', quads: circleQuads(0, 0, 1, 40), closed: true, style: stroke(this.props), color: this.props.color });
    return ops;
  }
}

// ── text label ─────────────────────────────────────────────────────────────
export class Label extends Mobject {
  constructor(public text: string, x: number, y: number, public size = 24, public color = [0.9, 0.92, 0.98, 1], public anchor: 'start' | 'middle' | 'end' = 'start') { super(); this.position = [x, y]; }
  protected build(): DrawOp[] { return [{ kind: 'text', text: this.text, x: 0, y: 0, size: this.size, color: this.color, anchor: this.anchor }]; }
  // extrude lifts the glyphs off the ground (folded into the accumulated z so the
  // text op's per-instance xform carries it — glyph edges stay analytic-sharp).
  emit(ctx: RenderCtx, parent: Aff = identity(), pz = 0, prx = 0, pry = 0) {
    super.emit(ctx, parent, pz + this.extrude, prx, pry);
  }
}

// ── LaTeX math (Mobject wrapper around MathTex) ────────────────────────────
// The analytic top face (sharp glyphs) is emitted here; the extruded SIDE WALLS
// are real depth-tested geometry built by the board from wallLoops() (the glyph
// outlines stored on the atlas) — a true extrusion, not stacked copies, so it is
// watertight and sharp at any zoom. elevation + extrude lift the top face by z.
export class Tex extends Mobject {
  private mt: MathTex;
  constructor(public latex: string, x: number, y: number, public size = 48, public color = [0.93, 0.95, 0.98, 1], public anchor: 'start' | 'middle' | 'end' = 'start') {
    super(); this.position = [x, y]; this.mt = new MathTex(latex);
  }
  protected build(): DrawOp[] { return []; }
  measure(atlas: any) { return this.mt.measure(atlas); }
  emit(ctx: RenderCtx, parent: Aff = identity(), pz = 0, prx = 0, pry = 0) {
    if (!this.visible) return;
    const m = mul(parent, this.localMatrix());
    const s = scaleOf(m);
    const [x, y] = apply(m, 0, 0);
    // Top face lifted by EXTRUDE_PLUG_EPS so it cleanly caps the mesh wall tube
    // (the wall top sits exactly at elevation+extrude; the plug wins the depth test
    // at the shared silhouette → no sliver). The mesh walls are NOT inset, so they
    // meet the glyph outline exactly and the raised glyph covers their top edge.
    const top = pz + this.elevation + this.extrude + (this.extrude > 0 ? EXTRUDE_PLUG_EPS : 0);
    this.mt.emit(ctx.atlas, ctx.inst, ctx.crv, ctx.rws, {
      x, y, size: this.size * s, color: this.color, opacity: this.opacity * this.reveal,
      anchor: this.anchor, z: top, xf: ctx.xf,
    });
    for (const c of this.children) c.emit(ctx, m, top, prx + this.faceTilt, pry);
  }
  /** World-space glyph outline contours (the extruded side-wall silhouette). */
  wallLoops(atlas: any, parent: Aff = identity()): number[][] {
    const m = mul(parent, this.localMatrix());
    const s = scaleOf(m);
    const [x, y] = apply(m, 0, 0);
    return this.mt.outlineLoops(atlas, { x, y, size: this.size * s, anchor: this.anchor });
  }
}
