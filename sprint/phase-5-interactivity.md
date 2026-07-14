# Phase 5 — Interactivity & constraints (JSXGraph parity)

**Status:** not started · **Depends on:** Phases 1–4 · **Blocks:** —

## Goal
Live, draggable geometry with a **reactive dependency graph**: move a free point,
and every dependent object recomputes and redraws instantly — JSXGraph's core value.

## Scope
- [ ] Dependency graph: objects declare inputs; a topological update recomputes
      dependents when an input changes (cycle detection).
- [ ] Free vs. constrained objects (free point draggable; constrained derived).
- [ ] Derived constructors: `midpoint`, `intersection` (line/line, line/curve,
      circle/…), `glider` (point constrained to a curve, drag along it),
      `perpendicular`/`parallel`, `reflection`, `angle`, `distance`.
- [ ] Drag: hit-test via windfoil picking (2D + 3D ray from Phase 3 of the camera
      work); map pointer → data coords; update the dragged free object.
- [ ] Snap-to-grid / snap-to-object (optional).

## Deliverables
- `src/windgraph/interact/` — `graph.ts` (reactive), `constraints.ts`, `drag.ts`.
- Demo: drag a triangle's vertices; its centroid, circumcircle, and an angle arc
  update live and stay crisp.

## Acceptance criteria
- Dragging a free point updates all dependents within the same frame, smoothly.
- Gliders stay exactly on their host curve while dragging.
- Intersections track correctly (and gracefully handle "no intersection").
- No lag or popping during drag; picking is accurate at any zoom/angle.

## Notes
- Reuse the existing ray-pick (`scrToDoc`) for 2D and the 3D ground-plane cast.
- Keep the reactive graph minimal and explicit (no heavy reactive framework).
