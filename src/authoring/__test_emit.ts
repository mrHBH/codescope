// ── emitTS tests ────────────────────────────────────────────────────────────

import { emitTS } from './emitTS';
import { deserialize, serialize } from './ir/serialize';

let passed = 0, failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  \u2717 ${name}: ${e.message}`);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

console.log('emitTS tests\n');

// ── Test 1: produces non-empty string ────────────────────────────────────
test('produces non-empty string', () => {
  const doc = {
    version: 1,
    meta: { title: 'Test' },
    objects: {
      r1: { kind: 'rect' as const, id: 'r1', at: [0, 0] as [number, number], size: [100, 80] as [number, number], fill: [1, 0, 0, 1] as [number, number, number, number] },
    },
    params: {},
    clips: [],
    camera: { keyframes: [] },
  };
  const out = emitTS(doc as any);
  assert(out.length > 0, 'should produce non-empty string');
  assert(out.includes('Test'), 'should contain title');
  assert(out.includes('scene('), 'should contain scene() call');
});

// ── Test 2: contains chapter name ────────────────────────────────────────
test('contains chapter title and object', () => {
  const doc = {
    version: 1,
    meta: { title: 'My Scene' },
    objects: {
      ch0: {
        kind: 'group' as const, id: 'ch0', at: [0, 0] as [number, number],
        size: [1260, 820] as [number, number], children: ['t0'],
        chapter: { title: 'Hello', sub: 'World', duration: 8 },
      },
      t0: { kind: 'text' as const, id: 't0', content: 'Hi', at: [100, 60] as [number, number], size: 32, color: [1, 1, 1, 1] as [number, number, number, number] },
    },
    params: {},
    clips: [],
    camera: { keyframes: [] },
  };
  const out = emitTS(doc as any);
  assert(out.includes('My Scene'), 'should contain scene title');
  assert(out.includes('Hello'), 'should contain chapter title');
  assert(out.includes("'t0'"), 'should contain text object id');
  assert(out.includes('text'), 'should contain text kind');
});

// ── Test 3: param emission ──────────────────────────────────────────────
test('emits params', () => {
  const doc = {
    version: 1,
    meta: { title: 'P' },
    objects: {},
    params: {
      r: { kind: 'number' as const, label: 'Radius', default: 50, min: 10, max: 100 },
    },
    clips: [],
    camera: { keyframes: [] },
  };
  const out = emitTS(doc as any);
  assert(out.includes("s.param.number"), 'should emit param.number');
  assert(out.includes("'r'"), 'should contain param name');
  assert(out.includes('default: 50'), 'should contain default value');
});

// ── Test 4: clip emission ──────────────────────────────────────────────
test('emits clips', () => {
  const doc = {
    version: 1,
    meta: { title: 'C' },
    objects: {
      ch0: {
        kind: 'group' as const, id: 'ch0', at: [0, 0] as [number, number],
        size: [1260, 820] as [number, number], children: ['t0'],
        chapter: { title: 'X', sub: 'Y', duration: 8 },
      },
      t0: { kind: 'text' as const, id: 't0', content: 'Hi', at: [100, 60] as [number, number], size: 32, color: [1, 1, 1, 1] as [number, number, number, number] },
    },
    params: {},
    clips: [
      { id: 'c0', target: 't0', kind: 'fadeIn' as const, start: 0, duration: 1, props: {} },
    ],
    camera: { keyframes: [] },
  };
  const out = emitTS(doc as any);
  assert(out.includes('fadeIn'), 'should contain fadeIn clip');
});

// ── Test 5: deterministic output ────────────────────────────────────────
test('deterministic output', () => {
  const doc = {
    version: 1,
    meta: { title: 'D' },
    objects: {
      ch0: {
        kind: 'group' as const, id: 'ch0', at: [0, 0] as [number, number],
        size: [1260, 820] as [number, number], children: ['r1'],
        chapter: { title: 'A', sub: 'B', duration: 5 },
      },
      r1: { kind: 'rect' as const, id: 'r1', at: [50, 40] as [number, number], size: [100, 80] as [number, number], fill: [1, 0, 0, 1] as [number, number, number, number] },
    },
    params: {},
    clips: [],
    camera: { keyframes: [] },
  };
  const a = emitTS(doc as any);
  const b = emitTS(doc as any);
  assert(a === b, 'should produce identical output');
});

// ── windgraph projection (sprint-v2 Phase 1.5) ──────────────────────────────
import { scene } from './builder/scene';

test('emits scene-level windgraph objects via s.wg', () => {
  const doc = scene({ title: 'WG' }, (s) => {
    s.param.number('r', { default: 2, min: 0.5, max: 5 });
    s.wg.point('A', [0, 0], { free: true, label: 'A' });
    s.wg.point('B', [3, 1]);
    s.wg.segment('ab', 'A', 'B', { stroke: { color: [1, 1, 1, 1], width: 2 } });
    s.wg.circle('c', [0, 0], s.param.ref('r'));
    s.wg.plotFn('f', 'sin(x)', { domain: [-6, 6] });
  });
  const out = emitTS(doc);
  assert(out.includes("s.wg.point('A'"), 'point call');
  assert(out.includes('free: true'), 'free flag');
  assert(out.includes("s.wg.segment('ab', \"A\", \"B\""), 'segment with id args');
  assert(out.includes("s.wg.circle('c', [0, 0], s.param.ref('r')"), 'param-ref radius');
  assert(out.includes('s.wg.plotFn(\'f\', "sin(x)"'), 'plotFn expr');
  assert(out.includes('domain: [-6, 6]'), 'plot domain');
});

test('emits chapter-parented windgraph objects via ch.wg', () => {
  const doc = scene({ title: 'WG2' }, (s) => {
    const ch = s.chapter('ch0', { title: 'C', sub: 's', at: [0, 0], dur: 10 });
    ch.wg.point('P', [1, 2]);
    ch.wg.midpoint('M', 'P', 'P');
  });
  const out = emitTS(doc);
  assert(out.includes("ch0.wg.point('P', [1, 2]"), 'chapter-relative wg call (data coords, no offset)');
  assert(out.includes('ch0.wg.midpoint'), 'constraint call');
});

test('emits moveAlongPath clips', () => {
  const doc = scene({ title: 'WG3' }, (s) => {
    const ch = s.chapter('ch0', { title: 'C', sub: 's', at: [0, 0], dur: 10 });
    ch.wg.point('P', [0, 0]);
    ch.wg.plotFn('path', 'sin(x)');
    ch.clip.moveAlongPath('P', 'path', { start: 1, duration: 2 });
  });
  const out = emitTS(doc);
  assert(out.includes("ch0.clip.moveAlongPath('P', \"path\""), 'moveAlongPath call');
});

test('windgraph projection is deterministic', () => {
  const mk = () => scene({ title: 'WG4' }, (s) => {
    s.wg.point('A', [0, 0], { free: true });
    s.wg.point('B', [2, 0]);
    s.wg.circumcircle('cc', 'A', 'B', 'A');
    s.wg.field('fld', 'vector', { x: '-y', y: 'x' }, { density: 1 });
  });
  assert(emitTS(mk()) === emitTS(mk()), 'identical output');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
