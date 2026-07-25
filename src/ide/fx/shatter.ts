import { fxHash, type Fx } from './types';

const R = 250, R2 = R * R, BURST_Z = 300, BURST_ROT = 8, BURST_R = 120, LIFE = 2.5;
const clicks: { x: number; y: number; t: number }[] = [];

export const shatter: Fx = {
  uses3d: true,
  onExit() { clicks.length = 0; },
  onClick(ctx, wx, wy) { clicks.push({ x: wx, y: wy, t: ctx.t }); ctx.tilt?.(0.55); },
  apply(ctx) {
    if (!ctx.glyph) return;
    const { wx, wy, hash, t, i, xi, fxXforms, instFA, inst } = ctx;
    for (let r = clicks.length - 1; r >= 0; r--) {
      const c = clicks[r];
      const age = t - c.t;
      if (age > LIFE) { clicks.splice(r, 1); continue; }
      const dx = wx - c.x, dy = wy - c.y;
      if (dx * dx + dy * dy > R2) continue;
      const bp = Math.min(age / 0.8, 1);
      const rp = Math.max(0, Math.min((age - 0.8) / 1.7, 1));
      const e = bp * (1 - rp);
      fxXforms[xi] = e * BURST_ROT * (hash - 0.5) * 2;
      fxXforms[xi + 1] = e * BURST_ROT * (fxHash(i + 1) - 0.5) * 2;
      fxXforms[xi + 2] = e * BURST_Z * (0.5 + hash);
      fxXforms[xi + 3] = 1;
      ctx.fx3dActive = true;
      ctx.ox += e * BURST_R * (hash - 0.5);
      ctx.oy += e * BURST_R * (fxHash(i + 3) - 0.5);
      instFA[i + 8] = Math.min(1, inst[i + 8] + e);
      instFA[i + 9] = Math.min(1, inst[i + 9] + e * 0.8);
      instFA[i + 10] = Math.min(1, inst[i + 10] + e * 0.6);
    }
  },
};
