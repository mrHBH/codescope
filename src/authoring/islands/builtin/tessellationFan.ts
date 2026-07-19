// ── Island: tessellation-fan ─────────────────────────────────────────────────
// A glyph rendered as a coarse polygonal tessellation with outline.

import { registerIsland, type IslandDef } from '../registry';
import { buildGlyphAsset, renderGlyphTess } from '../glyphAsset';
import { ping, clamp01 } from '../../builder/helpers';

const GLYPH_CHAR = 'a';
let cachedGlyph: any = null;
function getGlyph(font: any) { if (!cachedGlyph) cachedGlyph = buildGlyphAsset(font, GLYPH_CHAR); return cachedGlyph; }

const island: IslandDef = {
  id: 'tessellation-fan',
  title: 'Tessellation fan',
  kind: 'visual',
  params: {
    maxSub: { kind: 'number', label: 'Max subdivisions', default: 3, min: 1, max: 6, step: 1 },
    color: { kind: 'color', label: 'Color', default: [0.66, 0.42, 0.92, 1] },
  },
  defaultSize: [470, 585],
  emit(ctx, params, time) {
    const g = getGlyph(ctx.font);
    const t = time.playing ? clamp01(time.build) : ping(time.now, 4.0);
    const sub = 1 + Math.round(t * (params.maxSub as number));
    renderGlyphTess(g, 0, 0, (g.W / g.H) * 540, 540, sub, params.color as number[], time.alpha, t, ctx.inst, ctx.crv, ctx.rws, ctx.draw.ox, ctx.draw.oy);
  },
};
registerIsland(island);
