// ── Island: tessellation-fan ─────────────────────────────────────────────────
// A glyph rendered as a coarse polygonal tessellation with outline.
// Static outside its build/fade windows → the whole emit is replayed through an
// EmitCache (quantized sig) instead of re-banding thousands of quads per frame.

import { registerIsland, type IslandDef } from '../registry';
import { buildGlyphAsset, renderGlyphTess } from '../glyphAsset';
import { EmitCache } from '../../../windfoil/emitCache';

const GLYPH_CHAR = 'a';
let cachedGlyph: any = null;
function getGlyph(font: any) { if (!cachedGlyph) cachedGlyph = buildGlyphAsset(font, GLYPH_CHAR); return cachedGlyph; }

let emitCache: EmitCache | null = null;

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
    const t = time.build < 1 ? time.build : 1;
    const sub = 1 + Math.round(t * Math.min(params.maxSub as number, 3));
    const d = ctx.draw;
    // Quantized signature: rebuilds only while build/alpha actually move (and on
    // layout transforms); a static frame replays the captured instance slice.
    const sig = [
      sub, Math.round(t * 40), Math.round(time.alpha * 24),
      Math.round(d.ox * 8) / 8, Math.round(d.oy * 8) / 8,
      Math.round(d.sx * 1024) / 1024, Math.round(d.sy * 1024) / 1024,
    ].join('|');
    (emitCache ??= new EmitCache()).run(sig, ctx.inst, ctx.crv, ctx.rws, () => {
      renderGlyphTess(g, 0, 0, (g.W / g.H) * 540, 540, sub, params.color as number[], time.alpha, t, ctx.inst, ctx.crv, ctx.rws, d.ox, d.oy, d.sx, d.sy);
    });
  },
};
registerIsland(island);
