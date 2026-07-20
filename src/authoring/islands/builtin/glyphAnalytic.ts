// ── Island: glyph-analytic ───────────────────────────────────────────────────
// A full-resolution analytic glyph (plain fill + outline).

import { registerIsland, type IslandDef } from '../registry';
import { buildGlyphAsset, renderGlyphAnalytic, renderGlyphOutline } from '../glyphAsset';

const GLYPH_CHAR = 'a';
let cachedGlyph: any = null;
function getGlyph(font: any) { if (!cachedGlyph) cachedGlyph = buildGlyphAsset(font, GLYPH_CHAR); return cachedGlyph; }

const island: IslandDef = {
  id: 'glyph-analytic',
  title: 'Glyph (analytic)',
  kind: 'visual',
  params: {
    color: { kind: 'color', label: 'Color', default: [0.85, 0.87, 0.91, 1] },
  },
  defaultSize: [470, 585],
  emit(ctx, params, time) {
    const g = getGlyph(ctx.font);
    const col = params.color as number[];
    const a = time.alpha;
    renderGlyphAnalytic(g, 0, 0, (g.W / g.H) * 540, 540, col, 0.92 * a, ctx.inst, ctx.crv, ctx.rws, ctx.draw.ox, ctx.draw.oy, ctx.draw.sx, ctx.draw.sy);
  },
};
registerIsland(island);
