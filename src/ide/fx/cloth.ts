import type { Fx } from './types';

const REP_R = 72, REP_R2 = REP_R * REP_R, REP_STR = 16;
const CLOTH_AX = 2.8, CLOTH_AY = 1.4, CLOTH_FX = 0.028, CLOTH_FY = 0.038, CLOTH_SX = 1.6, CLOTH_SY = 2.2;

export const cloth: Fx = {
  apply(ctx) {
    const { wx, wy, glyph, mx, my, t, w } = ctx;
    if (glyph) {
      const dx = wx - mx, dy = wy - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < REP_R2 && d2 > 1) {
        const d = Math.sqrt(d2), f = 1 - d / REP_R, s = REP_STR * f * f;
        ctx.ox = (dx / d) * s; ctx.oy = (dy / d) * s;
      }
    }
    const frac = wx / Math.max(w, 1);
    ctx.ox += CLOTH_AX * Math.sin(wy * CLOTH_FY - t * CLOTH_SY) * frac;
    ctx.oy += CLOTH_AY * Math.sin(wx * CLOTH_FX - t * CLOTH_SX) * frac;
  },
};
