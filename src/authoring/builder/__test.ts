// ── Builder API comprehensive test ───────────────────────────────────────────
// Run with: bun src/authoring/builder/__test.ts

import { scene } from './scene-builder';
import { validateSceneIR as v } from '../ir/index';
import { serialize, deserialize } from '../ir/serialize';
import { star, arrow, align } from './helpers';
import type { TextSpec, GlyphSpec, GroupSpec, RectSpec } from '../ir/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}

function assert(cond: boolean, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

console.log('Builder API tests\n');

test('creates a text object', () => {
  const ir = scene((s) => {
    s.text('Hello World', { at: [100, 200], size: 48, color: [1, 0.8, 0.2, 1], font: 'Lato', weight: 700, align: 'center' });
  });
  const t = ir.objects.hello_world as TextSpec;
  assert(t.kind === 'text');
  assert(t.content === 'Hello World');
  assert(t.style.size === 48);
});

test('creates a glyph with subregion', () => {
  const ir = scene((s) => {
    s.glyph('a', { at: [0, 0], scale: 4, subregion: [0.78, 0.55, 8.5], color: [0.3, 0.6, 1, 1] });
  });
  const g = ir.objects.glyph_a as GlyphSpec;
  assert(g.kind === 'glyph');
  assert(g.subregion![0] === 0.78);
});

test('creates all shape objects', () => {
  const ir = scene((s) => {
    s.rect({ size: [300, 200], fill: [0.1, 0.1, 0.15, 1], stroke: { color: [0.4, 0.6, 0.8, 1], width: 2 } });
    s.circle({ radius: 20, fill: [1, 0, 0.5, 0.8] });
    s.ellipse({ rx: 80, ry: 40, fill: [0.2, 0.8, 0.3, 0.5] });
    s.polygon({ points: [[0, 0], [100, 0], [50, 80]], fill: [0.9, 0.3, 0.1, 0.7] });
    s.arc({ stroke: { color: [0.5, 0.5, 1, 1], width: 4 }, startAngle: 0, endAngle: Math.PI });
    s.line({ points: [[-50, 0], [50, 0]], stroke: { color: [1, 1, 1, 1], width: 2 } });
    s.arrow({ from: [0, 0], to: [100, 50], stroke: { color: [0, 1, 0, 1], width: 2 } });
  });
  assert(Object.keys(ir.objects).length >= 7);
});

test('creates a group with flex layout', () => {
  const ir = scene((s) => {
    const a = s.rect({ id: 'a', size: [100, 50] });
    const b = s.rect({ id: 'b', size: [120, 50] });
    s.group([a.id, b.id], { layout: { kind: 'flex', direction: 'row', gap: 8, padding: 16 } });
  });
  const g = ir.objects.group as GroupSpec;
  assert(g.kind === 'group');
  assert(g.children.length === 2);
  assert(g.layout!.kind === 'flex');
});

test('schedules clips at absolute times', () => {
  const ir = scene((s) => {
    const t = s.text('Hello', { size: 24 });
    s.at(0).play(s.fadeIn(t, { duration: 1 }));
    s.at(0.5).play(s.write(t, { duration: 2 }));
  });
  assert(ir.clips.length === 2);
  assert(ir.clips[0].start === 0);
  assert(ir.clips[1].start === 0.5);
});

test('creates camera keyframes', () => {
  const ir = scene((s) => {
    s.camera.keyframe(0, [0, 0], 1);
    s.camera.keyframe(3, [500, 200], 2, 45, 'rushInto');
  });
  assert(ir.camera.keyframes.length === 2);
  assert(ir.camera.keyframes[1].zoom === 2);
});

test('creates interactive params', () => {
  const ir = scene((s) => {
    s.param('radius', { default: 50, min: 10, max: 100 });
    s.param('show', { default: true });
    s.param('origin', { default: [0, 0] as [number, number] });
  });
  assert(ir.params.length === 3);
  assert(ir.params[0].kind === 'slider');
  assert(ir.params[1].kind === 'toggle');
  assert(ir.params[2].kind === 'point');
});

test('star helper generates correct points', () => {
  assert(star(30, 60, 5).length === 10);
});

test('arrow helper generates shaft and head', () => {
  const a = arrow([0, 0], [100, 0]);
  assert(a.shaft.length === 2 && a.head.length === 3);
});

test('align helpers compute positions', () => {
  const obj = { at: [100, 200] as [number, number] };
  assert(align.below(obj, 30)[1] === 230);
  assert(align.rightOf(obj, 50)[0] === 150);
});

test('generates valid SceneIR', () => {
  const ir = scene((s) => {
    const t = s.text('Test', { size: 40 });
    const r = s.rect({ size: [200, 100], fill: [1, 0, 0, 1] });
    s.at(0).play(s.fadeIn(t, { duration: 1 }));
    s.at(0.5).play(s.draw(r));
    s.camera.keyframe(0, [0, 0], 1);
    s.param('sliders', { default: 50 });
  });
  const result = v(ir);
  assert(result.ok, `validation failed: ${!result.ok && result.errors.join(', ')}`);
});

test('round-trip through serialize/deserialize', () => {
  const ir = scene((s) => {
    s.text('Roundtrip', { size: 36 });
    s.rect({ size: [100, 100] });
    s.at(1).play(s.fadeIn(s.rect({ size: [50, 50] })));
  });
  const json = serialize(ir);
  const back = deserialize(json);
  assert(back.version === 1);
  assert(Object.keys(back.objects).length === 3);
});

test('color helper produces correct RGBA', () => {
  const ir = scene((s) => {
    s.rect({ fill: s.color(100, 200, 50) });
  });
  const c = (ir.objects.rect as RectSpec).fill!;
  assert(Math.abs(c[0] - 100 / 255) < 0.01);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);

