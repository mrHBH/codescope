import type { Fx } from './types';

const R = 150, R2 = R * R, MAX_Z = 80, TILT_MAX = 0.6;

export const standup: Fx = {
  uses3d: true,
  apply(ctx) {
    if (!ctx.glyph) return;
    const { wx, wy, mx, my, xi, fxXforms } = ctx;
    const dx = wx - mx, dy = wy - my;
    const d2 = dx * dx + dy * dy;
    if (d2 > R2 || d2 < 1) return;
    const d = Math.sqrt(d2);
    const f = 1 - d / R;
    const ff = f * f;
    fxXforms[xi] = (dy / d) * TILT_MAX * f;
    fxXforms[xi + 1] = (dx / d) * TILT_MAX * f;
    fxXforms[xi + 2] = MAX_Z * ff;
    fxXforms[xi + 3] = 1 + f * 0.2;
    ctx.fx3dActive = true;
  },
};
