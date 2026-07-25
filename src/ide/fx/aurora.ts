import { hueRgb, type Fx } from './types';

export const aurora: Fx = {
  apply(ctx) {
    const { wx, wy, glyph, t, i, instFA, inst } = ctx;
    ctx.oy += 3.5 * Math.sin(wx * 0.018 + t * 0.7) + 2 * Math.sin(wx * 0.031 - t * 1.1);
    ctx.ox += 1.5 * Math.cos(wy * 0.022 + t * 0.5);
    if (glyph) {
      const hue = (wx * 0.003 + wy * 0.002 + t * 0.15) % 1;
      const [r, g, b] = hueRgb(hue);
      instFA[i + 8] = r * 0.7 + inst[i + 8] * 0.3;
      instFA[i + 9] = g * 0.7 + inst[i + 9] * 0.3;
      instFA[i + 10] = b * 0.7 + inst[i + 10] * 0.3;
    }
    instFA[i + 2] *= 1 + 0.06 * Math.sin(t * 1.8 + wx * 0.01);
  },
};
