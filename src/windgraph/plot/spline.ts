// ── windgraph · spline interpolation (Phase 4 · A4) ──────────────────────────
// Catmull-Rom, natural cubic, and uniform cubic B-spline interpolation through
// control points, plus the de Casteljau evaluation used by the construction
// animation. All functions work in DATA space (the resolver maps to world).

import type { Pt } from '../stroke/stroke';

export type SplineKind = 'catmull' | 'cubic' | 'bspline';

export function catmullRom(ctrl: Pt[], perSeg = 24): Pt[] {
  if (ctrl.length < 2) return ctrl.slice();
  const out: Pt[] = [];
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

export function naturalCubic(ctrl: Pt[], perSeg = 24): Pt[] {
  const n = ctrl.length - 1;
  if (n < 1) return ctrl.slice();
  if (n === 1) {
    const out: Pt[] = [];
    for (let s = 0; s <= perSeg; s++) {
      const t = s / perSeg;
      out.push([ctrl[0][0] + (ctrl[1][0] - ctrl[0][0]) * t, ctrl[0][1] + (ctrl[1][1] - ctrl[0][1]) * t]);
    }
    return out;
  }
  const axis = (k: 0 | 1) => {
    const a = ctrl.map((p) => p[k]);
    const h = new Array(n).fill(1);
    const alpha = new Array(n + 1).fill(0);
    for (let i = 1; i < n; i++) alpha[i] = (3 / h[i]) * (a[i + 1] - a[i]) - (3 / h[i - 1]) * (a[i] - a[i - 1]);
    const l = new Array(n + 1).fill(1), mu = new Array(n + 1).fill(0), z = new Array(n + 1).fill(0);
    for (let i = 1; i < n; i++) {
      l[i] = 2 * (h[i - 1] + h[i]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    const c = new Array(n + 1).fill(0), b = new Array(n).fill(0), d = new Array(n).fill(0);
    for (let j = n - 1; j >= 0; j--) {
      c[j] = z[j] - mu[j] * c[j + 1];
      b[j] = (a[j + 1] - a[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
      d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
    }
    return { a, b, c, d };
  };
  const X = axis(0), Y = axis(1);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        X.a[i] + X.b[i] * t + X.c[i] * t2 + X.d[i] * t3,
        Y.a[i] + Y.b[i] * t + Y.c[i] * t2 + Y.d[i] * t3,
      ]);
    }
  }
  out.push(ctrl[n]);
  return out;
}

function bBasis(t: number): [number, number, number, number] {
  const u = 1 - t;
  return [u * u * u / 6, (3 * t * t * t - 6 * t * t + 4) / 6, (-3 * t * t * t + 3 * t * t + 3 * t + 1) / 6, t * t * t / 6];
}

export function bspline(ctrl: Pt[], perSeg = 24): Pt[] {
  if (ctrl.length < 4) return catmullRom(ctrl, perSeg);
  const out: Pt[] = [];
  for (let i = 0; i < ctrl.length - 3; i++) {
    const p0 = ctrl[i], p1 = ctrl[i + 1], p2 = ctrl[i + 2], p3 = ctrl[i + 3];
    for (let s = 0; s < perSeg; s++) {
      const [b0, b1, b2, b3] = bBasis(s / perSeg);
      out.push([b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0], b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]]);
    }
  }
  return out;
}

export function spline(kind: SplineKind, ctrl: Pt[], perSeg = 24): Pt[] {
  if (kind === 'catmull') return catmullRom(ctrl, perSeg);
  if (kind === 'cubic') return naturalCubic(ctrl, perSeg);
  return bspline(ctrl, perSeg);
}

export function deCasteljau(ctrl: Pt[], t: number): Pt {
  let pts = ctrl.slice();
  while (pts.length > 1) {
    const next: Pt[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      next.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
    }
    pts = next;
  }
  return pts[0];
}

export function bezier(ctrl: Pt[], samples = 64): Pt[] {
  const out: Pt[] = [];
  for (let s = 0; s <= samples; s++) out.push(deCasteljau(ctrl, s / samples));
  return out;
}
