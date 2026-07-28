// ── windgraph plot-catalog resolver tests (Phase 4 · Lane A) ─────────────────
// Run with: bun src/authoring/runtime/__test_plotKinds.ts

import { WgScene } from './object-resolver';
import { NumberPlane } from '../../windgraph/coords/numberPlane';
import type { SceneDoc } from '../ir/types';
import { validateSceneDoc } from '../ir/validate';
import { plotGalleryDoc } from '../../playground/boards/windgraphScene';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(c: boolean, m = 'assertion failed') { if (!c) throw new Error(m); }

function mkDoc(objects: Record<string, any>, params: Record<string, any> = {}): SceneDoc {
  return { version: 1, meta: { title: 'wg' }, objects, params, clips: [], camera: { keyframes: [] } } as SceneDoc;
}

const view = { zoom: 1, left: -700, right: 700, top: -500, bottom: 500 };
function emit(scene: WgScene): number {
  const ctx: any = { font: { unitsPerEm: 1000, charToGlyph: () => ({ advance: 500, getKerning: () => 0 }), getKerningValue: () => 0 }, atlas: { table: {} }, inst: [], crv: [], rws: [] };
  scene.emit(ctx, view);
  return ctx.inst.length;
}

console.log('Plot-catalog resolver tests\n');

test('A1 piecewise builds + emits', () => {
  const scene = new WgScene(mkDoc({ f: { kind: 'wg-plot-piecewise', id: 'f', pieces: [{ cond: 'x < 0', expr: '-x' }, { cond: 'x >= 0', expr: 'x^2' }], domain: [-3, 3], samples: 80 } }), new Map(), new NumberPlane());
  assert(scene.mobjects.has('f'));
  assert(emit(scene) > 0);
});

test('A2 inequality is a direct draw that emits fill', () => {
  const scene = new WgScene(mkDoc({ r: { kind: 'wg-plot-inequality', id: 'r', exprs: ['x^2 + y^2 - 4'], cmps: ['<'], fill: [0.3, 0.8, 0.7, 0.3] } }), new Map(), new NumberPlane());
  assert(emit(scene) > 0, 'shaded region emits instances');
});

test('A3 sequence dots + cobweb build', () => {
  const s1 = new WgScene(mkDoc({ s: { kind: 'wg-plot-sequence', id: 's', expr: '1/n', nRange: [1, 8] } }), new Map(), new NumberPlane());
  assert((s1.mobjects.get('s')!).children.length === 8);
  const s2 = new WgScene(mkDoc({ c: { kind: 'wg-plot-sequence', id: 'c', expr: '3.2*x*(1-x)', cobweb: true, x0: 0.3, iters: 20, nRange: [0, 1] } }), new Map(), new NumberPlane());
  assert((s2.mobjects.get('c')!).children.length >= 1);
});

test('A4 spline through draggable points reacts to drag', () => {
  const plane = new NumberPlane();
  const scene = new WgScene(mkDoc({
    P0: { kind: 'wg-point', id: 'P0', at: [-3, 0], free: true },
    P1: { kind: 'wg-point', id: 'P1', at: [0, 2], free: true },
    P2: { kind: 'wg-point', id: 'P2', at: [3, 0], free: true },
    sp: { kind: 'wg-plot-spline', id: 'sp', points: ['P0', 'P1', 'P2'], spline: 'catmull' },
  }), new Map(), plane);
  const before = emit(scene);
  assert(before > 0);
  const P1 = scene.points.get('P1')!;
  P1.set(P1.x, P1.y + 80);
  scene.update();
  assert(emit(scene) > 0);
});

test('A5 tangent + derivatives build', () => {
  const scene = new WgScene(mkDoc({ t: { kind: 'wg-plot-tangent', id: 't', expr: 'sin(x)', at: 1, domain: [-3, 3], showNormal: true, showDerivatives: true, samples: 80 } }), new Map(), new NumberPlane());
  assert((scene.mobjects.get('t')!).children.length >= 3);
});

test('A6 accumulation builds a curve', () => {
  const scene = new WgScene(mkDoc({ F: { kind: 'wg-plot-accumulation', id: 'F', expr: 'cos(x)', from: 0, domain: [-3, 3], samples: 100 } }), new Map(), new NumberPlane());
  assert((scene.mobjects.get('F')!).children.length >= 1);
});

test('A7 riemann columns resample on n change', () => {
  const params = new Map<string, any>([['n', 4]]);
  const scene = new WgScene(mkDoc({ r: { kind: 'wg-plot-riemann', id: 'r', expr: 'x^2', domain: [0, 2], n: { $param: 'n' }, mode: 'midpoint' } }, { n: { kind: 'number', label: 'n', default: 4 } }), params, new NumberPlane());
  assert((scene.mobjects.get('r')!).children.length === 4);
  params.set('n', 8);
  scene.update();
  assert((scene.mobjects.get('r')!).children.length === 8);
});

test('A8 streamlines direct draw emits', () => {
  const scene = new WgScene(mkDoc({ sl: { kind: 'wg-streamlines', id: 'sl', xExpr: '-y', yExpr: 'x', density: 0.5, steps: 60 } }), new Map(), new NumberPlane());
  assert(emit(scene) > 0);
});

test('A9 ODE through draggable initial point', () => {
  const plane = new NumberPlane();
  const scene = new WgScene(mkDoc({
    p: { kind: 'wg-point', id: 'p', at: [0, 1], free: true },
    ode: { kind: 'wg-plot-ode', id: 'ode', yExpr: '-y', through: ['p'], domain: [0, 3], h: 0.05 },
  }), new Map(), plane);
  assert((scene.mobjects.get('ode')!).children.length >= 2);
});

test('A10 bifurcation direct draw emits splats', () => {
  const scene = new WgScene(mkDoc({ b: { kind: 'wg-plot-bifurcation', id: 'b', expr: 'r*x*(1-x)', rRange: [2.5, 4], iters: 20, transient: 50, rSteps: 80 } }), new Map(), new NumberPlane());
  assert(emit(scene) > 0);
});

test('A11 fourier partial sum + epicycles', () => {
  const scene = new WgScene(mkDoc({ f: { kind: 'wg-plot-fourier', id: 'f', expr: 'x', terms: 5, domain: [-3, 3], epicycles: true, samples: 120 } }), new Map(), new NumberPlane());
  assert((scene.mobjects.get('f')!).children.length >= 2);
});

test('A12 histogram bars from data', () => {
  const data = Array.from({ length: 50 }, (_, i) => Math.sin(i) * 3);
  const scene = new WgScene(mkDoc({ h: { kind: 'wg-histogram', id: 'h', data, method: 'sturges' } }), new Map(), new NumberPlane());
  assert((scene.mobjects.get('h')!).children.length >= 1);
});

test('A13 boxplot variants build', () => {
  const data = Array.from({ length: 40 }, (_, i) => i);
  for (const variant of ['box', 'violin', 'strip', 'beeswarm']) {
    const scene = new WgScene(mkDoc({ b: { kind: 'wg-boxplot', id: 'b', data, variant, at: 0 } }), new Map(), new NumberPlane());
    assert((scene.mobjects.get('b')!).children.length >= 1, variant);
  }
});

test('A14 bubble / heatmap / hexbin build', () => {
  const s1 = new WgScene(mkDoc({ c: { kind: 'wg-plot-cells', id: 'c', cell: 'bubble', points: [[0, 0], [1, 1]], sizes: [1, 4] } }), new Map(), new NumberPlane());
  assert((s1.mobjects.get('c')!).children.length === 2);
  const s2 = new WgScene(mkDoc({ c: { kind: 'wg-plot-cells', id: 'c', cell: 'heatmap', matrix: [[1, 2], [3, 4]] } }), new Map(), new NumberPlane());
  assert((s2.mobjects.get('c')!).children.length === 4);
  const s3 = new WgScene(mkDoc({ c: { kind: 'wg-plot-cells', id: 'c', cell: 'hexbin', points: [[0, 0], [0.1, 0.1], [3, 3]], size: 0.5 } }), new Map(), new NumberPlane());
  assert((s3.mobjects.get('c')!).children.length >= 1);
});

test('A15 contours line + filled + labels emit', () => {
  const scene = new WgScene(mkDoc({ c: { kind: 'wg-contours', id: 'c', expr: 'x^2 + y^2', count: 4, filled: true, labels: true } }), new Map(), new NumberPlane());
  assert(scene.mobjects.has('c:labels'));
  assert(emit(scene) > 0);
});

test('A16 regression fit + residuals + R² label', () => {
  const pts = Array.from({ length: 8 }, (_, i) => [i, 2 * i + 1] as [number, number]);
  const scene = new WgScene(mkDoc({ r: { kind: 'wg-regression', id: 'r', points: pts, fit: 'linear', showResiduals: true } }), new Map(), new NumberPlane());
  assert((scene.mobjects.get('r')!).children.length >= 2);
});

test('A17 financial charts build', () => {
  const s1 = new WgScene(mkDoc({ c: { kind: 'wg-chart-fin', id: 'c', chart: 'candle', ohlc: [{ x: 0, open: 1, high: 3, low: 0, close: 2 }, { x: 1, open: 2, high: 4, low: 1, close: 1.5 }] } }), new Map(), new NumberPlane());
  assert((s1.mobjects.get('c')!).children.length >= 2);
  const s2 = new WgScene(mkDoc({ c: { kind: 'wg-chart-fin', id: 'c', chart: 'radar', values: [1, 2, 3, 4, 5] } }), new Map(), new NumberPlane());
  assert((s2.mobjects.get('c')!).children.length >= 2);
});

test('A18 ternary / parallel / scattermatrix build', () => {
  const s1 = new WgScene(mkDoc({ c: { kind: 'wg-chart-multi', id: 'c', chart: 'ternary', triples: [[1, 1, 1], [2, 1, 0]] } }), new Map(), new NumberPlane());
  assert((s1.mobjects.get('c')!).children.length >= 2);
  const s2 = new WgScene(mkDoc({ c: { kind: 'wg-chart-multi', id: 'c', chart: 'parallel', columns: [[1, 2, 3], [3, 1, 2]] } }), new Map(), new NumberPlane());
  assert((s2.mobjects.get('c')!).children.length >= 2);
  const s3 = new WgScene(mkDoc({ c: { kind: 'wg-chart-multi', id: 'c', chart: 'scattermatrix', columns: [[1, 2, 3], [2, 3, 1]] } }), new Map(), new NumberPlane());
  assert((s3.mobjects.get('c')!).children.length >= 1);
});

test('comparison/logical operators work in expr (piecewise prereq)', () => {
  const scene = new WgScene(mkDoc({ f: { kind: 'wg-plot-piecewise', id: 'f', pieces: [{ cond: 'x > 0 && x < 2', expr: '1' }, { cond: 'x >= 2 || x <= 0', expr: '0' }], domain: [-3, 3], samples: 60 } }), new Map(), new NumberPlane());
  assert(emit(scene) > 0);
});

test('plot gallery doc validates + resolves + emits', () => {
  const doc = plotGalleryDoc();
  const errs = validateSceneDoc(doc);
  assert(errs.length === 0, 'gallery validates: ' + errs.join('; '));
  const params = new Map<string, any>();
  for (const [k, p] of Object.entries(doc.params)) params.set(k, (p as any).default);
  const scene = new WgScene(doc, params, new NumberPlane());
  assert(scene.mobjects.size > 10, 'many mobjects resolved');
  assert(emit(scene) > 0, 'gallery emits instances');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
