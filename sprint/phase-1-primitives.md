# Phase 1 — Primitives + Mobject model

**Status:** not started · **Depends on:** Phase 0 · **Blocks:** 2–7.

## Goal
Define the base **Mobject** (the animatable/renderable object) and the core
**geometry primitives**, all expressed as stroked/filled Bézier contours so they
render through windfoil.

## The Mobject contract
A `Mobject` owns:
- **geometry:** one or more contours (Bézier-quad point lists) in *local* space.
- **style:** stroke (color, width, dash, caps/joins), fill (color, rule), opacity.
- **transform:** position/rotation/scale (a `mat4`, reusing `src/camera/mat4.ts`).
- **children:** a tree (groups compose transforms); z-order.
- **emit(camera, out):** append windfoil instances for itself + children.
- **interpolate(a, b, t):** for morph animation (Phase 4) — path/style lerp.

Keep geometry generation lazy + cached; invalidate on parameter change.

## Scope (primitives)
- [ ] `Dot`/`Point` (filled disc; picking target).
- [ ] `Segment`, `Ray`, `Line` (infinite — clip to viewport).
- [ ] `Vector`/`Arrow` (stroked shaft + filled arrowhead; configurable head).
- [ ] `Polyline`, `Polygon` (stroke + optional fill).
- [ ] `Circle`, `Arc`, `Ellipse`, `Sector`, `AnnularSector`.
- [ ] General `Conic` (from coefficients) — stretch.
- [ ] `Group` (transform composition).
- [ ] `Label` — a windfoil text run attached to an anchor (world or screen-pinned).

## Deliverables
- `src/windgraph/mobject/mobject.ts` (base) + `primitives.ts`.
- Demo: a labeled triangle with an inscribed circle and two vectors, pannable and
  infinitely zoomable, all crisp.

## Acceptance criteria
- Every primitive is razor-sharp at any zoom (inherits Phase 0 + windfoil).
- Transforms compose correctly through groups (a rotated group rotates children).
- Arrowheads stay correctly sized/oriented and attached under zoom/rotate.
- One draw call for a scene of ~100 primitives.

## Notes
- Reuse `mat4` for transforms; keep primitives declarative (params in, contours out)
  so animation can tween the params and regenerate.
- `Line`/`Ray` infinite extent: clip against the current view rect each frame.
