// ── windgraph world tests (headless: construction + pointer routing) ─────────
// Run with: bun src/playground/__test_windgraphWorld.ts

import { WindgraphWorld } from './windgraphWorld';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 0.5) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b}`); }

console.log('Windgraph world tests\n');

test('builds three boards with valid authored scenes', () => {
  const w = new WindgraphWorld();
  assert(w.boards.length === 3);
  for (const b of w.boards) {
    b.ensure();
    assert(b.scene.order.length > 0);
  }
  assert(w.overview.w > 2000 && w.overview.h > 2000);
});

test('pointer routes to the board under it — triangle drag works', () => {
  const w = new WindgraphWorld();
  const tri = w.boards[0];
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
  const geom = w.boards[1];
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
  const plots = w.boards[2];
  plots.ensure();
  const rev0 = plots.rev;
  plots.setParam('k', 8);
  assert(plots.rev > rev0);
  assert(plots.params.get('k') === 8);
});

test('empty canvas rejects drags (camera pan territory)', () => {
  const w = new WindgraphWorld();
  assert(!w.tryBeginDrag(-9000, -9000, 1));
  assert(!w.dragging);
});

test('hover reports only over board content', () => {
  const w = new WindgraphWorld();
  const tri = w.boards[0];
  tri.ensure();
  const A = tri.scene.points.get('A')!;
  assert(w.updateHover(A.x, A.y, 1));
  assert(!w.updateHover(-9000, -9000, 1));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
