// ── windgraph · MathTex (Phase 6) ────────────────────────────────────────────
// Parses LaTeX math, lays it out, and emits analytic windfoil instances (glyphs
// + fraction/rule rects + radical strokes) — infinitely sharp, zoomable, and
// animatable (fade + left-to-right write-on). Positioned by baseline; anchor
// controls horizontal alignment.

import { fillQuads, strokeInto, polygonQuads, type Pt } from '../stroke/stroke';
import { parseMath } from './parse';
import { layout, type Box, type Atlas } from './layout';

export interface MathEmitOpts {
  x: number; y: number;       // world position (y = baseline)
  size: number;               // font size in world px
  color: number[];
  opacity?: number;           // 0..1 fade
  reveal?: number;            // 0..1 left-to-right write-on
  anchor?: 'start' | 'middle' | 'end';
}

function rectQuads(x0: number, y0: number, x1: number, y1: number): number[] {
  return polygonQuads([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Pt[], true);
}

export class MathTex {
  private box: Box | null = null;
  private atlas: Atlas | null = null;

  constructor(public latex: string) {}

  /** Lay out against an atlas (idempotent unless the latex/atlas changes). */
  ensure(atlas: Atlas): Box {
    if (!this.box || this.atlas !== atlas) {
      this.atlas = atlas;
      this.box = layout(parseMath(this.latex), atlas, 1);
    }
    return this.box;
  }

  /** Measured extent in EM units (multiply by size for world px). */
  measure(atlas: Atlas): { w: number; h: number; d: number } {
    const b = this.ensure(atlas);
    return { w: b.w, h: b.h, d: b.d };
  }

  emit(atlas: Atlas, inst: number[], crv: number[], rws: number[], o: MathEmitOpts) {
    const b = this.ensure(atlas);
    const size = o.size;
    const op = o.opacity ?? 1;
    const reveal = o.reveal ?? 1;
    const col = o.color;
    let ax = o.x;
    if (o.anchor === 'middle') ax -= (b.w * size) / 2;
    else if (o.anchor === 'end') ax -= b.w * size;
    const oy = o.y;
    const totalW = b.w * size;
    const fade = 0.18 * size + 1e-3; // write-on soft edge (world px)

    const alphaAt = (wx: number): number => {
      if (reveal >= 1) return op;
      const edge = ax + reveal * totalW;
      const a = Math.max(0, Math.min(1, (edge - wx) / fade));
      return op * a;
    };
    const withA = (a: number): number[] => [col[0], col[1], col[2], (col[3] ?? 1) * a];

    for (const p of b.items) {
      if (p.kind === 'glyph') {
        const e = atlas.table[p.key];
        if (!e) continue;
        const upm = e.upm || 1000;
        const penX = ax + p.x * size;
        const baseY = oy + p.y * size;
        const a = alphaAt(penX);
        if (a <= 0.002) continue;
        const u = (size * p.s) / upm;
        const c = withA(a);
        inst.push(penX, baseY, u, 0, e.bbox[0], e.bbox[1], e.bbox[2], e.bbox[3], c[0], c[1], c[2], c[3], e.rowBase, e.bandCount, e.bandH, e.invH);
      } else if (p.kind === 'rule') {
        const x0 = ax + p.x * size, y0 = oy + p.y * size;
        const a = alphaAt(x0 + p.w * size * 0.5);
        if (a <= 0.002) continue;
        fillQuads(rectQuads(x0, y0, x0 + p.w * size, y0 + p.h * size), withA(a), inst, crv, rws);
      } else {
        // path (radical mark)
        const pts: Pt[] = p.pts.map(([x, y]) => [ax + x * size, oy + y * size] as Pt);
        const a = alphaAt(pts[pts.length - 1][0]);
        if (a <= 0.002) continue;
        strokeInto(pts, { width: p.w * size, cap: 'round', join: 'round' }, withA(a), inst, crv, rws);
      }
    }
  }
}
