import type { Fx } from './types';

const R = 180, R2 = R * R, LIFT = 200, SPIN_SPEED = 4, SPIN_RATE = 6;

export const tornado: Fx = {
  uses3d: true,
  apply(ctx) {
    if (!ctx.glyph) return;
    const { wx, wy, mx, my, t, xi, fxXforms } = ctx;
    const dx = wx - mx, dy = wy - my;
    const d2 = dx * dx + dy * dy;
    if (d2 > R2 || d2 < 1) return;
    const d = Math.sqrt(d2);
    const f = 1 - d / R;
    const baseAng = Math.atan2(dy, dx);
    const newAng = baseAng + t * SPIN_SPEED * f;
    ctx.ox = Math.cos(newAng) * d - dx;
    ctx.oy = Math.sin(newAng) * d - dy;
    fxXforms[xi] = 0;
    fxXforms[xi + 1] = t * SPIN_RATE * f;
    fxXforms[xi + 2] = LIFT * f * (0.5 + 0.5 * Math.sin(t * 3));
    fxXforms[xi + 3] = 1 + f * 0.3;
    ctx.fx3dActive = true;
  },
};
