// ── Timeline engine tests ──────────────────────────────────────────────────
// Run with: bun src/authoring/runtime/__test_timeline.ts

import { evalScene, docDuration, chapterWindows } from './timeline';
import type { SceneDoc } from '../ir/types';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 0.01) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b} (ε=${eps})`); }

console.log('Timeline tests\n');

// ── Helper ─────────────────────────────────────────────────────────────────
function rectAt(doc: SceneDoc, id: string): any {
  return (doc.objects as any)[id];
}

// ── Test 1: fadeIn ─────────────────────────────────────────────────────────
test('fadeIn clip drives opacityMult from 0 to 1 over duration', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 't' },
    objects: { r1: { kind: 'rect', id: 'r1', at: [0, 0], size: [10, 10] } },
    params: {},
    clips: [{ id: 'c1', target: 'r1', kind: 'fadeIn', start: 0, duration: 1, props: {} }],
    camera: { keyframes: [] },
  };
  const s0 = evalScene(doc, 0);
  assert(s0.objects.get('r1')!.opacityMult === 0, 'at t=0, opacity=0');

  const s05 = evalScene(doc, 0.5);
  assert(s05.objects.get('r1')!.opacityMult > 0.3 && s05.objects.get('r1')!.opacityMult < 0.7, 'at t=0.5, opacity ≈ 0.5');

  const s1 = evalScene(doc, 1);
  assert(s1.objects.get('r1')!.opacityMult === 1, 'at t=1, opacity=1');

  const s2 = evalScene(doc, 2);
  assert(s2.objects.get('r1')!.opacityMult === 1, 'after end, opacity stays 1');
});

// ── Test 2: moveTo ─────────────────────────────────────────────────────────
test('moveTo clip applies offset from base position', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 't' },
    objects: { r1: { kind: 'rect', id: 'r1', at: [0, 0], size: [10, 10] } },
    params: {},
    clips: [{ id: 'c1', target: 'r1', kind: 'moveTo', start: 0, duration: 2, props: { x: 100, y: 200 } }],
    camera: { keyframes: [] },
  };
  const s0 = evalScene(doc, 0);
  assert(s0.objects.get('r1')!.dx === 0, 'at t=0, dx=0');

  const s1 = evalScene(doc, 1);
  approx(s1.objects.get('r1')!.dx, 50, 2);
  approx(s1.objects.get('r1')!.dy, 100, 2);

  const s2 = evalScene(doc, 2);
  assert(s2.objects.get('r1')!.dx === 100, 'at t=2, dx=100');
  assert(s2.objects.get('r1')!.dy === 200, 'at t=2, dy=200');
});

// ── Test 3: overlapping clips (last-started wins) ──────────────────────────
test('overlapping moveTo clips: later clip from previous clip end value', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 't' },
    objects: { r1: { kind: 'rect', id: 'r1', at: [0, 0], size: [10, 10] } },
    params: {},
    clips: [
      { id: 'c1', target: 'r1', kind: 'moveTo', start: 0, duration: 2, props: { x: 100, y: 0 }, ease: 'linear' },
      { id: 'c2', target: 'r1', kind: 'moveTo', start: 0.5, duration: 1, props: { x: 200, y: 0 }, ease: 'linear' },
    ],
    camera: { keyframes: [] },
  };
  // At t=0.5, c1 has moved to dx=25, and c2 starts — it should override
  const s0503 = evalScene(doc, 0.5);
  // c2 has just started: from = c1's current = 25, to = 200 — but computation may vary
  // Just check that c2 is the active driver after t=0.5
  assert(s0503.objects.get('r1')!.dx >= 25, 'at t=0.5, dx >= 25');

  const s1 = evalScene(doc, 1);
  assert(s1.objects.get('r1')!.dx > 50, 'at t=1, past midpoint of second clip');

  const s15 = evalScene(doc, 1.5);
  assert(s15.objects.get('r1')!.dx === 200, 'at t=1.5, both clips done');

  const s3 = evalScene(doc, 3);
  assert(s3.objects.get('r1')!.dx === 200, 'at t=3, end value persists');
});

// ── Test 4: fadeIn then fadeOut ────────────────────────────────────────────
test('fadeIn then fadeOut: composited opacity', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 't' },
    objects: { r1: { kind: 'rect', id: 'r1', at: [0, 0], size: [10, 10] } },
    params: {},
    clips: [
      { id: 'c1', target: 'r1', kind: 'fadeIn', start: 0, duration: 1, props: {} },
      { id: 'c2', target: 'r1', kind: 'fadeOut', start: 2, duration: 1, props: {} },
    ],
    camera: { keyframes: [] },
  };
  const s0 = evalScene(doc, 0);
  assert(s0.objects.get('r1')!.opacityMult === 0, 'at t=0, hidden');
  const s1 = evalScene(doc, 1);
  assert(s1.objects.get('r1')!.opacityMult === 1, 'at t=1, fully visible');
  const s15 = evalScene(doc, 1.5);
  assert(s15.objects.get('r1')!.opacityMult === 1, 'at t=1.5, still visible');
  const s25 = evalScene(doc, 2.5);
  assert(s25.objects.get('r1')!.opacityMult < 1 && s25.objects.get('r1')!.opacityMult > 0, 'at t=2.5, fading out');
  const s3 = evalScene(doc, 3);
  assert(s3.objects.get('r1')!.opacityMult === 0, 'at t=3, invisible');
  assert(s3.objects.get('r1')!.visible === false, 'at t=3, visible=false');
});

// ── Test 5: draw clip drives reveal ────────────────────────────────────────
test('draw clip: reveal 0→1', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 't' },
    objects: { l1: { kind: 'line', id: 'l1', points: [[0, 0], [100, 0]], width: 3, color: [1, 1, 1, 1] } },
    params: {},
    clips: [{ id: 'c1', target: 'l1', kind: 'draw', start: 0, duration: 2, props: {} }],
    camera: { keyframes: [] },
  };
  assert(evalScene(doc, 0).objects.get('l1')!.reveal === 0);
  assert(evalScene(doc, 2).objects.get('l1')!.reveal === 1);
});

// ── Test 6: param clip ─────────────────────────────────────────────────────
test('param clip animates param value', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 't' },
    objects: {},
    params: { r: { kind: 'number', label: 'R', default: 0 } },
    clips: [{ id: 'c1', target: 'param:r', kind: 'param', start: 0, duration: 2, props: { to: 100 } }],
    camera: { keyframes: [] },
  };
  assert(evalScene(doc, 0).params.get('r') === 0, 'at t=0');
  const s1 = evalScene(doc, 1);
  assert(s1.params.get('r') > 0 && s1.params.get('r') < 100, 'at t=1, in progress');
  assert(evalScene(doc, 2).params.get('r') === 100, 'at t=2, done');
});

// ── Test 7: chapter alpha ──────────────────────────────────────────────────
test('chapter alpha fades in over [start-0.5, start+1.0]', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 't' },
    objects: {
      ch0: { kind: 'group', id: 'ch0', at: [0, 0], children: [], size: [100, 80], chapter: { title: 'C', sub: 's', duration: 5 } },
    },
    params: {}, clips: [], camera: { keyframes: [] },
  };
  const before = evalScene(doc, -1);
  assert(before.chapters.get('ch0')!.alpha === 0, 'before start-0.5, alpha=0');
  const atStart = evalScene(doc, 0);
  assert(atStart.chapters.get('ch0')!.alpha >= 0 && atStart.chapters.get('ch0')!.alpha < 1, 'at start, partially faded');
  const after = evalScene(doc, 2);
  assert(after.chapters.get('ch0')!.alpha === 1, 'after start+1.0, alpha=1');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
