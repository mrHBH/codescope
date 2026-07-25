import type { Fx } from './types';

const A1 = 18, A2 = 12, A3 = 8;
const F1 = 0.012, F2 = 0.015, F3 = 0.008;
const S1 = 1.2, S2 = 0.9, S3 = 0.7;

export const ocean: Fx = {
  uses3d: true,
  apply(ctx) {
    if (!ctx.glyph) return;
    const { wx, wy, t, xi, fxXforms, instFA, inst } = ctx;
    const p1 = wx * F1 + t * S1, p2 = wy * F2 - t * S2, p3 = (wx + wy) * F3 + t * S3;
    const z = A1 * Math.sin(p1) + A2 * Math.sin(p2) + A3 * Math.cos(p3);
    const dzdx = A1 * F1 * Math.cos(p1) - A3 * F3 * Math.sin(p3);
    const dzdy = A2 * F2 * Math.cos(p2) - A3 * F3 * Math.sin(p3);
    fxXforms[xi] = dzdy;
    fxXforms[xi + 1] = -dzdx;
    fxXforms[xi + 2] = z;
    fxXforms[xi + 3] = 1;
    ctx.fx3dActive = true;
    const tn = z * 0.012;
    instFA[ctx.i + 9] = Math.min(1, inst[ctx.i + 9] + Math.max(0, tn));
    instFA[ctx.i + 10] = Math.min(1, inst[ctx.i + 10] + Math.max(0, tn * 0.6));
  },
};
