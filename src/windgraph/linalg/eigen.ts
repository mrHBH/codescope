import type { Mat2, Vec2 } from './matrix';
import { det2, trace2, applyMat2 } from './matrix';

export interface EigenResult2 {
  values: [number, number];
  vectors: [Vec2, Vec2];
  real: boolean;
}

export function eigen2(m: Mat2): EigenResult2 {
  const tr = trace2(m);
  const d = det2(m);
  const disc = tr * tr - 4 * d;
  if (disc < -1e-12) {
    return { values: [tr / 2, tr / 2], vectors: [[1, 0], [0, 1]], real: false };
  }
  const sqrtDisc = Math.sqrt(Math.max(0, disc));
  const l1 = (tr + sqrtDisc) / 2;
  const l2 = (tr - sqrtDisc) / 2;
  return { values: [l1, l2], vectors: [eigenvector2(m, l1), eigenvector2(m, l2)], real: true };
}

function eigenvector2(m: Mat2, lambda: number): Vec2 {
  const a = m[0] - lambda, b = m[1], c = m[2], d = m[3] - lambda;
  if (Math.abs(a) + Math.abs(b) > Math.abs(c) + Math.abs(d)) {
    if (Math.abs(b) < 1e-12) return [1, 0];
    const v: Vec2 = [-b, a];
    return normalize2(v);
  }
  if (Math.abs(d) < 1e-12) return [1, 0];
  const v: Vec2 = [-d, c];
  return normalize2(v);
}

function normalize2(v: Vec2): Vec2 {
  const len = Math.hypot(v[0], v[1]);
  if (len < 1e-12) return [1, 0];
  return [v[0] / len, v[1] / len];
}

export function invariantLines(m: Mat2): { direction: Vec2; eigenvalue: number }[] {
  const { values, vectors, real } = eigen2(m);
  if (!real) return [];
  return values.map((v, i) => ({ direction: vectors[i], eigenvalue: v }));
}

export function isEigenline(m: Mat2, dir: Vec2, tol = 1e-6): boolean {
  const out = applyMat2(m, dir);
  const len = Math.hypot(dir[0], dir[1]);
  if (len < 1e-12) return false;
  const cross = out[0] * dir[1] - out[1] * dir[0];
  return Math.abs(cross) < tol * len;
}

export function powerIteration(m: Mat2, iterations = 100): { value: number; vector: Vec2 } {
  let v: Vec2 = [1, 0];
  for (let i = 0; i < iterations; i++) {
    const next = applyMat2(m, v);
    const len = Math.hypot(next[0], next[1]);
    if (len < 1e-12) break;
    v = [next[0] / len, next[1] / len];
  }
  const mv = applyMat2(m, v);
  const value = v[0] * mv[0] + v[1] * mv[1];
  return { value, vector: v };
}
