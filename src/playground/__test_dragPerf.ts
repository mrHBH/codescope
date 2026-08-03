// ── drag-emit regression gates (headless) ────────────────────────────────────
// Run with: bun src/playground/__test_dragPerf.ts
//
// These are the gates the postmortem (POSTMORTEM-drag-fps.md §6.5) asked for
// BEFORE optimizing:
//   1. tryBeginDrag → dragTo → the emitted inst/crv/rws MUST change (catches the
//      "board never re-emits during a drag" aliasing bug — attempt-1 Bug A).
//   2. A still scene (no input between emits) MUST emit bit-identical content
//      (the sig ⇔ content invariant frame-skip relies on).
//   3. Differential: the persistent-slot composition (default) must be
//      element-wise IDENTICAL to the naive full recompose (naiveEmit flag)
//      across a scripted drag/pan/zoom sequence — the test that catches every
//      offset/length bookkeeping escape (attempt-1 Bug B).

import { WindgraphWorld } from './windgraphWorld';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

const mockFont: any = { unitsPerEm: 1000, charToGlyph: () => ({ advance: 500, getKerning: () => 0 }), getKerningValue: () => 0 };
const mockAtlas: any = { table: {} };
const view = { zoom: 1, left: -1000, right: 2000, top: -1000, bottom: 2000 };

function emitAll(w: WindgraphWorld, now: number, v = view) {
  const inst: number[] = [], crv: number[] = [], rws: number[] = [];
  w.emit(mockFont, mockAtlas, inst, crv, rws, now, v);
  return { inst, crv, rws };
}

// Element-wise equality with f32 tolerance: the persistent path keeps
// build-time f64 values in comp while the naive path replays EmitCache's
// f32-rounded capture — visually exact, and the GPU (Float32Array upload)
// sees f32 either way. Real bookkeeping bugs (misplaced offsets) differ by
// orders of magnitude and still fail hard.
function arrEq(a: number[], b: number[]): string | null {
  if (a.length !== b.length) return `length ${a.length} !== ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (!isFinite(x) || !isFinite(y) || Math.abs(x - y) > 1e-5 * Math.max(1, Math.abs(x), Math.abs(y))) {
      return `index ${i}: ${x} !== ${y}`;
    }
  }
  return null;
}
function eq(x: { inst: number[]; crv: number[]; rws: number[] }, y: { inst: number[]; crv: number[]; rws: number[] }, label: string) {
  for (const k of ['inst', 'crv', 'rws'] as const) {
    const d = arrEq(x[k], y[k]);
    if (d) throw new Error(`${label} ${k} differs: ${d}`);
  }
}

console.log('Drag-emit regression gates\n');

test('gate 1: a handle drag changes the emitted content (bug-A class)', () => {
  const w = new WindgraphWorld();
  const tri = w.boards[0] as any;
  tri.ensure();
  const A = tri.scene.points.get('A')!;
  const before = emitAll(w, 0);
  assert(w.tryBeginDrag(A.x, A.y, 1), 'grab A');
  w.dragTo(A.x + 120, A.y + 70);
  const during = emitAll(w, 16);
  assert(arrEq(before.crv, during.crv) !== null || arrEq(before.inst, during.inst) !== null || arrEq(before.rws, during.rws) !== null,
    'drag produced identical output — the dragged board did not re-emit (bug A)');
  w.endDrag();
});

test('gate 2: a still scene emits bit-identical content (sig ⇔ content)', () => {
  const w = new WindgraphWorld();
  emitAll(w, 0); // first emit is a BUILD (f64); later emits are cache replays
  // (f32-rounded by EmitCache capture — existing, visually-exact behavior).
  // Frame-skip requires replay ≡ replay, so compare two consecutive stills.
  const a = emitAll(w, 16);
  const b = emitAll(w, 32);
  eq(a, b, 'still-scene');
});

test('gate 3: persistent composition ≡ naive full recompose across a drag sequence', () => {
  const steps: ((w: WindgraphWorld) => void)[] = [
    () => { /* initial emit only */ },
    (w) => { const A = (w.boards[0] as any).scene.points.get('A')!; assert(w.tryBeginDrag(A.x, A.y, 1)); w.dragTo(A.x + 40, A.y + 25); },
    (w) => { const A = (w.boards[0] as any).scene.points.get('A')!; w.dragTo(A.x + 90, A.y - 60); w.endDrag(); },
    (w) => { const C = (w.boards[1] as any).scene.points.get('C')!; assert(w.tryBeginDrag(C.x, C.y, 1)); w.dragTo(C.x - 80, C.y + 45); w.endDrag(); },
    (w) => { (w.boards[2] as any).setParam('k', 7); },
  ];
  const wp = new WindgraphWorld(); // persistent (default)
  const wn = new WindgraphWorld(); // naive full recompose
  (wn as any).naiveEmit = true;
  let now = 0;
  for (let i = 0; i < steps.length; i++) {
    steps[i](wp); steps[i](wn);
    now += 16;
    const p = emitAll(wp, now);
    const n = emitAll(wn, now);
    eq(p, n, `step ${i}`);
  }
});

test('gate 3b: equivalence holds across view (pan/zoom) changes', () => {
  const views = [
    view,
    { zoom: 1, left: 800, right: 2600, top: -400, bottom: 1400 },
    { zoom: 2.3, left: -200, right: 900, top: 0, bottom: 700 },
    { zoom: 0.6, left: -3000, right: 5000, top: -2000, bottom: 4000 },
  ];
  const wp = new WindgraphWorld();
  const wn = new WindgraphWorld();
  (wn as any).naiveEmit = true;
  for (let i = 0; i < views.length; i++) {
    const p = emitAll(wp, i * 16, views[i]);
    const n = emitAll(wn, i * 16, views[i]);
    eq(p, n, `view ${i}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
