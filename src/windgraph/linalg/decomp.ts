import type { Mat2, Vec2 } from './matrix';
import { applyMat2, det2, mulMat2, transpose2, mat2 } from './matrix';
import { dot2, normalize2, sub2, scaleVec2 } from './products';

export function gramSchmidt2(vectors: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const v of vectors) {
    let u: Vec2 = [...v];
    for (const e of out) {
      const proj = dot2(u, e);
      u = sub2(u, scaleVec2(e, proj));
    }
    out.push(normalize2(u));
  }
  return out;
}

export function gramSchmidtSteps(vectors: Vec2[]): { step: number; input: Vec2; subtracted: Vec2; result: Vec2 }[] {
  const basis: Vec2[] = [];
  const steps: { step: number; input: Vec2; subtracted: Vec2; result: Vec2 }[] = [];
  for (let i = 0; i < vectors.length; i++) {
    let u: Vec2 = [...vectors[i]];
    let totalSub: Vec2 = [0, 0];
    for (const e of basis) {
      const proj = dot2(u, e);
      const sub = scaleVec2(e, proj);
      totalSub = [totalSub[0] + sub[0], totalSub[1] + sub[1]];
      u = sub2(u, sub);
    }
    const normalized = normalize2(u);
    basis.push(normalized);
    steps.push({ step: i, input: vectors[i], subtracted: totalSub, result: normalized });
  }
  return steps;
}

export interface SVD2 {
  U: Mat2;
  S: [number, number];
  V: Mat2;
}

export function svd2(m: Mat2): SVD2 {
  const mt = transpose2(m);
  const mtm = mulMat2(mt, m);
  const a = mtm[0], b = mtm[1], d = mtm[3];
  const tr = a + d;
  const det = a * d - b * b;
  const disc = Math.sqrt(Math.max(0, tr * tr - 4 * det));
  const s1sq = (tr + disc) / 2;
  const s2sq = (tr - disc) / 2;
  const s1 = Math.sqrt(Math.max(0, s1sq));
  const s2 = Math.sqrt(Math.max(0, s2sq));

  let v1: Vec2, v2: Vec2;
  if (Math.abs(b) < 1e-12) {
    v1 = a >= d ? [1, 0] : [0, 1];
    v2 = a >= d ? [0, 1] : [1, 0];
  } else {
    v1 = normalize2([b, s1sq - a]);
    v2 = [-v1[1], v1[0]];
  }
  const V = mat2(v1[0], v2[0], v1[1], v2[1]);

  let u1: Vec2, u2: Vec2;
  if (s1 > 1e-12) {
    u1 = [applyMat2(m, v1)[0] / s1, applyMat2(m, v1)[1] / s1];
  } else {
    u1 = [1, 0];
  }
  if (s2 > 1e-12) {
    u2 = [applyMat2(m, v2)[0] / s2, applyMat2(m, v2)[1] / s2];
  } else {
    u2 = [-u1[1], u1[0]];
  }
  if (det2(mat2(u1[0], u2[0], u1[1], u2[1])) < 0) {
    u2 = [-u2[0], -u2[1]];
  }
  const U = mat2(u1[0], u2[0], u1[1], u2[1]);

  return { U, S: [s1, s2], V };
}

export function svdRotationAngle(m: Mat2): { thetaU: number; thetaV: number; scales: [number, number] } {
  const { U, S, V } = svd2(m);
  return {
    thetaU: Math.atan2(U[2], U[0]),
    thetaV: Math.atan2(V[2], V[0]),
    scales: S,
  };
}

export function changeOfBasis2(v: Vec2, from: [Vec2, Vec2], to: [Vec2, Vec2]): Vec2 {
  const detFrom = from[0][0] * from[1][1] - from[0][1] * from[1][0];
  if (Math.abs(detFrom) < 1e-12) return v;
  const c0 = (v[0] * from[1][1] - v[1] * from[1][0]) / detFrom;
  const c1 = (from[0][0] * v[1] - from[0][1] * v[0]) / detFrom;
  return [c0 * to[0][0] + c1 * to[1][0], c0 * to[0][1] + c1 * to[1][1]];
}

export function changeOfBasisMatrix(from: [Vec2, Vec2], to: [Vec2, Vec2]): Mat2 {
  const detTo = to[0][0] * to[1][1] - to[0][1] * to[1][0];
  if (Math.abs(detTo) < 1e-12) return mat2(1, 0, 0, 1);
  const invTo: Mat2 = [to[1][1] / detTo, -to[1][0] / detTo, -to[0][1] / detTo, to[0][0] / detTo];
  const fromMat: Mat2 = mat2(from[0][0], from[1][0], from[0][1], from[1][1]);
  return mulMat2(invTo, fromMat);
}
