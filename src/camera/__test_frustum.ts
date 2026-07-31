// ── frustum culling tests (pure, headless) ──────────────────────────────────
// Run with: bun src/camera/__test_frustum.ts
//
// Locks the 3D ground-rect culling contract: the side-plane tests are exact
// signed-distance tests (never false-cull), and "any corner behind the near
// plane" is NEVER culled — the near plane clips the ground when the camera is
// low/close, so a rect the camera LOOKS AT can have all corners behind while
// filling the screen (the "things disappear even when in view" fix).

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

// VP that puts every point behind the near plane (w = -1).
const behind = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1];

test('all-corners-behind is NEVER culled (the visible-but-vanishing fix)', () => {
  const r: [number, number, number, number] = [0, 0, 10, 10];
  // The near plane clips the ground when the camera is low/close, so a rect the
  // camera looks at can have every corner behind it while filling the screen.
  // The old camera-inside-rect guard culled those → boards vanished in view.
  assert(rect3DVisible(behind, ...r, { x: 5, y: 5 }) === true, 'camera inside → visible');
  assert(rect3DVisible(behind, ...r, { x: 0, y: -20 }) === true,
    'camera outside + all corners behind → STILL DRAWN (was a false cull)');
  assert(rect3DVisible(behind, ...r) === true, 'no camera position → draw');
  assert(rect3DVisible(behind, ...r, { x: 0, y: 0 }) === true, 'camera on the boundary → visible');
});

test('mixed front/behind corners still obey the exact plane tests', () => {
  const vp = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert(rect3DVisible(vp, -4, 0, -1.5, 1, { x: -10, y: 0 }) === false,
    'behind-ish corners left of the viewport → culled');
});

test('MIXED rect (some corners behind) is NEVER side-culled — the aggressive fix', () => {
  const vp = [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert(rect3DVisible(vp, -1, -0.5, 3, 0.5, { x: 0, y: 0 }) === true,
    'any corner behind + some in front → never culled (would false-cull)');
  assert(rect3DVisible(vp, -1, -0.5, 3, 0.5) === true,
    '…and stays visible without a camera position');
  assert(rect3DVisible([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], -4, 0, -1.5, 1) === false,
    'all-front fully-left rect → still culled exactly');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
