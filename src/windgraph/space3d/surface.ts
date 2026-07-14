// ── windgraph · 3D surface plotting (Phase 7) ────────────────────────────────
// z = f(x, y) as a painter-sorted quad mesh: each cell is projected to 2D world
// coordinates, shaded (height colormap × Lambert), and drawn back-to-front so
// occlusion is correct without a depth buffer. Edges use the Phase-0 stroke
// engine; faces are analytic fills — crisp at any zoom.

import { fillQuads, strokeInto, polygonQuads, type Pt } from '../stroke/stroke';
import { Projector, colormap, faceNormal, LIGHT_DIR } from './project3d';

export interface Ctx3 { inst: number[]; crv: number[]; rws: number[]; }
export interface Region { xMin: number; xMax: number; yMin: number; yMax: number; }
export interface SurfaceStyle {
  res?: number;             // cells per axis (default 34)
  wire?: number[];          // edge color (default subtle dark); null = no wireframe
  wireWidthPx?: number;
  zoom?: number;            // view zoom (for ~1px wire width)
  opacity?: number;
}

interface Face { poly: Pt[]; depth: number; color: number[]; }

export function plotSurface(f: (x: number, y: number) => number, region: Region, proj: Projector, ctx: Ctx3, style: SurfaceStyle = {}) {
  const N = style.res ?? 34;
  const { xMin, xMax, yMin, yMax } = region;
  const dx = (xMax - xMin) / N, dy = (yMax - yMin) / N;

  // Sample the height grid once (cache f evaluations + auto z-range).
  const gx = N + 1, gy = N + 1;
  const zg: number[] = new Array(gx * gy);
  let zMin = Infinity, zMax = -Infinity;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = xMin + i * dx, y = yMin + j * dy;
      const z = f(x, y);
      zg[j * gx + i] = z;
      if (z < zMin) zMin = z; if (z > zMax) zMax = z;
    }
  }
  const zSpan = Math.max(zMax - zMin, 1e-6);

  const at = (i: number, j: number): [number, number, number] => [xMin + i * dx, yMin + j * dy, zg[j * gx + i]];

  const faces: Face[] = [];
  const wire = style.wire === undefined ? [0, 0, 0, 0.18] : style.wire;
  const wirePx = (style.wireWidthPx ?? 1) / Math.max(style.zoom ?? 1, 1e-6);
  const alpha = style.opacity ?? 1;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c0 = at(i, j), c1 = at(i + 1, j), c2 = at(i + 1, j + 1), c3 = at(i, j + 1);
      const p0 = proj.toWorld(c0[0], c0[1], c0[2]);
      const p1 = proj.toWorld(c1[0], c1[1], c1[2]);
      const p2 = proj.toWorld(c2[0], c2[1], c2[2]);
      const p3 = proj.toWorld(c3[0], c3[1], c3[2]);
      const depth = (proj.depthOf(...c0) + proj.depthOf(...c1) + proj.depthOf(...c2) + proj.depthOf(...c3)) / 4;
      // Shade: face normal (flipped up) · light.
      let n = faceNormal(c0, c2, c1);
      if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
      const lambert = Math.max(0, n[0] * LIGHT_DIR[0] + n[1] * LIGHT_DIR[1] + n[2] * LIGHT_DIR[2]);
      const shade = 0.45 + 0.55 * lambert;
      const zAvg = (c0[2] + c1[2] + c2[2] + c3[2]) / 4;
      const cm = colormap((zAvg - zMin) / zSpan);
      faces.push({ poly: [p0, p1, p2, p3], depth, color: [cm[0] * shade, cm[1] * shade, cm[2] * shade, alpha] });
    }
  }

  // Painter's algorithm: farthest first (largest depth), so near faces overdraw.
  faces.sort((a, b) => b.depth - a.depth);
  for (const fc of faces) {
    fillQuads(polygonQuads(fc.poly, true), fc.color, ctx.inst, ctx.crv, ctx.rws);
    if (wire && wire[3] > 0.001) strokeInto([...fc.poly, fc.poly[0]], { width: wirePx }, wire, ctx.inst, ctx.crv, ctx.rws);
  }
}
