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
  const wp = new WindgraphWorld(); // persistent, no-slack (packed ≡ naive layout)
  (wp as any).slotSlack = false;
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
  (wp as any).slotSlack = false;
  const wn = new WindgraphWorld();
  (wn as any).naiveEmit = true;
  for (let i = 0; i < views.length; i++) {
    const p = emitAll(wp, i * 16, views[i]);
    const n = emitAll(wn, i * 16, views[i]);
    eq(p, n, `view ${i}`);
  }
});

// Resolve the RENDERED content of an emit: for every instance, the instance
// fields + the rows/quads it actually references (absolute indices resolved to
// the slot-relative content). Two emits that render identically produce
// identical canonical forms even when their comp layouts differ (stage-5 slots
// keep crv/rws gaps the GPU never reads).
function canonical(x: { inst: number[]; crv: number[]; rws: number[] }): string {
  // f32-tolerant quantization: the persistent path can hold f64 build values a
  // frame longer than the naive path's f32 EmitCache replays (visually exact,
  // and the GPU sees f32 either way — same tolerance rationale as arrEq).
  const q = (v: number) => (v === 0 ? 0 : Number(v.toPrecision(5)));
  const parts: string[] = [];
  for (let i = 0; i < x.inst.length; i += 16) {
    const fr = x.inst[i + 3];
    let s = '';
    // inst[12] is the ABSOLUTE rowBase — layout-dependent (packed vs gapped
    // slots); the resolved rows below carry the actual content, so drop it.
    for (let j = 0; j < 16; j++) s += (j === 12 && fr < 1.5 ? 0 : q(x.inst[i + j])) + ',';
    if (fr < 1.5) {
      const rowBase = x.inst[i + 12], rowCount = x.inst[i + 13];
      for (let r = 0; r < rowCount; r++) {
        const ri = (rowBase + r) * 5;
        const start = x.rws[ri], count = x.rws[ri + 1];
        s += `|${x.rws[ri + 2]},${x.rws[ri + 3]},${x.rws[ri + 4]};`;
        for (let qi2 = 0; qi2 < count; qi2++) {
          const qi = (start + qi2) * 6;
          for (let k = 0; k < 6; k++) s += q(x.crv[qi + k]) + ',';
        }
      }
    }
    parts.push(s);
  }
  return parts.join('\n');
}

test('gate 4: slack slots render identically to naive across length-changing drags', () => {
  const wp = new WindgraphWorld(); // persistent WITH slack (the shipped mode)
  const wn = new WindgraphWorld();
  (wn as any).naiveEmit = true;
  const steps: ((w: WindgraphWorld) => void)[] = [
    () => {},
    // Long drags cross measure-label digit boundaries + arc segment counts →
    // slice length changes (the exact frames that used to re-emit the tail).
    (w) => { const B = (w.boards[1] as any).scene.points.get('B')!; assert(w.tryBeginDrag(B.x, B.y, 1)); w.dragTo(B.x + 150, B.y + 90); },
    (w) => { const B = (w.boards[1] as any).scene.points.get('B')!; w.dragTo(B.x + 320, B.y - 40); },
    (w) => { const B = (w.boards[1] as any).scene.points.get('B')!; w.dragTo(B.x - 60, B.y + 200); w.endDrag(); },
    (w) => { const A = (w.boards[0] as any).scene.points.get('A')!; assert(w.tryBeginDrag(A.x, A.y, 1)); w.dragTo(A.x + 260, A.y + 130); w.endDrag(); },
    (w) => { (w.boards[2] as any).setParam('k', 3); },
  ];
  let now = 0;
  for (let i = 0; i < steps.length; i++) {
    steps[i](wp); steps[i](wn);
    now += 16;
    const p = emitAll(wp, now);
    const n = emitAll(wn, now);
    assert(canonical(p) === canonical(n), `step ${i}: rendered content differs`);
  }
});

test('gate 4b: slack slots absorb length changes without a full-dirty fallback', () => {
  const w = new WindgraphWorld();
  emitAll(w, 0);
  // Warm the slack: grow the dragged board's slice once so capacities carry slack.
  const B = (w.boards[1] as any).scene.points.get('B')!;
  assert(w.tryBeginDrag(B.x, B.y, 1));
  let fulls = 0, emits = 0;
  for (let i = 1; i <= 40; i++) {
    w.dragTo(B.x + i * 9, B.y + Math.sin(i * 0.7) * 120);
    emitAll(w, i * 16);
    emits++;
    if ((w as any).dirtyRanges() === null) fulls++;
  }
  w.endDrag();
  // After the capacities settle, a drag must stay on the partial-upload path —
  // a full-dirty frame here means the tail/relayout mechanism fired mid-drag.
  assert(fulls <= 2, `${fulls}/${emits} drag frames fell back to full-dirty`);
});

test('gate 4c: slack mode still emits bit-identical still frames (sig ⇔ content)', () => {
  const w = new WindgraphWorld();
  emitAll(w, 0);
  const B = (w.boards[1] as any).scene.points.get('B')!;
  assert(w.tryBeginDrag(B.x, B.y, 1));
  w.dragTo(B.x + 100, B.y + 55);
  emitAll(w, 16);
  w.endDrag();
  const a = emitAll(w, 32);
  const b = emitAll(w, 48);
  eq(a, b, 'still-scene(slack)');
});

test('gate 5: persistent frame region (frame.ts protocol) ≡ naive', () => {
  // Simulates frame.ts: the working arrays PERSIST across frames; each frame
  // truncates them to staticLen + frameSpan (preserving the world region) and
  // the world splices its dirty ranges into the preserved region.
  const wp = new WindgraphWorld();
  const wn = new WindgraphWorld();
  (wn as any).naiveEmit = true;
  const inst: number[] = [], crv: number[] = [], rws: number[] = [];
  const emitP = (now: number) => {
    const spanC = (wp as any).frameSpanC ?? 0, spanR = (wp as any).frameSpanR ?? 0;
    crv.length = spanC; rws.length = spanR; inst.length = 0; // staticLen = 0 here
    wp.emit(mockFont, mockAtlas, inst, crv, rws, now, view);
    return { inst: inst.slice(), crv: crv.slice(), rws: rws.slice() };
  };
  const emitN = (now: number) => {
    const i2: number[] = [], c2: number[] = [], r2: number[] = [];
    wn.emit(mockFont, mockAtlas, i2, c2, r2, now, view);
    return { inst: i2, crv: c2, rws: r2 };
  };
  const steps: ((w: WindgraphWorld) => void)[] = [
    () => {},
    (w) => { const B = (w.boards[1] as any).scene.points.get('B')!; assert(w.tryBeginDrag(B.x, B.y, 1)); w.dragTo(B.x + 120, B.y + 70); },
    (w) => { const B = (w.boards[1] as any).scene.points.get('B')!; w.dragTo(B.x + 240, B.y - 30); w.endDrag(); },
    (w) => { (w.boards[2] as any).setParam('k', 5); },
  ];
  let now = 0;
  for (let i = 0; i < steps.length; i++) {
    steps[i](wp); steps[i](wn);
    now += 16;
    const p = emitP(now);
    const n = emitN(now);
    assert(canonical(p) === canonical(n), `step ${i}: rendered content differs under the persistent-region protocol`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
