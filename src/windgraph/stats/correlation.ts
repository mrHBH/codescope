export type Point = [number, number];

export function pearsonR(pts: Point[]): number {
  const n = pts.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) {
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return den < 1e-12 ? 0 : num / den;
}

export interface LinearRegression {
  slope: number;
  intercept: number;
  r2: number;
  predict(x: number): number;
  residuals(pts: Point[]): number[];
}

export function linearRegression(pts: Point[]): LinearRegression {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, predict: () => 0, residuals: () => [] };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const denom = n * sxx - sx * sx;
  const slope = Math.abs(denom) < 1e-12 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const r = pearsonR(pts);
  return {
    slope,
    intercept,
    r2: r * r,
    predict: (x) => slope * x + intercept,
    residuals: (data) => data.map(([x, y]) => y - (slope * x + intercept)),
  };
}

export function spearmanR(pts: Point[]): number {
  const n = pts.length;
  if (n < 2) return 0;
  const rankX = ranks(pts.map(p => p[0]));
  const rankY = ranks(pts.map(p => p[1]));
  const ranked: Point[] = rankX.map((rx, i) => [rx, rankY[i]]);
  return pearsonR(ranked);
}

function ranks(vals: number[]): number[] {
  const indexed = vals.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array<number>(vals.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) out[indexed[k].i] = avgRank;
    i = j;
  }
  return out;
}

export const ANSCOMBE_QUARTET: Point[][] = [
  [[10, 8.04], [8, 6.95], [13, 7.58], [9, 8.81], [11, 8.33], [14, 9.96], [6, 7.24], [4, 4.26], [12, 10.84], [7, 4.82], [5, 5.68]],
  [[10, 9.14], [8, 8.14], [13, 8.74], [9, 8.77], [11, 9.26], [14, 8.1], [6, 6.13], [4, 3.1], [12, 9.13], [7, 7.26], [5, 4.74]],
  [[10, 7.46], [8, 6.77], [13, 12.74], [9, 7.11], [11, 7.81], [14, 8.84], [6, 6.08], [4, 5.39], [12, 8.15], [7, 6.42], [5, 5.73]],
  [[8, 6.58], [8, 5.76], [8, 7.71], [8, 8.84], [8, 8.47], [8, 7.04], [8, 5.25], [19, 12.5], [8, 5.56], [8, 7.91], [8, 6.89]],
];
