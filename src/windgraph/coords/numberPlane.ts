// ── windgraph · coordinate system, axes, grid (Phase 2) ──────────────────────
// A NumberPlane maps DATA coords → WORLD coords (the camera then maps world →
// screen), and draws an adaptive grid + axes + ticks + labels. The grid is
// PROCEDURAL (shader fillRule 3): two full-rect instances (minor + major)
// evaluated per-pixel, phase-locked to the data origin, with a screen-px line
// width — uniformly crisp at any zoom and under the tilted 3D camera. Tick
// density follows the camera zoom (a 1.26×/decade ladder subdivides smoothly)
// and everything is culled to the visible rect, so it stays crisp and cheap at
// any zoom — including infinite zoom.

import { strokeInto } from '../stroke/stroke';
import { layoutStr, tw } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';

export interface PlaneView { zoom: number; left: number; right: number; top: number; bottom: number; }
export interface PlaneCtx { font: FontFace; atlas: any; inst: number[]; crv: number[]; rws: number[]; }

// Nearest 10-step/decade (1 · 1.26 ×…) step ≥ rough, instead of 1-2-5: on-screen
// tick spacing used to pulse up to 2.5× while zooming (a visible "grid shrink"
// sweep). 1.26× keeps the sweep under ~26%, so zooming reads as smooth
// subdivision, not a pulse.
const NICE_STEPS = [1, 1.25, 1.6, 2, 2.5, 3.2, 4, 5, 6.3, 8];
function niceStep(rough: number): number {
  if (!(rough > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / p;
  for (const n of NICE_STEPS) if (f <= n) return n * p;
  return 10 * p;
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
    this.renderGrid(ctx, view);
    this.renderLabels(ctx, view);
  }

  /** Cached geometry: procedural grid (2 instances) + axes strokes, clipped to
   *  `view`. Boards emit this against a TILE-EXPANDED view so the cached slice
   *  covers the whole tile (panning within a tile never shows gaps). The tick
   *  labels are NOT here — they're emitted uncached (renderLabels) against the
   *  live viewport so they stay current + bounded during pan/zoom. */
  renderGrid(ctx: PlaneCtx, view: PlaneView) {
    const { inst, crv, rws } = ctx;
    const z = Math.max(view.zoom, 1e-9);

    // Visible data range = domain ∩ (view rect mapped to data).
    const dxMin = Math.max(this.xMin, (view.left - this.worldX0) / this.unitX);
    const dxMax = Math.min(this.xMax, (view.right - this.worldX0) / this.unitX);
    const dyMin = Math.max(this.yMin, (this.worldY0 - view.bottom) / this.unitY);
    const dyMax = Math.min(this.yMax, (this.worldY0 - view.top) / this.unitY);
    if (dxMin > dxMax || dyMin > dyMax) return;

    // ONE shared data step for both axes. A procedural grid instance draws both
    // line sets with a single spacing; on the windgraph boards unitX == unitY so
    // this coincides with the old per-axis steps, and on non-square planes the
    // cells simply mirror the plane's world scaling. The 1.26× ladder (D23)
    // subdivides smoothly on zoom — no 2.5× pulse.
    const step = niceStep(this.style.targetPx / (Math.max(this.unitX, this.unitY) * z));

    const wYtop = this.dToWy(Math.min(this.yMax, dyMax)), wYbot = this.dToWy(Math.max(this.yMin, dyMin));
    const wXlo = this.dToWx(Math.max(this.xMin, dxMin)), wXhi = this.dToWx(Math.min(this.xMax, dxMax));

    // Procedural grid (shader fillRule 3): TWO full-rect instances covering the
    // visible rect — minor at step/5 (~1px screen lines), major at step (~1.8px).
    // The shader evaluates the lines per-pixel from the world coord with a
    // SCREEN-px width, so lines stay uniformly crisp at every zoom AND under the
    // tilted 3D camera (no fat-near/thin-far), and a moiré guard fades the far
    // horizon. band.zw = the data origin's world position (phase), so grid lines
    // land exactly on the tick-label multiples at any zoom. 2 instances instead
    // of dozens of stroked lines — no crv/rws rows, cache-friendly.
    const grid = (stepWorld: number, widthPx: number, clr: number[]) => {
      if (wXhi <= wXlo || wYbot <= wYtop) return;
      inst.push(
        wXlo, wYtop, 1, 3,                                // place: origin, unitsToPx, fillRule 3
        0, 0, wXhi - wXlo, wYbot - wYtop,                 // bbox: local (0,0,w,h) → rc reads world coords
        clr[0], clr[1], clr[2], clr[3],                   // color
        stepWorld, widthPx, this.worldX0, this.worldY0,   // band: stepWorld, widthPx, phaseX, phaseY
      );
    };
    grid(step / 5 * this.unitX, 1.0, this.style.minor);
    grid(step * this.unitX, 1.8, this.style.major);

    // Axes (data x=0 / y=0) when in range — world strokes like the plot lines
    // (they stay consistent with the curves' world-constant widths).
    const px = 1.5 / z;
    if (0 >= this.yMin && 0 <= this.yMax) strokeInto([[wXlo, this.dToWy(0)], [wXhi, this.dToWy(0)]], { width: px * 1.6 }, this.style.axis, inst, crv, rws);
    if (0 >= this.xMin && 0 <= this.xMax) strokeInto([[this.dToWx(0), wYtop], [this.dToWx(0), wYbot]], { width: px * 1.6 }, this.style.axis, inst, crv, rws);
  }

  /** Uncached tick labels along the axes, clipped to `view` (the LIVE viewport)
   *  and capped to a bounded count per axis. They must NOT be built against a
   *  tile/domain superset: at deep zoom the step is tiny and a large range yields
   *  thousands of glyph instances per rebuild (the 3D FPS tank when looking at
   *  the horizon). Viewport-clipped + capped keeps the emit bounded while the
   *  on-screen density stays ~targetPx apart. Emitted after the board's cache so
   *  panning re-lays them out with the current viewport each frame. */
  renderLabels(ctx: PlaneCtx, view: PlaneView) {
    const { inst } = ctx;
    const z = Math.max(view.zoom, 1e-9);

    const dxMin = Math.max(this.xMin, (view.left - this.worldX0) / this.unitX);
    const dxMax = Math.min(this.xMax, (view.right - this.worldX0) / this.unitX);
    const dyMin = Math.max(this.yMin, (this.worldY0 - view.bottom) / this.unitY);
    const dyMax = Math.min(this.yMax, (this.worldY0 - view.top) / this.unitY);
    if (dxMin > dxMax || dyMin > dyMax) return;

    const step = niceStep(this.style.targetPx / (Math.max(this.unitX, this.unitY) * z));

    // Cap the tick count: label every Nth grid line (N a nice integer multiple,
    // so labels stay ON grid lines at round values) when the range is huge.
    const MAX_LABELS = 48;
    const nTicks = Math.max(dxMax - dxMin, dyMax - dyMin) / step;
    let labelStep = step;
    if (nTicks > MAX_LABELS) {
      const need = Math.ceil(nTicks / MAX_LABELS);
      const p = Math.pow(10, Math.ceil(Math.log10(need)) - 1);
      const f = need / p;
      labelStep = step * (f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    }

    const wYbot = this.dToWy(Math.max(this.yMin, dyMin));
    const wXlo = this.dToWx(Math.max(this.xMin, dxMin));
    const size = this.style.labelPx / z;
    const axisYworld = (0 >= this.yMin && 0 <= this.yMax) ? this.dToWy(0) : wYbot;
    const axisXworld = (0 >= this.xMin && 0 <= this.xMax) ? this.dToWx(0) : wXlo;
    const ls = (v: number) => fmt(v, labelStep);
    for (let v = Math.ceil(dxMin / labelStep) * labelStep; v <= dxMax + labelStep * 1e-6; v += labelStep) {
      if (Math.abs(v) < labelStep * 1e-6) continue; // skip 0 (shared)
      const s = ls(v);
      layoutStr(inst, s, this.style.label, ctx.atlas.table, ctx.font, { x: this.dToWx(v) - tw(s, ctx.font, size) / 2, y: axisYworld + size * 0.35, size });
    }
    for (let v = Math.ceil(dyMin / labelStep) * labelStep; v <= dyMax + labelStep * 1e-6; v += labelStep) {
      if (Math.abs(v) < labelStep * 1e-6) continue;
      const s = ls(v);
      layoutStr(inst, s, this.style.label, ctx.atlas.table, ctx.font, { x: axisXworld - tw(s, ctx.font, size) - size * 0.5, y: this.dToWy(v) - size * 0.5, size });
    }
    // Origin label.
    if (0 >= this.xMin && 0 <= this.xMax && 0 >= this.yMin && 0 <= this.yMax) {
      layoutStr(inst, '0', this.style.label, ctx.atlas.table, ctx.font, { x: this.dToWx(0) - tw('0', ctx.font, size) - size * 0.4, y: this.dToWy(0) + size * 0.35, size });
    }
  }
}
