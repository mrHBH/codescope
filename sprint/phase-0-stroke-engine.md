# Phase 0 — Analytic stroke→fill engine

**Status:** not started · **Depends on:** windfoil renderer (done) · **Blocks:** all
later phases.

## Goal
Render **strokes** (lines and curves with width, caps, joins, dashes) through
windfoil's *fill* pipeline, by converting stroked paths into **filled ribbon
contours**. This is the single foundational gap between "a text/shape renderer"
and "a graphing library" — almost everything a plot draws is a stroke.

## Why this way (glyph-approach-pure)
windfoil fills closed quadratic-Bézier contours with an exact winding integral. A
thick line is just a **filled ribbon** (offset the path by ±width/2). Caps and
joins extend that ribbon; dashes are multiple ribbons. So strokes are expressible
as ordinary windfoil fills — **one pipeline, no SDF, no second shader**, crisp at
any zoom.

## Scope
**In:** constant-width stroking of polylines and quadratic Bézier paths; caps
(butt/square/round); joins (miter/bevel/round + miter limit); dash arrays;
emitting the result as windfoil fill instances (contour → monotone pieces → bands).
**Out (later/stretch):** variable width / taper, stroke gradients, hairline mode
(sub-pixel constant-screen-width lines — likely a small shader flag later).

## Tasks
- [ ] `strokePolyline(points, width, opts) → contour[]` (offset both sides, stitch).
- [ ] Caps: butt (flat), square (extend half-width), round (arc → quads).
- [ ] Joins: bevel, miter (with `miterLimit` fallback to bevel), round (arc fan).
- [ ] `strokeBezierPath(quads, width, opts)` — flatten adaptively to a polyline in
      *path space* (curvature-aware), then reuse `strokePolyline`. Cubic inputs use
      windfoil's existing `cubicToQuads`.
- [ ] Dashes: split the path by a dash array + offset, stroke each run.
- [ ] Output adaptor: contour(s) → `pushMonotonePieces` → `bandPieces` → instance,
      reusing `src/windfoil/geometry.ts` + `bands.ts`. Confirm fill-rule (nonzero)
      handles self-overlap at sharp joins without holes.
- [ ] Hairline/constant-screen-width option (screen-space width) — stretch.

## Deliverables
- `src/windgraph/stroke/stroke.ts` (+ small `join.ts`/`cap.ts` if it clarifies).
- A demo scene: a zig-zag polyline, a stroked Bézier `S`-curve, a dashed circle
  outline, showing all cap/join types.

## Acceptance criteria
- A 2px stroke is razor-sharp and uniform-width at 1×, and at **1000× zoom** shows
  no faceting, no width wobble, no AA breakdown.
- Sharp corners (miter/round/bevel) render without holes or overlap artifacts.
- Dashed strokes have even dash lengths that track the path arc-length.
- A 500-segment stroked curve renders in the single windfoil draw call.

## Risks / notes
- **Self-overlap at tight joins/corners** can cause winding cancellation with the
  even-odd rule — use **nonzero** fill and ensure consistent contour orientation.
- Round caps/joins are arcs → approximate with quadratic Béziers (few segments;
  they stay smooth because windfoil renders the Béziers exactly).
- Keep the offsetting numerically stable at near-degenerate (zero-length) segments.
