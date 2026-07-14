// ── windgraph · 3D axes, grid, space curves (Phase 7) ────────────────────────
// A floor grid + three labelled axes for a 3D scene, and parametric space
// curves — all CPU-projected to 2D world coordinates and drawn with the analytic
// stroke engine (crisp at any zoom). Labels are 2D text, so they stay upright and
// razor-sharp (billboarded for free).

import { strokeInto, type Pt } from '../stroke/stroke';
import { layoutStr, tw } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';
import { Projector } from './project3d';
import type { Ctx3 } from './surface';

export interface Region3 { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number; }

export interface AxesStyle { grid?: number[]; axis?: number[]; label?: number[]; zoom?: number; labelPx?: number; }

// Floor grid at z = zMin + the three axes rising from the (min,min,min) corner.
export function drawAxes3D(r: Region3, proj: Projector, ctx: Ctx3, font: FontFace, atlas: any, style: AxesStyle = {}) {
  const grid = style.grid ?? [1, 1, 1, 0.12];
  const axis = style.axis ?? [0.8, 0.84, 0.95, 0.9];
  const px = 1 / Math.max(style.zoom ?? 1, 1e-6);
  const seg = (a: [number, number, number], b: [number, number, number], color: number[], w = px) =>
    strokeInto([proj.toWorld(...a), proj.toWorld(...b)], { width: w }, color, ctx.inst, ctx.crv, ctx.rws);

  const NX = 8, NY = 8;
  for (let i = 0; i <= NX; i++) {
    const x = r.xMin + (r.xMax - r.xMin) * (i / NX);
    seg([x, r.yMin, r.zMin], [x, r.yMax, r.zMin], grid);
  }
  for (let j = 0; j <= NY; j++) {
    const y = r.yMin + (r.yMax - r.yMin) * (j / NY);
    seg([r.xMin, y, r.zMin], [r.xMax, y, r.zMin], grid);
  }

  // Three axes from the origin corner.
  seg([r.xMin, r.yMin, r.zMin], [r.xMax, r.yMin, r.zMin], axis, px * 1.6);
  seg([r.xMin, r.yMin, r.zMin], [r.xMin, r.yMax, r.zMin], axis, px * 1.6);
  seg([r.xMin, r.yMin, r.zMin], [r.xMin, r.yMin, r.zMax], axis, px * 1.6);
}

// Axis labels (drawn AFTER the surface so they read on top). Upright 2D text.
export function drawAxisLabels3D(r: Region3, proj: Projector, ctx: Ctx3, font: FontFace, atlas: any, style: AxesStyle = {}) {
  const label = style.label ?? [0.82, 0.86, 0.96, 1];
  const size = (style.labelPx ?? 20) / Math.max(style.zoom ?? 1, 1e-6);
  const put = (p: [number, number], s: string) => layoutStr(ctx.inst, s, label, atlas.table, font, { x: p[0] - tw(s, font, size) / 2, y: p[1] - size / 2, size });
  put(proj.toWorld(r.xMax, r.yMin, r.zMin), 'x');
  put(proj.toWorld(r.xMin, r.yMax, r.zMin), 'y');
  put(proj.toWorld(r.xMin, r.yMin, r.zMax), 'z');
}

// A parametric space curve C(t) = (x,y,z), t∈[t0,t1], projected + stroked.
export function plotCurve3D(C: (t: number) => [number, number, number], t0: number, t1: number, samples: number, proj: Projector, ctx: Ctx3, color: number[], widthPx = 3, zoom = 1) {
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = t0 + (t1 - t0) * (i / samples);
    const [x, y, z] = C(t);
    pts.push(proj.toWorld(x, y, z));
  }
  strokeInto(pts, { width: widthPx / Math.max(zoom, 1e-6), cap: 'round', join: 'round' }, color, ctx.inst, ctx.crv, ctx.rws);
}
