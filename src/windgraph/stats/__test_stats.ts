// ── Stats tests (Lane C) ────────────────────────────────────────────────────
// Run with: bun src/windgraph/stats/__test_stats.ts

import {
  normal, normalPdf, normalCdf, binomial, binomialPdf, poisson, poissonPdf,
  exponential, exponentialCdf, uniform, geometric, chiSquared, tDist, fDist,
} from './distributions';
import { sample, histogram, sturgesBins, freedmanDiaconisBins, mean, variance, stdDev, median, quantile } from './sampling';
import { cltSimulation, cltConvergence } from './clt';
import { randomWalk1D, randomWalk2D, brownianMotion, multipleWalks1D } from './randomWalk';
import { monteCarloPi, buffonsNeedle } from './monteCarlo';
import { pearsonR, linearRegression, spearmanR, ANSCOMBE_QUARTET } from './correlation';
import { confidenceInterval, zTest, tTest, repeatedSamplingCI } from './hypothesis';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 1e-4) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b} (eps ${eps})`); }

function seededRng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}

console.log('Stats tests (Lane C)\n');

// C1: Distributions
test('C1 normal PDF at mean', () => approx(normalPdf(0), 1 / Math.sqrt(2 * Math.PI)));
test('C1 normal CDF symmetry', () => approx(normalCdf(0), 0.5));
test('C1 normal CDF at 1σ', () => approx(normalCdf(1), 0.8413, 0.001));
test('C1 binomial PDF n=10 p=0.5 k=5', () => approx(binomialPdf(5, 10, 0.5), 0.2461, 0.001));
test('C1 binomial mean/variance', () => {
  const d = binomial(10, 0.3);
  approx(d.mean, 3); approx(d.variance, 2.1);
});
test('C1 poisson PDF lambda=3 k=2', () => approx(poissonPdf(2, 3), 0.224, 0.01));
test('C1 exponential CDF', () => approx(exponentialCdf(1, 1), 1 - Math.exp(-1)));
test('C1 uniform PDF/CDF', () => {
  const d = uniform(0, 10);
  approx(d.pdf(5), 0.1); approx(d.cdf(5), 0.5);
});
test('C1 geometric mean', () => approx(geometric(0.25).mean, 4));
test('C1 chi-squared mean = k', () => approx(chiSquared(5).mean, 5));
test('C1 t-dist symmetric', () => {
  const d = tDist(10);
  approx(d.pdf(1), d.pdf(-1));
});
test('C1 t-dist CDF known values', () => {
  const d = tDist(10);
  approx(d.cdf(0), 0.5, 1e-6);
  approx(d.cdf(2), 0.9633, 0.001);
  approx(d.cdf(-2), 0.0367, 0.001);
  approx(d.cdf(1), 0.8296, 0.001);
});
test('C1 F-dist mean', () => approx(fDist(5, 10).mean, 10 / 8));

// C2: Sampling
test('C2 sample normal has correct mean', () => {
  const rng = seededRng(42);
  const data = sample(normal(5, 1), 10000, rng);
  approx(mean(data), 5, 0.1);
});
test('C2 histogram bins sum to n', () => {
  const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const h = histogram(data, 5);
  const total = h.reduce((s, b) => s + b.count, 0);
  assert(total === 10);
});
test('C2 sturges bins', () => assert(sturgesBins(100) === 8));
test('C2 freedman-diaconis bins positive', () => {
  const data = sample(normal(0, 1), 100, seededRng(1));
  assert(freedmanDiaconisBins(data) > 0);
});
test('C2 mean/variance/stdDev', () => {
  const data = [2, 4, 4, 4, 5, 5, 7, 9];
  approx(mean(data), 5);
  approx(variance(data), 4.571, 0.01);
  approx(stdDev(data), Math.sqrt(4.571), 0.01);
});
test('C2 median odd/even', () => {
  approx(median([1, 2, 3]), 2);
  approx(median([1, 2, 3, 4]), 2.5);
});
test('C2 quantile', () => {
  const data = [1, 2, 3, 4, 5];
  approx(quantile(data, 0.5), 3);
  approx(quantile(data, 0), 1);
  approx(quantile(data, 1), 5);
});

// C3: CLT
test('C3 CLT means converge to population mean', () => {
  const rng = seededRng(123);
  const result = cltSimulation(uniform(0, 1), 30, 1000, 20, rng);
  approx(mean(result.sampleMeans), 0.5, 0.05);
});
test('C3 CLT std ≈ σ/√n', () => {
  const rng = seededRng(456);
  const result = cltSimulation(normal(0, 2), 25, 2000, 20, rng);
  const s = stdDev(result.sampleMeans);
  approx(s, 2 / 5, 0.1);
});
test('C3 CLT convergence series', () => {
  const rng = seededRng(789);
  const series = cltConvergence(uniform(0, 1), [5, 20, 50], 500, rng);
  assert(series.length === 3);
  assert(series[2].stdOfMeans < series[0].stdOfMeans);
});

// C4: Random walks
test('C4 1D walk length', () => {
  const w = randomWalk1D(100, 1, seededRng(1));
  assert(w.length === 101);
  assert(w[0] === 0);
});
test('C4 2D walk starts at origin', () => {
  const w = randomWalk2D(50, 1, seededRng(2));
  assert(w.length === 51);
  approx(w[0][0], 0); approx(w[0][1], 0);
});
test('C4 brownian motion length', () => {
  const bm = brownianMotion(200, 0.01, 1, seededRng(3));
  assert(bm.length === 201);
});
test('C4 multiple walks', () => {
  const walks = multipleWalks1D(10, 50, 1, seededRng(4));
  assert(walks.length === 10);
  assert(walks[0].length === 51);
});

// C5: Monte Carlo
test('C5 monte carlo pi estimate', () => {
  const result = monteCarloPi(10000, seededRng(42));
  approx(result.estimate, Math.PI, 0.1);
  assert(result.darts.length === 10000);
  assert(result.running.length === 10000);
});
test('C5 buffon needle estimate', () => {
  const result = buffonsNeedle(10000, 1, 1, seededRng(99));
  approx(result.estimate, Math.PI, 0.3);
});

// C6: Correlation
test('C6 perfect positive correlation', () => {
  const pts: [number, number][] = [[1, 2], [2, 4], [3, 6], [4, 8]];
  approx(pearsonR(pts), 1);
});
test('C6 perfect negative correlation', () => {
  const pts: [number, number][] = [[1, 8], [2, 6], [3, 4], [4, 2]];
  approx(pearsonR(pts), -1);
});
test('C6 linear regression slope/intercept', () => {
  const pts: [number, number][] = [[0, 1], [1, 3], [2, 5], [3, 7]];
  const reg = linearRegression(pts);
  approx(reg.slope, 2); approx(reg.intercept, 1); approx(reg.r2, 1);
});
test('C6 regression predict', () => {
  const pts: [number, number][] = [[0, 0], [1, 2], [2, 4]];
  const reg = linearRegression(pts);
  approx(reg.predict(5), 10);
});
test('C6 spearman rank correlation', () => {
  const pts: [number, number][] = [[1, 1], [2, 2], [3, 3], [4, 4]];
  approx(spearmanR(pts), 1);
});
test('C6 Anscombe quartet has 4 datasets', () => {
  assert(ANSCOMBE_QUARTET.length === 4);
  assert(ANSCOMBE_QUARTET[0].length === 11);
});

// C7: Hypothesis testing
test('C7 confidence interval contains mean', () => {
  const rng = seededRng(42);
  const data = sample(normal(10, 2), 100, rng);
  const ci = confidenceInterval(data, 0.95);
  assert(ci.lower < 10 && ci.upper > 10, `CI [${ci.lower}, ${ci.upper}] should contain 10`);
});
test('C7 z-test rejects false null', () => {
  const rng = seededRng(55);
  const data = sample(normal(5, 1), 100, rng);
  const result = zTest(data, 0, 1, 'two', 0.05);
  assert(result.reject, 'should reject μ=0 when true μ=5');
});
test('C7 t-test does not reject true null', () => {
  const rng = seededRng(77);
  const data = sample(normal(0, 1), 200, rng);
  const result = tTest(data, 0, 'two', 0.05);
  assert(!result.reject, `should not reject μ=0 when true μ=0 (p=${result.pValue}, t=${result.statistic})`);
});
test('C7 repeated sampling coverage ≈ confidence', () => {
  const rng = seededRng(123);
  const { coverageRate } = repeatedSamplingCI(0, 1, 30, 500, 0.95, rng);
  approx(coverageRate, 0.95, 0.05);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
