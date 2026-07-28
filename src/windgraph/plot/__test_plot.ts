// ── windgraph plot-catalog math tests (Phase 4 · Lane A) ─────────────────────
// Run with: bun src/windgraph/plot/__test_plot.ts

import { catmullRom, naturalCubic, bspline, deCasteljau } from './spline';
import { sequenceSamples, cobweb } from './sequence';
import { derivative, secondDerivative, accumulation, quadrature, quadratureColumns } from './calculus';
import { rk4Ode, rk4System, bifurcation } from './ode';
import { fourierCoeffs, fourierSum } from './fourier';
import { histogram, boxStats, linearReg, polyReg, regression, residuals, hexbin, beeswarm } from './stats';
import { contourLevels } from './contour';
import { candlestick, ternaryToXY, radar, parallelCoords } from './charts';
import type { Pt } from '../stroke/stroke';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(c: boolean, m = 'assertion failed') { if (!c) throw new Error(m); }
function approx(a: number, b: number, eps = 1e-3) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b} (eps ${eps})`); }

console.log('Plot catalog math tests\n');

test('catmull-rom passes through interior control points', () => {
  const ctrl: Pt[] = [[0, 0], [1, 2], [2, 0], [3, 2]];
  const curve = catmullRom(ctrl, 16);
  const hit = curve.some((p) => Math.hypot(p[0] - 1, p[1] - 2) < 0.02);
  assert(hit, 'curve should pass near [1,2]');
});

test('natural cubic matches endpoints', () => {
  const ctrl: Pt[] = [[0, 0], [1, 1], [2, 0]];
  const curve = naturalCubic(ctrl, 12);
  approx(curve[0][0], 0); approx(curve[0][1], 0);
  approx(curve[curve.length - 1][0], 2); approx(curve[curve.length - 1][1], 0);
});

test('b-spline stays near the control hull', () => {
  const ctrl: Pt[] = [[0, 0], [1, 3], [2, -1], [3, 2], [4, 0]];
  const curve = bspline(ctrl, 12);
  assert(curve.every((p) => p[1] >= -1.5 && p[1] <= 3.5), 'within hull bounds');
});

test('de Casteljau evaluates a bezier endpoint', () => {
  const p = deCasteljau([[0, 0], [1, 2], [2, 0]], 1);
  approx(p[0], 2); approx(p[1], 0);
});

test('sequence samples land on integers', () => {
  const s = sequenceSamples((n) => n * n, 0, 5);
  assert(s.length === 6);
  approx(s[3][1], 9);
});

test('cobweb builds a staircase', () => {
  const path = cobweb((x) => 3.5 * x * (1 - x), 0.5, 8, 0, 1);
  assert(path.length > 4, 'cobweb has steps');
});

test('numeric derivative of x^2 at 3 is 6', () => approx(derivative((x) => x * x, 3), 6, 1e-3));
test('second derivative of x^3 at 2 is 12', () => approx(secondDerivative((x) => x * x * x, 2), 12, 1e-2));

test('accumulation F(x)=∫ₐˣ f: zero at a, positive right, negative left', () => {
  const pts = accumulation(() => 1, 1, 0, 2, 200);
  const at = (x: number) => pts.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best), pts[0]);
  approx(at(1)[1], 0, 0.02);   // F(a) = 0
  approx(at(2)[1], 1, 0.02);   // ∫₁² 1 = 1
  approx(at(0)[1], -1, 0.02);  // ∫₁⁰ 1 = -1  (sign flips for x < a)
  const sq = accumulation((x) => x, 0, -2, 2, 400);
  const atSq = (x: number) => sq.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best), sq[0]);
  approx(atSq(0)[1], 0, 0.05);  // F(a) = 0
  approx(atSq(-2)[1], 2, 0.05); // ∫₀⁻² t dt = [t²/2] = 2 (even antiderivative)
  approx(atSq(2)[1], 2, 0.05);  // ∫₀² t dt = 2
});

test('quadrature modes integrate x on [0,1] to ~0.5', () => {
  approx(quadrature((x) => x, 0, 1, 100, 'trapezoid'), 0.5, 1e-3);
  approx(quadrature((x) => x, 0, 1, 101, 'simpson'), 0.5, 1e-3);
  approx(quadrature((x) => x, 0, 1, 1000, 'midpoint'), 0.5, 1e-3);
});

test('quadrature columns cover the domain', () => {
  const cols = quadratureColumns((x) => x, 0, 1, 10, 'midpoint');
  assert(cols.length === 10);
});

test('rk4 solves y\'=y to e^x', () => {
  const traj = rk4Ode((_x, y) => y, 0, 1, 1, 0.01);
  const last = traj[traj.length - 1];
  approx(last[1], Math.E, 1e-4);
});

test('rk4 system traces a circle', () => {
  const traj = rk4System((p) => [-p[1], p[0]] as Pt, [1, 0], 0, Math.PI * 2, 0.01);
  const last = traj[traj.length - 1];
  approx(Math.hypot(last[0], last[1]), 1, 1e-2);
  approx(last[0], 1, 0.05);
});

test('bifurcation produces points in range', () => {
  const pts = bifurcation((r, x) => r * x * (1 - x), 2.5, 4, 50, 20, 100);
  assert(pts.length > 0);
  assert(pts.every((p) => p[0] >= 2.5 && p[0] <= 4));
});

test('fourier of sin(x) has b₁≈1', () => {
  const c = fourierCoeffs(Math.sin, 4, Math.PI * 2, 1024);
  approx(c[1].b, 1, 0.02);
  approx(fourierSum(c, Math.PI / 2, Math.PI * 2), 1, 0.05);
});

test('histogram counts sum to n', () => {
  const data = Array.from({ length: 100 }, (_, i) => i);
  const bins = histogram(data, 'fd');
  const total = bins.reduce((s, b) => s + b.count, 0);
  assert(total === 100, `total ${total}`);
});

test('box stats median of 1..5 is 3', () => {
  const st = boxStats([1, 2, 3, 4, 5]);
  approx(st.median, 3);
});

test('linear regression on a line has R²=1', () => {
  const pts: Pt[] = [[0, 1], [1, 3], [2, 5], [3, 7]];
  const r = linearReg(pts);
  approx(r.coeffs[0], 2); approx(r.coeffs[1], 1);
  approx(r.r2, 1, 1e-9);
});

test('poly regression fits a parabola', () => {
  const pts: Pt[] = Array.from({ length: 11 }, (_, i) => [i - 5, (i - 5) * (i - 5)] as Pt);
  const r = polyReg(pts, 2);
  approx(r.r2, 1, 1e-6);
});

test('regression dispatcher + residuals', () => {
  const pts: Pt[] = [[0, 1], [1, 3], [2, 5]];
  const r = regression(pts, 'linear');
  const res = residuals(pts, r.fn);
  assert(res.every(([, ry]) => Math.abs(ry) < 1e-6));
});

test('hexbin aggregates nearby points', () => {
  const pts: Pt[] = [[0, 0], [0.01, 0.01], [5, 5]];
  const cells = hexbin(pts, 0.5);
  assert(cells.some((c) => c.count === 2));
});

test('beeswarm offsets separate collisions', () => {
  const offs = beeswarm([1, 1, 1, 1], 0.1);
  assert(new Set(offs.map((o) => o.toFixed(3))).size === 4, 'distinct offsets');
});

test('contour levels are sorted within range', () => {
  const plane = { xMin: -2, xMax: 2, yMin: -2, yMax: 2 } as any;
  const lv = contourLevels((x, y) => x * x + y * y, plane, 4);
  assert(lv.length === 4);
  assert(lv.every((v, i) => i === 0 || v > lv[i - 1]));
});

test('candlestick geometry up/down', () => {
  const g = candlestick([{ x: 0, open: 1, high: 3, low: 0, close: 2 }], 0.6);
  assert(g[0].up === true);
  assert(g[0].body.length === 4);
});

test('ternary maps to the unit triangle', () => {
  const p = ternaryToXY(1, 0, 0);
  approx(p[0], 0); approx(p[1], 0);
  const q = ternaryToXY(0, 1, 0);
  approx(q[0], 1); approx(q[1], 0);
});

test('radar polygon has one vertex per axis', () => {
  const r = radar([1, 2, 3, 4]);
  assert(r.poly.length === 4);
  assert(r.axes.length === 4);
});

test('parallel coords emits one line per row', () => {
  const pc = parallelCoords([[1, 2, 3], [3, 2, 1], [2, 2, 2]]);
  assert(pc.lines.length === 3);
  assert(pc.axes.length === 3);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
