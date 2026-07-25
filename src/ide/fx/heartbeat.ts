import type { Fx } from './types';

export const heartbeat: Fx = {
  apply(ctx) {
    const { wx, wy, glyph, t, w, i, instFA, inst } = ctx;
    const cx = w * 0.5, cy = 300;
    const dx = wx - cx, dy = wy - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const beat = t % 1.1;
    const pulse = beat < 0.12 ? Math.sin(beat / 0.12 * Math.PI) : beat < 0.28 ? 0.6 * Math.sin((beat - 0.12) / 0.16 * Math.PI) : 0;
    const wave = Math.max(0, pulse - d * 0.0012);
    if (glyph) {
      instFA[i + 2] *= 1 + wave * 0.22;
      instFA[i + 8] = Math.min(1, inst[i + 8] + wave * 0.7);
      instFA[i + 9] *= 1 - wave * 0.4;
      instFA[i + 10] *= 1 - wave * 0.4;
    }
    ctx.ox += (dx / d) * wave * 5;
    ctx.oy += (dy / d) * wave * 5;
  },
};
