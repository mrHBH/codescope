// ── Scene IR round-trip test ─────────────────────────────────────────────────
// Run with: bun src/authoring/ir/__test.ts

import { serialize, deserialize, deserializeUnsafe } from './serialize';
import type { SceneIR } from './types';

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const aa = a as unknown[], bb = b as unknown[];
    if (aa.length !== bb.length) return false;
    return aa.every((v, i) => deepEqual(v, bb[i]));
  }
  const ra = a as Record<string, unknown>, rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).sort(), kb = Object.keys(rb).sort();
  if (ka.length !== kb.length) return false;
  return ka.every(k => kb.includes(k) && deepEqual(ra[k], rb[k]));
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assert(cond: boolean, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

// ── Test IR that exercises every type ────────────────────────────────────────

const allTypesIR: SceneIR = {
  version: 1,
  meta: { title: 'Round-trip test', duration: 10 },
  objects: {
    title: {
      kind: 'text',
      id: 'title',
      content: 'Hello World',
      at: [100, 200],
      style: { size: 48, color: [1, 0.8, 0.2, 1], font: 'Lato', weight: 700, align: 'center', lineHeight: 1.5 },
      opacity: 0.9,
      zIndex: 10,
    },
    myGlyph: {
      kind: 'glyph',
      id: 'myGlyph',
      char: 'a',
      at: [0, 0],
      scale: 4,
      subregion: [0.78, 0.55, 8.5],
      style: { color: [0.3, 0.6, 1, 1] },
    },
    box: {
      kind: 'rect',
      id: 'box',
      size: [300, 200],
      at: [-150, -100],
      fill: [0.1, 0.1, 0.15, 1],
      stroke: { color: [0.4, 0.6, 0.8, 1], width: 2, cap: 'round', join: 'miter', dash: [4, 2] },
      radius: [8, 8, 0, 0],
    },
    dot: {
      kind: 'circle',
      id: 'dot',
      radius: 20,
      at: [50, 50],
      fill: [1, 0, 0.5, 0.8],
      stroke: { color: [1, 1, 1, 1], width: 3 },
    },
    oval: {
      kind: 'ellipse',
      id: 'oval',
      rx: 80,
      ry: 40,
      at: [200, 300],
      fill: [0.2, 0.8, 0.3, 0.5],
    },
    triangle: {
      kind: 'polygon',
      id: 'triangle',
      points: [[0, 0], [100, 0], [50, 80]],
      closed: true,
      fill: [0.9, 0.3, 0.1, 0.7],
      stroke: { color: [1, 1, 1, 1], width: 2, join: 'round' },
    },
    curve: {
      kind: 'arc',
      id: 'curve',
      radius: 60,
      startAngle: 0,
      endAngle: Math.PI,
      at: [0, 200],
      stroke: { color: [0.5, 0.5, 1, 1], width: 4, cap: 'round' },
    },
    seg: {
      kind: 'line',
      id: 'seg',
      points: [[-50, 0], [50, 0]],
      at: [400, 100],
      stroke: { color: [1, 1, 1, 1], width: 2 },
    },
    arr: {
      kind: 'arrow',
      id: 'arr',
      from: [0, 0],
      to: [100, 50],
      at: [10, 10],
      stroke: { color: [0, 1, 0, 1], width: 2 },
      headSize: 16,
    },
    container: {
      kind: 'group',
      id: 'container',
      children: ['box', 'dot'],
      at: [500, 500],
      layout: { kind: 'flex', direction: 'row', gap: 12, padding: 16, align: 'center', justify: 'start' },
      visible: true,
    },
    fnPlot: {
      kind: 'plot',
      id: 'fnPlot',
      plotKind: 'function',
      fn: 'Math.sin(x)',
      bounds: { xMin: -Math.PI, xMax: Math.PI, yMin: -2, yMax: 2 },
      at: [0, 600],
      stroke: { color: [0.3, 0.8, 1, 1], width: 3 },
    },
    scPlot: {
      kind: 'plot',
      id: 'scPlot',
      plotKind: 'scatter',
      points: [[1, 2], [3, 5], [4, 4]],
      bounds: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
      at: [700, 0],
      fill: [1, 0.5, 0, 1],
      pointRadius: 5,
    },
  },
  clips: [
    { id: 'clip1', target: 'title', kind: 'fadeIn', start: 0, duration: 1, ease: 'smootherstep', props: {} },
    { id: 'clip2', target: 'box', kind: 'draw', start: 1, duration: 2, ease: 'cubicOut', props: {} },
    { id: 'clip3', target: 'dot', kind: 'moveTo', start: 1.5, duration: 1, ease: 'rushInto', props: { x: 200, y: 200 } },
    { id: 'clip4', target: 'camera', kind: 'cameraTo', start: 0, duration: 3, ease: 'smoothstep', props: { center: [0, 0], zoom: 2, rotation: 45 } },
    { id: 'clip5', target: 'title', kind: 'write', start: 0, duration: 3, ease: 'linear', props: { charsPerSec: 30 } },
    { id: 'clip6', target: 'seg', kind: 'shift', start: 2, duration: 0.5, ease: 'bounceOut', props: { dx: 50, dy: -20 } },
    { id: 'clip7', target: 'triangle', kind: 'morphTo', start: 3, duration: 1, ease: 'cubicInOut', props: { points: [[0, 0], [50, 0], [25, 80]] } },
    { id: 'clip8', target: 'dot', kind: 'rotateTo', start: 4, duration: 1, ease: 'backOut', props: { radians: Math.PI } },
    { id: 'clip9', target: 'box', kind: 'param', start: 0, duration: 2, ease: 'sineInOut', props: { paramId: 'mySlider', from: 0, to: 100 } },
  ],
  camera: {
    keyframes: [
      { time: 0, center: [0, 0], zoom: 1 },
      { time: 3, center: [500, 200], zoom: 2, rotation: 45, ease: 'rushInto' },
      { time: 7, center: [0, 0], zoom: 0.5, ease: 'smoothstep' },
    ],
    defaultZoom: 1,
  },
  params: [
    { kind: 'slider', id: 'mySlider', label: 'Value', default: 50, min: 0, max: 100, step: 1 },
    { kind: 'toggle', id: 'showLabels', label: 'Labels', default: true },
    { kind: 'point', id: 'origin', label: 'Origin', default: [0, 0] },
    { kind: 'color', id: 'accent', label: 'Accent', default: [0.3, 0.6, 1, 1] },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('Scene IR round-trip tests\n');

test('serialize produces valid JSON', () => {
  const json = serialize(allTypesIR);
  assert(typeof json === 'string');
  assert(json.length > 10);
  JSON.parse(json); // must not throw
});

test('deserialize returns valid SceneIR', () => {
  const json = serialize(allTypesIR);
  const ir = deserialize(json);
  assert(ir.version === 1);
  assert(ir.meta.title === 'Round-trip test');
});

test('round-trip preserves all data (deep equality)', () => {
  const json = serialize(allTypesIR);
  const ir = deserialize(json);
  assert(deepEqual(allTypesIR, ir), 'round-trip changed data');
});

test('deserialize rejects invalid JSON', () => {
  try {
    deserialize('not json');
    assert(false, 'should have thrown');
  } catch (e) {
    assert((e as Error).message.includes('Failed to parse'));
  }
});

test('deserialize rejects valid JSON with wrong shape', () => {
  try {
    deserialize('{"version": 99}');
    assert(false, 'should have thrown');
  } catch (e) {
    assert((e as Error).message.includes('Invalid SceneIR'));
  }
});

test('deserialize rejects missing required fields', () => {
  try {
    deserialize('{"version": 1, "meta": {}}');
    assert(false, 'should have thrown');
  } catch (e) {
    assert((e as Error).message.includes('Invalid'));
  }
});

test('deserialize rejects invalid object kind', () => {
  try {
    deserialize(JSON.stringify({
      version: 1,
      meta: { title: 'x', duration: 0 },
      objects: { x: { kind: 'bogus', id: 'x' } },
      clips: [],
      camera: { keyframes: [] },
      params: [],
    }));
    assert(false, 'should have thrown');
  } catch (e) {
    assert((e as Error).message.includes('unknown kind'));
  }
});

test('deserialize rejects clip targeting nonexistent object', () => {
  try {
    deserialize(JSON.stringify({
      version: 1,
      meta: { title: 'x', duration: 0 },
      objects: { x: { kind: 'rect', id: 'x', size: [10, 10] } },
      clips: [{ id: 'c1', target: 'y', kind: 'fadeIn', start: 0, duration: 1, ease: 'linear', props: {} }],
      camera: { keyframes: [] },
      params: [],
    }));
    assert(false, 'should have thrown');
  } catch (e) {
    assert((e as Error).message.includes("target 'y'"));
  }
});

test('deserialize rejects unsorted camera keyframes', () => {
  try {
    deserialize(JSON.stringify({
      version: 1,
      meta: { title: 'x', duration: 0 },
      objects: {},
      clips: [],
      camera: {
        keyframes: [
          { time: 5, center: [0, 0], zoom: 1 },
          { time: 2, center: [0, 0], zoom: 1 },
        ],
      },
      params: [],
    }));
    assert(false, 'should have thrown');
  } catch (e) {
    assert((e as Error).message.includes('sorted by time'));
  }
});

test('deserializeUnsafe returns null on error', () => {
  assert(deserializeUnsafe('not json') === null);
  assert(deserializeUnsafe('{"version":1}') === null);
});

test('deserializeUnsafe returns SceneIR on valid input', () => {
  const json = serialize(allTypesIR);
  const ir = deserializeUnsafe(json);
  assert(ir !== null);
  assert(ir!.meta.title === 'Round-trip test');
});

test('empty scene is valid', () => {
  const empty: SceneIR = {
    version: 1,
    meta: { title: '', duration: 0 },
    objects: {},
    clips: [],
    camera: { keyframes: [] },
    params: [],
  };
  const ir = deserialize(serialize(empty));
  assert(deepEqual(empty, ir));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
