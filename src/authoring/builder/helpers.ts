// ── Geometry + alignment helpers ─────────────────────────────────────────────

import type { Vec2 } from '../ir/types';

/** Generate points for a regular star polygon. */
export function star(innerR: number, outerR: number, numPoints: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < numPoints * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI * i) / numPoints - Math.PI / 2;
    pts.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return pts;
}

/** Generate points for an arrow shape from `from` to `to`. */
export function arrow(from: Vec2, to: Vec2): { shaft: Vec2[]; head: Vec2[] } {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len;
  const headLen = Math.min(12, len * 0.4);
  const headW = headLen * 0.6;
  const baseX = to[0] - ux * headLen;
  const baseY = to[1] - uy * headLen;
  return {
    shaft: [from, [baseX, baseY]],
    head: [
      [baseX - uy * headW, baseY + ux * headW],
      to,
      [baseX + uy * headW, baseY - ux * headW],
    ],
  };
}

/** Alignment helpers for computing positions at builder-time. */
export const align = {
  /** Center of object at its `at` position. */
  centerOf(obj: { at?: Vec2 }): Vec2 {
    return obj.at ?? [0, 0];
  },

  /** Position left-aligned on the same row. */
  leftOf(obj: { at?: Vec2 }, gap = 20): Vec2 {
    const at = obj.at ?? [0, 0];
    return [at[0] - gap, at[1]];
  },

  /** Position right-aligned on the same row. */
  rightOf(obj: { at?: Vec2 }, gap = 20): Vec2 {
    const at = obj.at ?? [0, 0];
    return [at[0] + gap, at[1]];
  },

  /** Position above the object. */
  above(obj: { at?: Vec2 }, gap = 20): Vec2 {
    const at = obj.at ?? [0, 0];
    return [at[0], at[1] - gap];
  },

  /** Position below the object. */
  below(obj: { at?: Vec2 }, gap = 20): Vec2 {
    const at = obj.at ?? [0, 0];
    return [at[0], at[1] + gap];
  },

  /** Center Y coordinate of an object. */
  centerY(obj: { at?: Vec2 }): number {
    return (obj.at ?? [0, 0])[1];
  },

  /** Center X coordinate of an object. */
  centerX(obj: { at?: Vec2 }): number {
    return (obj.at ?? [0, 0])[0];
  },
};

export type AlignHelpers = typeof align;
