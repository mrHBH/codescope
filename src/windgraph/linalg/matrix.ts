export type Mat2 = [number, number, number, number];
export type Vec2 = [number, number];

export function mat2(a: number, b: number, c: number, d: number): Mat2 {
  return [a, b, c, d];
}

export function identity2(): Mat2 {
  return [1, 0, 0, 1];
}

export function applyMat2(m: Mat2, v: Vec2): Vec2 {
  return [m[0] * v[0] + m[1] * v[1], m[2] * v[0] + m[3] * v[1]];
}

export function det2(m: Mat2): number {
  return m[0] * m[3] - m[1] * m[2];
}

export function transpose2(m: Mat2): Mat2 {
  return [m[0], m[2], m[1], m[3]];
}

export function inverse2(m: Mat2): Mat2 | null {
  const d = det2(m);
  if (Math.abs(d) < 1e-12) return null;
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d];
}

export function mulMat2(a: Mat2, b: Mat2): Mat2 {
  return [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  ];
}

export function scale2(s: number): Mat2 {
  return [s, 0, 0, s];
}

export function rotation2(angle: number): Mat2 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c, -s, s, c];
}

export function shear2(kx: number, ky: number): Mat2 {
  return [1, kx, ky, 1];
}

export function transformGrid(m: Mat2, extent: number, step: number): { lines: [Vec2, Vec2][]; basisI: Vec2; basisJ: Vec2 } {
  const lines: [Vec2, Vec2][] = [];
  const n = Math.ceil(extent / step);
  for (let i = -n; i <= n; i++) {
    const v = i * step;
    lines.push([applyMat2(m, [v, -extent]), applyMat2(m, [v, extent])]);
    lines.push([applyMat2(m, [-extent, v]), applyMat2(m, [extent, v])]);
  }
  return { lines, basisI: applyMat2(m, [1, 0]), basisJ: applyMat2(m, [0, 1]) };
}

export function parallelogramArea(m: Mat2): number {
  return det2(m);
}

export function parallelogramVertices(m: Mat2): Vec2[] {
  return [[0, 0], [m[0], m[2]], [m[0] + m[1], m[2] + m[3]], [m[1], m[3]]];
}

export function trace2(m: Mat2): number {
  return m[0] + m[3];
}

export function mat2ToString(m: Mat2): string {
  return `[[${m[0]}, ${m[1]}], [${m[2]}, ${m[3]}]]`;
}
