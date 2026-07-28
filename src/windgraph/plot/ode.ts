// ── windgraph · ODE & field integration (Phase 4 · A8/A9/A10) ────────────────
// RK4 integration for first-order ODEs y'=f(x,y), autonomous systems (phase
// portraits), RK-integrated streamlines through a vector field, and batched
// bifurcation point splats for xₙ₊₁ = f_r(xₙ). Data-space results.

import type { Pt } from '../stroke/stroke';

export function rk4Ode(f: (x: number, y: number) => number, x0: number, y0: number, x1: number, h: number): Pt[] {
  const out: Pt[] = [[x0, y0]];
  let x = x0, y = y0;
  const dir = x1 >= x0 ? 1 : -1;
  const step = Math.abs(h) * dir;
  const guard = 100000;
  let i = 0;
  while (dir > 0 ? x < x1 : x > x1) {
    if (i++ > guard) break;
    const k1 = f(x, y);
    const k2 = f(x + step / 2, y + step * k1 / 2);
    const k3 = f(x + step / 2, y + step * k2 / 2);
    const k4 = f(x + step, y + step * k3);
    x += step;
    y += (step / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    if (!isFinite(y)) break;
    out.push([x, y]);
  }
  return out;
}

export function rk4System(F: (p: Pt) => Pt, p0: Pt, t0: number, t1: number, h: number): Pt[] {
  const out: Pt[] = [p0];
  let p = p0, t = t0;
  const guard = 100000;
  let i = 0;
  while (t < t1) {
    if (i++ > guard) break;
    const k1 = F(p);
    const k2 = F([p[0] + h * k1[0] / 2, p[1] + h * k1[1] / 2]);
    const k3 = F([p[0] + h * k2[0] / 2, p[1] + h * k2[1] / 2]);
    const k4 = F([p[0] + h * k3[0], p[1] + h * k3[1]]);
    p = [p[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), p[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
    t += h;
    if (!isFinite(p[0]) || !isFinite(p[1])) break;
    out.push(p);
  }
  return out;
}

export function streamline(V: (x: number, y: number) => Pt, seed: Pt, steps: number, h: number, dir: 1 | -1 = 1): Pt[] {
  const out: Pt[] = [seed];
  let p = seed;
  for (let i = 0; i < steps; i++) {
    const v1 = V(p[0], p[1]);
    const l1 = Math.hypot(v1[0], v1[1]);
    if (l1 < 1e-9) break;
    const m: Pt = [p[0] + dir * h * v1[0] / l1 / 2, p[1] + dir * h * v1[1] / l1 / 2];
    const v2 = V(m[0], m[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    if (l2 < 1e-9) break;
    p = [p[0] + dir * h * v2[0] / l2, p[1] + dir * h * v2[1] / l2];
    if (!isFinite(p[0]) || !isFinite(p[1])) break;
    out.push(p);
  }
  return out;
}

export function streamlines(V: (x: number, y: number) => Pt, seeds: Pt[], steps: number, h: number): Pt[][] {
  const out: Pt[][] = [];
  for (const s of seeds) {
    const fwd = streamline(V, s, steps, h, 1);
    const bwd = streamline(V, s, steps, h, -1).reverse();
    out.push([...bwd.slice(0, -1), ...fwd]);
  }
  return out;
}

export function bifurcation(f: (r: number, x: number) => number, r0: number, r1: number, rSteps: number, iters: number, transient: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= rSteps; i++) {
    const r = r0 + (r1 - r0) * (i / rSteps);
    let x = 0.5;
    for (let k = 0; k < transient; k++) x = f(r, x);
    for (let k = 0; k < iters; k++) {
      x = f(r, x);
      if (isFinite(x)) out.push([r, x]);
    }
  }
  return out;
}
