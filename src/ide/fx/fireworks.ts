import { fxHash, type Fx } from './types';

const FW_R = 220, FW_R2 = FW_R * FW_R, FW_STR = 40, FW_LIFE = 3.0, FW_GRAV = 90;
const FW_Z_STR = 260, FW_SPIN = 4.5;

interface FwParticle {
  src: number; x: number; y: number;
  vx: number; vy: number; vz: number; z: number;
  rotX: number; rotY: number; spinX: number; spinY: number;
  birth: number; life: number;
}

const clicks: { x: number; y: number; t: number }[] = [];
const particles: FwParticle[] = [];
let extraFA = new Float32Array(4096);
let extraXF = new Float32Array(1024);
let extraN = 0;

export const fireworks: Fx = {
  uses3d: true,

  onExit() {
    clicks.length = 0;
    particles.length = 0;
    extraN = 0;
  },

  onClick(ctx, wx, wy) {
    if (clicks.length >= 10) return;
    clicks.push({ x: wx, y: wy, t: ctx.t });
    if (!ctx.cam3d) return;
    ctx.tilt?.(0.55);
    const glyphIdxs: number[] = [];
    for (let gi = 0; gi < ctx.inst.length; gi += 16) {
      if (ctx.inst[gi + 3] < 1.5) {
        const dx = ctx.inst[gi] - wx, dy = ctx.inst[gi + 1] - wy;
        if (dx * dx + dy * dy < FW_R2) glyphIdxs.push(gi);
      }
    }
    const count = Math.min(glyphIdxs.length, 40);
    const seq = clicks.length;
    for (let p = 0; p < count; p++) {
      const src = glyphIdxs[Math.floor(fxHash(p * 77 + seq * 13) * glyphIdxs.length)];
      const ang = fxHash(p * 31 + seq * 7) * Math.PI * 2;
      const spd = 60 + fxHash(p * 53) * 140;
      particles.push({
        src, x: ctx.inst[src], y: ctx.inst[src + 1],
        vx: Math.cos(ang) * spd * 0.4, vy: Math.sin(ang) * spd * 0.3,
        vz: 180 + fxHash(p * 19) * 200, z: 0,
        rotX: 0, rotY: 0,
        spinX: (fxHash(p * 41) - 0.5) * 10, spinY: (fxHash(p * 67) - 0.5) * 12,
        birth: ctx.t, life: 1.8 + fxHash(p * 23) * 1.2,
      });
    }
  },

  preFrame(ctx) {
    const need = ctx.instCount * 4;
    if (ctx.fxXforms.length < need) ctx.allocXforms(ctx.instCount);
    ctx.fxXforms.fill(0, 0, need);
  },

  apply(ctx) {
    const { wx, wy, glyph, hash, t, i, xi, inst, instFA, fxXforms } = ctx;
    for (let r = clicks.length - 1; r >= 0; r--) {
      const c = clicks[r];
      const age = t - c.t;
      if (age > FW_LIFE) { clicks.splice(r, 1); continue; }
      const dx = wx - c.x, dy = wy - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > FW_R2 || d2 < 1) continue;
      const d = Math.sqrt(d2);
      const f = 1 - d / FW_R;
      const ease = 1 - Math.pow(1 - Math.min(age / 0.2, 1), 3);
      const decay = Math.max(0, 1 - age / FW_LIFE);
      const s = FW_STR * f * ease * decay;
      ctx.ox += (dx / d) * s;
      ctx.oy += (dy / d) * s * 0.4;
      if (glyph) {
        const zLaunch = FW_Z_STR * f * ease;
        const zGrav = 0.5 * FW_GRAV * age * age;
        const z = Math.max(0, zLaunch * decay - zGrav * f * decay);
        const spinPhase = hash * 6.283;
        const rotX = Math.sin(age * FW_SPIN + spinPhase) * f * decay * 1.8;
        const rotY = Math.cos(age * FW_SPIN * 0.7 + spinPhase * 1.3) * f * decay * 2.2;
        const sc = 1 + f * ease * decay * 0.3;
        fxXforms[xi] = rotX;
        fxXforms[xi + 1] = rotY;
        fxXforms[xi + 2] = z;
        fxXforms[xi + 3] = sc;
        ctx.fx3dActive = true;
        const warm = f * decay;
        instFA[i + 8] = Math.min(1, inst[i + 8] + warm * 0.8);
        instFA[i + 9] = Math.min(1, inst[i + 9] + warm * 0.35);
        instFA[i + 10] *= 1 - warm * 0.5;
        instFA[i + 11] *= 0.4 + 0.6 * decay;
      }
    }
  },

  postFrame(ctx) {
    if (particles.length === 0) { extraN = 0; return; }
    const grav = 320;
    const dt60 = 1 / 60;
    let alive = 0;
    const need = particles.length * 16;
    if (extraFA.length < need) extraFA = new Float32Array(need * 2);
    const xNeed = particles.length * 4;
    if (extraXF.length < xNeed) extraXF = new Float32Array(xNeed * 2);
    extraN = 0;
    for (let p = 0; p < particles.length; p++) {
      const pt = particles[p];
      const age = ctx.t - pt.birth;
      if (age > pt.life) continue;
      const prog = age / pt.life;
      const fade = 1 - prog * prog;
      pt.x += pt.vx * dt60; pt.y += pt.vy * dt60;
      pt.vz -= grav * dt60;
      pt.z = Math.max(0, pt.z + pt.vz * dt60);
      pt.rotX += pt.spinX * dt60;
      pt.rotY += pt.spinY * dt60;
      const dst = extraN * 16;
      for (let j = 0; j < 16; j++) extraFA[dst + j] = ctx.inst[pt.src + j];
      extraFA[dst] = pt.x;
      extraFA[dst + 1] = pt.y;
      extraFA[dst + 8] = Math.min(1, ctx.inst[pt.src + 8] + fade * 0.6);
      extraFA[dst + 9] = Math.min(1, ctx.inst[pt.src + 9] + fade * 0.3);
      extraFA[dst + 10] = ctx.inst[pt.src + 10] * (1 - fade * 0.4);
      extraFA[dst + 11] = ctx.inst[pt.src + 11] * fade;
      const exi = extraN * 4;
      extraXF[exi] = pt.rotX;
      extraXF[exi + 1] = pt.rotY;
      extraXF[exi + 2] = pt.z;
      extraXF[exi + 3] = 0.7 + fade * 0.5;
      extraN++;
      particles[alive++] = pt;
    }
    particles.length = alive;
    ctx.fx3dActive = true;
  },

  extras() {
    if (extraN === 0) return null;
    return { instFA: extraFA, xforms: extraXF, count: extraN };
  },
};
