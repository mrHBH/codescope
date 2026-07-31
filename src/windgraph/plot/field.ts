// ── windgraph · vector / slope fields (Phase 3) ──────────────────────────────
// Draws vector fields V(x,y) = (u,v) and slope fields y' = f(x,y) as grids
// of arrows or short segments, using the Phase 1 arrow primitive and stroke
// engine for crisp rendering at any zoom.

import { strokeInto, type Pt } from '../stroke/stroke';
import type { NumberPlane, PlaneView, PlaneCtx } from '../coords/numberPlane';

export interface FieldStyle {
  color: number[];
  widthPx?: number;
  gridRes?: number;    // arrows per data unit (default 1)
  scale?: number;      // arrow length multiplier (default 0.4 of cell size)
  headLength?: number; // arrow head length (data units, default 0)
  fixedGrid?: boolean; // if true, sample over the whole plane domain, not just visible range
  lockToScreen?: boolean; // keep arrow size/stroke stable in screen pixels while zooming
  screenLenPx?: number;   // on-screen arrow length when lockToScreen=true
}

// ── vector field ─────────────────────────────────────────────────────────
export function plotVectorField(
  V: (x: number, y: number) => [number, number],
  plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, style: FieldStyle
) {
  const res = style.gridRes ?? 1;
  const cell = 1 / res;
  const scale = style.scale ?? 0.4;
  const pxWorld = 1 / Math.max(view.zoom, 1e-9);
  const lockToScreen = style.lockToScreen ?? true;
  const w = Math.max((style.widthPx ?? 2) * pxWorld, 1e-6);
  const color = style.color;

  // Visible data range (or full plane domain when fixedGrid is set)
  const dxMin = style.fixedGrid ? plane.xMin : Math.max(plane.xMin, (view.left - plane.worldX0) / plane.unitX);
  const dxMax = style.fixedGrid ? plane.xMax : Math.min(plane.xMax, (view.right - plane.worldX0) / plane.unitX);
  const dyMin = style.fixedGrid ? plane.yMin : Math.max(plane.yMin, (plane.worldY0 - view.bottom) / plane.unitY);
  const dyMax = style.fixedGrid ? plane.yMax : Math.min(plane.yMax, (plane.worldY0 - view.top) / plane.unitY);
  if (dxMin > dxMax || dyMin > dyMax) return;

  const cols = Math.ceil((dxMax - dxMin) * res);
  const rows = Math.ceil((dyMax - dyMin) * res);
  const inBounds = (x: number, y: number) => x >= plane.xMin && x <= plane.xMax && y >= plane.yMin && y <= plane.yMax;

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const dx = dxMin + c * cell;
      const dy = dyMin + r * cell;
      const [u, v] = V(dx, dy);
      if (!isFinite(u) || !isFinite(v)) continue;
      const len = Math.hypot(u, v);
      if (len < 1e-12) continue;
      // Normalize arrow length by cell size, or lock to a stable on-screen size.
      const arrowLen = lockToScreen
        ? ((style.screenLenPx ?? 24) * pxWorld) / Math.max((plane.unitX + plane.unitY) * 0.5, 1e-9)
        : cell * scale;
      const ux = (u / len) * arrowLen;
      const uy = (v / len) * arrowLen;
      // Hard-clip to this plane's domain so field strokes never spill into
      // neighboring demo sections.
      if (!inBounds(dx, dy) || !inBounds(dx + ux, dy + uy)) continue;
      // Draw arrow in world space via strokeInto (shaft + head)
      const a: Pt = [plane.dToWx(dx), plane.dToWy(dy)];
      const b: Pt = [plane.dToWx(dx + ux), plane.dToWy(dy + uy)];
      // Short arrow: just a segment if too small
      const headLen = Math.min((style.headLength ?? 0) || arrowLen * 0.3, arrowLen * 0.6);
      if (headLen < 2) {
        // Butt caps: round caps cost two 24-quad discs per arrow shaft.
        strokeInto([a, b], { width: w, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
      } else {
        // Draw shaft + arrowhead as two strokes
        const hl = headLen;
        const [bx, by] = b;
        const axDir = (a[0] - bx), ayDir = (a[1] - by);
        const al = Math.hypot(axDir, ayDir) || 1;
        const baseX = bx + (axDir / al) * hl;
        const baseY = by + (ayDir / al) * hl;
        const px = -ayDir / al, py = axDir / al;
        const hw = headLen * 0.35;
        const baseDx = dx + (ux * (arrowLen - hl)) / Math.max(arrowLen, 1e-9);
        const baseDy = dy + (uy * (arrowLen - hl)) / Math.max(arrowLen, 1e-9);
        const leftDx = baseDx + (-uy / Math.max(arrowLen, 1e-9)) * hw;
        const leftDy = baseDy + (ux / Math.max(arrowLen, 1e-9)) * hw;
        const rightDx = baseDx - (-uy / Math.max(arrowLen, 1e-9)) * hw;
        const rightDy = baseDy - (ux / Math.max(arrowLen, 1e-9)) * hw;
        if (!inBounds(baseDx, baseDy) || !inBounds(leftDx, leftDy) || !inBounds(rightDx, rightDy)) continue;
        strokeInto([a, [baseX, baseY]], { width: w, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
        strokeInto([[bx, by], [baseX + px * hw, baseY + py * hw]], { width: w, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
        strokeInto([[bx, by], [baseX - px * hw, baseY - py * hw]], { width: w, cap: 'butt' }, color, ctx.inst, ctx.crv, ctx.rws);
      }
    }
  }
}

// ── slope field (direction field for y' = f(x,y)) ─────────────────────────
export function plotSlopeField(
  f: (x: number, y: number) => number,
  plane: NumberPlane, view: PlaneView, ctx: PlaneCtx, style: FieldStyle
) {
  plotVectorField(
    (x, y) => {
      const slope = f(x, y);
      if (!isFinite(slope)) return [0, 0];
      return [1, slope]; // direction (dx=1, dy=slope)
    },
    plane, view, ctx, { ...style, scale: style.scale ?? 0.35, headLength: 0 }
  );
}
