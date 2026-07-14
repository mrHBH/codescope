// ── windgraph · 2D affine transform ──────────────────────────────────────────
// A compact 2D affine for Mobject transforms (translate/rotate/scale) and group
// composition. Layout [a,b,c,d,e,f]: x' = a·x + c·y + e, y' = b·x + d·y + f.

export type Aff = [number, number, number, number, number, number];

export function identity(): Aff { return [1, 0, 0, 1, 0, 0]; }

// A∘B — apply B first, then A.
export function mul(A: Aff, B: Aff): Aff {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}

// Translate · Rotate · Scale (scale applied first, then rotate, then translate).
export function fromTRS(tx: number, ty: number, rot: number, sx: number, sy: number): Aff {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [c * sx, s * sx, -s * sy, c * sy, tx, ty];
}

export function apply(A: Aff, x: number, y: number): [number, number] {
  return [A[0] * x + A[2] * y + A[4], A[1] * x + A[3] * y + A[5]];
}

// The uniform scale factor of the transform (for scaling text size / stroke width).
export function scaleOf(A: Aff): number {
  return Math.hypot(A[0], A[1]);
}
