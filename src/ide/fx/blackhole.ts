import type { Fx } from './types';

const BH_R = 200, BH_R2 = BH_R * BH_R, BH_CORE = 28;

export const blackhole: Fx = {
  apply(ctx) {
    if (!ctx.glyph) return;
    const { wx, wy, mx, my, i, instFA, inst } = ctx;
    const dx = wx - mx, dy = wy - my;
    const d2 = dx * dx + dy * dy;
    if (d2 < BH_R2 && d2 > 1) {
      const d = Math.sqrt(d2);
      const pull = 1 - d / BH_R;
      const swirl = pull * pull * 42;
      const inv = 1 / d;
      ctx.ox += (-dy * inv * swirl - dx * inv * pull * 18);
      ctx.oy += (dx * inv * swirl - dy * inv * pull * 18);
      if (d < BH_CORE) {
        const crush = 1 - d / BH_CORE;
        instFA[i + 2] *= Math.max(0.05, 1 - crush * 0.95);
        instFA[i + 11] *= 1 - crush;
        instFA[i + 8] = Math.min(1, inst[i + 8] + crush * 0.6);
        instFA[i + 9] *= 1 - crush * 0.7;
        instFA[i + 10] *= 1 - crush * 0.9;
      } else if (d < BH_CORE * 2.5) {
        const ring = 1 - Math.abs(d - BH_CORE * 1.6) / (BH_CORE * 0.9);
        if (ring > 0) {
          instFA[i + 2] *= 1 + ring * 0.5;
          instFA[i + 8] = Math.min(1, inst[i + 8] + ring * 0.5);
          instFA[i + 9] = Math.min(1, inst[i + 9] + ring * 0.25);
        }
      }
    }
  },
};
