// ── windgraph · coordinate system, axes, grid (Phase 2) ──────────────────────
// A NumberPlane maps DATA coords → WORLD coords (the camera then maps world →
// screen), and draws an adaptive grid + axes + ticks + labels. Tick density
// follows the camera zoom (nice 1·2·5 steps re-subdivide as you zoom in) and
// everything is culled to the visible rect, so it stays crisp and cheap at any
// zoom — including infinite zoom.

import { strokeInto } from '../stroke/stroke';
import { layoutStr, tw } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';

export interface PlaneView { zoom: number; left: number; right: number; top: number; bottom: number; }
export interface PlaneCtx { font: FontFace; atlas: any; inst: number[]; crv: number[]; rws: number[]; }

// Nearest 1·2·5 × 10^k step ≥ rough.
function niceStep(rough: number): number {
  if (!(rough > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / p;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * p;
}

// Format a tick value without float noise.
function fmt(v: number, step: number): string {
  if (Math.abs(v) < step * 1e-6) return '0';
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m));
}

export interface PlaneStyle {
  minor?: number[]; major?: number[]; axis?: number[]; label?: number[];
  targetPx?: number;  // desired screen px between major ticks (default 90)
  labelPx?: number;   // label screen px height (default 14)
}

export class NumberPlane {
  // World position of data (0,0), and world px per data unit.
  worldX0 = 0; worldY0 = 0; unitX = 100; unitY = 100;
  xMin = -6; xMax = 6; yMin = -4; yMax = 4;
  style: Required<PlaneStyle> = {
    minor: [1, 1, 1, 0.05], major: [1, 1, 1, 0.12], axis: [0.75, 0.80, 0.92, 0.9], label: [0.68, 0.72, 0.82, 1],
    targetPx: 90, labelPx: 14,
  };

  dToWx(dx: number) { return this.worldX0 + dx * this.unitX; }
  dToWy(dy: number) { return this.worldY0 - dy * this.unitY; } // data y-up → world y-down

  render(ctx: PlaneCtx, view: PlaneView) {
    const { inst, crv, rws } = ctx;
    const z = Math.max(view.zoom, 1e-9);
    const px = 1 / z; // ~1 screen-px line width in world units

    // Visible data range = domain ∩ (view rect mapped to data).
    const dxMin = Math.max(this.xMin, (view.left - this.worldX0) / this.unitX);
    const dxMax = Math.min(this.xMax, (view.right - this.worldX0) / this.unitX);
    const dyMin = Math.max(this.yMin, (this.worldY0 - view.bottom) / this.unitY);
    const dyMax = Math.min(this.yMax, (this.worldY0 - view.top) / this.unitY);
    if (dxMin > dxMax || dyMin > dyMax) return;

    const stepX = niceStep(this.style.targetPx / (this.unitX * z));
    const stepY = niceStep(this.style.targetPx / (this.unitY * z));

    const wYtop = this.dToWy(Math.min(this.yMax, dyMax)), wYbot = this.dToWy(Math.max(this.yMin, dyMin));
    const wXlo = this.dToWx(Math.max(this.xMin, dxMin)), wXhi = this.dToWx(Math.min(this.xMax, dxMax));

    // Grid: minor (step/5) then major (step).
    const vlines = (step: number, color: number[]) => {
      const start = Math.ceil(dxMin / step) * step;
      for (let v = start; v <= dxMax + step * 1e-6; v += step) {
        const wx = this.dToWx(v);
        strokeInto([[wx, wYtop], [wx, wYbot]], { width: px }, color, inst, crv, rws);
      }
    };
    const hlines = (step: number, color: number[]) => {
      const start = Math.ceil(dyMin / step) * step;
      for (let v = start; v <= dyMax + step * 1e-6; v += step) {
        const wy = this.dToWy(v);
        strokeInto([[wXlo, wy], [wXhi, wy]], { width: px }, color, inst, crv, rws);
      }
    };
    vlines(stepX / 5, this.style.minor); hlines(stepY / 5, this.style.minor);
    vlines(stepX, this.style.major); hlines(stepY, this.style.major);

    // Axes (data x=0 / y=0) when in range.
    if (0 >= this.yMin && 0 <= this.yMax) strokeInto([[wXlo, this.dToWy(0)], [wXhi, this.dToWy(0)]], { width: px * 1.6 }, this.style.axis, inst, crv, rws);
    if (0 >= this.xMin && 0 <= this.xMax) strokeInto([[this.dToWx(0), wYtop], [this.dToWx(0), wYbot]], { width: px * 1.6 }, this.style.axis, inst, crv, rws);

    // Tick labels along the axes (constant screen size).
    const size = this.style.labelPx / z;
    const axisYworld = (0 >= this.yMin && 0 <= this.yMax) ? this.dToWy(0) : wYbot;
    const axisXworld = (0 >= this.xMin && 0 <= this.xMax) ? this.dToWx(0) : wXlo;
    for (let v = Math.ceil(dxMin / stepX) * stepX; v <= dxMax + stepX * 1e-6; v += stepX) {
      if (Math.abs(v) < stepX * 1e-6) continue; // skip 0 (shared)
      const s = fmt(v, stepX);
      layoutStr(inst, s, this.style.label, ctx.atlas.table, ctx.font, { x: this.dToWx(v) - tw(s, ctx.font, size) / 2, y: axisYworld + size * 0.35, size });
    }
    for (let v = Math.ceil(dyMin / stepY) * stepY; v <= dyMax + stepY * 1e-6; v += stepY) {
      if (Math.abs(v) < stepY * 1e-6) continue;
      const s = fmt(v, stepY);
      layoutStr(inst, s, this.style.label, ctx.atlas.table, ctx.font, { x: axisXworld - tw(s, ctx.font, size) - size * 0.5, y: this.dToWy(v) - size * 0.5, size });
    }
    // Origin label.
    if (0 >= this.xMin && 0 <= this.xMax && 0 >= this.yMin && 0 <= this.yMax) {
      layoutStr(inst, '0', this.style.label, ctx.atlas.table, ctx.font, { x: this.dToWx(0) - tw('0', ctx.font, size) - size * 0.4, y: this.dToWy(0) + size * 0.35, size });
    }
  }
}
