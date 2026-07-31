// ── frustum culling tests (pure, headless) ──────────────────────────────────
// Run with: bun src/camera/__test_frustum.ts
//
// Locks the 3D ground-rect culling contract: the side-plane tests are exact
// signed-distance tests (never false-cull), and "all 4 corners behind the near
// plane" culls ONLY when the camera's ground position is outside the rect — a
// rect containing the camera fills the screen and must stay (the fix for deep
// zoom making boards/lines vanish "halfway").

import { rect3DVisible } from './frustum';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

console.log('Frustum culling tests\n');

// identity-ish VP: clip.x = x, clip.y = y, w = 1 (viewport = [-1,1]²)
const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

test('same-side plane culls stay exact (left / top)', () => {
  assert(rect3DVisible(id, -5, 0, -2, 1) === false, 'fully left of the viewport → culled');
  assert(rect3DVisible(id, 0.5, -3, 2, -1.5) === false, 'fully above the viewport → culled');
  assert(rect3DVisible(id, 0, 0, 1, 1) === true, 'on-screen rect → visible');
  assert(rect3DVisible(id, -2, -2, 2, 2) === true, 'rect straddling the viewport → visible');
});

// VP that puts every point behind the near plane (w = -1) with no side offset:
// the result must hinge on the camera-inside-rect guard alone.
const behind = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1];

test('all-corners-behind: culled only when the camera is OUTSIDE the rect', () => {
  const r: [number, number, number, number] = [0, 0, 10, 10];
  assert(rect3DVisible(behind, ...r, { x: 5, y: 5 }) === true,
    'camera inside the rect → visible (the deep-zoom vanish fix)');
  assert(rect3DVisible(behind, ...r, { x: 0, y: -20 }) === false,
    'camera outside + all corners behind → genuinely off-screen → culled');
  assert(rect3DVisible(behind, ...r) === true,
    'no camera position → conservative draw (never false-cull)');
  // A rect that contains the camera on its EDGE is still visible.
  assert(rect3DVisible(behind, ...r, { x: 0, y: 0 }) === true,
    'camera on the rect boundary → visible');
});

test('mixed front/behind corners still obey the exact plane tests', () => {
  // cx = x, cy = y, w = 1 (front) for a rect that is wholly behind a side plane.
  const vp = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert(rect3DVisible(vp, -4, 0, -1.5, 1, { x: -10, y: 0 }) === false,
    'behind-ish corners left of the viewport → culled');
});

test('MIXED rect (some corners behind) is NEVER side-culled — the aggressive fix', () => {
  // Camera at origin looking +x: cx = y (lateral), cy = 0, cw = x (depth).
  // A rect straddling the camera: two corners in front (x=3) but OFF the left
  // plane, two corners BEHIND (x=-1) far to the RIGHT. The old side tests
  // counted the behind corners too and hit right === 4 → the board vanished
  // while still covering the screen centre. It is visibly on screen → draw.
  const vp = [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  // front corners (3,±0.5) → NDC x = ±0.5/3 ≈ ±0.17 → on screen; behind
  // corners (-1,±0.5) → cx = ±0.5 > cw = -1 (both "right") + one "left".
  assert(rect3DVisible(vp, -1, -0.5, 3, 0.5, { x: 0, y: 0 }) === true,
    'any corner behind + some in front → never culled (would false-cull)');
  assert(rect3DVisible(vp, -1, -0.5, 3, 0.5) === true,
    '…and stays visible without a camera position');
  // Same geometry but the whole rect far LEFT of the camera axis (all corners
  // in front): the exact plane test still culls it.
  assert(rect3DVisible([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], -4, 0, -1.5, 1) === false,
    'all-front fully-left rect → still culled exactly');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
