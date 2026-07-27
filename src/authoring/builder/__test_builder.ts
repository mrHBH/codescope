// ── SceneDoc builder round-trip + validation tests ──────────────────────────
// Run with: bun src/authoring/builder/__test_builder.ts

import { scene } from './scene';
import { validateSceneDoc } from '../ir/validate';
import type { SceneDoc } from '../ir/types';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

console.log('Builder tests\n');

// ── Test 1 ─────────────────────────────────────────────────────────────────
test('builds minimal valid doc', () => {
  const doc = scene({ title: 't' }, () => {});
  assert(validateSceneDoc(doc).length === 0);
});

// ── Test 2 ─────────────────────────────────────────────────────────────────
test('one chapter with title', () => {
  const doc = scene({ title: 't' }, (s) => {
    s.chapter('ch0', { title: 'My Chapter', sub: 'sub', at: [100, 200], dur: 10 });
  });
  const ch0 = doc.objects.ch0 as any;
  assert(ch0.chapter.title === 'My Chapter');
  assert(ch0.chapter.sub === 'sub');
  assert(ch0.chapter.duration === 10);
});

// ── Test 3 ─────────────────────────────────────────────────────────────────
test('chapter with text child', () => {
  const doc = scene({ title: 't' }, (s) => {
    const ch = s.chapter('ch0', { title: 'C', sub: 's', at: [100, 200], dur: 10 });
    ch.text('t0', 'Hello', { at: [50, 80], size: 20, color: [1, 1, 1, 1] });
  });
  const t0 = doc.objects.t0 as any;
  assert(t0.kind === 'text');
  assert(t0.content === 'Hello');
  assert(t0.at[0] === 150); // 100 + 50
  assert(t0.at[1] === 280); // 200 + 80
  const ch0 = doc.objects.ch0 as any;
  assert(ch0.children.includes('t0'));
});

// ── Test 4 ─────────────────────────────────────────────────────────────────
test('build validates and throws on duplicate ids', () => {
  try {
    scene({ title: 't' }, (s) => {
      s.chapter('ch0', { title: 'C', sub: 's', at: [0, 0], dur: 5 });
      s.chapter('ch0', { title: 'Dup', sub: 's', at: [0, 0], dur: 5 });
    });
    assert(false, 'should have thrown');
  } catch (e: any) {
    assert(e.message.includes('Duplicate'), 'expected duplicate id error');
  }
});

// ── Test 5 ─────────────────────────────────────────────────────────────────
test('camera gestures produce keyframes', () => {
  const doc = scene({ title: 't' }, (s) => {
    const ch = s.chapter('ch0', { title: 'C', sub: 's', at: [0, 0], dur: 10 });
    ch.start = 0;
    ch.cam.dive({ into: [0.55, 0.55], zoom: 9 });
  });
  assert(doc.camera.keyframes.length >= 3);
  assert(doc.camera.keyframes[0].time >= 0);
});

// ── Test 6 ─────────────────────────────────────────────────────────────────
test('chapter clip timing', () => {
  const doc = scene({ title: 't' }, (s) => {
    const ch = s.chapter('ch0', { title: 'C', sub: 's', at: [0, 0], dur: 10 });
    ch.start = 5;
    ch.clip.fadeIn('t0', { start: 0, duration: 1 });
    ch.text('t0', 'x', { at: [0, 0], size: 20, color: [1, 1, 1, 1] });
  });
  const c = doc.clips[0];
  assert(c.start === 5);
  assert(c.duration === 1);
  assert(c.kind === 'fadeIn');
});

// ── Test 7 ─────────────────────────────────────────────────────────────────
test('param and param ref', () => {
  const doc = scene({ title: 't' }, (s) => {
    const r = s.param.number('radius', { default: 0.5 });
    s.chapter('ch0', { title: 'C', sub: 's', at: [0, 0], dur: 5 });
    // Add an island manually
    s.addSpec({ kind: 'island', id: 'is0', island: 'test-isl', at: [0, 0], params: { x: r.ref() } });
  });
  assert(doc.params.radius.default === 0.5);
  assert((doc.params.radius as any).kind === 'number');
  const is0 = doc.objects.is0 as any;
  assert(is0.params.x.$param === 'radius');
});

// ── Test 8 ─────────────────────────────────────────────────────────────────
test('validateSceneDoc catches invalid doc (negative clip)', () => {
  const doc: any = {
    version: 1, meta: { title: 't' },
    objects: { r1: { kind: 'rect', id: 'r1', at: [0, 0], size: [10, 10] } },
    params: {}, clips: [{ id: 'c1', target: 'r1', kind: 'fadeIn', start: -5, duration: 1, props: {} }],
    camera: { keyframes: [] },
  };
  const errs = validateSceneDoc(doc);
  assert(errs.length > 0, 'expected validation errors');
});

// ── windgraph builder (sprint-v2 Phase 1.3) ─────────────────────────────────

test('wg builder: scene-level objects with auto ids', () => {
  const doc = scene({ title: 't' }, (s) => {
    s.wg.point('A', [0, 0], { free: true, label: 'A' });
    s.wg.point('B', [4, 0], { free: true });
    s.wg.segment(null, 'A', 'B', { stroke: { color: [1, 1, 1, 1], width: 2 } });
    s.wg.plotFn('f', 'sin(x)', { domain: [-6, 6] });
  });
  assert(validateSceneDoc(doc).length === 0);
  assert((doc.objects.A as any).kind === 'wg-point');
  assert((doc.objects.A as any).free === true);
  const seg = Object.values(doc.objects).find((o: any) => o.kind === 'wg-segment') as any;
  assert(seg && seg.from === 'A' && seg.to === 'B');
  assert((doc.objects.f as any).expr === 'sin(x)');
});

test('wg builder: chapter parenting', () => {
  const doc = scene({ title: 't' }, (s) => {
    const ch = s.chapter('ch0', { title: 'C', sub: 's', at: [0, 0], dur: 10 });
    ch.wg.point('P', [1, 1]);
  });
  assert((doc.objects.ch0 as any).children.includes('P'));
  // wg coordinates stay data-space (NO chapter offset)
  assert((doc.objects.P as any).at[0] === 1);
});

test('wg builder: param-bound radius + $param wire', () => {
  const doc = scene({ title: 't' }, (s) => {
    const r = s.param.number('r', { default: 2, min: 0.5, max: 5 });
    s.wg.circle('c', [0, 0], r.ref());
  });
  assert((doc.objects.c as any).radius.$param === 'r');
  assert(validateSceneDoc(doc).length === 0);
});

test('wg builder: full construction kit validates', () => {
  const doc = scene({ title: 't' }, (s) => {
    s.wg.point('A', [0, 0], { free: true });
    s.wg.point('B', [4, 0], { free: true });
    s.wg.point('C', [2, 3], { free: true });
    s.wg.polygon('tri', ['A', 'B', 'C']);
    s.wg.circumcircle('cc', 'A', 'B', 'C');
    s.wg.midpoint('M', 'A', 'B');
    s.wg.centroid('G', ['A', 'B', 'C']);
    s.wg.lineThrough('ln', 'A', 'M');
    s.wg.perpendicular('pp', 'ln', 'C');
    s.wg.glider('gl', 'cc', 0.5);
    s.wg.angle('ang', 'A', 'B', 'C');
    s.wg.distance('d', 'A', 'B');
    s.wg.vector('v', 'A', [1, 1]);
    s.wg.ellipse('e', [0, 0], 3, 1.5, { rot: 0.4 });
    s.wg.plotPolar('rose', 'cos(3*t)', [0, 6.283]);
    s.wg.plotImplicit('impl', 'x^2 + y^2 - 4');
    s.wg.field('fld', 'vector', { x: '-y', y: 'x' }, { density: 1 });
  });
  const errs = validateSceneDoc(doc);
  assert(errs.length === 0, 'expected no errors, got: ' + errs.join('; '));
});

test('moveAlongPath clip: chapter-relative + validation', () => {
  const doc = scene({ title: 't' }, (s) => {
    const ch = s.chapter('ch0', { title: 'C', sub: 's', at: [0, 0], dur: 10 });
    ch.wg.point('P', [0, 0]);
    ch.wg.plotFn('path', 'sin(x)');
    ch.start = 2;
    ch.clip.moveAlongPath('P', 'path', { start: 1, duration: 3 });
  });
  const c = doc.clips[0];
  assert(c.kind === 'moveAlongPath');
  assert(c.start === 3 && c.duration === 3);
  assert((c.props as any).path === 'path');

  const bad: any = {
    version: 1, meta: { title: 't' },
    objects: { P: { kind: 'wg-point', id: 'P', at: [0, 0] } },
    params: {},
    clips: [{ id: 'c1', target: 'P', kind: 'moveAlongPath', start: 0, duration: 1, props: { path: 'ghost' } }],
    camera: { keyframes: [] },
  };
  assert(validateSceneDoc(bad).some((e) => e.includes('ghost')));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
