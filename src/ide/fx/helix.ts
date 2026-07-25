import { fxHash, type Fx } from './types';

const R = 200, R2 = R * R, HELIX_R = 60, HELIX_H = 300, ROT_SPEED = 2, LIFE = 4;
const TAU = Math.PI * 2;
const clicks: { x: number; y: number; t: number }[] = [];

export const helix: Fx = {
  uses3d: true,
  onExit() { clicks.length = 0; },
  onClick(ctx, wx, wy) { clicks.push({ x: wx, y: wy, t: ctx.t }); ctx.tilt?.(0.6); },
  apply(ctx) {
    if (!ctx.glyph) return;
    const { wx, wy, hash, t, i, xi, fxXforms, instFA, inst } = ctx;
    for (let r = clicks.length - 1; r >= 0; r--) {
      const c = clicks[r];
      const age = t - c.t;
      if (age > LIFE) { clicks.splice(r, 1); continue; }
      const dx = wx - c.x, dy = wy - c.y;
      if (dx * dx + dy * dy > R2) continue;
      const p = Math.min(age / 1.5, 1);
      const e = p * p * (3 - 2 * p);
      const strand = ((i / 16) | 0) % 2;
      const ang = hash * TAU * 6 + t * ROT_SPEED;
      const tx = c.x + Math.cos(ang + strand * Math.PI) * HELIX_R;
      const ty = c.y + (hash - 0.5) * HELIX_H;
      const tz = Math.sin(ang + strand * Math.PI) * HELIX_R;
      ctx.ox = (tx - wx) * e;
      ctx.oy = (ty - wy) * e;
      fxXforms[xi] = e * hash * 3;
      fxXforms[xi + 1] = e * fxHash(i + 1) * 3;
      fxXforms[xi + 2] = tz * e;
      fxXforms[xi + 3] = 1 - 0.3 * e;
      ctx.fx3dActive = true;
      instFA[i + 8] = inst[i + 8] * (1 - e) + 0.4 * e;
      instFA[i + 9] = inst[i + 9] * (1 - e) + 0.8 * e;
      instFA[i + 10] = inst[i + 10] * (1 - e) + 1.0 * e;
    }
  },
};
