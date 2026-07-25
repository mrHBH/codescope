import { fxHash, type Fx } from './types';

export const matrix: Fx = {
  apply(ctx) {
    const { wx, glyph, hash, t, i, instFA } = ctx;
    const col = Math.floor(wx / 9);
    const speed = 40 + fxHash(col * 7) * 80;
    const phase = fxHash(col * 13) * 600;
    ctx.oy += ((t * speed + phase) % 70) - 35;
    const flicker = Math.sin(t * (3 + hash * 5) + hash * 40) * 0.5 + 0.5;
    if (glyph) {
      instFA[i + 8] = 0.1 + 0.15 * flicker;
      instFA[i + 9] = 0.7 + 0.3 * flicker;
      instFA[i + 10] = 0.15 + 0.1 * flicker;
      instFA[i + 11] *= 0.35 + 0.65 * flicker;
    }
  },
};
