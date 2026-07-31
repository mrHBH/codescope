// ── 3D space curves tests (F3D-2, D26 mesh-tube pivot) ───────────────────────
// Run with: bun src/windgraph/space3d/__test_curve3d.ts
//
// Verifies the building blocks of the mesh-tube pipeline: the adaptive sampler
// respects tolerance + budget, the frame helpers match the shader, and pushTube
// sweeps a watertight smooth tube (Gouraud radial shading, end caps) whose every
// vertex sits at radius distance from the centerline.

import { sampleCurve3D, pushTube, quatFromFrame, quatApply, frameOf, type Vec3 } from './curve3d';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function near(a: number, b: number, eps: number, msg: string) { if (Math.abs(a - b) > eps) throw new Error(`${msg}: ${a} !≈ ${b}`); }

console.log('curve3d tests\n');

test('quatFromFrame: local axes map exactly to the frame (shader formula)', () => {
  const T: Vec3 = [0.3, 0.5, 0.8]; const tl = Math.hypot(...T);
  const Tu: Vec3 = [T[0] / tl, T[1] / tl, T[2] / tl];
  const { B, N } = frameOf(Tu);
  const q = quatFromFrame(Tu, B, N);
  const e1 = quatApply(q, [1, 0, 0]), e2 = quatApply(q, [0, 1, 0]), e3 = quatApply(q, [0, 0, 1]);
  const close = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert(close(e1, Tu) < 1e-6, `local x → T (${e1.join(',')})`);
  assert(close(e2, B) < 1e-6, `local y → B (${e2.join(',')})`);
  assert(close(e3, N) < 1e-6, `local z → N (${e3.join(',')})`);
  near(Math.hypot(...q), 1, 1e-9, 'unit quaternion');
});

test('sampleCurve3D: a straight line needs no subdivision (2 points)', () => {
  const pts = sampleCurve3D((t) => [t * 100, 0, 0], 0, 1, { tolWorld: 5, tolPx: 1 });
  assert(pts.length === 2, `expected 2 points, got ${pts.length}`);
});

test('sampleCurve3D: circle chords stay within the world tolerance', () => {
  const R = 100, tol = 5;
  const pts = sampleCurve3D((t) => [R * Math.cos(t), R * Math.sin(t), 0], 0, 2 * Math.PI, { tolWorld: tol });
  assert(pts.length >= 8, `circle undersampled: ${pts.length} pts`);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
    const dev = Math.hypot(mid[0], mid[1]) - R;
    assert(Math.abs(dev) <= tol + 1e-6, `segment ${i} deviates ${dev} > ${tol}`);
  }
});

test('sampleCurve3D: tighter tolerance yields more segments (screen-space path)', () => {
  const Cw = 1000, Ch = 1000;
  const vp = new Float32Array(16);
  vp[0] = 2 / 200; vp[5] = 2 / 200; vp[10] = 1; vp[15] = 1; // world ±100 → NDC ±1
  const R = 100;
  const C = (t: number): Vec3 => [R * Math.cos(t), R * Math.sin(t), 0];
  const fine = sampleCurve3D(C, 0, 2 * Math.PI, { tolPx: 0.5, Cw, Ch, viewProj: vp, scale: 5, maxSegPx: 512 });
  const coarse = sampleCurve3D(C, 0, 2 * Math.PI, { tolPx: 8, Cw, Ch, viewProj: vp, scale: 5, maxSegPx: 512 });
  assert(fine.length > coarse.length, `fine (${fine.length}) should beat coarse (${coarse.length})`);
});

test('sampleCurve3D: budget caps runaway subdivision', () => {
  const maxSegs = 300;
  const pts = sampleCurve3D((t) => [Math.cos(t * 50), Math.sin(t * 50), 0], 0, 100, { tolWorld: 0.0001, maxSegs });
  assert(pts.length <= maxSegs + 2, `budget exceeded: ${pts.length}`);
});

test('pushTube: open polyline → sides + both end caps, every vertex on the radius', () => {
  const m: number[] = [];
  pushTube(m, [[0, 0, 0], [100, 0, 0], [200, 0, 0]], { radius: 10, color: [1, 0, 0, 1], segs: 8 });
  const n = m.length / 7;
  // sides: 2 segments × 8 radial × 2 tris × 3 = 96; caps: 2 × 8 × 3 = 48; total 144
  assert(n === 144, `expected 144 verts, got ${n}`);
  for (let v = 0; v < n; v++) {
    const x = m[v * 7], y = m[v * 7 + 1], z = m[v * 7 + 2];
    // centerline is (x, 0, 0) → radial distance from the x-axis must be radius
    const r = Math.hypot(y, z);
    // cap centers sit ON the centerline (r=0) and are excluded by the box test below
    const sh = m[v * 7 + 3];
    assert(sh >= 0.45 - 1e-6 && sh <= 1 + 1e-6, `vertex ${v} shade in [0.45,1], got ${sh}`);
    if (Math.abs(r) > 1e-6) near(r, 10, 1e-6, `vertex ${v} radius`);
  }
});

test('pushTube: every side vertex stays within radius of the centerline (curved helix)', () => {
  const pts: Vec3[] = [];
  for (let i = 0; i <= 60; i++) { const t = (i / 60) * 4 * Math.PI; pts.push([Math.cos(t) * 100, Math.sin(t) * 100, t * 8]); }
  const m: number[] = [];
  pushTube(m, pts, { radius: 6, color: [1, 1, 1, 1], segs: 12 });
  const distToPts = (p: Vec3) => {
    let best = Infinity;
    for (const c of pts) best = Math.min(best, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
    return best;
  };
  for (let v = 0; v < m.length / 7; v++) {
    const p: Vec3 = [m[v * 7], m[v * 7 + 1], m[v * 7 + 2]];
    const d = distToPts(p);
    if (d < 6 / 2) continue; // cap-center fan vertices sit ON the centerline
    near(d, 6, 1e-5, `helix tube vertex ${v} distance from centerline point`);
  }
});

test('pushTube: Gouraud radial shading varies across the ring (not flat)', () => {
  const m: number[] = [];
  pushTube(m, [[0, 0, 0], [100, 0, 0]], { radius: 10, color: [1, 1, 1, 1], segs: 12 });
  const shades = new Set<number>();
  for (let v = 0; v < m.length / 7; v++) shades.add(Math.round(m[v * 7 + 3] * 1000));
  assert(shades.size >= 3, `expected varied radial shading, got ${shades.size} distinct`);
});

test('pushTube: closed polyline drops both end caps', () => {
  const m: number[] = [];
  pushTube(m, [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 0, 0]], { radius: 10, color: [1, 0, 0, 1], segs: 8 });
  const n = m.length / 7;
  assert(n === 3 * 8 * 2 * 3, `closed loop → sides only (${3 * 8 * 2 * 3}), got ${n}`);
});

test('pushTube: degenerate (zero radius / single point) emits nothing', () => {
  const m: number[] = [];
  pushTube(m, [[0, 0, 0], [10, 0, 0]], { radius: 0, color: [1, 0, 0, 1] });
  pushTube(m, [[0, 0, 0]], { radius: 5, color: [1, 0, 0, 1] });
  assert(m.length === 0, 'no verts for degenerate tubes');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
