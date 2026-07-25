import type { Fx } from './types';

const CURL_W = 200, CURL_H = 60;

export const curl: Fx = {
  uses3d: true,
  apply(ctx) {
    const dist = ctx.wx - ctx.mx;
    if (dist <= 0) return;
    const prog = Math.min(dist / CURL_W, 1);
    ctx.fxXforms[ctx.xi] = 0;
    ctx.fxXforms[ctx.xi + 1] = prog * Math.PI * 0.8;
    ctx.fxXforms[ctx.xi + 2] = Math.sin(prog * Math.PI) * CURL_H;
    ctx.fxXforms[ctx.xi + 3] = 1;
    ctx.fx3dActive = true;
    ctx.ox = -prog * CURL_W * 0.3;
    ctx.instFA[ctx.i + 11] *= 1 - prog * 0.3;
  },
};
