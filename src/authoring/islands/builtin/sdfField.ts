// ── Island: sdf-field ────────────────────────────────────────────────────────
// A glyph's signed-distance field visualization — colored banded grid.

import { registerIsland, type IslandDef } from '../registry';
import { buildGlyphAsset, renderGlyphField } from '../glyphAsset';
import { ping, clamp01 } from '../../builder/helpers';

const GLYPH_CHAR = 'a';
let cachedGlyph: any = null;
function getGlyph(font: any) { if (!cachedGlyph) cachedGlyph = buildGlyphAsset(font, GLYPH_CHAR); return cachedGlyph; }

const island: IslandDef = {
  id: 'sdf-field',
  title: 'SDF field',
  kind: 'visual',
  params: {
    fine: { kind: 'number', label: 'Grid density', default: 44, min: 10, max: 100, step: 1 },
  },
  defaultSize: [470, 585],
  emit(ctx, params, time) {
    const g = getGlyph(ctx.font);
    const t = time.playing ? clamp01(time.build) : ping(time.now, 4.0);
    renderGlyphField(g, 0, 0, (g.W / g.H) * 540, 540, params.fine as number, time.alpha, t, ctx.draw, ctx.inst, ctx.crv, ctx.rws);
  },
};
registerIsland(island);
