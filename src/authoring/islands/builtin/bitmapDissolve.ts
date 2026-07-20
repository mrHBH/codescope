// ── Island: bitmap-dissolve ──────────────────────────────────────────────────
// A glyph's bitmap representation — coarse pixel grid with a sweep line.

import { registerIsland, type IslandDef } from '../registry';
import { buildGlyphAsset, renderGlyphBitmap } from '../glyphAsset';

const GLYPH_CHAR = 'a';
let cachedGlyph: any = null;
function getGlyph(font: any) { if (!cachedGlyph) cachedGlyph = buildGlyphAsset(font, GLYPH_CHAR); return cachedGlyph; }

const island: IslandDef = {
  id: 'bitmap-dissolve',
  title: 'Bitmap dissolve',
  kind: 'visual',
  params: {
    cells: { kind: 'number', label: 'Grid cells', default: 16, min: 4, max: 32, step: 1 },
    color: { kind: 'color', label: 'Color', default: [0.93, 0.36, 0.34, 1] },
  },
  defaultSize: [470, 585],
  emit(ctx, params, time) {
    const g = getGlyph(ctx.font);
    const t = time.build < 1 ? time.build : 1;
    renderGlyphBitmap(g, 0, 0, (g.W / g.H) * 540, 540, params.cells as number, params.color as number[], time.alpha, t, ctx.draw);
  },
};
registerIsland(island);
