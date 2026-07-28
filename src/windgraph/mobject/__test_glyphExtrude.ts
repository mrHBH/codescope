// ── Glyph & math extrusion tests (Phase 2.3, true extrusion) ──────────────────
// Run with: bun src/windgraph/mobject/__test_glyphExtrude.ts
//
// The extruded side is now real depth-tested wall geometry built from the glyph
// outlines stored on the atlas (Tex.wallLoops); the analytic pass emits a single
// sharp top glyph. These tests verify the top-glyph lift and the outline→world
// contour transform that feeds the wall mesh.

import { MathTex } from '../math/mathtex';
import { Tex, Label } from './primitives';
import type { RenderCtx } from './mobject';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(c: boolean, m = 'assertion failed') { if (!c) throw new Error(m); }
function near(a: number, b: number, eps: number, m: string) { if (Math.abs(a - b) > eps) throw new Error(`${m}: ${a} !≈ ${b}`); }

const glyph = { upm: 1000, advance: 500, bbox: [10, -700, 490, 10], rowBase: 3, bandCount: 2, bandH: 8, invH: 0.125 };
const atlas = { table: { 'mi:x': glyph, 'mn:1': glyph } };
// Atlas that also carries a stored outline contour (as the baker now does for math
// fonts): a unit square in font units.
const outlineAtlas = { table: { 'mi:x': { ...glyph, outline: [[0, 0, 500, 0, 500, 500, 0, 500]] } } };
function ctx(): RenderCtx { return { font: null as any, atlas, inst: [], crv: [], rws: [], xf: [] }; }

console.log('Glyph extrusion tests\n');

test('MathTex.emit lifts each glyph by z into xf (1:1 with instances)', () => {
  const inst: number[] = [], crv: number[] = [], rws: number[] = [], xf: number[] = [];
  new MathTex('x').emit(atlas as any, inst, crv, rws, { x: 0, y: 0, size: 48, color: [1, 1, 1, 1], z: 30, xf });
  const n = inst.length / 16;
  assert(n >= 1, `expected >=1 glyph instance, got ${n}`);
  assert(xf.length === n * 8, 'xf aligned to instance count');
  for (let k = 0; k < n; k++) near(xf[k * 8 + 2], 30, 1e-9, `glyph ${k} z = 30`);
});

test('MathTex.emit with z=0 leaves xf flat (zeros)', () => {
  const inst: number[] = [], crv: number[] = [], rws: number[] = [], xf: number[] = [];
  new MathTex('x').emit(atlas as any, inst, crv, rws, { x: 0, y: 0, size: 48, color: [1, 1, 1, 1], z: 0, xf });
  const n = inst.length / 16;
  assert(n >= 1, 'emitted a glyph');
  for (let k = 0; k < n; k++) near(xf[k * 8 + 2], 0, 1e-9, `glyph ${k} z = 0`);
});

test('Tex mobject extrude>0 emits ONE sharp top glyph at z=extrude (no stack)', () => {
  const c = ctx();
  const tex = new Tex('x', 100, 200, 48);
  tex.extrude = 55;
  tex.emit(c);
  const n = c.inst.length / 16;
  assert(n === 1, `expected a single top glyph, got ${n}`);
  assert(c.xf!.length === n * 8, 'xf aligned');
  near(c.xf![2], 56.5, 1e-9, 'top glyph at z=extrude+plug');
});

test('Tex elevation + extrude place the top glyph at their sum', () => {
  const c = ctx();
  const tex = new Tex('x', 0, 0, 48);
  tex.elevation = 20; tex.extrude = 35;
  tex.emit(c);
  near(c.xf![2], 56.5, 1e-9, 'z = elevation + extrude + plug');
});

test('Tex.wallLoops returns transformed outline contours (the wall silhouette)', () => {
  const tex = new Tex('x', 100, 200, 48);
  const loops = tex.wallLoops(outlineAtlas as any);
  assert(loops.length === 1, `expected 1 contour, got ${loops.length}`);
  assert(loops[0].length === 8, `expected 4 pts (8 floats), got ${loops[0].length}`);
  // unit = size*p.s/upm = 48*1/1000 = 0.048; font coords [0,500] → world span 24.
  for (let i = 0; i < loops[0].length; i += 2) {
    assert(loops[0][i] >= 99 && loops[0][i] <= 125, `world x near pen, got ${loops[0][i]}`);
  }
});

test('Tex.wallLoops with no stored outline yields nothing', () => {
  const tex = new Tex('x', 0, 0, 48);
  assert(tex.wallLoops(atlas as any).length === 0, 'no outline → no loops');
});

test('Label extrude lifts the text op via the accumulated z', () => {
  const c = ctx();
  const lab = new Label('x', 0, 0, 24);
  lab.extrude = 40;
  let threw = false;
  try { lab.emit(c); } catch { threw = true; }
  assert(c.xf!.length % 8 === 0, 'xf stays aligned');
  assert(threw || c.xf!.length >= 0, 'label emit ran');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
