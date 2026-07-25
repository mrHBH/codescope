import type { Fx } from './types';

const SPEED = 200, FREQ = 0.05, AMP = 40, LIFE = 3;
const clicks: { x: number; y: number; t: number }[] = [];

export const ripple: Fx = {
  uses3d: true,
  onExit() { clicks.length = 0; },
  onClick(ctx, wx, wy) { clicks.push({ x: wx, y: wy, t: ctx.t }); ctx.tilt?.(0.5); },
  apply(ctx) {
    const { wx, wy, t, xi, fxXforms } = ctx;
    for (let r = clicks.length - 1; r >= 0; r--) {
      const c = clicks[r];
      const age = t - c.t;
      if (age > LIFE) { clicks.splice(r, 1); continue; }
      const ring = age * SPEED;
      const decay = Math.exp(-age * 1.5);
      const dx = wx - c.x, dy = wy - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const z = Math.sin((d - ring) * FREQ) * AMP * decay;
      const dxp = Math.sqrt((wx + 1 - c.x) * (wx + 1 - c.x) + dy * dy);
      const dyp = Math.sqrt(dx * dx + (wy + 1 - c.y) * (wy + 1 - c.y));
      const dzdx = Math.sin((dxp - ring) * FREQ) * AMP * decay - z;
      const dzdy = Math.sin((dyp - ring) * FREQ) * AMP * decay - z;
      fxXforms[xi] = dzdy * 0.5;
      fxXforms[xi + 1] = -dzdx * 0.5;
      fxXforms[xi + 2] = z;
      fxXforms[xi + 3] = 1;
      ctx.fx3dActive = true;
    }
  },
};
