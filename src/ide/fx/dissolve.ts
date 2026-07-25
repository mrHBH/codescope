import type { Fx } from './types';

const DISSOLVE_MS = 2800;
let t0 = -1;

export const dissolve: Fx = {
  onExit() { t0 = -1; },

  onClick(ctx) {
    if (t0 < 0) t0 = ctx.now;
  },

  apply(ctx) {
    if (t0 < 0) return;
    const { wx, wy, glyph, hash, t: _t, w, h, i, instFA, now } = ctx;
    const elapsed = now - t0;
    const sweep = (elapsed / DISSOLVE_MS) * (w + 200) - 100;
    const threshold = h * 120;
    const local = sweep - wx + threshold;
    if (local > 0) {
      const prog = Math.min(local / 90, 1);
      const ease = prog * prog;
      if (glyph) {
        instFA[i + 11] *= 1 - ease;
        instFA[i + 2] *= 1 - ease * 0.6;
        ctx.oy += ease * 14;
        ctx.ox += (hash - 0.5) * ease * 20;
        const ember = ease * (1 - ease) * 4;
        instFA[i + 8] = Math.min(1, ctx.inst[i + 8] + ember * 0.7);
        instFA[i + 9] = Math.min(1, ctx.inst[i + 9] + ember * 0.25);
      } else {
        instFA[i + 11] *= 1 - ease * 0.85;
      }
    }
    if (elapsed > DISSOLVE_MS + 1200) t0 = -1;
  },
};
