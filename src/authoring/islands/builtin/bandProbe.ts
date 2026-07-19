// ── Island: band-probe ───────────────────────────────────────────────────────
// Star shape with horizontal band rows and a probe line, row info cards.

import { registerIsland, type IslandDef } from '../registry';
import { starPoints, ping, clamp } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.25, 0.26, 0.30, 1], cardBg: [0.13, 0.135, 0.15, 1],
  gold: [0.97, 0.73, 0.33, 1], cyan: [0.36, 0.85, 0.97, 1],
};

const island: IslandDef = {
  id: 'band-probe',
  title: 'Band probe',
  kind: 'visual',
  params: {
    bandY: { kind: 'number', label: 'Probe Y', default: 210, min: 10, max: 610 },
  },
  defaultSize: [470, 585],
  handles: [
    {
      param: 'bandY',
      at(params) { return [0, params.bandY as number]; },
      set(params, to) { (params as any).bandY = clamp(to[1], 10, 610); },
    },
  ],
  emit(ctx, params, time) {
    const a = time.alpha;
    const by = 30, bh = 420, bx = 20, bw = 320;
    // Auto-scan when playing; when paused use the live param (draggable).
    const t = time.playing ? ping(time.local > 0 ? time.local : time.now, 4.0) : ping(time.now, 4.0);
    const probeY = time.playing
      ? by + t * bh
      : clamp(params.bandY as number, by + 10, by + bh - 10);

    // Match original: single active band highlight (not a soft blob trail)
    const bands = 12, bandH = bh / bands;
    const ab = Math.max(0, Math.min(bands - 1, Math.floor((probeY - by) / bandH)));

    ctx.draw.rect(bx, by, bx + bw, by + bh, [0.025, 0.03, 0.04, 1], a);
    const shape = starPoints(bx + bw / 2, by + 210, 135, -Math.PI / 2 + 0.25);
    ctx.draw.fillPoly(shape, C.gold, 0.10 * a);
    ctx.draw.line([...shape, shape[0]], C.gold, 4, a);

    for (let k = 0; k < bands; k++) {
      const yy = by + k * bandH;
      if (k === ab) ctx.draw.rect(bx, yy, bx + bw, yy + bandH, C.cyan, 0.16 * a);
      ctx.draw.line([[bx, yy], [bx + bw, yy]], k === ab ? C.cyan : C.border, k === ab ? 3 : 1.1, a * (k === ab ? 0.85 : 0.4));
    }
    ctx.draw.rectStroke(bx, by, bx + bw, by + bh, C.border, 1.6, a);
    ctx.draw.line([[bx - 30, probeY], [bx + bw + 30, probeY]], C.cyan, 4, a);

    const bandHot = ctx.hoveredHandle === 'bandY' || ctx.grabbedHandle === 'bandY';
    ctx.draw.handle(bx - 30, probeY, bandHot, a);

    // Row info cards (original layout)
    const rtx = bx + bw + 20, rows = 5;
    for (let k = 0; k < rows; k++) {
      const yy = 40 + k * 52;
      const on = k === Math.min(rows - 1, Math.floor(ab * rows / bands));
      ctx.draw.rect(rtx, yy, rtx + 120, yy + 38, C.cardBg, on ? a : 0.8 * a);
      if (on) ctx.draw.rect(rtx, yy, rtx + 4, yy + 38, C.cyan, 0.9 * a);
      ctx.draw.text(`row ${k}`, rtx + 14, yy + 9, 16, on ? C.head : C.dim, a);
    }

    ctx.draw.text(`pixel \u2192 row ${ab}`, 10, 520, 22, C.cyan, a, 'start');
  },
};
registerIsland(island);
