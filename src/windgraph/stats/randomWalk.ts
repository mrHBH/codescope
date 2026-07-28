export type Vec2 = [number, number];

export function randomWalk1D(steps: number, stepSize = 1, rng: () => number = Math.random): number[] {
  const path = [0];
  let pos = 0;
  for (let i = 0; i < steps; i++) {
    pos += rng() < 0.5 ? stepSize : -stepSize;
    path.push(pos);
  }
  return path;
}

export function randomWalk2D(steps: number, stepSize = 1, rng: () => number = Math.random): Vec2[] {
  const path: Vec2[] = [[0, 0]];
  let x = 0, y = 0;
  for (let i = 0; i < steps; i++) {
    const angle = rng() * 2 * Math.PI;
    x += stepSize * Math.cos(angle);
    y += stepSize * Math.sin(angle);
    path.push([x, y]);
  }
  return path;
}

export function brownianMotion(steps: number, dt: number, diffusion = 1, rng: () => number = Math.random): Vec2[] {
  const path: Vec2[] = [[0, 0]];
  let x = 0, y = 0;
  const scale = Math.sqrt(2 * diffusion * dt);
  for (let i = 0; i < steps; i++) {
    x += scale * gaussianPair(rng)[0];
    y += scale * gaussianPair(rng)[1];
    path.push([x, y]);
  }
  return path;
}

function gaussianPair(rng: () => number): [number, number] {
  const u1 = rng() || 1e-10;
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

export function diffusionLimit(walks: Vec2[][], timeIndex: number): { meanDisp2: number; expected: number } {
  let sum = 0;
  for (const w of walks) {
    if (timeIndex < w.length) {
      const [x, y] = w[timeIndex];
      sum += x * x + y * y;
    }
  }
  const meanDisp2 = sum / (walks.length || 1);
  return { meanDisp2, expected: 0 };
}

export function multipleWalks1D(count: number, steps: number, stepSize = 1, rng: () => number = Math.random): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < count; i++) out.push(randomWalk1D(steps, stepSize, rng));
  return out;
}

export function multipleWalks2D(count: number, steps: number, stepSize = 1, rng: () => number = Math.random): Vec2[][] {
  const out: Vec2[][] = [];
  for (let i = 0; i < count; i++) out.push(randomWalk2D(steps, stepSize, rng));
  return out;
}
