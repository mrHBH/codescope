// ── Island emission helpers with origin shifting ─────────────────────────────
// Each method adds (ox, oy) to every coordinate for gallery grid layout.

import type { FontFace } from '../../windfoil/font';
import type { GlyphAtlas } from '../../windfoil/bands';
import { addRect, layoutStr, tw } from '../../layout/metrics';
import { fillQuads, strokeInto, strokeQuadPath, polygonQuads, circleQuads, type Pt } from '../../windgraph/stroke/stroke';

export interface EmitBuffers { inst: number[]; crv: number[]; rws: number[]; }
export interface DrawCtx { font: FontFace; atlas: GlyphAtlas; buff: EmitBuffers; }

export class DrawHelpers {
  private ctx: DrawCtx;
  ox = 0;
  oy = 0;
  sx = 1;
  sy = 1;

  constructor(ctx: DrawCtx) { this.ctx = ctx; }

  setOrigin(x: number, y: number) { this.ox = x; this.oy = y; this.sx = 1; this.sy = 1; }
  setTransform(x: number, y: number, sx: number, sy: number) { this.ox = x; this.oy = y; this.sx = sx; this.sy = sy; }

  private lx(x: number) { return this.ox + x * this.sx; }
  private ly(y: number) { return this.oy + y * this.sy; }

  text(s: string, x: number, y: number, size: number, color: number[] = [1, 1, 1, 1], alpha = 1, anchor: 'start' | 'middle' | 'end' = 'start') {
    const fsize = size * this.sx;
    let tx = this.lx(x);
    const yy = this.ly(y);
    if (anchor !== 'start') { const w = tw(s, this.ctx.font, fsize); tx -= anchor === 'middle' ? w / 2 : w; }
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color, alpha];
    layoutStr(this.ctx.buff.inst, s, c, this.ctx.atlas.table, this.ctx.font, { x: tx, y: yy, size: fsize });
  }

  /** Render text with word-wrapping to fit maxWidth. Returns rendered height. */
  textBlock(s: string, x: number, y: number, size: number, color: number[], alpha: number, maxWidth: number): number {
    const font = this.ctx.font;
    const fsize = size * this.sx;
    const maxW = maxWidth * this.sx;
    const words = s.split(' ');
    let line = '', ly = this.ly(y), count = 0;
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (tw(candidate, font, fsize) > maxW && line) {
        const tx = this.lx(x);
        const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color, alpha];
        layoutStr(this.ctx.buff.inst, line, c, this.ctx.atlas.table, font, { x: tx, y: ly, size: fsize });
        line = word;
        ly += fsize * 1.25;
        count++;
      } else {
        line = candidate;
      }
    }
    if (line) {
      const tx = this.lx(x);
      const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color, alpha];
      layoutStr(this.ctx.buff.inst, line, c, this.ctx.atlas.table, font, { x: tx, y: ly, size: fsize });
      count++;
    }
    return count * fsize * 1.25;
  }

  line(pts: Pt[], color: number[], width = 3, alpha = 1, dash?: number[]) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    const shifted = pts.map((p) => [this.lx(p[0]), this.ly(p[1])] as Pt);
    strokeInto(shifted, { width: width * this.sx, cap: 'round', join: 'round', dash }, c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  rect(x0: number, y0: number, x1: number, y1: number, color: number[], alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    addRect(this.lx(x0), this.ly(y0), this.lx(x1), this.ly(y1), c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
  }

  rectStroke(x0: number, y0: number, x1: number, y1: number, color: number[], width = 2, alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    const h = (width * this.sx) / 2, ox = this.ox, oy = this.oy;
    const X0 = ox + x0 * this.sx, Y0 = oy + y0 * this.sy, X1 = ox + x1 * this.sx, Y1 = oy + y1 * this.sy;
    addRect(X0 - h, Y0 - h, X1 + h, Y0 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
    addRect(X1 - h, Y0 - h, X1 + h, Y1 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
    addRect(X0 - h, Y1 - h, X1 + h, Y1 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
    addRect(X0 - h, Y0 - h, X0 + h, Y1 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
  }

  fillPoly(pts: Pt[], color: number[], alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    fillQuads(polygonQuads(pts.map(p => [this.lx(p[0]), this.ly(p[1])] as Pt), true), c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  fillCircle(x: number, y: number, r: number, color: number[], alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    fillQuads(circleQuads(this.lx(x), this.ly(y), r * this.sx, 16), c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  strokeCircle(x: number, y: number, r: number, color: number[], width = 3, alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    const q: number[] = [];
    strokeQuadPath(circleQuads(this.lx(x), this.ly(y), r * this.sx, 14), { width: width * this.sx, cap: 'round', join: 'round' }, true, q);
    fillQuads(q, c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  arrow(x0: number, y0: number, x1: number, y1: number, color: number[], width = 4, alpha = 1) {
    this.line([[x0, y0], [x1, y1]], color, width, alpha);
    const a = Math.atan2(y1 - y0, x1 - x0), l = width * 5, w = width * 3.2;
    this.fillPoly([
      [x1, y1],
      [x1 - Math.cos(a) * l + Math.sin(a) * w, y1 - Math.sin(a) * l - Math.cos(a) * w],
      [x1 - Math.cos(a) * l - Math.sin(a) * w, y1 - Math.sin(a) * l + Math.cos(a) * w],
    ], color, alpha);
  }

  handle(x: number, y: number, hot: boolean, alpha = 1) {
    if (hot) {
      this.fillCircle(x, y, 12, [0.97, 0.73, 0.33, 1], alpha);
      this.strokeCircle(x, y, 18, [0.97, 0.73, 0.33, 1], 2, alpha * 0.75);
    } else {
      this.fillCircle(x, y, 9, [0.30, 0.80, 0.40, 1], alpha);
      this.strokeCircle(x, y, 14, [0.30, 0.80, 0.40, 1], 2, alpha * 0.75);
    }
  }

  // ── Glow / halo (post-fx emulation via concentric copies) ────────────────
  glowRect(x0: number, y0: number, x1: number, y1: number, color: number[], layers = 3, spread = 18, alpha = 1) {
    const sc = (this.sx + this.sy) * 0.5;
    const s = spread * sc;
    for (let i = layers; i >= 1; i--) {
      const f = i / layers;
      const a = alpha * f * f * 0.28;
      const d = s * (layers - i + 1);
      this.rect(x0 - d, y0 - d, x1 + d, y1 + d, color, a);
    }
  }

  glowCircle(cx: number, cy: number, r: number, color: number[], layers = 3, spread = 18, alpha = 1) {
    const sc = (this.sx + this.sy) * 0.5;
    const s = spread * sc;
    for (let i = layers; i >= 1; i--) {
      const f = i / layers;
      const a = alpha * f * f * 0.28;
      const d = s * (layers - i + 1);
      this.fillCircle(cx, cy, r + d, color, a);
    }
  }

  glowText(s: string, x: number, y: number, size: number, color: number[], layers = 2, spread = 4, alpha = 1) {
    const sc = this.sx;
    const ss = spread * sc;
    for (let i = layers; i >= 1; i--) {
      const f = i / layers;
      const a = alpha * f * f * 0.22;
      const d = ss * (layers - i + 1);
      // Offset in 4-cardinal directions to simulate bloom spread
      for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) {
        this.text(s, x + dx, y + dy, size, color, a, 'start');
      }
    }
  }
}
