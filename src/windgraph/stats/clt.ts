import type { Distribution } from './distributions';
import { sample, mean, histogram, type HistogramBin } from './sampling';

export interface CLTResult {
  sampleMeans: number[];
  histogram: HistogramBin[];
  theoreticalMean: number;
  theoreticalStd: number;
}

export function cltSimulation(dist: Distribution, sampleSize: number, numSamples: number, bins = 30, rng: () => number = Math.random): CLTResult {
  const means: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    const s = sample(dist, sampleSize, rng);
    means.push(mean(s));
  }
  return {
    sampleMeans: means,
    histogram: histogram(means, bins),
    theoreticalMean: dist.mean,
    theoreticalStd: Math.sqrt(dist.variance / sampleSize),
  };
}

export function cltConvergence(dist: Distribution, sampleSizes: number[], numSamples: number, rng: () => number = Math.random): { n: number; meanOfMeans: number; stdOfMeans: number; expected: number }[] {
  return sampleSizes.map(n => {
    const means: number[] = [];
    for (let i = 0; i < numSamples; i++) {
      means.push(mean(sample(dist, n, rng)));
    }
    const m = mean(means);
    let v = 0;
    for (const x of means) v += (x - m) * (x - m);
    v /= means.length - 1 || 1;
    return { n, meanOfMeans: m, stdOfMeans: Math.sqrt(v), expected: Math.sqrt(dist.variance / n) };
  });
}
