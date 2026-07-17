// ── Taffy layout integration tests ───────────────────────────────────────────
// Run with: bun src/authoring/layout/__test.ts

import { taffy as taffyInstance } from './taffy';
import { buildTaffyTree } from './spec-to-taffy';
import { solveLayout } from './solver';
import type { SceneIR } from '../ir/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return run();
}

function assert(cond: boolean, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

// ── Test setup ───────────────────────────────────────────────────────────────

const objects: Record<string, any> = {
  myBox: { kind: 'rect', id: 'myBox', size: [100, 50] },
  yourBox: { kind: 'rect', id: 'yourBox', size: [150, 60] },
  bigBox: { kind: 'rect', id: 'bigBox', size: [200, 80] },
  dot: { kind: 'circle', id: 'dot', radius: 20 },
};

async function main() {
  console.log('Taffy layout tests\n');
  await taffyInstance.init();

  await test('flex row — 3 children, gap 8, padding 16', () => {
    const group = {
      kind: 'group' as const, id: 'row',
      children: ['myBox', 'yourBox', 'bigBox'],
      layout: { kind: 'flex' as const, direction: 'row' as const, gap: 8, padding: 16, align: 'start' as const },
    };

    const tree = buildTaffyTree(group, group.children, objects,
      (s) => taffyInstance.newNode(s),
      (p, c) => taffyInstance.addChild(p, c),
    );

    const results = taffyInstance.computeLayout(tree.rootId);
    assert(results.length === 4, `expected 4 nodes, got ${results.length}`);

    // Find children by mapped IDs
    const byId = new Map(results.map(r => [tree.objectIdMap.get(r.id)!, r]));
    const myBoxR = byId.get('myBox')!;
    const yourBoxR = byId.get('yourBox')!;
    const bigBoxR = byId.get('bigBox')!;

    assert(myBoxR.x === 16, `myBox x: expected 16, got ${myBoxR.x}`);
    assert(yourBoxR.x === 124, `yourBox x: expected 124 (16+100+8), got ${yourBoxR.x}`);
    assert(bigBoxR.x === 282, `bigBox x: expected 282 (124+150+8), got ${bigBoxR.x}`);
    assert(myBoxR.width === 100 && myBoxR.height === 50, 'myBox size wrong');
  });

  await test('flex column — 2 children, gap 4, padding 12', () => {
    const group = {
      kind: 'group' as const, id: 'col',
      children: ['myBox', 'dot'],
      layout: { kind: 'flex' as const, direction: 'column' as const, gap: 4, padding: 12 },
    };

    const tree = buildTaffyTree(group, group.children, objects,
      (s) => taffyInstance.newNode(s),
      (p, c) => taffyInstance.addChild(p, c),
    );

    const results = taffyInstance.computeLayout(tree.rootId);
    const byId = new Map(results.map(r => [tree.objectIdMap.get(r.id)!, r]));

    const myBoxR = byId.get('myBox')!;
    const dotR = byId.get('dot')!;

    assert(myBoxR.y === 12, `myBox y: expected 12, got ${myBoxR.y}`);
    assert(dotR.y === 66, `dot y: expected 66 (12+50+4), got ${dotR.y}`);
  });

  await test('stack horizontal — same as flex row', () => {
    const group = {
      kind: 'group' as const, id: 'stack',
      children: ['myBox', 'yourBox'],
      layout: { kind: 'stack' as const, direction: 'horizontal' as const, gap: 10, padding: 0 },
    };

    const tree = buildTaffyTree(group, group.children, objects,
      (s) => taffyInstance.newNode(s),
      (p, c) => taffyInstance.addChild(p, c),
    );

    const results = taffyInstance.computeLayout(tree.rootId);
    const byId = new Map(results.map(r => [tree.objectIdMap.get(r.id)!, r]));

    const myBoxR = byId.get('myBox')!;
    const yourBoxR = byId.get('yourBox')!;

    assert(myBoxR.x === 0, `myBox x: expected 0, got ${myBoxR.x}`);
    assert(yourBoxR.x === 110, `yourBox x: expected 110 (100+10), got ${yourBoxR.x}`);
  });

  await test('no-op on group with absolute layout', () => {
    const group = {
      kind: 'group' as const, id: 'abs',
      children: ['myBox'],
      layout: { kind: 'absolute' as const },
    };

    const tree = buildTaffyTree(group, group.children, objects,
      (s) => taffyInstance.newNode(s),
      (p, c) => taffyInstance.addChild(p, c),
    );

    const results = taffyInstance.computeLayout(tree.rootId);
    // With absolute, no layout constraints — children size to content
    const byId = new Map(results.map(r => [tree.objectIdMap.get(r.id)!, r]));
    const myBoxR = byId.get('myBox')!;
    assert(myBoxR.width === 100 && myBoxR.height === 50, 'child should keep explicit size');
  });

  await test('grid auto-placement — 4 children, gap 4, padding 8', () => {
    const gridGroup = {
      kind: 'group' as const, id: 'grid',
      children: ['myBox', 'yourBox', 'bigBox', 'dot'],
      layout: {
        kind: 'grid' as const,
        columns: [],   // auto-place — columns/rows deferred to Phase 3+
        rows: [],
        gap: 4,
        padding: 8,
      },
    };

    const gridObjects = {
      ...objects,
      myBox: { ...objects.myBox, size: [100, 80] },
      yourBox: { ...objects.yourBox, size: [150, 80] },
      bigBox: { ...objects.bigBox, size: [100, 80] },
      dot: { ...objects.dot, radius: 40, kind: 'circle' },
    };

    const tree = buildTaffyTree(gridGroup, gridGroup.children, gridObjects,
      (s) => taffyInstance.newNode(s),
      (p, c) => taffyInstance.addChild(p, c),
    );

    const results = taffyInstance.computeLayout(tree.rootId);
    // In auto-placement mode, grid creates a single column by default
    const byId = new Map(results.map(r => [tree.objectIdMap.get(r.id)!, r]));
    const myBoxR = byId.get('myBox')!;
    const yourBoxR = byId.get('yourBox')!;

    assert(myBoxR.x === 8 && myBoxR.y === 8, `myBox at [8,8], got [${myBoxR.x},${myBoxR.y}]`);
    // yourBox should be below myBox with gap
    assert(yourBoxR.y === 92, `yourBox y: expected 92 (8+80+4), got ${yourBoxR.y}`);
  });

  await test('solveLayout writes positions back to SceneIR', () => {
    const scene: SceneIR = {
      version: 1,
      meta: { title: 'layout test', duration: 0 },
      objects: {
        container: {
          kind: 'group', id: 'container',
          children: ['a', 'b'],
          layout: { kind: 'flex', direction: 'row', gap: 8, padding: 16 },
        },
        a: { kind: 'rect', id: 'a', size: [100, 50] },
        b: { kind: 'rect', id: 'b', size: [120, 50] },
      },
      clips: [],
      camera: { keyframes: [] },
      params: [],
    };

    solveLayout(scene);

    const a = scene.objects.a;
    const b = scene.objects.b;
    assert(a.at![0] === 16, `a.at[0] expected 16, got ${a.at?.[0]}`);
    assert(b.at![0] === 124, `b.at[0] expected 124 (16+100+8), got ${b.at?.[0]}`);
  });

  await test('solveLayout handles nested groups (bottom-up)', () => {
    const scene: SceneIR = {
      version: 1,
      meta: { title: 'nested', duration: 0 },
      objects: {
        outer: {
          kind: 'group', id: 'outer',
          children: ['inner'],
          layout: { kind: 'flex', direction: 'column', gap: 10, padding: 10 },
        },
        inner: {
          kind: 'group', id: 'inner',
          children: ['x', 'y'],
          layout: { kind: 'flex', direction: 'row', gap: 5, padding: 5 },
        },
        x: { kind: 'rect', id: 'x', size: [50, 30] },
        y: { kind: 'rect', id: 'y', size: [60, 30] },
      },
      clips: [],
      camera: { keyframes: [] },
      params: [],
    };

    solveLayout(scene);

    const inner = scene.objects.inner as any;
    const x = scene.objects.x;
    const y = scene.objects.y;

    // Inner group's children should be resolved first
    assert(x.at![0] === 5, `x.at[0] expected 5, got ${x.at?.[0]}`);
    assert(y.at![0] === 60, `y.at[0] expected 60 (5+50+5), got ${y.at?.[0]}`);

    // Then inner group itself should be positioned by outer
    assert(inner.at![0] === 10, `inner parent x expected 10, got ${inner.at?.[0]}`);
    assert(inner.at![1] === 10, `inner parent y expected 10, got ${inner.at?.[1]}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} tests failed`);
}

main();
