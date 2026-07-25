import type { Fx } from './types';

const SN_R = 240, SN_R2 = SN_R * SN_R, SN_LIFE = 1.8, SN_SPEED = 320;

const clicks: { x: number; y: number; t: number }[] = [];

export const supernova: Fx = {
  onExit() { clicks.length = 0; },

  onClick(_ctx, wx, wy) {
    if (clicks.length < 10) clicks.push({ x: wx, y: wy, t: _ctx.t });
  },

  apply(ctx) {
    const { wx, wy, glyph, t, i, instFA, inst } = ctx;
    for (let r = clicks.length - 1; r >= 0; r--) {
      const c = clicks[r];
      const age = t - c.t;
      if (age > SN_LIFE) { clicks.splice(r, 1); continue; }
      const dx = wx - c.x, dy = wy - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > SN_R2 || d2 < 1) continue;
      const d = Math.sqrt(d2);
      const ring = age * SN_SPEED;
      const behind = d < ring;
      const fade = Math.max(0, 1 - age / SN_LIFE);
      if (behind) {
        const scorch = Math.max(0, 1 - (ring - d) / 80) * fade;
        if (glyph && scorch > 0.01) {
          instFA[i + 8] = Math.min(1, inst[i + 8] + scorch);
          instFA[i + 9] = Math.min(1, inst[i + 9] + scorch * 0.85);
          instFA[i + 10] = Math.min(1, inst[i + 10] + scorch * 0.6);
          instFA[i + 2] *= 1 - scorch * 0.55;
          instFA[i + 11] *= 1 - scorch * 0.7;
        }
      }
      const dw = Math.abs(d - ring);
      if (dw < 30) {
        const crest = (1 - dw / 30) * fade;
        const inv = 1 / d;
        ctx.ox += dx * inv * crest * 22;
        ctx.oy += dy * inv * crest * 22;
        if (glyph) {
          instFA[i + 2] *= 1 + crest * 0.4;
          instFA[i + 8] = Math.min(1, inst[i + 8] + crest * 0.9);
          instFA[i + 9] = Math.min(1, inst[i + 9] + crest * 0.7);
          instFA[i + 10] = Math.min(1, inst[i + 10] + crest * 0.3);
        }
      }
    }
  },
};
