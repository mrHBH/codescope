// ── windgraph · extrusion geometry (Phase 2, moat foundation) ────────────────
// Turns a flat 2D polygon into a lit prism WITHOUT leaving the analytic windfoil
// pass (D9): the top face is the polygon fill translated up by z=h, and each side
// wall is ONE flat fill quad stood vertical by a per-instance quaternion in the
// shader's fxXforms buffer. The coverage integral keeps every silhouette edge
// razor-sharp at any zoom / grazing orbit (the moat), and the geometry rides the
// SAME orbit view-projection as the rest of the scene, so 2D↔3D stays seamless
// (OQ-9). Per-face flat Lambert shading reuses LIGHT_DIR from project3d.
//
// Shader z convention: a positive per-instance z rises UP (the vertex stage feeds
// -z to the view-projection; the ground model maps doc-local -z to world +Y/up).

import { fillQuads, polygonQuads, strokeInto, type Pt } from '../stroke/stroke';
import { LIGHT_DIR } from './project3d';
import type { RenderCtx } from '../mobject/mobject';

// Flat Lambert shade (matches surface3dDemo): 0.4 ambient + 0.6 diffuse.
function shade(nx: number, ny: number, nz: number): number {
  const lambert = Math.max(0, nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]);
  return 0.4 + 0.6 * lambert;
}

function tint(c: number[], s: number, opacity: number): number[] {
  return [c[0] * s, c[1] * s, c[2] * s, (c[3] ?? 1) * opacity];
}

// Pad ctx.xf to cover instances [i0, i1) and write one xform slot each.
// quat null → Euler path (rotX,rotY,z,scale); quat set → quaternion path.
function writeInstXf(ctx: RenderCtx, i0: number, i1: number, z: number, scale: number, quat: [number, number, number, number] | null, rx = 0, ry = 0) {
  const xf = ctx.xf;
  if (!xf) return;
  const need = i1 * 8;
  while (xf.length < need) xf.push(0);
  for (let k = i0; k < i1; k++) {
    const b = k * 8;
    if (quat) { xf[b] = 0; xf[b + 1] = 0; xf[b + 2] = z; xf[b + 3] = scale; xf[b + 4] = quat[0]; xf[b + 5] = quat[1]; xf[b + 6] = quat[2]; xf[b + 7] = quat[3]; }
    else { xf[b] = rx; xf[b + 1] = ry; xf[b + 2] = z; xf[b + 3] = scale; xf[b + 4] = 0; xf[b + 5] = 0; xf[b + 6] = 0; xf[b + 7] = 0; }
  }
}

// Camera-space depth of a doc-local point from the live orbit pose (larger =
// farther from the camera; smaller = nearer). Derived from the ground model
// M=rotX(90) (doc (x,y,z)→world (x,−z,y)) and the orbit camera's spherical pose:
// the view (into-screen) direction in DOC coords is
//   (−sinP·sinA, −sinP·cosA, +cosP)  applied to the point's DOC position, where the
// shader feeds doc-z = −(per-instance z). Folding that negation in, with `z` here
// the per-instance elevation, gives the form below. Top-down (polar 0): depth = −z,
// so a raised face is nearer (smaller) — correct for painter order.
export function camDepth(x: number, y: number, z: number, az: number, polar: number): number {
  const sp = Math.sin(polar), cp = Math.cos(polar);
  return -sp * (x * Math.sin(az) + y * Math.cos(az)) - cp * z;
}

export interface PrismOpts {
  h: number;            // extrusion height (world px)
  baseZ?: number;       // z of the footprint (default 0 = ground plane)
  color: number[];      // base surface color
  opacity?: number;
  outline?: number[];   // optional top-rim stroke color
  outlineWidth?: number;
}

// Emit the ANALYTIC parts of a prism into the windfoil pass: the lit top face +
// an optional sharp rim. The SIDE WALLS are NOT drawn here — they go through the
// depth-tested mesh3d pipeline (pushWalls, built once per extrude value by the
// board). That makes the solid watertight at every camera angle: the old analytic
// painter-order + back-face-culling walls always left a gap at some angle (the
// "rotating notch"), and depth testing resolves occlusion exactly. The top face
// stays analytic so its silhouette edge is the razor-sharp coverage integral.
export function emitPrism(ctx: RenderCtx, pts: Pt[], o: PrismOpts) {
  const { inst, crv, rws } = ctx;
  const h = o.h;
  if (h <= 0 || pts.length < 3) return;
  const baseZ = o.baseZ ?? 0;
  const opacity = o.opacity ?? 1;

  // Top face: polygon fill + optional rim, lifted to baseZ + h (sharp silhouette).
  const topShade = shade(0, 0, 1);
  const i0 = inst.length >> 4;
  fillQuads(polygonQuads(pts, true), tint(o.color, topShade, opacity), inst, crv, rws);
  writeInstXf(ctx, i0, inst.length >> 4, baseZ + h, 1, null);

  if (o.outline) {
    const i1 = inst.length >> 4;
    strokeInto([...pts, pts[0]] as Pt[], { width: o.outlineWidth ?? 2, cap: 'butt', join: 'miter' }, tint(o.outline, topShade, opacity), inst, crv, rws);
    writeInstXf(ctx, i1, inst.length >> 4, baseZ + h, 1, null);
  }
}

// ── depth-tested side walls (mesh3d) ─────────────────────────────────────────
// Build the vertical side walls of an extrusion as real triangles (7 floats/vert:
// pos vec3 + straight-alpha rgba) for the mesh3d pipeline. `loops` are world-space
// (doc-xy) contour polylines (flat [x,y,...]); each contour becomes a tube of wall
// quads from z0v to z1v (vertex z = −elevation, matching the analytic pass + the
// orbit ground model). No culling, no painter order — the shared depth buffer
// occludes correctly at every angle, so the solid is watertight.
// `smooth` = Gouraud: shade each vertex by the average of its two incident edge
// outward-normals (radial on a circle → a smooth cylinder/letter side instead of
// flat facets). The mesh fragment shader already interpolates per-vertex color, so
// per-vertex shading is smooth for free. Flat (smooth=false) keeps a box's crisp
// faces. Per-edge outward normal (away from the centroid) drives the flat path.
export function pushWalls(mesh: number[], loops: number[][], z0v: number, z1v: number, color: number[], smooth = false) {
  for (const loop of loops) {
    const n = loop.length >> 1;
    if (n < 2) continue;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += loop[i * 2]; cy += loop[i * 2 + 1]; }
    cx /= n; cy /= n;
    // Per-edge outward normal.
    const en: number[][] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = loop[j * 2] - loop[i * 2], dy = loop[j * 2 + 1] - loop[i * 2 + 1];
      const l = Math.hypot(dx, dy) || 1;
      let nx = -dy / l, ny = dx / l;
      if (nx * ((loop[i * 2] + loop[j * 2]) / 2 - cx) + ny * ((loop[i * 2 + 1] + loop[j * 2 + 1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
      en.push([nx, ny]);
    }
    // Per-vertex normal (smooth) = normalized average of the two incident edges.
    const vn: number[][] = [];
    for (let i = 0; i < n; i++) {
      const a = en[(i - 1 + n) % n], b = en[i];
      let nx = a[0] + b[0], ny = a[1] + b[1];
      const l = Math.hypot(nx, ny) || 1;
      vn.push([nx / l, ny / l]);
    }
    const shadeOf = (nx: number, ny: number) => 0.45 + 0.55 * Math.max(0, nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = loop[i * 2], ay = loop[i * 2 + 1], bx = loop[j * 2], by = loop[j * 2 + 1];
      if (Math.hypot(bx - ax, by - ay) < 1e-6) continue;
      const nA = smooth ? vn[i] : en[i], nB = smooth ? vn[j] : en[i];
      const sA = shadeOf(nA[0], nA[1]), sB = shadeOf(nB[0], nB[1]);
      const rA = color[0] * sA, gA = color[1] * sA, bA = color[2] * sA;
      const rB = color[0] * sB, gB = color[1] * sB, bB = color[2] * sB;
      const a = color[3] ?? 1;
      mesh.push(ax, ay, z0v, rA, gA, bA, a, bx, by, z0v, rB, gB, bB, a, bx, by, z1v, rB, gB, bB, a);
      mesh.push(ax, ay, z0v, rA, gA, bA, a, bx, by, z1v, rB, gB, bB, a, ax, ay, z1v, rA, gA, bA, a);
    }
  }
}

// Flat end-cap for a CONVEX contour (centroid fan): closes a prism top or bottom
// with the same loop the walls use, so the solid is watertight (shared vertices →
// no seam). `normal` sets the Lambert shade (top = +z bright, bottom = −z dark).
export function pushCap(mesh: number[], loops: number[][], zv: number, color: number[], normal: [number, number, number] = [0, 0, 1]) {
  const sh = 0.45 + 0.55 * Math.max(0, normal[0] * LIGHT_DIR[0] + normal[1] * LIGHT_DIR[1] + normal[2] * LIGHT_DIR[2]);
  const r = color[0] * sh, g = color[1] * sh, b = color[2] * sh, a = color[3] ?? 1;
  for (const loop of loops) {
    const n = loop.length >> 1;
    if (n < 3) continue;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += loop[i * 2]; cy += loop[i * 2 + 1]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      mesh.push(cx, cy, zv, r, g, b, a, loop[i * 2], loop[i * 2 + 1], zv, r, g, b, a, loop[j * 2], loop[j * 2 + 1], zv, r, g, b, a);
    }
  }
}

// Shrink a contour toward its centroid by an absolute world-px amount (used to tuck
// a mesh wall loop just inside an analytic top face so the two never z-fight at the
// shared silhouette).
export function insetLoop(loop: number[], px: number): number[] {
  const n = loop.length >> 1;
  if (n < 3) return loop;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += loop[i * 2]; cy += loop[i * 2 + 1]; }
  cx /= n; cy /= n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const dx = loop[i * 2] - cx, dy = loop[i * 2 + 1] - cy;
    const l = Math.hypot(dx, dy) || 1;
    out.push(loop[i * 2] - (dx / l) * px, loop[i * 2 + 1] - (dy / l) * px);
  }
  return out;
}
