// ── Island: winding-ray ──────────────────────────────────────────────────────
// Star shape with winding test: a test point, horizontal ray, inside/outside label.

import { registerIsland, type IslandDef } from '../registry';
import { starPoints, lerp, ping, clamp01 } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  accent2: [0.66, 0.42, 0.92, 1], gold: [0.97, 0.73, 0.33, 1], cyan: [0.36, 0.85, 0.97, 1],
  green: [0.30, 0.80, 0.40, 1], rose: [0.93, 0.36, 0.34, 1],
};

const island: IslandDef = {
  id: 'winding-ray',
  title: 'Winding ray',
  kind: 'visual',
  params: {
    testPoint: { kind: 'point', label: 'Test point', default: [100, 100] },
  },
  defaultSize: [470, 585],
  handles: [
    {
      param: 'testPoint',
      at(params) { return (params.testPoint as number[]) as [number, number]; },
      set(params, to) {
        (params as any).testPoint = [Math.max(10, Math.min(390, to[0])), Math.max(10, Math.min(580, to[1]))];
      },
    },
  ],
  emit(ctx, params, time) {
    const a = time.alpha;
    const tp = params.testPoint as number[];
    const cx = 220, cy = 200, r = 165;
    const shape = starPoints(cx, cy, r, -Math.PI / 2 + 0.2);

    ctx.draw.fillPoly(shape, C.accent2, 0.07 * a);
    ctx.draw.line([...shape, shape[0]], C.accent2, 4, a);

    // Horizontal ray from test point
    ctx.draw.line([[tp[0], tp[1]], [430, tp[1]]], C.gold, 3, a, [12, 10]);
    ctx.draw.fillCircle(tp[0], tp[1], 8, C.gold, a);

    const testHot = ctx.hoveredHandle === 'testPoint' || ctx.grabbedHandle === 'testPoint';
    ctx.draw.handle(tp[0], tp[1], testHot, a);

    const inside = Math.hypot(tp[0] - cx, tp[1] - cy) < r * 0.62;
    ctx.draw.text(inside ? 'inside \u00B7 w = 1' : 'outside \u00B7 w = 0', 10, 520, 24, inside ? C.green : C.rose, a, 'start');

    // Orbiting dot on star perimeter
    const t = time.playing ? ping(time.local, 5.0) : ping(time.now, 5.0);
    const seg = t * 10, k = Math.floor(seg) % 10, f = seg - Math.floor(seg);
    const p0 = shape[k], p1 = shape[(k + 1) % 10];
    ctx.draw.fillCircle(lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f), 7, C.cyan, a);
  },
};
registerIsland(island);
