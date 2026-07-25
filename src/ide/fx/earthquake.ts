import type { Fx } from './types';

export const earthquake: Fx = {
  apply(ctx) {
    const { wx, wy, glyph, hash, t, w, i, instFA } = ctx;
    const mag = Math.sin(t * 0.4) * 0.5 + 0.5;
    const amp = mag * mag * 7;
    const depthPhase = wy * 0.008;
    ctx.ox += amp * Math.sin(t * 23 + depthPhase) * (0.5 + hash * 0.5);
    ctx.oy += amp * 0.6 * Math.cos(t * 19 + depthPhase * 1.3);
    const waveX = ((t * 200) % (w + 300)) - 150;
    const dw = Math.abs(wx - waveX);
    if (dw < 60) {
      const crest = (1 - dw / 60) * mag;
      ctx.oy -= crest * 12;
      if (glyph) instFA[i + 2] *= 1 + crest * 0.15;
    }
    if (glyph && mag > 0.7 && hash > 0.92) {
      instFA[i + 11] *= 0.4 + 0.6 * Math.abs(Math.sin(t * 40 + hash * 80));
    }
  },
};
