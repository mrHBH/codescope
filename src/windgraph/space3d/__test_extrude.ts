// ── Extrusion geometry tests (Phase 2.2 / 2.5, depth-tested walls) ────────────
// Run with: bun src/windgraph/space3d/__test_extrude.ts
//
// The side walls now go through the mesh3d depth-tested pipeline (pushWalls), so
// the analytic pass only emits the sharp top face + the grounded shadow. These
// tests verify: pushWalls builds a watertight wall tube with correct z + shading,
// emitPrism emits top (+shadow) only, and shadows sit a hair under the ground.

import { emitPrism, emitShadow, emitBlobShadow, pushWalls, pushCap, insetLoop } from './extrude';
import type { RenderCtx } from '../mobject/mobject';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function near(a: number, b: number, eps: number, msg: string) { if (Math.abs(a - b) > eps) throw new Error(`${msg}: ${a} !≈ ${b}`); }

function ctx(): RenderCtx {
  return { font: null as any, atlas: null as any, inst: [], crv: [], rws: [], xf: [] };
}
const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];

console.log('Extrude tests\n');

test('emitPrism emits ONLY the top face (walls are mesh3d now)', () => {
  const c = ctx();
  emitPrism(c, square, { h: 40, color: [1, 0, 0, 1] });
  const n = c.inst.length / 16;
  assert(n === 1, `expected 1 analytic instance (top), got ${n}`);
  near(c.xf![2], 40, 1e-9, 'top face z = h');
  near(c.xf![4] + c.xf![5] + c.xf![6] + c.xf![7], 0, 1e-9, 'top face Euler path');
});

test('emitPrism + shadow: 3 shadow layers (z=-1) then top (z=h)', () => {
  const c = ctx();
  emitPrism(c, square, { h: 40, color: [1, 0, 0, 1], shadow: true });
  const n = c.inst.length / 16;
  assert(n === 4, `expected 4 instances (3 shadow + top), got ${n}`);
  for (let k = 0; k < 3; k++) near(c.xf![k * 8 + 2], -1, 1e-9, `shadow layer ${k} under ground (z=-1)`);
  near(c.xf![(n - 1) * 8 + 2], 40, 1e-9, 'top face at z=h');
});

test('pushWalls: a 4-pt loop → 4 wall quads = 8 tris = 24 verts, z in {z0v,z1v}', () => {
  const m: number[] = [];
  pushWalls(m, [square.flatMap((p) => [p[0], p[1]])], 0, -40, [1, 0, 0, 1]);
  assert(m.length === 24 * 7, `expected 24 verts (168 floats), got ${m.length / 7}`);
  for (let v = 0; v < m.length / 7; v++) {
    const z = m[v * 7 + 2];
    assert(z === 0 || z === -40, `vert ${v} z must be 0 or -40, got ${z}`);
    const a = m[v * 7 + 6];
    near(a, 1, 1e-9, 'wall alpha = 1');
    const r = m[v * 7 + 3];
    assert(r >= 0.45 - 1e-6 && r <= 1 + 1e-6, `wall shade r in [0.45,1], got ${r}`);
  }
});

test('pushWalls: outward normals give varied shading (not all flat)', () => {
  const m: number[] = [];
  pushWalls(m, [square.flatMap((p) => [p[0], p[1]])], 0, -40, [1, 1, 1, 1]);
  const shades = new Set<number>();
  for (let v = 0; v < m.length / 7; v++) shades.add(Math.round(m[v * 7 + 3] * 1000));
  assert(shades.size >= 2, `expected varied wall shading, got ${shades.size} distinct`);
});

test('emitShadow layers sit under the ground (z=-1)', () => {
  const c = ctx();
  emitShadow(c, square, { h: 40, layers: 3 });
  const n = c.inst.length / 16;
  assert(n === 3, `expected 3 shadow layers, got ${n}`);
  for (let k = 0; k < n; k++) near(c.xf![k * 8 + 2], -1, 1e-9, `shadow ${k} z=-1`);
});

test('emitShadow h=0 emits nothing', () => {
  const c = ctx();
  emitShadow(c, square, { h: 0 });
  assert(c.inst.length === 0, 'no shadow at h=0');
});

test('emitBlobShadow layers under the ground', () => {
  const c = ctx();
  emitBlobShadow(c, 0, 0, 60, 20, { h: 30, layers: 3 });
  const n = c.inst.length / 16;
  assert(n === 3, `expected 3 blob layers, got ${n}`);
  for (let k = 0; k < n; k++) near(c.xf![k * 8 + 2], -1, 1e-9, `blob ${k} z=-1`);
});

test('zero extrude → emitPrism emits nothing', () => {
  const c = ctx();
  emitPrism(c, square, { h: 0, color: [1, 0, 0, 1] });
  assert(c.inst.length === 0, 'no instances for h=0');
});

test('pushCap: convex fan = (n-2) tris at the cap z, shaded by normal', () => {
  const m: number[] = [];
  pushCap(m, [square.flatMap((p) => [p[0], p[1]])], -40, [1, 1, 1, 1], [0, 0, 1]);
  assert(m.length === 4 * 3 * 7, `expected 4 tris (12 verts), got ${m.length / 7}`);
  for (let v = 0; v < m.length / 7; v++) near(m[v * 7 + 2], -40, 1e-9, 'cap vert at zv');
  // top normal +z → bright shade (0.45 + 0.55·LIGHT_DIR.z ≈ 0.887); bottom = ambient.
  assert(m[3] > 0.8 && m[3] < 1.0, `top cap bright shade, got ${m[3]}`);
  const m2: number[] = [];
  pushCap(m2, [square.flatMap((p) => [p[0], p[1]])], 0, [1, 1, 1, 1], [0, 0, -1]);
  near(m2[3], 0.45, 1e-6, 'bottom cap ambient-only shade');
});

test('insetLoop shrinks a contour toward its centroid', () => {
  const flat = square.flatMap((p) => [p[0], p[1]]);
  const ins = insetLoop(flat, 10);
  assert(ins.length === flat.length, 'same vertex count');
  // centroid (50,50); corner (0,0) moves toward it by 10/|(-50,-50)|*... = ~7.07 each axis
  assert(ins[0] > 0 && ins[0] < 50, `corner x inset toward centroid, got ${ins[0]}`);
  assert(ins[1] > 0 && ins[1] < 50, `corner y inset toward centroid, got ${ins[1]}`);
});

test('pushWalls smooth=true varies shade across a wall edge (Gouraud), flat does not', () => {
  const flat = square.flatMap((p) => [p[0], p[1]]);
  const ms: number[] = [];
  pushWalls(ms, [flat], 0, -40, [1, 1, 1, 1], true);
  // edge 0 = first 6 verts (2 tris); bottom verts are 0 and 1.
  const r0 = ms[0 * 7 + 3], r1 = ms[1 * 7 + 3];
  assert(Math.abs(r0 - r1) > 1e-6, `smooth: edge-0 endpoints should differ, got ${r0} vs ${r1}`);
  const mf: number[] = [];
  pushWalls(mf, [flat], 0, -40, [1, 1, 1, 1], false);
  near(mf[0 * 7 + 3], mf[1 * 7 + 3], 1e-9, 'flat: edge-0 endpoints share one face shade');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
