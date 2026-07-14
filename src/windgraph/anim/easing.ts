// ── windgraph · easing library (Phase 4) ─────────────────────────────────────
// Normalized easing functions f: [0,1] → [0,1] with f(0)=0, f(1)=1. Used by the
// timeline to shape every animation's alpha. Continuity is the priority — every
// curve here is C0 (and most C1) so chained/looped animations never pop.

export type Easing = (t: number) => number;

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const linear: Easing = (t) => t;

export const easeInQuad: Easing = (t) => t * t;
export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const easeInCubic: Easing = (t) => t * t * t;
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const easeInQuint: Easing = (t) => t * t * t * t * t;
export const easeOutQuint: Easing = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutQuint: Easing = (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2);

// Hermite smoothstep (C1) and smootherstep (C2) — the workhorses for no-pop motion.
export const smoothstep: Easing = (t) => t * t * (3 - 2 * t);
export const smootherstep: Easing = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export const easeInSine: Easing = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine: Easing = (t) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine: Easing = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeOutElastic: Easing = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export const easeOutBounce: Easing = (t) => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

// Manim's default "rush" pair.
export const rushInto: Easing = (t) => 2 * smoothstep(t / 2);
export const rushFrom: Easing = (t) => 2 * smoothstep(t / 2 + 0.5) - 1;
