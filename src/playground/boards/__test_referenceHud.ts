// ── Reference HUD board tests (headless: construction + pointer routing) ─────
// Run with: bun src/playground/boards/__test_referenceHud.ts

import { ReferenceHudBoard } from './referenceHud';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

console.log('Reference HUD board tests\n');

// Board laid out at the origin: pad 22, toolbar y 100, buttons 36px @ 50px pitch.
// settings = button index 2 → x[122,158], y[100,136]; panel opens at (22,154).
const RECT = { x: 0, y: 0, w: 976, h: 420 };
const mk = () => new ReferenceHudBoard(RECT, () => {});

test('constructs against the stage rect', () => {
  const b = mk();
  assert(b.x0 === 0 && b.y0 === 0 && b.width === 976 && b.height === 420);
  assert(b.dragging === false);
});

test('updateHover: true over a toolbar button, false far away', () => {
  const b = mk();
  assert(b.updateHover(140, 118, 1) === true, 'over the settings button');
  assert(b.updateHover(5000, 5000, 1) === false, 'far away');
});

test('tryBeginDrag rejects presses outside the HUD (camera-pan territory)', () => {
  const b = mk();
  assert(b.tryBeginDrag(5000, 5000, 1) === false);
  assert(b.dragging === false);
});

test('settings click opens the panel (proven by a subsequent slider grab)', () => {
  const b = mk();
  // Before opening, a press on the (closed) panel's slider row is not consumed.
  assert(b.tryBeginDrag(100, 277, 1) === false, 'panel closed → slider press ignored');
  // Click the settings toolbar button → opens the panel.
  assert(b.tryBeginDrag(140, 118, 1) === true, 'settings button consumed');
  // Now the same slider row press is consumed and starts a drag.
  assert(b.tryBeginDrag(100, 277, 1) === true, 'panel open → slider grab consumed');
  assert(b.dragging === true, 'slider drag in flight');
  b.dragTo(246, 277);
  b.endDrag();
  assert(b.dragging === false, 'drag released');
});

test('a click away from the open panel closes it without consuming', () => {
  const b = mk();
  b.tryBeginDrag(140, 118, 1); // open panel
  // Press on empty board space (outside panel + toolbar): closes, returns false.
  assert(b.tryBeginDrag(700, 380, 1) === false);
  // Panel is now closed: the slider row press is ignored again.
  assert(b.tryBeginDrag(100, 277, 1) === false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
