# Phase 7 — 3D graphing

**Status:** not started · **Depends on:** Phases 2–4 + the 3D camera (done) · **Blocks:** —

## Goal
Extend plotting into true 3D using the existing perspective camera + ground/panel
system, with crisp camera-facing labels.

## Scope
- [ ] 3D coordinate system + axes/grid (reuse the `camera-controls` 3D orbit).
- [ ] `surface(z = f(x,y), region)` — quad mesh; edges via Phase-0 strokes, faces
      via analytic fills; simple shading/heightmap coloring.
- [ ] Parametric surfaces `S(u,v)`; space curves `C(t)`.
- [ ] Hidden-line / depth handling (add a depth buffer to the windfoil pass, or
      painter-sort quads) — decide approach at phase start.
- [ ] Labels/ticks that face the camera and stay razor-sharp (billboard text).

## Deliverables
- `src/windgraph/space3d/` — `axes3d.ts`, `surface.ts`, `curve3d.ts`.
- Demo: a rotatable `z = sin(√(x²+y²))` surface with sharp 3D axis labels.

## Acceptance criteria
- Surface + axes render correctly under orbit; labels stay sharp and readable.
- No z-fighting / incorrect occlusion (depth handled).
- Text stays analytically crisp at grazing angles (uses the aniso footprint work).

## Notes
- The renderer already supports `viewProj` + a ground `mat4`; a per-object model
  matrix generalizes this (introduce the deferred per-panel model buffer here).
- Depth: the current pass has no depth buffer — adding one is the main new piece.
- Grazing-angle text already benefits from the anisotropic supersampling in the
  shader.
