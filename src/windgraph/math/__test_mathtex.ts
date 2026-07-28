// ── windgraph mathtex Lane K tests ───────────────────────────────────────────
// Run with: bun src/windgraph/math/__test_mathtex.ts

import { parseMath, type Node } from './parse';
import { layout, type Atlas } from './layout';
import { MathTex } from './mathtex';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(c: boolean, m = 'assertion failed') { if (!c) throw new Error(m); }

const atlas: Atlas = { table: {} };
function find(n: Node, t: string): boolean {
  if (n.t === t) return true;
  const any = n as any;
  for (const k of Object.keys(any)) {
    const v = any[k];
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.t === 'string' && find(x, t)) return true; }
      else if (typeof v.t === 'string' && find(v, t)) return true;
    }
  }
  return false;
}

console.log('MathTex Lane K tests\n');

test('K1 \\left( … \\right) parses to leftright', () => {
  const n = parseMath('\\left( x + 1 \\right)');
  assert(find(n, 'leftright'), 'has leftright node');
});

test('K1 growing delimiters lay out taller for tall bodies', () => {
  const small = layout(parseMath('\\left( x \\right)'), atlas, 1);
  const tall = layout(parseMath('\\left( \\frac{a}{b} \\right)'), atlas, 1);
  assert(tall.h + tall.d > small.h + small.d, 'tall body grows the delimiters');
  assert(tall.items.some((p) => p.kind === 'path'), 'delimiter drawn as vector path');
});

test('K1 pmatrix parses to a matrix with parens', () => {
  const n = parseMath('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
  const m = find(n, 'matrix');
  assert(m, 'has matrix node');
  const box = layout(n, atlas, 1);
  assert(box.items.some((p) => p.kind === 'path'), 'matrix delimiters drawn');
  assert(box.w > 0 && box.h > 0);
});

test('K2 \\begin{cases} parses + draws a brace', () => {
  const n = parseMath('\\begin{cases} x & x > 0 \\\\ -x & x \\leq 0 \\end{cases}');
  assert(find(n, 'cases'), 'has cases node');
  const box = layout(n, atlas, 1);
  assert(box.items.some((p) => p.kind === 'path'), 'brace drawn as path');
});

test('K3 align parses with rows + equation numbers', () => {
  const n = parseMath('\\begin{align} a &= b + c \\\\ d &= e \\end{align}');
  assert(find(n, 'align'), 'has align node');
  const box = layout(n, atlas, 1);
  assert(box.h > box.d, 'multi-line is tall');
  const numbered = layout(parseMath('\\begin{align} x &= 1 \\\\ y &= 2 \\end{align}'), atlas, 1);
  assert(numbered.w > 0);
});

test('K4 accents parse + lay out above the body', () => {
  for (const cmd of ['hat', 'bar', 'vec', 'tilde', 'dot']) {
    const n = parseMath(`\\${cmd}{x}`);
    assert(find(n, 'accent'), `${cmd} → accent node`);
    const plain = layout(parseMath('x'), atlas, 1);
    const acc = layout(n, atlas, 1);
    assert(acc.h > plain.h, `${cmd} adds height above`);
  }
});

test('K4 overbrace/underbrace capture their labels', () => {
  const n = parseMath('\\overbrace{a + b}^{n}');
  assert(find(n, 'brace'), 'has brace node');
  const box = layout(n, atlas, 1);
  const plain = layout(parseMath('a + b'), atlas, 1);
  assert(box.h > plain.h, 'overbrace + label adds height');
  const under = layout(parseMath('\\underbrace{x}_{k}'), atlas, 1);
  assert(under.d > plain.d, 'underbrace adds depth');
});

test('K5 \\xrightarrow draws a shaft + head + labels', () => {
  const n = parseMath('\\xrightarrow[below]{above}');
  assert(find(n, 'xarrow'), 'has xarrow node');
  const box = layout(n, atlas, 1);
  assert(box.items.some((p) => p.kind === 'rule'), 'arrow shaft is a rule');
  assert(box.items.some((p) => p.kind === 'path'), 'arrow head is a path');
});

test('K6 MathTex.locate finds a coefficient box', () => {
  const table: Record<string, any> = {
    'mi:f': { advance: 500, bbox: [20, -700, 480, 10], upm: 1000 },
    'mi:a': { advance: 520, bbox: [30, -680, 490, 5], upm: 1000 },
  };
  const mt = new MathTex('f a');
  const at: Atlas = { table };
  const box = mt.locate(at, 'a', { x: 0, y: 0, size: 20 });
  assert(box !== null, 'locates "a"');
  assert(box!.x1 > box!.x0 && box!.y1 > box!.y0, 'non-empty box');
  assert(mt.locate(at, 'z', { x: 0, y: 0, size: 20 }) === null, 'absent char → null');
});

test('parser still handles plain math (regression)', () => {
  const box = layout(parseMath('x^2 + \\frac{1}{2} = \\sqrt{y}'), atlas, 1);
  assert(box.w > 0 && box.items.length > 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
