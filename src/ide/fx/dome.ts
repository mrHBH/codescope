import type { Fx } from './types';

const AMP = 60, FREQ = 0.008, SPEED = 1.5;

export const dome: Fx = {
  uses3d: true,
  apply(ctx) {
    if (!ctx.glyph) return;
    const { wx, wy, t, w, h, xi, fxXforms, instFA, inst } = ctx;
    const cx = w / 2, cy = h / 2;
    const dx = wx - cx, dy = wy - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const breathe = 0.5 + 0.5 * Math.sin(t * SPEED);
    const z = AMP * Math.cos(d * FREQ) * breathe;
    const slope = -AMP * FREQ * Math.sin(d * FREQ) * breathe;
    fxXforms[xi] = slope * (dy / d);
    fxXforms[xi + 1] = -slope * (dx / d);
    fxXforms[xi + 2] = z;
    fxXforms[xi + 3] = 1 + z * 0.001;
    ctx.fx3dActive = true;
    const warm = z * 0.01;
    instFA[ctx.i + 8] = Math.min(1, inst[ctx.i + 8] + Math.max(0, warm));
    instFA[ctx.i + 10] = Math.min(1, inst[ctx.i + 10] + Math.max(0, -warm * 0.5));
  },
};
