import { fxHash, type Fx } from './types';

export const glitch: Fx = {
  apply(ctx) {
    const { wy, glyph, hash, t, i, instFA } = ctx;
    const sliceY = Math.floor(wy / 18);
    const sliceH = fxHash(sliceY * 31 + Math.floor(t * 8));
    if (sliceH > 0.7) {
      ctx.ox += (fxHash(sliceY * 17 + Math.floor(t * 12)) - 0.5) * 30 * ((sliceH - 0.7) / 0.3);
    }
    if (glyph && hash > 0.88) {
      ctx.ox += (Math.sin(t * 47 + hash * 100) > 0 ? 1 : -1) * 3;
      ctx.oy += (Math.cos(t * 53 + hash * 200) > 0 ? 1 : -1) * 2;
      const ch = Math.floor(t * 14 + hash * 10) % 3;
      if (ch === 0) { instFA[i + 8] = 1; instFA[i + 9] = 0.1; instFA[i + 10] = 0.1; }
      else if (ch === 1) { instFA[i + 8] = 0.1; instFA[i + 9] = 1; instFA[i + 10] = 0.2; }
      else { instFA[i + 8] = 0.2; instFA[i + 9] = 0.3; instFA[i + 10] = 1; }
    }
    if (glyph && hash > 0.95) instFA[i + 11] *= Math.sin(t * 30 + hash * 50) > 0 ? 1 : 0.15;
  },
};
