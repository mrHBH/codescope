// ── Layout solver tests ──────────────────────────────────────────────────────
// Run with: bun src/authoring/layout/__test_layout.ts

import type { ObjectSpec, Vec2, Color, SceneDoc } from '../ir/types';
import type { MeasureFn } from './measure';
import { solveDocLayout, ensureTaffy } from './solve';

let passed = 0, failed = 0;

function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}

function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

// Stub measure — text returns fixed 120×24, rect returns its size, island returns 480×360
const stubMeasure: MeasureFn = (_id: string, spec: ObjectSpec) => {
  switch (spec.kind) {
    case 'text': return { w: 120, h: 24 };
    case 'rect': return { w: (spec as any).size[0], h: (spec as any).size[1] };
    case 'island': return spec.size ? { w: spec.size[0], h: spec.size[1] } : { w: 480, h: 360 };
    case 'group': return spec.size ? { w: spec.size[0], h: spec.size[1] } : { w: 0, h: 0 };
    default: return { w: 100, h: 80 };
  }
};

const C: Color = [1, 1, 1, 1];



console.log('Layout solver tests\n');

await ensureTaffy();

// ── Test 1: page column, padding 20, gap 10, two rects 100×40 ───────────────
test('page column — padding 20 gap 10 — two rects 100x40', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 'test' }, params: {}, clips: [],
    camera: { keyframes: [] },
    objects: {
      page1: {
        kind: 'group', id: 'page1', at: [100, 200] as Vec2, size: [400, 600] as Vec2,
        children: ['r1', 'r2'],
        layout: { kind: 'flex', direction: 'column', gap: 10, padding: 20 },
        page: { title: 'Test' },
      },
      r1: { kind: 'rect', id: 'r1', at: [0, 0] as Vec2, size: [100, 40] as Vec2, fill: C },
      r2: { kind: 'rect', id: 'r2', at: [0, 0] as Vec2, size: [100, 40] as Vec2, fill: C },
    },
  };

  const map = solveDocLayout(doc, stubMeasure);
  assert(map.has('r1'), 'r1 missing');
  assert(map.has('r2'), 'r2 missing');

  const r1 = map.get('r1')!;
  const r2 = map.get('r2')!;

  // Page padding 20 → first rect at y=20
  assert(Math.abs(r1.y - 20) < 0.1, `r1.y: expected ~20, got ${r1.y}`);
  // After r1 (h=40) + gap(10) → second rect at y = 20+40+10 = 70
  assert(Math.abs(r2.y - 70) < 0.1, `r2.y: expected ~70, got ${r2.y}`);
  // x should be padding 20
  assert(Math.abs(r1.x - 20) < 0.1, `r1.x: expected ~20, got ${r1.x}`);
});

// ── Test 2: page row, 3 equal flexGrow children, w=300, pad 0, gap 0 ────────
test('page row — 3 equal flexGrow children — each ~100 wide', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 'test' }, params: {}, clips: [],
    camera: { keyframes: [] },
    objects: {
      page1: {
        kind: 'group', id: 'page1', at: [0, 0] as Vec2, size: [300, 200] as Vec2,
        children: ['r1', 'r2', 'r3'],
        layout: { kind: 'flex', direction: 'row', gap: 0 },
        page: { title: 'Test' },
      },
      r1: { kind: 'rect', id: 'r1', at: [0, 0] as Vec2, size: [50, 40] as Vec2, fill: C, item: { flexGrow: 1 } },
      r2: { kind: 'rect', id: 'r2', at: [0, 0] as Vec2, size: [50, 40] as Vec2, fill: C, item: { flexGrow: 1 } },
      r3: { kind: 'rect', id: 'r3', at: [0, 0] as Vec2, size: [50, 40] as Vec2, fill: C, item: { flexGrow: 1 } },
    },
  };

  const map = solveDocLayout(doc, stubMeasure);
  const r1 = map.get('r1')!;
  const r2 = map.get('r2')!;
  const r3 = map.get('r3')!;

  // Each should be ~100 wide
  assert(Math.abs(r1.w - 100) < 1, `r1.w: expected ~100, got ${r1.w}`);
  assert(Math.abs(r2.w - 100) < 1, `r2.w: expected ~100, got ${r2.w}`);
  assert(Math.abs(r3.w - 100) < 1, `r3.w: expected ~100, got ${r3.w}`);
  // Positions: r1 at x=0, r2 at x=100, r3 at x=200
  assert(Math.abs(r1.x) < 1, `r1.x: expected ~0, got ${r1.x}`);
  assert(Math.abs(r2.x - 100) < 1, `r2.x: expected ~100, got ${r2.x}`);
  assert(Math.abs(r3.x - 200) < 1, `r3.x: expected ~200, got ${r3.x}`);
});

// ── Test 3: nested — page column → fixed head + body (row with 2 children) ───
test('nested layout — page column → head + body row', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 'test' }, params: {}, clips: [],
    camera: { keyframes: [] },
    objects: {
      page1: {
        kind: 'group', id: 'page1', at: [0, 0] as Vec2, size: [500, 400] as Vec2,
        children: ['head', 'body'],
        layout: { kind: 'flex', direction: 'column', gap: 8, padding: 12 },
        page: { title: 'Test' },
      },
      head: {
        kind: 'group', id: 'head', at: [0, 0] as Vec2, children: ['headTxt'],
        size: [476, 30] as Vec2,
      },
      headTxt: { kind: 'text', id: 'headTxt', content: 'Head', at: [0, 0] as Vec2, size: 20, color: C },
      body: {
        kind: 'group', id: 'body', at: [0, 0] as Vec2, children: ['left', 'right'],
        layout: { kind: 'flex', direction: 'row', gap: 6 },
      },
      left: { kind: 'rect', id: 'left', at: [0, 0] as Vec2, size: [100, 200] as Vec2, fill: C },
      right: { kind: 'rect', id: 'right', at: [0, 0] as Vec2, size: [120, 200] as Vec2, fill: C },
    },
  };

  const map = solveDocLayout(doc, stubMeasure);
  assert(map.has('head'), 'head missing');
  assert(map.has('body'), 'body missing');
  // headTxt is child of a non-layout group — not in LayoutMap (uses absolute at)
  assert(map.has('left'), 'left missing');
  assert(map.has('right'), 'right missing');

  const h = map.get('head')!;
  const b = map.get('body')!;
  const l = map.get('left')!;
  const r = map.get('right')!;

  // Page padding 12: head at y=12
  assert(Math.abs(h.y - 12) < 0.1, `head.y: expected ~12, got ${h.y}`);
  // head fixed height 30
  // body y = head y + head h + gap = 12 + 30 + 8 = 50
  assert(Math.abs(b.y - 50) < 0.1, `body.y: expected ~50, got ${b.y}`);
  // left and right are inside body row with gap 6
  // body starts at x=12 (page pad)
  // left inside body: body content at x=12, left at x=12+0=12
  assert(Math.abs(l.x - 12) < 0.1, `left.x: expected ~12, got ${l.x}`);
  // right inside body: left(100) + gap(6) + right.x(0) = 106
  assert(Math.abs(r.x - 118) < 1, `right.x: expected ~118, got ${r.x}`);
});

// ── Test 4: item.width override beats intrinsic ──────────────────────────────
test('item.width override beats intrinsic', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 'test' }, params: {}, clips: [],
    camera: { keyframes: [] },
    objects: {
      page1: {
        kind: 'group', id: 'page1', at: [0, 0] as Vec2, size: [400, 200] as Vec2,
        children: ['r1'],
        layout: { kind: 'flex', direction: 'row' },
        page: { title: 'Test' },
      },
      r1: { kind: 'rect', id: 'r1', at: [0, 0] as Vec2, size: [300, 50] as Vec2, fill: C, item: { width: 150 } },
    },
  };

  const map = solveDocLayout(doc, stubMeasure);
  const r1 = map.get('r1')!;
  assert(Math.abs(r1.w - 150) < 0.1, `r1.w: expected 150, got ${r1.w}`);
});

// ── Test 5: two separate pages with independent coords ───────────────────────
test('two separate pages with independent coords', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 'test' }, params: {}, clips: [],
    camera: { keyframes: [] },
    objects: {
      pa: {
        kind: 'group', id: 'pa', at: [100, 200] as Vec2, size: [200, 100] as Vec2,
        children: ['pa1', 'pa2'],
        layout: { kind: 'flex', direction: 'column', gap: 4 },
        page: { title: 'A' },
      },
      pa1: { kind: 'rect', id: 'pa1', at: [0, 0] as Vec2, size: [50, 30] as Vec2, fill: C },
      pa2: { kind: 'rect', id: 'pa2', at: [0, 0] as Vec2, size: [60, 20] as Vec2, fill: C },
      pb: {
        kind: 'group', id: 'pb', at: [500, 600] as Vec2, size: [300, 150] as Vec2,
        children: ['pb1'],
        layout: { kind: 'flex', direction: 'column' },
        page: { title: 'B' },
      },
      pb1: { kind: 'rect', id: 'pb1', at: [0, 0] as Vec2, size: [80, 40] as Vec2, fill: C },
    },
  };

  const map = solveDocLayout(doc, stubMeasure);
  const pa1 = map.get('pa1')!;
  const pa2 = map.get('pa2')!;
  const pb1 = map.get('pb1')!;

  assert(map.has('pa1') && map.has('pa2') && map.has('pb1'), 'all objects should be in map');
  assert(pa1.x >= 0 && pa1.y >= 0, `pa1 should be at non-negative position: (${pa1.x}, ${pa1.y})`);
  // pa2 below pa1: pa1.h=30, gap=4 → pa2.y = pa1.y + 30 + 4
  assert(Math.abs(pa2.y - (pa1.y + 30 + 4)) < 0.1, `pa2.y should be ~${pa1.y + 34}, got ${pa2.y}`);
  // pb1 should be in its own page — check its position is >= 0
  assert(pb1.x >= 0 && pb1.y >= 0, `pb1 should have non-negative position: (${pb1.x}, ${pb1.y})`);
});

// ── Test 6: flexGrow bars expand beyond intrinsic width ─────────────────────
test('flexGrow row — bars expand beyond intrinsic 40px', () => {
  const doc: SceneDoc = {
    version: 1, meta: { title: 'test' }, params: {}, clips: [],
    camera: { keyframes: [] },
    objects: {
      page1: {
        kind: 'group', id: 'page1', at: [0, 0] as Vec2, size: [900, 200] as Vec2,
        children: ['b0', 'b1', 'b2'],
        layout: { kind: 'flex', direction: 'row', gap: 12, padding: 24, align: 'stretch' },
        page: { title: 'Grow' },
      },
      b0: { kind: 'rect', id: 'b0', at: [0, 0] as Vec2, size: [40, 40] as Vec2, fill: C, item: { flexGrow: 1, minWidth: 40 } },
      b1: { kind: 'rect', id: 'b1', at: [0, 0] as Vec2, size: [40, 40] as Vec2, fill: C, item: { flexGrow: 1, minWidth: 40 } },
      b2: { kind: 'rect', id: 'b2', at: [0, 0] as Vec2, size: [40, 40] as Vec2, fill: C, item: { flexGrow: 1, minWidth: 40 } },
    },
  };
  const map = solveDocLayout(doc, stubMeasure);
  const b0 = map.get('b0')!;
  // content width 900-48=852, gaps 24 → 828/3 = 276 each
  assert(b0.w > 200, `b0 should grow well past 40, got ${b0.w}`);
  assert(Math.abs(b0.w - 276) < 2, `b0.w expected ~276, got ${b0.w}`);
});

// ── Test 7: PAGE_DEMO_DOC smoke ─────────────────────────────────────────────
test('PAGE_DEMO_DOC — all page children get valid layout positions', async () => {
  const { PAGE_DEMO_DOC } = await import('../scenes/pagesScene');
  const map = solveDocLayout(PAGE_DEMO_DOC, stubMeasure);

  let layoutCount = 0;
  for (const [id, spec] of Object.entries(PAGE_DEMO_DOC.objects)) {
    if (spec.kind === 'group') continue;
    if (id === 'world-label') continue;
    assert(map.has(id), `${id} missing from layout map`);
    const box = map.get(id)!;
    assert(box.w > 0 && box.h > 0, `${id} zero size`);
    assert(isFinite(box.x) && isFinite(box.y), `${id} bad pos`);
    layoutCount++;
  }
  assert(layoutCount >= 20, `expected many laid-out leaves, got ${layoutCount}`);

  const acBar = map.get('ac-bar');
  const acKicker = map.get('ac-kicker');
  const acTtl = map.get('ac-ttl');
  assert(!!acBar && !!acKicker && !!acTtl, 'accent head pieces missing');
  assert(acKicker!.x > acBar!.x, 'kicker should be right of bar');
  assert(acTtl!.y > acKicker!.y, 'title should be below kicker');

  // Grow bars must expand
  const gr0 = map.get('gr-bar-0')!;
  assert(gr0.w > 100, `gr-bar-0 should flex-grow, got w=${gr0.w}`);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} test(s) failed`); }
