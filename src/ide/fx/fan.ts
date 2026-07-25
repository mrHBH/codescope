import type { Fx } from './types';

const ROW_H = 22, Z_STEP = 12, WOBBLE = 4, TILT = 0.15;

export const fan: Fx = {
  uses3d: true,
  apply(ctx) {
    const { wy, t, xi, fxXforms } = ctx;
    const row = Math.floor(wy / ROW_H);
    const z = row * Z_STEP + Math.sin(t * 0.5 + row * 0.3) * WOBBLE;
    fxXforms[xi] = TILT;
    fxXforms[xi + 1] = 0;
    fxXforms[xi + 2] = z;
    fxXforms[xi + 3] = 1;
    ctx.fx3dActive = true;
    ctx.ox += Math.sin(row * 0.7) * 3;
  },
};
