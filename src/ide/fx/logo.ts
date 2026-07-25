import { wSDF, type Fx } from './types';

function buildGlyphMap(inst: number[]): Map<number, number> {
  const m = new Map<number, number>();
  let g = 0;
  for (let i = 0; i < inst.length; i += 16) if (inst[i + 3] < 1.5) m.set(i, g++);
  return m;
}

let t0 = -1;
let targets: Float32Array | null = null;
let glyphMap = new Map<number, number>();

export const logo: Fx = {
  onExit() { t0 = -1; targets = null; glyphMap = new Map(); },

  preFrame(ctx) {
    if (t0 >= 0) return;
    t0 = ctx.now;
    glyphMap = buildGlyphMap(ctx.inst);
    const gCount = glyphMap.size;
    const cell = 7;
    const gw = Math.floor(ctx.w * 0.72 / cell), gh = Math.floor(ctx.h * 0.62 / cell);
    const gx0 = ctx.w * 0.14, gy0 = ctx.h * 0.19;
    const strokeW = 0.11;
    const cells: number[] = [];
    for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
      if (wSDF((c + 0.5) / gw, (r + 0.5) / gh) < strokeW) cells.push(gx0 + (c + 0.5) * cell, gy0 + (r + 0.5) * cell);
    }
    const nc = cells.length / 2;
    targets = new Float32Array(gCount * 2);
    for (let g = 0; g < gCount; g++) {
      const ci = nc > 0 ? g % nc : 0;
      targets[g * 2] = nc > 0 ? cells[ci * 2] : ctx.w / 2;
      targets[g * 2 + 1] = nc > 0 ? cells[ci * 2 + 1] : ctx.h / 2;
    }
  },

  apply(ctx) {
    if (!targets) return;
    const elapsed = (ctx.now - t0) / 1000;
    const prog = Math.min(elapsed / 3.2, 1);
    const ease = prog < 0.5 ? 4 * prog * prog * prog : 1 - Math.pow(-2 * prog + 2, 3) / 2;
    const gi = glyphMap.get(ctx.i);
    if (gi !== undefined) {
      const tx = targets[gi * 2], ty = targets[gi * 2 + 1];
      const lx = ctx.inst[ctx.i], ly = ctx.inst[ctx.i + 1];
      ctx.instFA[ctx.i] = lx + (tx - lx) * ease;
      ctx.instFA[ctx.i + 1] = ly + (ty - ly) * ease;
      const wave = ease * 0.14 * Math.sin(tx * 0.045 + ctx.t * 2.6) * Math.cos(ty * 0.035 + ctx.t * 1.8);
      ctx.instFA[ctx.i + 2] = ctx.inst[ctx.i + 2] * (1 - ease * 0.35 + wave);
      ctx.instFA[ctx.i + 1] += ease * 3.5 * Math.sin(tx * 0.03 + ctx.t * 1.4);
      const hue = (tx * 0.004 + ty * 0.003 + ctx.t * 0.12) % 1;
      const cr = Math.max(0, Math.min(1, Math.abs(hue * 6 - 3) - 1));
      const cg = Math.max(0, Math.min(1, 2 - Math.abs(hue * 6 - 2)));
      const cb = Math.max(0, Math.min(1, 2 - Math.abs(hue * 6 - 4)));
      ctx.instFA[ctx.i + 8] = ctx.inst[ctx.i + 8] * (1 - ease) + cr * ease;
      ctx.instFA[ctx.i + 9] = ctx.inst[ctx.i + 9] * (1 - ease) + cg * ease;
      ctx.instFA[ctx.i + 10] = ctx.inst[ctx.i + 10] * (1 - ease) + cb * ease;
      ctx.ox = 0; ctx.oy = 0;
      return;
    }
    ctx.instFA[ctx.i + 11] *= 1 - ease;
    ctx.ox = 0; ctx.oy = 0;
  },
};
