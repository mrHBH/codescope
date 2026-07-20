// ── Island: gpu-pipeline ─────────────────────────────────────────────────────
// Animated GPU pipeline diagram with cycling hot stage highlight.

import { registerIsland, type IslandDef } from '../registry';
import { buildGlyphAsset, renderGlyphAnalytic, renderGlyphOutline } from '../glyphAsset';
import { loop01 } from '../../builder/helpers';
import { strokeInto } from '../../../windgraph/stroke/stroke';

const GLYPH_CHAR = 'a';
let cachedGlyph: any = null;
function getGlyph(font: any) { if (!cachedGlyph) cachedGlyph = buildGlyphAsset(font, GLYPH_CHAR); return cachedGlyph; }

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.25, 0.26, 0.30, 1], cardBg: [0.13, 0.135, 0.15, 1],
  accent: [0.12, 0.60, 0.95, 1], gold: [0.97, 0.73, 0.33, 1],
  green: [0.30, 0.80, 0.40, 1], cyan: [0.36, 0.85, 0.97, 1], ink: [0.85, 0.87, 0.91, 1],
};

const island: IslandDef = {
  id: 'gpu-pipeline',
  title: 'GPU pipeline',
  kind: 'visual',
  params: {},
  defaultSize: [620, 520],
  emit(ctx, params, time) {
    const a = time.alpha;
    const g = getGlyph(ctx.font);
    const hot = Math.floor(loop01(time.now, 6) * 5);

    const gx = 0, gy = 0, gw = 280, gh = 330;
    ctx.draw.rect(gx, gy, gx + gw, gy + gh, C.cardBg, a);
    ctx.draw.rectStroke(gx, gy, gx + gw, gy + gh, hot === 0 ? C.accent : C.border, hot === 0 ? 3 : 1.3, a);
    if (hot === 0) ctx.draw.rect(gx, gy, gx + 4, gy + gh, C.accent, 0.9 * a);
    renderGlyphAnalytic(g, gx + 25, gy + 34, gw - 50, gh - 70, C.ink, 0.22 * a, ctx.inst, ctx.crv, ctx.rws, ctx.draw.ox, ctx.draw.oy, ctx.draw.sx, ctx.draw.sy);
    renderGlyphOutline(g, gx + 25, gy + 34, gw - 50, gh - 70, hot === 0 ? C.accent : C.head, hot === 0 ? 4 : 2, a, ctx.inst, ctx.crv, ctx.rws, ctx.draw.ox, ctx.draw.oy, ctx.draw.sx, ctx.draw.sy);
    ctx.draw.text('1 \u2192 true glyph outline', gx + 20, gy + gh - 22, 15, hot === 0 ? C.accent : C.dim, a);

    const rx = 320, ry = 0;
    const labels = ['outline curves', 'monotone pieces', 'row bands', 'instance: bbox + rowBase', 'shader: gather + integrate'];
    for (let k = 0; k < 5; k++) {
      const yy = ry + k * 72;
      ctx.draw.rect(rx, yy, rx + 250, yy + 52, C.cardBg, a);
      ctx.draw.rectStroke(rx, yy, rx + 250, yy + 52, hot === k ? C.accent : C.border, hot === k ? 3 : 1.3, a);
      if (hot === k) ctx.draw.rect(rx, yy, rx + 4, yy + 52, C.accent, 0.9 * a);
      ctx.draw.text(labels[k], rx + 16, yy + 17, 17, hot === k ? C.head : C.body, a);
      if (k < 4) {
        const ax = rx + 125, ay0 = yy + 55, ay1 = yy + 70;
        ctx.draw.line([[ax, ay0], [ax, ay1]], hot === k ? C.accent : C.dim, 3, a);
        ctx.draw.fillPoly([[ax, ay1 + 6], [ax - 5, ay1], [ax + 5, ay1]], hot === k ? C.accent : C.dim, a);
      }
    }

    const bx = gx + 70, by = gy + 80, bw = 150, bh = 175;
    if (hot === 2 || hot === 4) {
      for (let r = 0; r < 7; r++) {
        const yy = by + r * bh / 7;
        ctx.draw.line([[bx, yy], [bx + bw, yy]], r === 3 ? C.cyan : C.border, r === 3 ? 3 : 1.2, a * (r === 3 ? 0.9 : 0.35));
      }
    }
    if (hot === 3 || hot === 4) ctx.draw.rectStroke(bx + 20, by + 70, bx + 72, by + 122, C.green, 3, a);
    if (hot === 4) {
      ctx.draw.fillCircle(bx + 46, by + 96, 7, C.gold, a);
      ctx.draw.arrow(bx + 46, by + 96, rx + 230, ry + 4 * 72 + 26, C.gold, 3, a);
    }
  },
};
registerIsland(island);
