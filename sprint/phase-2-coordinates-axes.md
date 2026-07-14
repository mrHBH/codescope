# Phase 2 — Coordinate systems, axes, grids

**Status:** done ✅ (log/polar deferred) · **Depends on:** Phase 1 · **Blocks:** 3, 7.

## Goal
A data coordinate space mapped onto the windfoil camera, with axes, ticks, grids,
and labels that stay correct and crisp through pan/zoom (including infinite zoom).

## Scope
- [ ] `CoordinateSystem`: data↔world transform (offset + scale per axis), bound to
      the existing camera so pan/zoom "just works".
- [ ] `NumberPlane`: x/y axes, major + minor grid lines (Phase 0 strokes).
- [ ] Ticks + **nice-number** tick selection (1·2·5 × 10^k), density adaptive to
      zoom so ticks stay readable at any scale.
- [ ] Tick labels + axis labels (windfoil text; number formatting).
- [ ] `LogScale` (per axis), `PolarPlane` (radial + angular grid).
- [ ] Auto-range helper (fit given data/functions with padding).

## Deliverables
- `src/windgraph/coords/` — `system.ts`, `numberPlane.ts`, `ticks.ts`.
- Demo: a number plane you can pan/zoom infinitely; ticks re-subdivide (10 → 1 →
  0.1 → …) and labels stay sharp and correctly formatted.

## Acceptance criteria
- Grid + ticks + labels remain razor-sharp at 1000× zoom; no shimmer, no overdraw
  blowup (cull off-screen grid lines).
- Tick spacing follows nice-number steps and re-subdivides smoothly as you zoom.
- Labels are correctly positioned (gutter/anchoring) and never overlap at default
  density.

## Notes
- Off-screen culling matters here (a grid is unbounded) — only emit visible lines.
- Reuse the demo/infinite-zoom experience already proven in windfoil.
- Log/polar can come after linear is solid.
