// ── windgraph scene resolver tests ───────────────────────────────────────────
// Run with: bun src/authoring/runtime/__test_objectResolver.ts

import { WgScene } from './object-resolver';
import { NumberPlane } from '../../windgraph/coords/numberPlane';
import type { SceneDoc } from '../ir/types';
import { Mobject } from '../../windgraph/mobject/mobject';
import { Polyline } from '../../windgraph/mobject/primitives';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 0.5) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b} (eps ${eps})`); }

function mkDoc(objects: Record<string, any>, params: Record<string, any> = {}): SceneDoc {
  return { version: 1, meta: { title: 'wg' }, objects, params, clips: [], camera: { keyframes: [] } } as SceneDoc;
}

function triangleScene() {
  return mkDoc({
    A: { kind: 'wg-point', id: 'A', at: [0, 0], free: true, label: 'A' },
    B: { kind: 'wg-point', id: 'B', at: [4, 0], free: true, label: 'B' },
    C: { kind: 'wg-point', id: 'C', at: [2, 3], free: true, label: 'C' },
    tri: { kind: 'wg-polygon', id: 'tri', points: ['A', 'B', 'C'], stroke: { color: [1, 1, 1, 1], width: 2 } },
    cc: { kind: 'wg-circumcircle', id: 'cc', a: 'A', b: 'B', c: 'C' },
    M: { kind: 'wg-midpoint', id: 'M', a: 'A', b: 'B' },
  });
}

console.log('Object resolver tests\n');

test('builds all mobjects in doc order', () => {
  const scene = new WgScene(triangleScene(), new Map(), new NumberPlane());
  for (const id of ['A', 'B', 'C', 'tri', 'cc', 'M']) {
    assert(scene.mobjects.has(id), `missing mobject ${id}`);
    assert(scene.order.includes(id), `missing order entry ${id}`);
  }
  assert(scene.points.size === 4, 'A,B,C + midpoint M'); // A, B, C, M
  assert(scene.circles.has('cc'));
  assert(scene.order.indexOf('A') < scene.order.indexOf('tri'));
});

test('free point drag recomputes midpoint + circumcircle live', () => {
  const plane = new NumberPlane();
  const scene = new WgScene(triangleScene(), new Map(), plane);
  const M = scene.points.get('M')!;
  approx(M.x, plane.dToWx(2)); approx(M.y, plane.dToWy(0));
  // Grab B (world 400,0) and drag to (6,0) data → world (600,0).
  assert(scene.tryBeginDrag(plane.dToWx(4), plane.dToWy(0), 1), 'should grab B');
  scene.dragTo(plane.dToWx(6), plane.dToWy(0));
  scene.endDrag();
  approx(M.x, plane.dToWx(3)); approx(M.y, plane.dToWy(0));
  const cc = scene.circles.get('cc')! as any;
  const rCheck = Math.hypot(plane.dToWx(6) - cc.cx, plane.dToWy(0) - cc.cy);
  approx(cc.r, rCheck, 0.01);
});

test('glider stays on its host circle while dragged', () => {
  const plane = new NumberPlane();
  const doc = mkDoc({
    c: { kind: 'wg-circle', id: 'c', center: [0, 0], radius: 2 },
    g: { kind: 'wg-glider', id: 'g', curve: 'c', t: 0 },
  });
  const scene = new WgScene(doc, new Map(), plane);
  const g = scene.points.get('g')!;
  approx(Math.hypot(g.x, g.y), 2 * plane.unitX, 0.01);
  assert(scene.tryBeginDrag(g.x, g.y, 1), 'should grab glider');
  scene.dragTo(plane.dToWx(5), plane.dToWy(5));
  scene.endDrag();
  approx(Math.hypot(g.x, g.y), 2 * plane.unitX, 0.01);
});

test('param change resamples function plots', () => {
  const plane = new NumberPlane();
  const params = new Map<string, any>([['a', 1]]);
  const doc = mkDoc({
    f: { kind: 'wg-plot-fn', id: 'f', expr: 'a*x', domain: [-2, 2], samples: 40 },
  }, { a: { kind: 'number', label: 'a', default: 1 } });
  const scene = new WgScene(doc, params, plane);
  const group = scene.mobjects.get('f')!;
  const firstPoly = group.children[0] as Polyline;
  const yBefore = firstPoly.points[firstPoly.points.length - 1][1];
  params.set('a', 2);
  scene.update();
  const yAfter = (group.children[0] as Polyline).points[(group.children[0] as Polyline).points.length - 1][1];
  assert(Math.abs(yAfter - yBefore) > 10, `slope change should move the endpoint (${yBefore} → ${yAfter})`);
});

test('plot splits at discontinuities (1/x at 0)', () => {
  const doc = mkDoc({ f: { kind: 'wg-plot-fn', id: 'f', expr: '1/x', domain: [-2, 2], samples: 80 } });
  const scene = new WgScene(doc, new Map(), new NumberPlane());
  assert(scene.mobjects.get('f')!.children.length >= 2, 'expected multiple polylines across the asymptote');
});

test('parametric + polar plots build', () => {
  const doc = mkDoc({
    p: { kind: 'wg-plot-parametric', id: 'p', xExpr: 'cos(t)', yExpr: 'sin(t)', tRange: [0, 6.283], samples: 60 },
    r: { kind: 'wg-plot-polar', id: 'r', rExpr: '1 + cos(t)', tRange: [0, 6.283], samples: 60 },
  });
  const scene = new WgScene(doc, new Map(), new NumberPlane());
  assert(scene.mobjects.get('p')!.children.length >= 1);
  assert(scene.mobjects.get('r')!.children.length >= 1);
});

test('constraint chain resolves out of doc order', () => {
  const doc = mkDoc({
    M2: { kind: 'wg-midpoint', id: 'M2', a: 'M1', b: 'B' },   // depends on M1 defined later
    B: { kind: 'wg-point', id: 'B', at: [4, 0] },
    A: { kind: 'wg-point', id: 'A', at: [0, 0] },
    M1: { kind: 'wg-midpoint', id: 'M1', a: 'A', b: 'B' },
  });
  const plane = new NumberPlane();
  const scene = new WgScene(doc, new Map(), plane);
  const M2 = scene.points.get('M2')!;
  approx(M2.x, plane.dToWx(3)); approx(M2.y, plane.dToWy(0));
});

test('measures: angle + distance labels track the points', () => {
  const plane = new NumberPlane();
  const doc = mkDoc({
    A: { kind: 'wg-point', id: 'A', at: [1, 0] },
    O: { kind: 'wg-point', id: 'O', at: [0, 0] },
    B: { kind: 'wg-point', id: 'B', at: [0, 1] },
    ang: { kind: 'wg-angle', id: 'ang', a: 'A', vertex: 'O', b: 'B' },
    d: { kind: 'wg-distance', id: 'd', a: 'O', b: 'A' },
  });
  const scene = new WgScene(doc, new Map(), plane);
  assert(scene.mobjects.has('ang'));
  assert(scene.mobjects.has('ang:label'));
  const lab = scene.mobjects.get('d') as any;
  assert(lab.text === '1.00', `distance label got "${lab.text}"`);
});

test('resolver rejects a constraint cycle', () => {
  const doc = mkDoc({
    A: { kind: 'wg-point', id: 'A', at: [0, 0] },
    p1: { kind: 'wg-midpoint', id: 'p1', a: 'p2', b: 'A' },
    p2: { kind: 'wg-midpoint', id: 'p2', a: 'p1', b: 'A' },
  });
  let threw = false;
  try { new WgScene(doc, new Map(), new NumberPlane()); } catch { threw = true; }
  assert(threw, 'expected cycle to throw');
});

test('resolver rejects non-point input with a descriptive error', () => {
  const doc = mkDoc({
    r1: { kind: 'rect', id: 'r1', at: [0, 0], size: [10, 10] },
    m: { kind: 'wg-midpoint', id: 'm', a: 'r1', b: 'r1' },
  });
  let msg = '';
  try { new WgScene(doc, new Map(), new NumberPlane()); } catch (e) { msg = String(e); }
  assert(msg.includes('not a point-valued'), `got: ${msg}`);
});

test('wg-conic resolves (Phase 4 B5)', () => {
  const doc = mkDoc({
    f1: { kind: 'wg-point', id: 'f1', at: [-2, 0], free: true },
    f2: { kind: 'wg-point', id: 'f2', at: [2, 0], free: true },
    k: { kind: 'wg-conic', id: 'k', conic: 'ellipse', foci: ['f1', 'f2'] },
  });
  const scene = new WgScene(doc, new Map(), new NumberPlane());
  assert(scene.mobjects.has('k'));
});

test('wg-conic ellipse rebuilds when a focus is dragged (point-driven, not param)', () => {
  const plane = new NumberPlane();
  const doc = mkDoc({
    f1: { kind: 'wg-point', id: 'f1', at: [-2, 0], free: true },
    f2: { kind: 'wg-point', id: 'f2', at: [2, 0], free: true },
    k: { kind: 'wg-conic', id: 'k', conic: 'ellipse', foci: ['f1', 'f2'] },
  });
  const scene = new WgScene(doc, new Map(), plane);
  const k = scene.mobjects.get('k')!;
  assert(k.children.length === 1, 'ellipse emits one polyline');
  const before = (k.children[0] as any).points.map((p: number[]) => p.slice());
  // Drag focus f1 — a POINT change, no slider param involved.
  const f1 = scene.points.get('f1')!;
  f1.set(f1.x + 300, f1.y + 150);
  scene.update();
  assert(k.children.length === 1, 'still one polyline after drag');
  const after = (k.children[0] as any).points as number[][];
  let moved = 0;
  for (let i = 0; i < before.length; i++) {
    if (Math.abs(before[i][0] - after[i][0]) > 1e-6 || Math.abs(before[i][1] - after[i][1]) > 1e-6) moved++;
  }
  assert(moved > before.length / 2, `ellipse reshaped on focus drag (${moved}/${before.length} pts moved)`);
});

test('mobjects are real Mobject instances (clip targets for 1.3)', () => {
  const scene = new WgScene(triangleScene(), new Map(), new NumberPlane());
  for (const m of scene.mobjects.values()) assert(m instanceof Mobject);
});

test('slice cache: byte-identical idle re-emit, partial change on drag', () => {
  const plane = new NumberPlane();
  const scene = new WgScene(triangleScene(), new Map(), plane);
  const view = { zoom: 1, left: -2000, right: 2000, top: -2000, bottom: 2000 };
  const fakeFont = { unitsPerEm: 1000, charToGlyph: () => ({ advance: 500, getKerning: () => 0 }) };
  const buf = () => ({ inst: [] as number[], crv: [] as number[], rws: [] as number[], font: fakeFont as any, atlas: { table: {} } as any });
  const c1 = buf();
  scene.emit(c1 as any, view);
  const n1 = c1.inst.length;
  assert(n1 > 0, 'emitted instances');
  // Rebase sanity: row quad-pointers inside crv, AND every instance rowBase
  // (a ROW index) inside the row buffer. The second check is what catches a
  // rowBase patched in the wrong unit (the "strokes vanished" regression).
  const rowsOk = (b: any) => {
    for (let i = 0; i < b.rws.length; i += 5) assert(b.rws[i] * 6 <= b.crv.length, `row quad ${b.rws[i]} out of range`);
    const rows = b.rws.length / 5;
    for (let i = 0; i < b.inst.length; i += 16) assert(b.inst[i + 12] >= 0 && b.inst[i + 12] < rows, `inst rowBase ${b.inst[i + 12]} out of [0,${rows})`);
  };
  rowsOk(c1);
  // Idle re-emit: byte-identical.
  const c2 = buf();
  scene.emit(c2 as any, view);
  assert(c2.inst.length === n1, 'same instance count');
  let same = true;
  for (let i = 0; i < n1; i++) if (c1.inst[i] !== c2.inst[i]) { same = false; break; }
  assert(same, 'byte-identical idle re-emit');
  // Move free point A: only dependent slices change.
  const A = scene.points.get('A')!;
  A.set(A.x + 50, A.y + 30);
  scene.update();
  const c3 = buf();
  scene.emit(c3 as any, view);
  assert(c3.inst.length === n1, 'same count after move');
  let diff = 0;
  for (let i = 0; i < n1; i++) if (c1.inst[i] !== c3.inst[i]) diff++;
  assert(diff > 0, 'output changed after drag');
  assert(diff < n1, `only part of the scene changed (${diff}/${n1} floats)`);
  rowsOk(c3);
});

test('direct draws: unrelated slider leaves implicit/field geometry cached', () => {
  const doc = mkDoc({
    f: { kind: 'wg-plot-implicit', id: 'f', expr: 'x^2 + y^2 - 1' },
    w: { kind: 'wg-plot-fn', id: 'w', expr: 'a*x', domain: [-2, 2], samples: 60 },
  }, { a: { kind: 'number', label: 'a', default: 1 } });
  const params = new Map<string, any>([['a', 1]]);
  const scene = new WgScene(doc, params, new NumberPlane());
  const view = { zoom: 1, left: -300, right: 300, top: -300, bottom: 300 };
  const ctx1: any = { font: {}, atlas: {}, inst: [], crv: [], rws: [] };
  scene.emit(ctx1, view);
  const n1 = ctx1.inst.length;
  assert(n1 > 0, 'emitted instances');
  // Slider 'a' feeds only the wave (same sample count on resample); the
  // implicit has no 'a' dependency → its cache replays, counts stay identical.
  params.set('a', 2);
  scene.update();
  const ctx2: any = { font: {}, atlas: {}, inst: [], crv: [], rws: [] };
  scene.emit(ctx2, view);
  assert(ctx2.inst.length === n1, `instance count stable (${n1} -> ${ctx2.inst.length})`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
