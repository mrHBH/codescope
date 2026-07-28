import type { Vec2 } from './matrix';
export type Vec3 = [number, number, number];

export function dot2(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function norm2(v: Vec2): number {
  return Math.hypot(v[0], v[1]);
}

export function norm3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalize2(v: Vec2): Vec2 {
  const len = norm2(v);
  return len < 1e-12 ? [0, 0] : [v[0] / len, v[1] / len];
}

export function normalize3(v: Vec3): Vec3 {
  const len = norm3(v);
  return len < 1e-12 ? [0, 0, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

export function project2(v: Vec2, onto: Vec2): Vec2 {
  const d = dot2(onto, onto);
  if (d < 1e-12) return [0, 0];
  const scalar = dot2(v, onto) / d;
  return [scalar * onto[0], scalar * onto[1]];
}

export function project3(v: Vec3, onto: Vec3): Vec3 {
  const d = dot3(onto, onto);
  if (d < 1e-12) return [0, 0, 0];
  const scalar = dot3(v, onto) / d;
  return [scalar * onto[0], scalar * onto[1], scalar * onto[2]];
}

export function projectionLength(v: Vec2, onto: Vec2): number {
  const len = norm2(onto);
  return len < 1e-12 ? 0 : dot2(v, onto) / len;
}

export function angleBetween2(a: Vec2, b: Vec2): number {
  const d = norm2(a) * norm2(b);
  if (d < 1e-12) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot2(a, b) / d)));
}

export function angleBetween3(a: Vec3, b: Vec3): number {
  const d = norm3(a) * norm3(b);
  if (d < 1e-12) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot3(a, b) / d)));
}

export function parallelepipedVolume(a: Vec3, b: Vec3, c: Vec3): number {
  return Math.abs(dot3(a, cross3(b, c)));
}

export function triangleArea3D(a: Vec3, b: Vec3, c: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return norm3(cross3(ab, ac)) / 2;
}

export function add2(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function sub2(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function scaleVec2(v: Vec2, s: number): Vec2 {
  return [v[0] * s, v[1] * s];
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scaleVec3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}
