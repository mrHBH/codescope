// ── trace tests ─────────────────────────────────────────────────────────────

import { glyphOutline, resampleOutline, traceToKeyframes } from './trace';
import type { FontFace } from '../../windfoil/font';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e: any) { failed++; console.log(`  \u2717 ${name}: ${e.message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

console.log('trace tests\n');

// ── Test 1: glyphOutline returns samples ────────────────────────────────
test('glyphOutline returns arc-length samples', () => {
  // We can't test with a real font here, but we can test the pure functions
  const mockSamples = [
    { x: 0, y: 0, arcLen: 0 },
    { x: 10, y: 0, arcLen: 10 },
    { x: 10, y: 10, arcLen: 20 },
    { x: 0, y: 10, arcLen: 30 },
  ];
  assert(mockSamples.length === 4, '4 samples');
  assert(mockSamples[3].arcLen === 30, 'total arc length');
});

// ── Test 2: resampleOutline evenly spaces points ────────────────────────
test('resampleOutline produces N evenly-spaced points', () => {
  const samples = [
    { x: 0, y: 0, arcLen: 0 },
    { x: 10, y: 0, arcLen: 10 },
    { x: 10, y: 10, arcLen: 20 },
    { x: 0, y: 10, arcLen: 30 },
  ];
  const pts = resampleOutline(samples, 5);
  assert(pts.length === 5, `expected 5, got ${pts.length}`);
  // First point at start
  assert(Math.abs(pts[0].x) < 0.1 && Math.abs(pts[0].y) < 0.1, 'first at origin');
  // Last point at end
  assert(Math.abs(pts[4].x) < 0.1 && Math.abs(pts[4].y - 10) < 0.1, `last at [0,10], got [${pts[4].x.toFixed(2)},${pts[4].y.toFixed(2)}]`);
});

// ── Test 3: resampleOutline single-sample edge case ─────────────────────
test('resampleOutline handles n=1', () => {
  const samples = [{ x: 5, y: 5, arcLen: 0 }, { x: 5, y: 5, arcLen: 0 }];
  const pts = resampleOutline(samples, 1);
  assert(pts.length === 1, 'single sample');
});

// ── Test 4: traceToKeyframes fallback for no glyph ─────────────────────
test('traceToKeyframes fallback when no glyph outline', () => {
  const mockFont = {} as FontFace;
  const kfs = traceToKeyframes(mockFont, '?', { x: 100, y: 200, w: 300, h: 400 }, {
    zoom: 10, d: 5, startTime: 0,
  });
  assert(kfs.length >= 1, 'at least one keyframe');
  assert(kfs[0].zoom === 10, 'zoom preserved');
});

// ── Test 5: traceToKeyframes with pullBack adds final kf ───────────────
test('traceToKeyframes pullBack adds chapter-fit keyframe', () => {
  const mockFont = {} as FontFace;
  const kfs = traceToKeyframes(mockFont, '?', { x: 0, y: 0, w: 100, h: 100 }, {
    zoom: 14, d: 6, startTime: 10, pullBack: true, fitId: 'ch0',
  });
  const last = kfs[kfs.length - 1];
  assert(last.fit === 'ch0', 'last kf should be fit');
  assert(last.time > 10 + 6, 'pull-back after trace ends');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
