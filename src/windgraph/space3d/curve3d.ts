// ── windgraph · 3D space curves (F3D-2, D26 — mesh-tube pivot) ───────────────
// 3D curves render as WATER-TIGHT GOURAUD MESH TUBES through the mesh3d
// pipeline, not analytic fills: a flat ribbon has zero thickness along its own
// normal, so it reads as a paper strip and collapses at grazing angles — the
// same "analytic walls are never watertight" lesson as the extrusion walls
// (D16). A tube is a swept N-gon: the centerline is tessellated adaptively
// (`sampleCurve3D`), each sample carries a ring in the plane ⟂ tangent, and
// consecutive rings become quads whose per-vertex color is shaded by the RADIAL
// normal (Gouraud → a smooth round tube at any angle). End caps close the tube.
//
// The analytic-3D story (D26) is retained as INFRASTRUCTURE elsewhere — the
// depth-write pipeline variant (`gpu.ts depthWrite` + `frame.ts` opaque pass)
// and the quaternion frame helpers below serve the locally-PLANAR content
// (slicing/tangent planes, flat regions, grids) where exact coverage is the
// point. Solids with body — curves, tubes, prisms — belong to mesh3d.
//
// Sampling is ADAPTIVE: a perspective-projected Bézier is rational, not
// quadratic, so we subdivide until the projected midpoint's deviation from the
// chord is sub-pixel in screen space (with a world-space tolerance as the
// behind-camera / degenerate fallback).

import { LIGHT_DIR } from './project3d';

export type Vec3 = [number, number, number];

export interface SampleOpts {
  /** Screen-space deviation tolerance (px) — subdivide until the projected
   *  midpoint is closer than this to the chord. Default 0.5. */
  tolPx?: number;
  /** World-space deviation tolerance (px) — used when the projection is
   *  unavailable or the camera is behind the curve. Default 2. */
  tolWorld?: number;
  /** Cap on a single segment's on-screen length (px) — bounds per-vertex z
   *  interpolation over huge near-plane-crossing quads. Default 512. */
  maxSegPx?: number;
  /** Hard cap on emitted segments (runaway guard). Default 4096. */
  maxSegs?: number;
  /** Canvas width/height in device px — needed for the screen-space test. */
  Cw?: number;
  Ch?: number;
  /** The orbit view-projection (same convention as the shader: clip =
   *  viewProj · (x, y, −z, 1)). Passed in so the sampler needs no camera import. */
  viewProj?: ArrayLike<number>;
  /** On-axis world→device scale for the behind-camera fallback. */
  scale?: number;
}

function projClip(p: Vec3, vp: ArrayLike<number>): [number, number, number] | null {
  const x = p[0], y = p[1], z = -p[2];
  const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (w <= 1e-9) return null;
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
  return [cx / w, cy / w, cw / w];
}

/** Distance of `pm` from the chord p0→p1, in screen px (0 when unprojectable). */
function screenDev(p0: Vec3, pm: Vec3, p1: Vec3, Cw: number, Ch: number, vp: ArrayLike<number>): number {
  const a = projClip(p0, vp), b = projClip(pm, vp), c = projClip(p1, vp);
  if (!a || !b || !c) return -1;
  const ax = (a[0] * 0.5 + 0.5) * Cw, ay = (0.5 - a[1] * 0.5) * Ch;
  const bx = (b[0] * 0.5 + 0.5) * Cw, by = (0.5 - b[1] * 0.5) * Ch;
  const cx = (c[0] * 0.5 + 0.5) * Cw, cy = (0.5 - c[1] * 0.5) * Ch;
  const dx = cx - ax, dy = cy - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return Math.hypot(bx - ax, by - ay);
  return Math.abs(dx * (ay - by) - (ax - bx) * dy) / len;
}

function screenLen(p0: Vec3, p1: Vec3, Cw: number, Ch: number, vp: ArrayLike<number>): number {
  const a = projClip(p0, vp), b = projClip(p1, vp);
  if (!a || !b) return Infinity;
  return Math.hypot((a[0] - b[0]) * Cw * 0.5, (a[1] - b[1]) * Ch * 0.5);
}

function worldDev(p0: Vec3, pm: Vec3, p1: Vec3): number {
  const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
  const bx = pm[0] - p0[0], by = pm[1] - p0[1], bz = pm[2] - p0[2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-9) return Math.hypot(bx, by, bz);
  return Math.hypot(cx, cy, cz) / len;
}

/**
 * Adaptively sample a 3D parametric curve C(t) into a polyline. Midpoint
 * subdivision until the projected midpoint sits within `tolPx` of the chord
 * (screen space) AND the segment stays short enough; falls back to a world-
 * space tolerance when the projection fails (behind the camera / no VP given).
 */
export function sampleCurve3D(
  C: (t: number) => Vec3,
  t0: number,
  t1: number,
  o: SampleOpts = {},
): Vec3[] {
  const tolPx = o.tolPx ?? 0.5;
  const tolWorld = o.tolWorld ?? 2;
  const maxSegPx = o.maxSegPx ?? 512;
  const maxSegs = o.maxSegs ?? 4096;
  const hasProj = !!o.viewProj && o.Cw != null && o.Ch != null;
  const scale = o.scale ?? 1;

  const p0 = C(t0), p1 = C(t1);
  const out: Vec3[] = [p0];
  let segs = 0;
  // Explicit stack of t-values [ta, tb].
  const stack: number[] = [t0, t1];
  while (stack.length >= 2) {
    const tb = stack.pop()!, ta = stack.pop()!;
    if (segs >= maxSegs) { out.push(C(tb)); break; }
    const pa = C(ta), pb = C(tb);
    const tm = (ta + tb) / 2;
    const pm = C(tm);
    let accept: boolean;
    if (hasProj) {
      const sd = screenDev(pa, pm, pb, o.Cw!, o.Ch!, o.viewProj!);
      const sl = screenLen(pa, pb, o.Cw!, o.Ch!, o.viewProj!);
      // sd < 0 → some endpoint behind the camera → use the world fallback.
      accept = (sd < 0 || sd < tolPx) && sl < maxSegPx;
    } else {
      accept = worldDev(pa, pm, pb) < tolWorld;
    }
    if (accept) {
      out.push(pb);
      segs++;
    } else if (stack.length > maxSegs * 8) {
      // Runaway (degenerate camera / tolerance): flatten the rest without
      // subdividing rather than blowing the stack.
      out.push(pb);
      segs++;
    } else {
      stack.push(ta, tm, tm, tb);
    }
  }
  return out;
}

// ── mesh tube builder ─────────────────────────────────────────────────────────

/** Perpendicular to T biased toward world up (0,0,1); a stable width direction
 *  that only twists when the curve itself turns. */
export function frameOf(T: Vec3): { B: Vec3; N: Vec3 } {
  let B: Vec3;
  const bt = T[2]; // T·up
  if (Math.abs(bt) > 0.999) B = [1, 0, 0];
  else {
    const bl = Math.hypot(T[0], T[1]);
    B = [-T[1] / bl, T[0] / bl, 0]; // up×T direction — horizontal, so B never folds
  }
  const N: Vec3 = [
    T[1] * B[2] - T[2] * B[1],
    T[2] * B[0] - T[0] * B[2],
    T[0] * B[1] - T[1] * B[0],
  ];
  return { B, N };
}

/** Apply a unit quaternion (x, y, z, w) to a vector — mirrors the shader's
 *  `r = v + 2·cross(q, cross(q, v) + w·v)` exactly. The outer cross expands to
 *  `cross(q, cross(q,v)) + w·(q×v)`, so one cross + one scaled cross suffice. */
export function quatApply(q: [number, number, number, number], v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const c1x = qy * v[2] - qz * v[1], c1y = qz * v[0] - qx * v[2], c1z = qx * v[1] - qy * v[0];
  const c2x = qy * c1z - qz * c1y + qw * c1x;
  const c2y = qz * c1x - qx * c1z + qw * c1y;
  const c2z = qx * c1y - qy * c1x + qw * c1z;
  return [v[0] + 2 * c2x, v[1] + 2 * c2y, v[2] + 2 * c2z];
}

/** mat3 → quaternion (x, y, z, w), columns c0/c1/c2 = local → world axes.
 *  Retained for the analytic-3D planar content (D26 infra). */
export function quatFromFrame(c0: Vec3, c1: Vec3, c2: Vec3): [number, number, number, number] {
  const m = [c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]]; // col-major 3×3
  let x: number, y: number, z: number, w: number;
  const tr = m[0] + m[4] + m[8];
  if (tr > 0) {
    let s = Math.sqrt(tr + 1) * 2; // s = 4w
    w = s / 4; x = (m[5] - m[7]) / s; y = (m[6] - m[2]) / s; z = (m[1] - m[3]) / s;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    let s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; // s = 4x
    x = s / 4; w = (m[5] - m[7]) / s; y = (m[3] + m[1]) / s; z = (m[6] + m[2]) / s;
  } else if (m[4] > m[8]) {
    let s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; // s = 4y
    y = s / 4; w = (m[6] - m[2]) / s; x = (m[3] + m[1]) / s; z = (m[7] + m[5]) / s;
  } else {
    let s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; // s = 4z
    z = s / 4; w = (m[1] - m[3]) / s; x = (m[6] + m[2]) / s; y = (m[7] + m[5]) / s;
  }
  const n = Math.hypot(x, y, z, w) || 1;
  return [x / n, y / n, z / n, w / n];
}

export interface TubeOpts {
  radius: number;         // world px
  color: number[];        // straight-alpha RGBA
  /** Radial segments (sides of the swept N-gon). Default 18. */
  segs?: number;
  /** Closed tube (no end caps). Default: auto from first == last. */
  closed?: boolean;
}

/** Convert a sampled 2D polyline into smooth quadratic-Bézier pieces via the
 *  B-spline→Bézier construction (segment i runs midpoint(i−1)→midpoint(i) with
 *  control point Q_i — C1-continuous, passes near the samples). Feed the result
 *  to `strokeQuadPath` so a stroked polyline boundary stays a smooth curve (not
 *  a faceted polygon) at any zoom — the same fit the 2D plot engine uses. */
export function polyToQuads(pts: [number, number][], closed: boolean): number[] {
  const n = pts.length;
  if (n < 2) return [];
  const m = closed ? n - 1 : n; // drop the seam duplicate on a closed loop
  const M = (i: number): [number, number] => {
    const j = ((i % m) + m) % m;
    const a = pts[j], b = pts[(j + 1) % m];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const out: number[] = [];
  if (closed) {
    for (let i = 0; i < m; i++) {
      const [ax, ay] = M(i - 1);
      const [cx, cy] = pts[i];
      const [bx, by] = M(i);
      out.push(ax, ay, cx, cy, bx, by);
    }
  } else {
    for (let i = 0; i < m - 1; i++) {
      const p0 = i === 0 ? pts[0] : M(i - 1);
      const c = pts[i];
      const p2 = i === m - 2 ? pts[m - 1] : M(i);
      out.push(p0[0], p0[1], c[0], c[1], p2[0], p2[1]);
    }
  }
  return out;
}

function shadeV(nx: number, ny: number, nz: number): number {
  // HIGH ambient (0.75) so the tube reads close to its flat base color at every
  // orbit — a fixed light at the old 0.45 darkened the tube so the 2D analytic
  // view (flat color) and the 3D tube visibly changed color when tilting.
  return 0.75 + 0.25 * Math.max(0, nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]);
}

function pushV(mesh: number[], p: Vec3, s: number, c: number[]) {
  mesh.push(p[0], p[1], p[2], c[0] * s, c[1] * s, c[2] * s, c[3] ?? 1);
}

/**
 * Sweep a watertight Gouraud tube along a sampled 3D polyline, in the mesh3d
 * vertex format (7 floats: pos vec3 + straight-alpha rgba — same as pushWalls).
 * Each sample's ring sits in the plane ⟂ tangent; per-vertex color is shaded by
 * the RADIAL normal so the round sides shade smoothly (no facets). `cullMode`
 * on the mesh pipeline is 'none', so winding is aesthetic only.
 */
export function pushTube(mesh: number[], pts: Vec3[], o: TubeOpts) {
  const n = pts.length;
  if (n < 2 || o.radius <= 0) return;
  const segs = Math.max(3, o.segs ?? 18);
  const closed = o.closed ?? (Math.hypot(pts[n - 1][0] - pts[0][0], pts[n - 1][1] - pts[0][1], pts[n - 1][2] - pts[0][2]) < 1e-6);
  const C = o.color;

  const tang = (i: number): Vec3 => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  };

  // Precompute each ring: position + radial unit normal per vertex.
  const rp: Vec3[][] = [], rn: Vec3[][] = [];
  for (let i = 0; i < n; i++) {
    const T = tang(i);
    const { B, N } = frameOf(T);
    const rowP: Vec3[] = [], rowN: Vec3[] = [];
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nrm: Vec3 = [B[0] * ca + N[0] * sa, B[1] * ca + N[1] * sa, B[2] * ca + N[2] * sa];
      rowN.push(nrm);
      rowP.push([pts[i][0] + nrm[0] * o.radius, pts[i][1] + nrm[1] * o.radius, pts[i][2] + nrm[2] * o.radius]);
    }
    rp.push(rowP); rn.push(rowN);
  }

  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      const a = rp[i][k], b = rp[i][k2], c = rp[i + 1][k2], d = rp[i + 1][k];
      const sA = shadeV(...rn[i][k]), sB = shadeV(...rn[i][k2]), sC = shadeV(...rn[i + 1][k2]), sD = shadeV(...rn[i + 1][k]);
      pushV(mesh, a, sA, C); pushV(mesh, c, sC, C); pushV(mesh, b, sB, C);
      pushV(mesh, a, sA, C); pushV(mesh, d, sD, C); pushV(mesh, c, sC, C);
    }
  }

  if (!closed) {
    const cap = (i: number, tSign: number) => {
      const T = tang(i);
      const s = shadeV(T[0] * tSign, T[1] * tSign, T[2] * tSign);
      const ctr: Vec3 = pts[i];
      for (let k = 0; k < segs; k++) {
        const k2 = (k + 1) % segs;
        pushV(mesh, ctr, s, C);
        pushV(mesh, rp[i][k2], s, C);
        pushV(mesh, rp[i][k], s, C);
      }
    };
    cap(0, -1);
    cap(n - 1, +1);
  }
}
