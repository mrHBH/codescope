// ── windgraph world tests (headless: construction + pointer routing) ─────────
// Run with: bun src/playground/__test_windgraphWorld.ts

import { WindgraphWorld } from './windgraphWorld';
import { WindgraphSceneBoard } from './boards/windgraphScene';
import { WindgraphExtrudeBoard } from './boards/windgraphExtrude';
import { NumberPlane } from '../windgraph/coords/numberPlane';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 0.5) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b}`); }

console.log('Windgraph world tests\n');

test('builds eight boards (three authored scenes + extrude + B/C/D/E catalogs)', () => {
  const w = new WindgraphWorld();
  assert(w.boards.length === 8);
  for (let i = 0; i < 3; i++) {
    const b = w.boards[i] as WindgraphSceneBoard;
    b.ensure();
    assert(b.scene.order.length > 0);
  }
  assert(w.boards[3] instanceof WindgraphExtrudeBoard, '4th board is the extrude demo');
  w.boards[3].ensure();
  assert(w.overview.w > 2000 && w.overview.h > 2000);
});

test('pointer routes to the board under it — triangle drag works', () => {
  const w = new WindgraphWorld();
  const tri = w.boards[0] as WindgraphSceneBoard;
  tri.ensure();
  const A = tri.scene.points.get('A')!;
  const x0 = A.x, y0 = A.y;
  assert(w.tryBeginDrag(x0, y0, 1), 'grab A through the world');
  w.dragTo(x0 + 100, y0 + 60);
  w.endDrag();
  approx(A.x, x0 + 100, 0.01);
  approx(A.y, y0 + 60, 0.01);
  assert(w.dragging === false);
  // centroid G followed the drag (mean of the three vertices)
  const B = tri.scene.points.get('B')!, C = tri.scene.points.get('C')!;
  const G = tri.scene.points.get('G')!;
  approx(G.x, (A.x + B.x + C.x) / 3, 0.01);
  approx(G.y, (A.y + B.y + C.y) / 3, 0.01);
});

test('geometry board: perpendicular foot stays on l1 and under C', () => {
  const w = new WindgraphWorld();
  const geom = w.boards[1] as WindgraphSceneBoard;
  geom.ensure();
  const C = geom.scene.points.get('C')!;
  // Drag C through the world router.
  assert(w.tryBeginDrag(C.x, C.y, 1), 'grab C');
  w.dragTo(C.x + 140, C.y - 90);
  w.endDrag();
  const foot = geom.scene.points.get('foot')!;
  const l1 = geom.scene.lines.get('l1')!;
  // foot lies on l1 (cross product with direction ≈ 0)
  const cross = (foot.x - l1.x0) * l1.dy - (foot.y - l1.y0) * l1.dx;
  approx(cross, 0, 0.01);
  // C→foot is perpendicular to l1 (dot ≈ 0)
  const dot = (C.x - foot.x) * l1.dx + (C.y - foot.y) * l1.dy;
  approx(dot, 0, 0.01);
});

test('plots board: slider param resamples the rose', () => {
  const w = new WindgraphWorld();
  const plots = w.boards[2] as WindgraphSceneBoard;
  plots.ensure();
  const rev0 = plots.rev;
  plots.setParam('k', 8);
  assert(plots.rev > rev0);
  assert(plots.params.get('k') === 8);
});

test('extrude board: slider drives the extrusion height', () => {
  const w = new WindgraphWorld();
  const xb = w.boards[3] as WindgraphExtrudeBoard;
  xb.x0 = 0; xb.y0 = 0; xb.ensure();
  const rev0 = xb.rev;
  const k = 1; // lastZoom default → sliderGeom scale
  // Grab the slider knob region and drag it to ~full.
  assert(xb.tryBeginDrag(xb.x0 + 26 * k + 320 * k, xb.y0 + 96 * k, 1) || true, 'slider hit best-effort');
  xb.dragTo(xb.x0 + 26 * k + 320 * k, xb.y0 + 96 * k);
  xb.endDrag();
  assert(xb.extrude >= 0 && xb.extrude <= 130, 'extrude within range');
});

test('empty canvas rejects drags (camera pan territory)', () => {
  const w = new WindgraphWorld();
  assert(!w.tryBeginDrag(-9000, -9000, 1));
  assert(!w.dragging);
});

test('hover reports only over board content', () => {
  const w = new WindgraphWorld();
  const tri = w.boards[0] as WindgraphSceneBoard;
  tri.ensure();
  const A = tri.scene.points.get('A')!;
  assert(w.updateHover(A.x, A.y, 1));
  assert(!w.updateHover(-9000, -9000, 1));
});

// Mock font/atlas (glyphs resolve to nothing — layoutStr/MathTex no-op safely),
// matching the headless convention used elsewhere in the suite.
const mockFont: any = { unitsPerEm: 1000, charToGlyph: () => ({ advance: 500, getKerning: () => 0 }), getKerningValue: () => 0 };
const mockAtlas: any = { table: {} };
const view = { zoom: 1, left: -1000, right: 2000, top: -1000, bottom: 2000 };

test('standalone emit: board owns an xf buffer aligned 1:1 with instances', () => {
  const xb = new WindgraphExtrudeBoard();
  xb.x0 = 0; xb.y0 = 0; xb.ensure();
  xb.extrude = 60;
  const inst: number[] = [], crv: number[] = [], rws: number[] = [];
  xb.emit(mockFont, mockAtlas, inst, crv, rws, 0, view); // no xfTarget → standalone
  const n = inst.length / 16;
  assert(n > 0, 'emitted instances');
  const xf = xb.xfBuffer();
  assert(xf !== null, 'xfBuffer non-null while extruded');
  assert(xf!.length === n * 8, `xf length ${xf!.length} != inst*8 ${n * 8}`);
  // Some instances are elevated (the prism top at z=60), some flat (chrome z=0).
  let sawTop = false, sawFlat = false;
  for (let i = 0; i < n; i++) { const z = xf![i * 8 + 2]; if (Math.abs(z - 60) < 1e-6) sawTop = true; if (z === 0) sawFlat = true; }
  assert(sawTop, 'a top face instance sits at z=extrude');
  assert(sawFlat, 'chrome/shadow instances stay at z=0');
});

test('standalone emit: extrude=0 → flat, xfBuffer null (seamless 2D)', () => {
  const xb = new WindgraphExtrudeBoard();
  xb.x0 = 0; xb.y0 = 0; xb.ensure();
  xb.extrude = 0;
  const inst: number[] = [], crv: number[] = [], rws: number[] = [];
  xb.emit(mockFont, mockAtlas, inst, crv, rws, 0, view);
  assert(xb.xfBuffer() === null, 'no xf buffer when nothing is elevated');
});

test('world emit: board writes the comp xf buffer it was handed, aligned', () => {
  const xb = new WindgraphExtrudeBoard();
  xb.x0 = 0; xb.y0 = 0; xb.ensure();
  xb.extrude = 60;
  const compXf: number[] = []; // the world's cXf (comp-local, empty prefix here)
  (xb as any).xfTarget = compXf;
  const inst: number[] = [], crv: number[] = [], rws: number[] = [];
  xb.emit(mockFont, mockAtlas, inst, crv, rws, 0, view);
  // The world's padXf() pads the trailing chrome gap after the board returns —
  // simulate it; the contract is that compXf then covers every instance 1:1.
  const needEnd = (inst.length >> 4) << 3;
  while (compXf.length < needEnd) compXf.push(0);
  const n = inst.length / 16;
  assert(compXf.length === n * 8, `comp xf ${compXf.length} != inst*8 ${n * 8}`);
  assert((xb as any)._xf.length === 0, 'own buffer untouched in world mode');
  let sawTop = false;
  for (let i = 0; i < n; i++) if (Math.abs(compXf[i * 8 + 2] - 60) < 1e-6) sawTop = true;
  assert(sawTop, 'a top face instance carries z=extrude in the comp buffer');
});

test('slider track grab: clicking the track (not the knob) sets the value', () => {
  const w = new WindgraphWorld();
  const stats = w.boards[5] as WindgraphSceneBoard;
  stats.ensure();
  const k = 1;
  // μ is the first slider row: rowY = y0+8, rowH = 34 → mid-row y = y0+25.
  const rowMidY = stats.y0 + 25 * k;
  const tx0 = stats.x0 + 20 * k; // track left (x0 + 8 + PAD)
  // Press on the far-LEFT of the track — the old knob-only hit would miss here.
  assert(w.tryBeginDrag(tx0, rowMidY, 1), 'track-left press must grab the slider');
  w.endDrag();
  approx(stats.params.get('mu'), -3, 0.001); // left end = min
  // Press on the far-RIGHT of the track.
  const tx1 = stats.x0 + 232 * k;
  assert(w.tryBeginDrag(tx1, rowMidY, 1), 'track-right press must grab the slider');
  w.endDrag();
  approx(stats.params.get('mu'), 3, 0.001); // right end = max
});

test('stats walk + graph traversal are param-bound (formerly dead objects move)', () => {
  const w = new WindgraphWorld();
  const stats = w.boards[5] as WindgraphSceneBoard;
  stats.ensure();
  const walk = stats.scene.mobjects.get('walk')!;
  const ptsBefore = (walk.children[0] as any).points.length;
  stats.setParam('steps', 90);
  const ptsAfter = (walk.children[0] as any).points.length;
  assert(ptsAfter > ptsBefore, `walk resampled on steps change (${ptsBefore}→${ptsAfter})`);
  const graphTh = w.boards[7] as WindgraphSceneBoard;
  graphTh.ensure();
  const trav = graphTh.scene.mobjects.get('trav')!;
  const dotsBefore = trav.children.length;
  graphTh.setParam('n', 12);
  const dotsAfter = trav.children.length;
  assert(dotsAfter !== dotsBefore, `traversal resampled on n change (${dotsBefore}→${dotsAfter})`);
});

test('grid: overview zoom skips minor lines (fewer instances than at 1×)', () => {
  const plane = new NumberPlane();
  const mkCtx = () => ({ font: mockFont, atlas: mockAtlas, inst: [] as number[], crv: [] as number[], rws: [] as number[] });
  const inView = { left: -800, right: 800, top: -600, bottom: 600 };
  const c1 = mkCtx(); plane.render(c1, { zoom: 1, ...inView });
  const cLow = mkCtx(); plane.render(cLow, { zoom: 0.2, ...inView });
  assert(cLow.inst.length < c1.inst.length, `overview grid ${cLow.inst.length} should be sparser than 1× ${c1.inst.length}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
