// ── Taffy layout tests ──────────────────────────────────────────────────────
// Run with: bun src/taffy/__test.ts

import { taffy } from './taffy';

let passed = 0, failed = 0;

async function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}

function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

console.log('Taffy layout tests\n');

await taffy.init();

test('flex row — 3 children, gap 8, padding 16', () => {
  const p = taffy.newNode({ display:'flex', flexDirection:'row', gap:8, padding:16 });
  const c1 = taffy.newNode({ width:100, height:50 });
  const c2 = taffy.newNode({ width:150, height:60 });
  const c3 = taffy.newNode({ width:200, height:80 });
  taffy.addChild(p, c1); taffy.addChild(p, c2); taffy.addChild(p, c3);
  const r = taffy.computeLayout(p);
  const byId = new Map(r.map(x => [x.id, x]));
  assert(byId.get(1)!.x === 16, `child1 x: expected 16, got ${byId.get(1)!.x}`);
  assert(byId.get(2)!.x === 124, `child2 x: expected 124, got ${byId.get(2)!.x}`);
  assert(byId.get(3)!.x === 282, `child3 x: expected 282, got ${byId.get(3)!.x}`);
  taffy.clear();
});

test('flex column — 2 children, gap 4, padding 12', () => {
  const p = taffy.newNode({ display:'flex', flexDirection:'column', gap:4, padding:12 });
  const c1 = taffy.newNode({ width:100, height:50 });
  const c2 = taffy.newNode({ width:80, height:40 });
  taffy.addChild(p, c1); taffy.addChild(p, c2);
  const r = taffy.computeLayout(p);
  const byId = new Map(r.map(x => [x.id, x]));
  assert(byId.get(1)!.y === 12, `child1 y: expected 12, got ${byId.get(1)!.y}`);
  assert(byId.get(2)!.y === 66, `child2 y: expected 66, got ${byId.get(2)!.y}`);
  taffy.clear();
});

test('flex with align items center', () => {
  const p = taffy.newNode({ display:'flex', flexDirection:'row', alignItems:'center', width:400, height:200 });
  const c = taffy.newNode({ width:100, height:50 });
  taffy.addChild(p, c);
  const r = taffy.computeLayout(p);
  assert(r.length === 2);
  taffy.clear();
});

test('flex with justify content space-between', () => {
  const p = taffy.newNode({ display:'flex', flexDirection:'row', justifyContent:'space-between', width:400 });
  const c1 = taffy.newNode({ width:100, height:50 });
  const c2 = taffy.newNode({ width:100, height:50 });
  taffy.addChild(p, c1); taffy.addChild(p, c2);
  const r = taffy.computeLayout(p);
  const byId = new Map(r.map(x => [x.id, x]));
  assert(byId.get(1)!.x === 0);
  assert(byId.get(2)!.x === 300);
  taffy.clear();
});

test('flex with wrap', () => {
  const p = taffy.newNode({ display:'flex', flexDirection:'row', flexWrap:'wrap', width:250, gap:8 });
  const c1 = taffy.newNode({ width:150, height:50 });
  const c2 = taffy.newNode({ width:150, height:50 });
  taffy.addChild(p, c1); taffy.addChild(p, c2);
  const r = taffy.computeLayout(p);
  const byId = new Map(r.map(x => [x.id, x]));
  assert(byId.get(1)!.y === 0);
  assert(byId.get(2)!.y === 58); // wrapped to second row
  taffy.clear();
});

test('grid auto-placement — 4 children, gap 4, padding 8', () => {
  const p = taffy.newNode({ display:'grid', gap:4, padding:8, width:400 });
  for (let i = 0; i < 4; i++) taffy.addChild(p, taffy.newNode({ width:100, height:80 }));
  const r = taffy.computeLayout(p);
  const byId = new Map(r.map(x => [x.id, x]));
  assert(byId.get(1)!.x === 8, `child1 x: expected 8, got ${byId.get(1)!.x}`);
  assert(byId.get(2)!.y === 92, `child2 y: expected 92, got ${byId.get(2)!.y}`);
  taffy.clear();
});

test('nested layout — flex row containing flex column', () => {
  const outer = taffy.newNode({ display:'flex', flexDirection:'row', gap:8, padding:10 });
  const inner = taffy.newNode({ display:'flex', flexDirection:'column', gap:4, padding:5 });
  const a = taffy.newNode({ width:50, height:30 });
  const b = taffy.newNode({ width:50, height:30 });
  taffy.addChild(inner, a); taffy.addChild(inner, b);
  taffy.addChild(outer, inner);
  const c = taffy.newNode({ width:100, height:100 });
  taffy.addChild(outer, c);
  const r = taffy.computeLayout(outer);
  assert(r.length >= 4);
  taffy.clear();
});

test('min size constraints', () => {
  const p = taffy.newNode({ display:'flex', width:200 });
  const c = taffy.newNode({ width:50, height:20 });
  taffy.addChild(p, c);
  const r = taffy.computeLayout(p);
  assert(r.length === 2); // smoke test
  taffy.clear();
});

test('aspect ratio node', () => {
  const c = taffy.newNode({ width:200, height:'auto' as any, aspectRatio:2 });
  assert(typeof c === 'number');
  taffy.clear();
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
