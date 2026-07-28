// ── Geometry constraint tests (Lane B) ──────────────────────────────────────
// Run with: bun src/windgraph/interact/__test_constraints.ts

import { ConstraintGraph } from './graph';
import {
  GPoint, GLine, GCircle, LineThrough, Circumcircle,
  Circumcenter, Incenter, Orthocenter, Excenter, EulerLine, NinePointCircle,
  PerpBisector, AngleBisector, Median, Altitude, TangentToCircle, TangentsFromPoint,
  CircleByDiameter, Incircle, Excircle,
  RadicalAxis, PolarLine, ApolloniusCircle, CommonTangents,
  EllipseFromFoci, ParabolaFromFocusDirectrix, HyperbolaFromFoci, ConicThrough5Points,
  RotatedPoint, TranslatedPoint, DilatedPoint,
  CircleInversion, MobiusPoint, invertCircle,
  TraceRecorder, LocusCurve,
  HLockedPoint, VLockedPoint, GridSnappedPoint, AngleSnappedPoint,
  LengthMeasure, AngleMeasure, AreaMeasure, SlopeMeasure, RadiusMeasure,
  ConstructionProtocol, RegularPolygon,
  Midpoint, Distance,
} from './constraints';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 1e-6) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b} (eps ${eps})`); }

console.log('Constraint geometry tests (Lane B)\n');

// B1: Triangle centers
test('B1 circumcenter of right triangle', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 0)), c = g.add(new GPoint(0, 3));
  const cc = g.add(new Circumcenter(a, b, c));
  g.update();
  approx(cc.x, 2); approx(cc.y, 1.5);
});

test('B1 incenter of 3-4-5 triangle', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 0)), c = g.add(new GPoint(0, 3));
  const ic = g.add(new Incenter(a, b, c));
  g.update();
  approx(ic.x, 1); approx(ic.y, 1);
});

test('B1 orthocenter of right triangle = right-angle vertex', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 0)), c = g.add(new GPoint(0, 3));
  const oh = g.add(new Orthocenter(a, b, c));
  g.update();
  approx(oh.x, 0); approx(oh.y, 0);
});

test('B1 excenter exists and is outside triangle', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 0)), c = g.add(new GPoint(0, 3));
  const ex = g.add(new Excenter(a, b, c, 0));
  g.update();
  assert(ex.x !== 0 || ex.y !== 0, 'excenter should not be at origin');
});

test('B1 Euler line passes through circumcenter and orthocenter', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(6, 0)), c = g.add(new GPoint(2, 4));
  const cc = g.add(new Circumcenter(a, b, c));
  const oh = g.add(new Orthocenter(a, b, c));
  const el = g.add(new EulerLine(cc, oh));
  g.update();
  const t1 = (cc.x - el.x0) * el.dx + (cc.y - el.y0) * el.dy;
  const px = el.x0 + el.dx * t1, py = el.y0 + el.dy * t1;
  approx(px, cc.x, 1e-4); approx(py, cc.y, 1e-4);
});

test('B1 nine-point circle radius = R/2', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 0)), c = g.add(new GPoint(0, 3));
  const cc = g.add(new Circumcenter(a, b, c));
  const oh = g.add(new Orthocenter(a, b, c));
  const circ = g.add(new Circumcircle(a, b, c));
  const npc = g.add(new NinePointCircle(cc, oh, circ));
  g.update();
  approx(npc.r, circ.r / 2);
});

// B2: Bisectors and tangents
test('B2 perpendicular bisector passes through midpoint', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 2));
  const pb = g.add(new PerpBisector(a, b));
  g.update();
  approx(pb.x0, 2); approx(pb.y0, 1);
  const dot = pb.dx * (b.x - a.x) + pb.dy * (b.y - a.y);
  approx(dot, 0, 1e-6);
});

test('B2 angle bisector bisects the angle', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(1, 0)), v = g.add(new GPoint(0, 0)), b = g.add(new GPoint(0, 1));
  const ab = g.add(new AngleBisector(a, v, b));
  g.update();
  approx(ab.dx, Math.SQRT1_2, 1e-6); approx(ab.dy, Math.SQRT1_2, 1e-6);
});

test('B2 tangent to circle at point is perpendicular to radius', () => {
  const g = new ConstraintGraph();
  const c = g.add(new GCircle()); c.cx = 0; c.cy = 0; c.r = 2;
  const p = g.add(new GPoint(2, 0));
  const t = g.add(new TangentToCircle(c, p));
  g.update();
  const dot = t.dx * (p.x - c.cx) + t.dy * (p.y - c.cy);
  approx(dot, 0, 1e-6);
});

test('B2 tangents from external point', () => {
  const g = new ConstraintGraph();
  const c = g.add(new GCircle()); c.cx = 0; c.cy = 0; c.r = 1;
  const p = g.add(new GPoint(3, 0));
  const tf = g.add(new TangentsFromPoint(c, p));
  g.update();
  assert(tf.ok, 'should find tangents');
  assert(tf.lines !== null && tf.lines.length === 2, 'two tangent lines');
});

// B3: More circles
test('B3 circle by diameter', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 0));
  const c = g.add(new CircleByDiameter(a, b));
  g.update();
  approx(c.cx, 2); approx(c.cy, 0); approx(c.r, 2);
});

test('B3 incircle of 3-4-5 triangle', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 0)), c = g.add(new GPoint(0, 3));
  const ic = g.add(new Incircle(a, b, c));
  g.update();
  approx(ic.r, 1, 1e-4);
});

test('B3 excircle exists', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 0)), c = g.add(new GPoint(0, 3));
  const ec = g.add(new Excircle(a, b, c, 0));
  g.update();
  assert(ec.r > 0, 'excircle radius positive');
});

// B4: Circle relations
test('B4 radical axis perpendicular to line of centers', () => {
  const g = new ConstraintGraph();
  const c1 = g.add(new GCircle()); c1.cx = 0; c1.cy = 0; c1.r = 2;
  const c2 = g.add(new GCircle()); c2.cx = 5; c2.cy = 0; c2.r = 3;
  const ra = g.add(new RadicalAxis(c1, c2));
  g.update();
  assert(ra.ok);
  approx(ra.dx, 0, 1e-6);
});

test('B4 Apollonius circle for ratio 2', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(3, 0));
  const ap = g.add(new ApolloniusCircle(a, b, 2));
  g.update();
  assert(ap.ok);
  assert(ap.r > 0);
});

test('B4 common tangents of two separated circles', () => {
  const g = new ConstraintGraph();
  const c1 = g.add(new GCircle()); c1.cx = 0; c1.cy = 0; c1.r = 1;
  const c2 = g.add(new GCircle()); c2.cx = 5; c2.cy = 0; c2.r = 1;
  const ct = g.add(new CommonTangents(c1, c2));
  g.update();
  assert(ct.lines.length === 4, `expected 4 tangents, got ${ct.lines.length}`);
});

// B5: Conics
test('B5 ellipse from foci samples correctly', () => {
  const g = new ConstraintGraph();
  const f1 = g.add(new GPoint(-1, 0)), f2 = g.add(new GPoint(1, 0));
  const ell = g.add(new EllipseFromFoci(f1, f2, 2));
  g.update();
  const pts = ell.sample(100);
  assert(pts.length > 50);
  for (const [x, y] of pts) {
    const d1 = Math.hypot(x - f1.x, y - f1.y);
    const d2 = Math.hypot(x - f2.x, y - f2.y);
    approx(d1 + d2, 4, 0.1);
  }
});

test('B5 parabola sample satisfies focus-directrix property', () => {
  const g = new ConstraintGraph();
  const f = g.add(new GPoint(0, 1));
  const d = g.add(new GLine()); d.x0 = 0; d.y0 = -1; d.dx = 1; d.dy = 0;
  const par = g.add(new ParabolaFromFocusDirectrix(f, d));
  g.update();
  const pts = par.sample(50);
  for (const [x, y] of pts) {
    const distFocus = Math.hypot(x - f.x, y - f.y);
    const distDirectrix = Math.abs(y - (-1));
    approx(distFocus, distDirectrix, 0.05);
  }
});

test('B5 conic through 5 points on unit circle', () => {
  const g = new ConstraintGraph();
  const pts = [0, 1, 2, 3, 4].map(i => {
    const t = (i / 5) * 2 * Math.PI;
    return g.add(new GPoint(Math.cos(t), Math.sin(t)));
  });
  const conic = g.add(new ConicThrough5Points(pts as [GPoint, GPoint, GPoint, GPoint, GPoint]));
  g.update();
  assert(conic.ok);
  assert(conic.kind === 'ellipse', `expected ellipse, got ${conic.kind}`);
});

// B6: Transforms
test('B6 rotation by 90°', () => {
  const g = new ConstraintGraph();
  const p = g.add(new GPoint(1, 0)), c = g.add(new GPoint(0, 0));
  const rp = g.add(new RotatedPoint(p, c, Math.PI / 2));
  g.update();
  approx(rp.x, 0); approx(rp.y, 1);
});

test('B6 translation', () => {
  const g = new ConstraintGraph();
  const p = g.add(new GPoint(1, 2));
  const tp = g.add(new TranslatedPoint(p, 3, -1));
  g.update();
  approx(tp.x, 4); approx(tp.y, 1);
});

test('B6 dilation by factor 2', () => {
  const g = new ConstraintGraph();
  const p = g.add(new GPoint(3, 4)), c = g.add(new GPoint(1, 1));
  const dp = g.add(new DilatedPoint(p, c, 2));
  g.update();
  approx(dp.x, 5); approx(dp.y, 7);
});

// B7: Inversion
test('B7 circle inversion: point on circle maps to itself', () => {
  const g = new ConstraintGraph();
  const c = g.add(new GCircle()); c.cx = 0; c.cy = 0; c.r = 2;
  const p = g.add(new GPoint(2, 0));
  const inv = g.add(new CircleInversion(p, c));
  g.update();
  approx(inv.x, 2); approx(inv.y, 0);
});

test('B7 circle inversion: r²/d relationship', () => {
  const g = new ConstraintGraph();
  const c = g.add(new GCircle()); c.cx = 0; c.cy = 0; c.r = 2;
  const p = g.add(new GPoint(4, 0));
  const inv = g.add(new CircleInversion(p, c));
  g.update();
  approx(inv.x, 1); approx(inv.y, 0);
});

test('B7 invertCircle: circle not through center → circle', () => {
  const inv = new GCircle(); inv.cx = 0; inv.cy = 0; inv.r = 1;
  const c = new GCircle(); c.cx = 3; c.cy = 0; c.r = 1;
  const result = invertCircle(c, inv);
  assert(result instanceof GCircle, 'should be a circle');
});

// B8: Trace & locus
test('B8 trace recorder collects points', () => {
  const tr = new TraceRecorder(5);
  for (let i = 0; i < 10; i++) tr.record(i, i * i);
  assert(tr.trail.length === 5);
  approx(tr.trail[0][0], 5);
});

test('B8 locus curve sweeps correctly', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(2, 0));
  const mid = g.add(new Midpoint(a, b));
  const locus = new LocusCurve(b, mid, g, 10);
  locus.sweepLine(0, 0, 4, 0);
  assert(locus.points.length === 11);
  approx(locus.points[0][0], 0);
  approx(locus.points[10][0], 2);
});

// B9: Drag constraints
test('B9 horizontal lock', () => {
  const p = new HLockedPoint(0, 5);
  p.moveTo(3, 10);
  approx(p.x, 3); approx(p.y, 5);
});

test('B9 vertical lock', () => {
  const p = new VLockedPoint(3, 0);
  p.moveTo(10, 7);
  approx(p.x, 3); approx(p.y, 7);
});

test('B9 grid snap', () => {
  const p = new GridSnappedPoint(0, 0, 2);
  p.moveTo(3.1, 5.7);
  approx(p.x, 4); approx(p.y, 6);
});

test('B9 angle snap', () => {
  const origin = new GPoint(0, 0);
  const p = new AngleSnappedPoint(1, 0, origin, Math.PI / 4);
  p.moveTo(1, 0.5);
  const angle = Math.atan2(p.y, p.x);
  approx(angle % (Math.PI / 4), 0, 1e-6);
});

// B10: Measurements
test('B10 length measure', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(3, 4));
  const lm = g.add(new LengthMeasure(a, b));
  g.update();
  approx(lm.value, 5);
  assert(lm.text === '5.00');
});

test('B10 angle measure', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(1, 0)), v = g.add(new GPoint(0, 0)), b = g.add(new GPoint(0, 1));
  const am = g.add(new AngleMeasure(a, v, b));
  g.update();
  approx(am.degrees, 90, 0.1);
});

test('B10 area measure (unit square)', () => {
  const g = new ConstraintGraph();
  const pts = [g.add(new GPoint(0, 0)), g.add(new GPoint(1, 0)), g.add(new GPoint(1, 1)), g.add(new GPoint(0, 1))];
  const am = g.add(new AreaMeasure(pts));
  g.update();
  approx(am.value, 1);
});

test('B10 slope measure', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(2, 4));
  const sm = g.add(new SlopeMeasure(a, b));
  g.update();
  approx(sm.value, 2);
});

test('B10 radius measure', () => {
  const g = new ConstraintGraph();
  const c = g.add(new GCircle()); c.cx = 0; c.cy = 0; c.r = 3.5;
  const rm = g.add(new RadiusMeasure(c));
  g.update();
  approx(rm.value, 3.5);
});

// B11: Construction protocol
test('B11 protocol step/replay', () => {
  const proto = new ConstructionProtocol();
  const p1 = new GPoint(0, 0), p2 = new GPoint(1, 0);
  proto.addStep('Draw points', [p1, p2]);
  proto.addStep('Draw line', [new LineThrough(p1, p2)]);
  proto.reset();
  assert(!proto.isVisible(p1));
  proto.stepForward();
  assert(proto.isVisible(p1));
  assert(!proto.isVisible(p2) === false);
  proto.stepForward();
  assert(proto.progress === 1);
  proto.stepBack();
  assert(proto.currentStep === 0);
});

// B12: Regular polygon
test('B12 regular hexagon vertices', () => {
  const g = new ConstraintGraph();
  const c = g.add(new GPoint(0, 0));
  const hex = g.add(new RegularPolygon(c, 1, 6));
  g.update();
  assert(hex.vertices.length === 6);
  for (const [x, y] of hex.vertices) approx(Math.hypot(x, y), 1, 1e-6);
});

test('B12 n-gon perimeter approaches 2πr', () => {
  const g = new ConstraintGraph();
  const c = g.add(new GPoint(0, 0));
  const ngon = g.add(new RegularPolygon(c, 1, 100));
  g.update();
  approx(ngon.perimeter, 2 * Math.PI, 0.01);
});

test('B12 n-gon area approaches πr²', () => {
  const g = new ConstraintGraph();
  const c = g.add(new GPoint(0, 0));
  const ngon = g.add(new RegularPolygon(c, 1, 100));
  g.update();
  approx(ngon.area, Math.PI, 0.01);
});

// Reactivity: moving a free point cascades
test('reactivity: move vertex → centers update', () => {
  const g = new ConstraintGraph();
  const a = g.add(new GPoint(0, 0)), b = g.add(new GPoint(4, 0)), c = g.add(new GPoint(0, 3));
  const cc = g.add(new Circumcenter(a, b, c));
  g.update();
  approx(cc.x, 2);
  c.set(0, 6);
  g.update();
  approx(cc.x, 2); approx(cc.y, 3);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
