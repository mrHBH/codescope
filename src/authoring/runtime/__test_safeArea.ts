// ── safeArea tests ──────────────────────────────────────────────────────────

import { BAND_FRAC, effHeight, safePageWH, safePageZoom, safePageCenter } from './safeArea';

let passed = 0, failed = 0;

function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e: any) { failed++; console.log(`  \u2717 ${name}: ${e.message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

console.log('safeArea tests\n');

// ── Test 1: effHeight at full bands ─────────────────────────────────────
test('effHeight at barT=1', () => {
  const h = effHeight(900, 1);
  assert(Math.abs(h - 900 * (1 - 2 * BAND_FRAC)) < 0.01, 'should be canvasH * (1 - 2*bandFrac)');
  assert(Math.abs(h - 702) < 1, `expected ~702, got ${h}`);
});

// ── Test 2: effHeight at no bands ──────────────────────────────────────
test('effHeight at barT=0', () => {
  const h = effHeight(900, 0);
  assert(h === 900, 'should be full canvas height');
});

// ── Test 3: safePageWH scales H with barT ─────────────────────────────
test('safePageWH H grows when bars drop', () => {
  const [w1, h1] = safePageWH(1260, 1600, 900, 1);  // bands up
  const [w2, h2] = safePageWH(1260, 1600, 900, 0);  // bands down
  assert(w1 === 1260 && w2 === 1260, 'width stays fixed');
  assert(h2 > h1, 'height should be larger when bars are down');
  assert(h2 / h1 > 1.25, `expected >25% growth, got ${(h2/h1).toFixed(2)}x`);
});

// ── Test 4: safePageZoom does not depend on barT ──────────────────────
test('safePageZoom invariant under barT', () => {
  const z1 = safePageZoom(1260, 1600);
  const z2 = safePageZoom(1260, 1600);
  assert(z1 === z2, 'zoom should be deterministic');
  assert(z1 > 0, 'zoom should be positive');
});

// ── Test 5: BAND_FRAC matches cinematicHud ────────────────────────────
test('BAND_FRAC = 0.11', () => {
  assert(BAND_FRAC === 0.11, 'must match cinematicHud.ts:208');
});

// ── Test 6: safePageCenter returns at as-is ──────────────────────────
test('safePageCenter is identity', () => {
  const [cx, cy] = safePageCenter([100, 200], 600);
  assert(cx === 100 && cy === 200, 'center should equal at');
});

// ── Test 7: height ratio at barT=0 equals canvas aspect ──────────────
test('safe page at barT=0 matches full canvas ratio', () => {
  const [wp, hp] = safePageWH(1260, 1600, 900, 0);
  const pageRatio = hp / wp;
  const canvasRatio = 900 / 1600;
  assert(Math.abs(pageRatio - canvasRatio) < 0.001, 'page aspect should match canvas at barT=0');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
