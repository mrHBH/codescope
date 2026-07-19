// ── Island: coverage-sweep ───────────────────────────────────────────────────
// Interactive pixel grid with coverage circle, scanline, and coverage plot.

import { registerIsland, type IslandDef } from '../registry';
import { ping, clamp } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.25, 0.26, 0.30, 1], cardBg: [0.13, 0.135, 0.15, 1],
  gold: [0.97, 0.73, 0.33, 1], cyan: [0.36, 0.85, 0.97, 1], green: [0.30, 0.80, 0.40, 1], blue: [0.40, 0.64, 1.0, 1],
};

function inCov(cx: number, cy: number, r: number, x: number, y: number) {
  return Math.hypot(x - cx, y - cy) <= r;
}

function covAtY(px: number, ps: number, cx: number, cy: number, r: number, y: number): number {
  const dy = y - cy, rr = r * r - dy * dy;
  if (rr <= 0) return 0;
  const dx = Math.sqrt(rr);
  return Math.max(0, Math.min(px + ps, cx + dx) - Math.max(px, cx - dx)) / ps;
}

function covValue(px: number, py: number, ps: number, cx: number, cy: number, r: number): number {
  const n = 30;
  let ins = 0;
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) if (inCov(cx, cy, r, px + (k + 0.5) * ps / n, py + (j + 0.5) * ps / n)) ins++;
  return ins / (n * n);
}

const island: IslandDef = {
  id: 'coverage-sweep',
  title: 'Coverage sweep',
  kind: 'visual',
  params: {
    center: { kind: 'point', label: 'Coverage center', default: [120, 200] },
    radius: { kind: 'number', label: 'Coverage radius', default: 60, min: 30, max: 120 },
    scanColor: { kind: 'color', label: 'Scan line color', default: [0.97, 0.73, 0.33, 1] },
    circleColor: { kind: 'color', label: 'Circle color', default: [0.40, 0.64, 1.0, 1] },
  },
  defaultSize: [470, 585],
  handles: [
    {
      param: 'center',
      at(params) { return (params.center as number[]) as [number, number]; },
      set(params, to) {
        (params as any).center = [clamp(to[0], 20, 220), clamp(to[1], 30, 340)];
      },
    },
    {
      param: 'radius',
      at(params) {
        const c = params.center as number[];
        return [c[0] + (params.radius as number), c[1]] as [number, number];
      },
      set(params, to) {
        const c = params.center as number[];
        (params as any).radius = clamp(Math.hypot(to[0] - c[0], to[1] - c[1]), 30, 120);
      },
    },
  ],
  emit(ctx, params, time) {
    const a = time.alpha;
    const cx = (params.center as number[])[0], cy = (params.center as number[])[1];
    const cr = params.radius as number;
    const px = 10, py = 30, ps = 260;
    const scan = time.playing ? ping(time.local, 4.0) : ping(time.now, 4.0);
    const scanY = py + scan * ps;

    ctx.draw.rect(px, py, px + ps, py + ps, [0.02, 0.025, 0.035, 1], a);
    ctx.draw.fillCircle(cx, cy, cr, C.blue, 0.14 * a);
    ctx.draw.strokeCircle(cx, cy, cr, C.blue, 4, a);

    const n = 6;
    for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const gx = px + k * ps / n, gy = py + j * ps / n, ins = inCov(cx, cy, cr, gx + ps / (2 * n), gy + ps / (2 * n));
      ctx.draw.rect(gx + 1.5, gy + 1.5, gx + ps / n - 1.5, gy + ps / n - 1.5, ins ? C.blue : [0.09, 0.10, 0.13, 1], (ins ? 0.5 : 0.6) * a);
    }

    ctx.draw.rectStroke(px, py, px + ps, py + ps, C.green, 4, a);
    ctx.draw.line([[px - 16, scanY], [px + ps + 16, scanY]], C.gold, 4, a);

    const centerHot = ctx.hoveredHandle === 'center' || ctx.grabbedHandle === 'center';
    const radiusHot = ctx.hoveredHandle === 'radius' || ctx.grabbedHandle === 'radius';
    ctx.draw.handle(cx, cy, centerHot, a);
    ctx.draw.handle(cx + cr, cy, radiusHot, a);

    const plotX = 280, plotY = 30, plotW = 135, plotH = 250;
    ctx.draw.rect(plotX, plotY, plotX + plotW, plotY + plotH, C.cardBg, a);
    ctx.draw.rectStroke(plotX, plotY, plotX + plotW, plotY + plotH, C.border, 1.3, a);
    ctx.draw.line([[plotX + 24, plotY + 14], [plotX + 24, plotY + plotH - 20], [plotX + plotW - 12, plotY + plotH - 20]], C.dim, 1.5, a * 0.6);

    const S = 28;
    const pts: [number, number][] = [];
    for (let k = 0; k <= S; k++) {
      const yy = py + (k / S) * ps, cv = covAtY(px, ps, cx, cy, cr, yy);
      pts.push([plotX + 28 + cv * (plotW - 46), plotY + 14 + (k / S) * (plotH - 40)]);
    }
    ctx.draw.line(pts, C.cyan, 3.5, a);
    const polyPts: [number, number][] = [[plotX + 28, plotY + plotH - 20], ...pts, [plotX + 28, pts[pts.length - 1][1]]];
    ctx.draw.fillPoly(polyPts, C.cyan, 0.16 * a);

    const sc = covAtY(px, ps, cx, cy, cr, scanY);
    ctx.draw.fillCircle(plotX + 28 + sc * (plotW - 46), plotY + 14 + scan * (plotH - 40), 6, C.gold, a);

    const cvTotal = covValue(px, py, ps, cx, cy, cr);
    ctx.draw.text(`F = ${cvTotal.toFixed(3)}`, 10, 520, 22, C.head, a, 'start');
  },
};
registerIsland(island);
