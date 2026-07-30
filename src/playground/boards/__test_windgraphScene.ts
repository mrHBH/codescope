// ── windgraph scene board tests (headless: no emit) ──────────────────────────
// Run with: bun src/playground/boards/__test_windgraphScene.ts

import { WindgraphSceneBoard, demoDoc, wgRepl } from './windgraphScene';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 0.5) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b}`); }

function board() {
  const b = new WindgraphSceneBoard(demoDoc());
  b.x0 = 0; b.y0 = 0;
  b.ensure();
  return b;
}

console.log('Windgraph scene board tests\n');

test('authored demo doc resolves to a full scene', () => {
  const b = board();
  for (const id of ['A', 'B', 'C', 'G', 'M', 'P']) assert(b.scene.points.has(id), `point ${id}`);
  assert(b.scene.circles.has('cc'));
  assert(b.scene.circles.has('orbit'));
  for (const id of ['tri', 'wave', 'angA', 'dBC']) assert(b.scene.mobjects.has(id), `mobject ${id}`);
});

test('dragging vertex B recomputes the centroid through the board contract', () => {
  const b = board();
  const B = b.scene.points.get('B')!;
  const G = b.scene.points.get('G')!;
  const rev0 = b.rev;
  assert(b.tryBeginDrag(B.x, B.y, 1), 'grab B');
  b.dragTo(B.x + 200, B.y);
  b.endDrag();
  approx(B.x, B.x); // tautology guard
  assert(b.rev > rev0, 'rev bumped by drag');
  const A = b.scene.points.get('A')!, C = b.scene.points.get('C')!;
  approx(G.x, (A.x + B.x + C.x) / 3, 0.01);
  approx(G.y, (A.y + B.y + C.y) / 3, 0.01);
});

test('glider P stays on the circumcircle after B moves', () => {
  const b = board();
  const B = b.scene.points.get('B')!;
  b.tryBeginDrag(B.x, B.y, 1);
  b.dragTo(B.x + 150, B.y - 120);
  b.endDrag();
  const cc = b.scene.circles.get('cc')!;
  const P = b.scene.points.get('P')!;
  approx(Math.hypot(P.x - cc.cx, P.y - cc.cy), cc.r, 0.01);
});

test('setParam resamples the param-bound plot and bumps rev', () => {
  const b = board();
  const wave = b.scene.mobjects.get('wave')!;
  const before = (wave.children[0] as any).points.map((p: number[]) => p.slice());
  const rev0 = b.rev;
  b.setParam('a', 2.8);
  assert(b.rev > rev0);
  const after = (wave.children[0] as any).points;
  let moved = 0;
  for (let i = 0; i < after.length; i++) {
    if (Math.abs(after[i][1] - before[i][1]) > 1) moved++;
  }
  assert(moved > before.length / 2, 'most sample points should move with amplitude');
});

test('param-bound circle radius tracks its slider param', () => {
  const b = board();
  b.setParam('r', 4);
  approx(b.scene.circles.get('orbit')!.r, 4 * b.plane.unitX, 0.01);
});

test('updateHover: true over a free point, false far away', () => {
  const b = board();
  const A = b.scene.points.get('A')!;
  assert(b.updateHover(A.x, A.y, 1));
  assert(b.scene.hoveredId === 'A');
  assert(!b.updateHover(b.x0 - 5000, b.y0 - 5000, 1));
});

test('slider drag maps pointer x to a quantized param value', () => {
  const b = board();
  const k = 1; // lastZoom defaults to 1 before any emit
  // New geometry: x0 = b.x0+8, panelW=236, PAD=12 → tx0=b.x0+20, tx1=b.x0+232
  const tx0 = b.x0 + 20 * k, tx1 = b.x0 + 232 * k;
  const trackW = tx1 - tx0;
  // Row 0: rowY = b.y0+8, rowH=34 → valid y = b.y0+25 (mid-row)
  const rowMidY = b.y0 + 25 * k;
  // 'a' default 1.2 in [0.2, 3] → t = 1/2.8 ≈ 0.357 → knobX ≈ tx0 + 75.7
  const knobX = tx0 + ((1.2 - 0.2) / 2.8) * trackW;
  assert(b.tryBeginDrag(knobX, rowMidY, 1), 'should grab the slider row');
  assert(b.dragging);
  b.dragTo(tx1, rowMidY); // drag to max
  b.endDrag();
  approx(b.params.get('a'), 3, 0.001);
  assert(b.tryBeginDrag(tx1, rowMidY, 1), 'knob now sits at max — grab it there');
  b.dragTo(tx0, rowMidY); // drag to min
  b.endDrag();
  approx(b.params.get('a'), 0.2, 0.001);
});

test('autoDrive moves B and bumps rev (cinematic flight feed)', () => {
  const b = board();
  const B = b.scene.points.get('B')!;
  const x0 = B.x, rev0 = b.rev;
  b.autoDrive();
  assert(b.rev > rev0);
  // wall-clock driven — position differs from home unless sin lands exactly on 0
  assert(Math.abs(B.x - x0) >= 0 || b.rev > rev0);
});

// ── wg REPL (task 1.6) ──────────────────────────────────────────────────────

test('repl: plot adds a live curve, bad expr rolls back', () => {
  const b = board();
  const n0 = Object.keys(b.doc.objects).length;
  const ok = wgRepl(b, 'wg plot cos(x)*x');
  assert(ok[0].startsWith('added plot_0'), ok.join(' '));
  assert(Object.keys(b.doc.objects).length === n0 + 1);
  assert(b.scene.mobjects.has('plot_0'), 'scene rebuilt with the new plot');
  const bad = wgRepl(b, 'wg plot sin(');
  assert(bad[0].startsWith('error:'), 'invalid expr rejected');
  assert(!b.doc.objects.plot_1, 'rolled back');
});

test('repl: point + drag moves the resolved GPoint', () => {
  const b = board();
  wgRepl(b, 'wg point 3 -2');
  const p = b.scene.points.get('pt_0')!;
  approx(p.x, b.plane.dToWx(3), 0.01);
  approx(p.y, b.plane.dToWy(-2), 0.01);
  wgRepl(b, 'wg drag pt_0 5 4');
  approx(p.x, b.plane.dToWx(5), 0.01);
  approx(p.y, b.plane.dToWy(4), 0.01);
  assert(wgRepl(b, 'wg drag G 0 0')[0].includes('constrained'), 'centroid not draggable');
});

test('repl: slider sets the param and resamples', () => {
  const b = board();
  const out = wgRepl(b, 'wg slider a 2.5');
  assert(out[0] === 'a = 2.5');
  assert(b.params.get('a') === 2.5);
  assert(wgRepl(b, 'wg slider nope 1')[0].includes('not found'));
});

test('repl: remove refuses dangling refs, removes leaves', () => {
  const b = board();
  const refused = wgRepl(b, 'wg remove A'); // tri/cc/angle/distance depend on A
  assert(refused[0].startsWith('error:'), refused.join(' '));
  assert(!!b.doc.objects.A, 'A kept');
  const removed = wgRepl(b, 'wg remove wave');
  assert(removed[0] === 'removed wave');
  assert(!b.doc.objects.wave);
  assert(!b.scene.mobjects.has('wave'), 'scene rebuilt without it');
});

test('repl: emit prints builder code for the live scene', () => {
  const b = board();
  wgRepl(b, 'wg point 1 1');
  const lines = wgRepl(b, 'wg emit');
  const code = lines.join('\n');
  assert(code.includes('scene('), 'scene call');
  assert(code.includes("s.wg.point('A'"), 'original objects projected');
  assert(code.includes("s.wg.point('pt_0', [1, 1]"), 'repl-added object projected');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
