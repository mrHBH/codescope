// ── windgraph · geometry primitives (Phase 1) ────────────────────────────────
// Concrete Mobjects. Each builds local-space draw ops; the Mobject transform
// (position/rotation/scale, composed through groups) places them in the world.

import { Mobject, type DrawOp } from './mobject';
import { circleQuads, arcQuads, polygonQuads, type Pt, type StrokeStyle } from '../stroke/stroke';

const DEFAULT_STROKE = 3;

export interface StrokeProps { color: number[]; width?: number; cap?: StrokeStyle['cap']; join?: StrokeStyle['join']; dash?: number[]; }
export interface FillProps { color: number[]; }

function stroke(props: StrokeProps): StrokeStyle & { color: number[] } {
  return { color: props.color, width: props.width ?? DEFAULT_STROKE, cap: props.cap ?? 'round', join: props.join ?? 'round', dash: props.dash };
}

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
}
