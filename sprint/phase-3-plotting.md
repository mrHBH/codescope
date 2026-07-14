# Phase 3 — Function & data plotting

**Status:** not started · **Depends on:** Phase 2 · **Blocks:** (feeds 4, 5, 7).

## Goal
Turn functions and data into crisp, zoomable curves and marks in the coordinate
system.

## Scope
- [ ] `plot(f, domain)` for `y = f(x)` — **adaptive Bézier sampling** (subdivide
      where curvature/deflection is high; handle discontinuities/asymptotes).
- [ ] `parametric(p(t), tRange)`, `polar(r(θ), θRange)`.
- [ ] `implicit(F, region)` via marching squares → contour polylines → strokes.
- [ ] `vectorField(V, grid)` / slope field (arrows from Phase 1).
- [ ] Area fills: under a curve, between two curves; `riemannRectangles(f, n)`.
- [ ] Discrete data: `scatter`, `lineSeries`, `bar`, `step`, error bars.
- [ ] Re-sample on domain/zoom change only (Béziers stay smooth otherwise).

## Deliverables
- `src/windgraph/plot/` — `functions.ts`, `implicit.ts`, `field.ts`, `data.ts`.
- Demo: `sin(x)`, a cubic, and a scatter series on shared axes; area under `sin`;
  all pannable + infinitely sharp.

## Acceptance criteria
- A plotted curve is smooth (no visible facets) at any zoom without re-sampling
  during a pure zoom (only on domain change).
- Adaptive sampler resolves sharp features (peaks, near-vertical regions) without
  exploding sample counts on flat regions.
- Asymptotes/discontinuities don't draw spurious connecting segments.
- 10 series × 1k points render in the single draw call at 60fps (tab focused).

## Notes
- Prefer emitting **quadratic Béziers** fit to samples over dense polylines — fewer
  instances, smoother, and exact under windfoil.
- Implicit/marching-squares output is polylines → Phase 0 strokes.
