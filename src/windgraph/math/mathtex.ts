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
  z?: number;                 // elevation: lift every glyph off the ground (D10)
  xf?: number[];              // per-instance fxXforms buffer to write z into
}

function rectQuads(x0: number, y0: number, x1: number, y1: number): number[] {
  return polygonQuads([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Pt[], true);
}

// Pad xf to cover instances [i0, i1) and lift them by z (Euler-path translation).
function writeXf(xf: number[], i0: number, i1: number, z: number) {
  const need = i1 * 8;
  while (xf.length < need) xf.push(0);
  if (z === 0) return;
  for (let k = i0; k < i1; k++) { const b = k * 8; xf[b] = 0; xf[b + 1] = 0; xf[b + 2] = z; xf[b + 3] = 1; }
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

  /** World-space box of the first glyph rendering `char` (K6 formula↔graph
   *  binding: a board hit-tests this rect to attach a slider to a coefficient).
   *  Returns null when the char is not present. */
  locate(atlas: Atlas, char: string, o: { x: number; y: number; size: number; anchor?: 'start' | 'middle' | 'end' }): { x0: number; y0: number; x1: number; y1: number } | null {
    const b = this.ensure(atlas);
    let ax = o.x;
    if (o.anchor === 'middle') ax -= (b.w * o.size) / 2;
    else if (o.anchor === 'end') ax -= b.w * o.size;
    const suffix = ':' + char;
    for (const p of b.items) {
      if (p.kind !== 'glyph' || !p.key.endsWith(suffix)) continue;
      const e = atlas.table[p.key];
      if (!e) continue;
      const upm = e.upm || 1000;
      const u = (o.size * p.s) / upm;
      const penX = ax + p.x * o.size, baseY = o.y + p.y * o.size;
      return { x0: penX + e.bbox[0] * u, y0: baseY + e.bbox[1] * u, x1: penX + e.bbox[2] * u, y1: baseY + e.bbox[3] * u };
    }
    return null;
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
    const xf = o.xf;
    const z = o.z ?? 0;

    const alphaAt = (wx: number): number => {
      if (reveal >= 1) return op;
      const edge = ax + reveal * totalW;
      const a = Math.max(0, Math.min(1, (edge - wx) / fade));
      return op * a;
    };
    const withA = (a: number): number[] => [col[0], col[1], col[2], (col[3] ?? 1) * a];

    for (const p of b.items) {
      const i0 = inst.length >> 4;
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
      if (xf) writeXf(xf, i0, inst.length >> 4, z);
    }
  }

  /** World-space outline contours of the laid-out glyphs (the extruded side-wall
   *  silhouette). Uses the same placement as emit() so the walls line up exactly
   *  under the analytic top face. Glyphs without a stored outline (UI font) yield
   *  nothing — only the baked math fonts carry outlines. */
  outlineLoops(atlas: Atlas, o: { x: number; y: number; size: number; anchor?: 'start' | 'middle' | 'end' }): number[][] {
    const b = this.ensure(atlas);
    const size = o.size;
    let ax = o.x;
    if (o.anchor === 'middle') ax -= (b.w * size) / 2;
    else if (o.anchor === 'end') ax -= b.w * size;
    const oy = o.y;
    const loops: number[][] = [];
    for (const p of b.items) {
      if (p.kind !== 'glyph') continue;
      const e = atlas.table[p.key];
      if (!e || !e.outline) continue;
      const upm = e.upm || 1000;
      const penX = ax + p.x * size;
      const baseY = oy + p.y * size;
      const unit = (size * p.s) / upm;
      for (const c of e.outline as number[][]) {
        const flat: number[] = [];
        for (let i = 0; i < c.length; i += 2) flat.push(penX + c[i] * unit, baseY + c[i + 1] * unit);
        if (flat.length >= 4) loops.push(flat);
      }
    }
    return loops;
  }
}
