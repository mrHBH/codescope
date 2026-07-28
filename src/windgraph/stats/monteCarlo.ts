export interface DartResult {
  x: number;
  y: number;
  inside: boolean;
}

export function monteCarloPi(darts: number, rng: () => number = Math.random): { estimate: number; darts: DartResult[]; running: number[] } {
  const results: DartResult[] = [];
  const running: number[] = [];
  let inside = 0;
  for (let i = 0; i < darts; i++) {
    const x = rng() * 2 - 1;
    const y = rng() * 2 - 1;
    const isIn = x * x + y * y <= 1;
    if (isIn) inside++;
    results.push({ x, y, inside: isIn });
    running.push(4 * inside / (i + 1));
  }
  return { estimate: 4 * inside / darts, darts: results, running };
}

export interface NeedleResult {
  x: number;
  y: number;
  angle: number;
  crosses: boolean;
}

export function buffonsNeedle(needles: number, needleLength = 1, lineSpacing = 1, rng: () => number = Math.random): { estimate: number; results: NeedleResult[]; running: number[] } {
  const results: NeedleResult[] = [];
  const running: number[] = [];
  let crosses = 0;
  const l = Math.min(needleLength, lineSpacing);
  for (let i = 0; i < needles; i++) {
    const x = rng() * lineSpacing;
    const y = rng() * lineSpacing;
    const angle = rng() * Math.PI;
    const halfProj = (l / 2) * Math.sin(angle);
    const doesCross = y - halfProj < 0 || y + halfProj > lineSpacing;
    if (doesCross) crosses++;
    results.push({ x, y, angle, crosses: doesCross });
    running.push(crosses > 0 ? 2 * l * (i + 1) / (lineSpacing * crosses) : 0);
  }
  const estimate = crosses > 0 ? 2 * l * needles / (lineSpacing * crosses) : 0;
  return { estimate, results, running };
}
