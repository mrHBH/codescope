import { normalCdf, normalPdf, tDist } from './distributions';
import { mean, stdDev } from './sampling';

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  center: number;
  margin: number;
  confidence: number;
}

export function confidenceInterval(data: number[], confidence = 0.95): ConfidenceInterval {
  const n = data.length;
  const m = mean(data);
  const se = stdDev(data) / Math.sqrt(n);
  const alpha = 1 - confidence;
  const z = zScore(1 - alpha / 2);
  const margin = z * se;
  return { lower: m - margin, upper: m + margin, center: m, margin, confidence };
}

export function confidenceIntervalWidth(n: number, sigma: number, confidence = 0.95): number {
  const z = zScore(1 - (1 - confidence) / 2);
  return 2 * z * sigma / Math.sqrt(n);
}

function zScore(p: number): number {
  let lo = -10, hi = 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export type TestTail = 'left' | 'right' | 'two';

export interface HypothesisTest {
  statistic: number;
  pValue: number;
  reject: boolean;
  tail: TestTail;
}

export function zTest(data: number[], mu0: number, sigma: number, tail: TestTail = 'two', alpha = 0.05): HypothesisTest {
  const n = data.length;
  const m = mean(data);
  const z = (m - mu0) / (sigma / Math.sqrt(n));
  let pValue: number;
  if (tail === 'left') pValue = normalCdf(z);
  else if (tail === 'right') pValue = 1 - normalCdf(z);
  else pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { statistic: z, pValue, reject: pValue < alpha, tail };
}

export function tTest(data: number[], mu0: number, tail: TestTail = 'two', alpha = 0.05): HypothesisTest {
  const n = data.length;
  const m = mean(data);
  const s = stdDev(data);
  const t = (m - mu0) / (s / Math.sqrt(n));
  const dist = tDist(n - 1);
  let pValue: number;
  if (tail === 'left') pValue = dist.cdf(t);
  else if (tail === 'right') pValue = 1 - dist.cdf(t);
  else pValue = 2 * (1 - dist.cdf(Math.abs(t)));
  return { statistic: t, pValue, reject: pValue < alpha, tail };
}

export function pValueShading(dist: { pdf(x: number): number }, statistic: number, tail: TestTail, resolution = 200, range = 5): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const lo = -range, hi = range;
  const step = (hi - lo) / resolution;
  for (let i = 0; i <= resolution; i++) {
    const x = lo + i * step;
    const inRegion = tail === 'left' ? x <= statistic : tail === 'right' ? x >= statistic : Math.abs(x) >= Math.abs(statistic);
    if (inRegion) pts.push({ x, y: dist.pdf(x) });
  }
  return pts;
}

export function repeatedSamplingCI(popMean: number, popSigma: number, n: number, trials: number, confidence = 0.95, rng: () => number = Math.random): { intervals: ConfidenceInterval[]; coverageRate: number } {
  const intervals: ConfidenceInterval[] = [];
  let covers = 0;
  for (let i = 0; i < trials; i++) {
    const data: number[] = [];
    for (let j = 0; j < n; j++) {
      const u1 = rng() || 1e-10, u2 = rng();
      data.push(popMean + popSigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
    }
    const ci = confidenceInterval(data, confidence);
    intervals.push(ci);
    if (ci.lower <= popMean && ci.upper >= popMean) covers++;
  }
  return { intervals, coverageRate: covers / trials };
}
