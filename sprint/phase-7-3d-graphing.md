# Phase 7 — 3D graphing

**Status:** ⚠️ PLACEHOLDER — must be redone as *true* 3D · **Depends on:** Phases 2–4 + the 3D camera (done) · **Blocks:** —

## ⚠️ Revisit note (2026-07-14)
A first pass exists (`src/windgraph/space3d/`, 🗻 button) but it is a **fake-3D**
CPU projection: 3D geometry is projected to 2D world coordinates and painter-
sorted into the **flat 2D canvas**. Two problems make this a placeholder, not the
real feature:
1. **Performance is poor** — thousands of CPU-projected, depth-sorted fills +
   wire strokes are rebuilt every frame.
2. **It does not integrate with the real 3D free-camera.** The graph should
   extend in **true 3D above the ground plane** and be viewed by the actual orbit
   camera (so flying the 3D world sweeps over/around the surface). Instead it is a
   flat picture-of-3D sitting on the 2D board.

**The real design:** give `windfoil.wgsl` a per-instance **height/Z** (the vertex
shader currently hardcodes `z = 0`) and a **depth buffer** in the pass, then emit
the surface as real 3D geometry that the orbit camera renders natively. Keep the
projection/colormap/shading math; swap the "project to 2D" step for "emit true 3D
+ let the camera + depth buffer handle it." Come back to this after Phases 6/8.

---

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
