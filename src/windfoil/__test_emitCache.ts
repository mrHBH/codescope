// ── EmitCache capture/replay tests ───────────────────────────────────────────
// Run with: bun src/windfoil/__test_emitCache.ts
//
// Buffer formats (per windfoil): crv = 6 floats/quad; rws = 5/row with
// rws[i] = quad index; inst = 16/instance with inst[i+12] = rowBase (row index).
// Rows with rowBase >= capture-time rowBase0 are board-relative (rebased on
// replay); smaller rowBases reference the immutable atlas prefix (untouched).

import { EmitCache } from './emitCache';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function eq(a: number[], b: number[], msg: string) {
  if (a.length !== b.length) throw new Error(`${msg}: length ${a.length} !== ${b.length}`);
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-9) throw new Error(`${msg}: [${i}] ${a[i]} !== ${b[i]}`);
  }
}

console.log('EmitCache tests\n');

// Atlas prefix present before the board emits (2 quads, 2 rows, 1 glyph inst).
function atlasPrefix() {
  const crv = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2];
  const rws = [0, 9, 9, 9, 9, 1, 9, 9, 9, 9];
  const inst = new Array(16).fill(7); inst[12] = 1; // rowBase 1 → atlas (< rowBase0=2)
  return { crv, rws, inst };
}

// Board build: 2 quads, 2 rows referencing them, 1 board-relative instance +
// 1 atlas-referencing instance.
function boardBuild(inst: number[], crv: number[], rws: number[]) {
  const q0 = crv.length / 6;
  crv.push(5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6);
  const r0 = rws.length / 5;
  rws.push(q0 + 0, 1, 1, 1, 1, q0 + 1, 2, 2, 2, 2);
  // fillRule 0 (a real shape instance): inst[12] is a rowBase and is rebased.
  const rel = new Array(16).fill(0); rel[12] = r0;     // board-relative rowBase
  const atl = new Array(16).fill(0); atl[12] = 0;      // atlas rowBase (kept)
  inst.push(...rel, ...atl);
}

test('replay reproduces build output at the same offsets', () => {
  const cache = new EmitCache();
  const { crv, rws, inst } = atlasPrefix();
  cache.run('s', inst, crv, rws, () => boardBuild(inst, crv, rws));
  const built = { inst: [...inst], crv: [...crv], rws: [...rws] };
  // Second frame, identical prefix → replay must match the build frame exactly.
  const f2 = atlasPrefix();
  cache.run('s', f2.inst, f2.crv, f2.rws, () => { throw new Error('must not rebuild'); });
  eq(f2.inst, built.inst, 'inst');
  eq(f2.crv, built.crv, 'crv');
  eq(f2.rws, built.rws, 'rws');
});

test('replay rebases rows + relative rowBase under a different prefix', () => {
  const cache = new EmitCache();
  const f1 = atlasPrefix();
  cache.run('s', f1.inst, f1.crv, f1.rws, () => boardBuild(f1.inst, f1.crv, f1.rws));
  // Frame 2: longer atlas prefix (4 quads / 4 rows instead of 2).
  const crv = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9];
  const rws = [0, 9, 9, 9, 9, 1, 9, 9, 9, 9, 2, 9, 9, 9, 9, 3, 9, 9, 9, 9];
  const inst = new Array(16).fill(7); inst[12] = 3;
  cache.run('s', inst, crv, rws, () => { throw new Error('must not rebuild'); });
  const quadOfs = 24 / 6; // 4 atlas quads
  const rowOfs = 20 / 5;  // 4 atlas rows
  // Board quads appended, unchanged.
  eq(crv.slice(24), [5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6], 'board crv');
  // Board rows rebased by quadOfs.
  eq(rws.slice(20), [quadOfs + 0, 1, 1, 1, 1, quadOfs + 1, 2, 2, 2, 2], 'board rws');
  // Relative instance rowBase += rowOfs; atlas instance rowBase untouched.
  assert(inst[16 + 12] === rowOfs, `rel rowBase ${inst[16 + 12]} !== ${rowOfs}`);
  assert(inst[32 + 12] === 0, 'atlas rowBase must stay 0');
});

test('signature change rebuilds', () => {
  const cache = new EmitCache();
  const f1 = atlasPrefix();
  let builds = 0;
  cache.run('a', f1.inst, f1.crv, f1.rws, () => { builds++; boardBuild(f1.inst, f1.crv, f1.rws); });
  cache.run('a', f1.inst, f1.crv, f1.rws, () => { builds++; });
  cache.run('b', f1.inst, f1.crv, f1.rws, () => { builds++; boardBuild(f1.inst, f1.crv, f1.rws); });
  assert(builds === 2, `expected 2 builds, got ${builds}`);
});

test('fillRule>=1.5 (rect/grid) instances never get a rowBase rebase', () => {
  const cache = new EmitCache();
  const f1 = atlasPrefix();
  // Board build: a procedural grid instance — inst[12] = band.x (stepWorld), NOT
  // a rowBase. If the capture heuristic misclassified it as a row ref it would
  // add rowOfs at replay and corrupt the spacing.
  const build = (inst: number[], crv: number[], rws: number[]) => {
    inst.push(100, 200, 1, 3, 0, 0, 500, 400, 1, 1, 1, 1, 20, 1.0, 137, 250);
  };
  cache.run('s', f1.inst, f1.crv, f1.rws, () => build(f1.inst, f1.crv, f1.rws));
  // Frame 2 with a longer atlas prefix → replay would rebase a false rowBase.
  const crv = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9];
  const rws = [0, 9, 9, 9, 9, 1, 9, 9, 9, 9, 2, 9, 9, 9, 9, 3, 9, 9, 9, 9];
  const inst = new Array(16).fill(7); inst[12] = 3;
  cache.run('s', inst, crv, rws, () => { throw new Error('must not rebuild'); });
  eq(inst.slice(16, 32), [100, 200, 1, 3, 0, 0, 500, 400, 1, 1, 1, 1, 20, 1.0, 137, 250],
    'grid instance replays verbatim (band.x=20, phase=137,250 untouched)');
});

test('invalidate forces rebuild', () => {
  const cache = new EmitCache();
  const f1 = atlasPrefix();
  let builds = 0;
  cache.run('a', f1.inst, f1.crv, f1.rws, () => { builds++; boardBuild(f1.inst, f1.crv, f1.rws); });
  cache.invalidate();
  cache.run('a', f1.inst, f1.crv, f1.rws, () => { builds++; boardBuild(f1.inst, f1.crv, f1.rws); });
  assert(builds === 2, `expected 2 builds, got ${builds}`);
});

test('empty build replays nothing', () => {
  const cache = new EmitCache();
  const f1 = atlasPrefix();
  cache.run('s', f1.inst, f1.crv, f1.rws, () => {});
  const f2 = atlasPrefix();
  cache.run('s', f2.inst, f2.crv, f2.rws, () => { throw new Error('must not rebuild'); });
  eq(f2.inst, f1.inst.slice(0, 16), 'inst unchanged');
  assert(f2.crv.length === 12 && f2.rws.length === 10, 'no appends');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
