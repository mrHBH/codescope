export const TAU = Math.PI * 2;

export function fxHash(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export { clamp01 } from '../../util/math';
import { clamp01 } from '../../util/math';

export function hueRgb(hue: number): [number, number, number] {
  const r = Math.abs(hue * 6 - 3) - 1;
  const g = 2 - Math.abs(hue * 6 - 2);
  const b = 2 - Math.abs(hue * 6 - 4);
  return [clamp01(r), clamp01(g), clamp01(b)];
}

export function wSDF(px: number, py: number): number {
  const S = [[0.06, 0.04, 0.27, 0.96], [0.27, 0.96, 0.50, 0.32], [0.50, 0.32, 0.73, 0.96], [0.73, 0.96, 0.94, 0.04]];
  let m = 1e9;
  for (const [x0, y0, x1, y1] of S) {
    const dx = x1 - x0, dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
    m = Math.min(m, Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)));
  }
  return m;
}

export interface FxCtx {
  now: number;
  t: number;
  dt: number;
  w: number;
  h: number;
  mx: number;
  my: number;
  cam3d: boolean;
  inst: number[];
  instFA: Float32Array;
  fxXforms: Float32Array;
  instCount: number;
  i: number;
  wx: number;
  wy: number;
  glyph: boolean;
  hash: number;
  xi: number;
  ox: number;
  oy: number;
  fx3dActive: boolean;
  extraCount: number;
  ensureInstFA(floats: number): void;
  allocXforms(totalInstances: number): void;
  tilt?: (polar: number) => void;
}

export interface Fx {
  uses3d?: boolean;
  onEnter?(ctx: FxCtx): void;
  onExit?(ctx: FxCtx): void;
  onClick?(ctx: FxCtx, wx: number, wy: number): void;
  preFrame?(ctx: FxCtx): void;
  apply(ctx: FxCtx): void;
  postFrame?(ctx: FxCtx): void;
  extras?(): { instFA: Float32Array; xforms: Float32Array; clip?: Float32Array; count: number } | null;
}
