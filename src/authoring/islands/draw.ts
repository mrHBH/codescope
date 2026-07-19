// ── Island emission helpers with origin shifting ─────────────────────────────
// Each method adds (ox, oy) to every coordinate for gallery grid layout.

import type { FontFace } from '../../windfoil/font';
import { addRect, layoutStr, tw } from '../../layout/metrics';
import { fillQuads, strokeInto, strokeQuadPath, polygonQuads, circleQuads, type Pt } from '../../windgraph/stroke/stroke';

export interface EmitBuffers { inst: number[]; crv: number[]; rws: number[]; }
export interface DrawCtx { font: FontFace; atlas: any; buff: EmitBuffers; }

export class DrawHelpers {
  private ctx: DrawCtx;
  ox = 0;
  oy = 0;

  constructor(ctx: DrawCtx) { this.ctx = ctx; }

  setOrigin(x: number, y: number) { this.ox = x; this.oy = y; }

  text(s: string, x: number, y: number, size: number, color: number[] = [1, 1, 1, 1], alpha = 1, anchor: 'start' | 'middle' | 'end' = 'start') {
    let tx = this.ox + x;
    const yy = this.oy + y;
    if (anchor !== 'start') { const w = tw(s, this.ctx.font, size); tx -= anchor === 'middle' ? w / 2 : w; }
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color, alpha];
    layoutStr(this.ctx.buff.inst, s, c, this.ctx.atlas.table, this.ctx.font, { x: tx, y: yy, size });
  }

  line(pts: Pt[], color: number[], width = 3, alpha = 1, dash?: number[]) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    const shifted = pts.map((p) => [this.ox + p[0], this.oy + p[1]] as Pt);
    strokeInto(shifted, { width, cap: 'round', join: 'round', dash }, c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  rect(x0: number, y0: number, x1: number, y1: number, color: number[], alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    addRect(this.ox + x0, this.oy + y0, this.ox + x1, this.oy + y1, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
  }

  rectStroke(x0: number, y0: number, x1: number, y1: number, color: number[], width = 2, alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    const h = width / 2, ox = this.ox, oy = this.oy;
    addRect(ox + x0 - h, oy + y0 - h, ox + x1 + h, oy + y0 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
    addRect(ox + x1 - h, oy + y0 - h, ox + x1 + h, oy + y1 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
    addRect(ox + x0 - h, oy + y1 - h, ox + x1 + h, oy + y1 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
    addRect(ox + x0 - h, oy + y0 - h, ox + x0 + h, oy + y1 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
  }

  fillPoly(pts: Pt[], color: number[], alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    fillQuads(polygonQuads(pts.map(p => [this.ox + p[0], this.oy + p[1]] as Pt), true), c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  fillCircle(x: number, y: number, r: number, color: number[], alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    fillQuads(circleQuads(this.ox + x, this.oy + y, r, 16), c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  strokeCircle(x: number, y: number, r: number, color: number[], width = 3, alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
    const q: number[] = [];
    strokeQuadPath(circleQuads(this.ox + x, this.oy + y, r, 14), { width, cap: 'round', join: 'round' }, true, q);
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
}
