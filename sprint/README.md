# windgraph — Sprint Plan

**Working title:** windgraph (TBD). A world-class, GPU-native math **plotting +
animation** library built on the **windfoil** analytic renderer.

> One-line pitch: everything Manim and JSXGraph do — plots, geometry, animation,
> LaTeX-quality math — but rendered through a single analytic GPU pipeline, so it
> is **infinitely sharp, infinitely zoomable, and fast enough for thousands of
> live elements**, in 2D and true 3D.

---

## Why this can beat Manim + JSXGraph

- **Infinite sharpness / infinite zoom.** Curves, axes, and math are closed-form
  coverage integrals — zero aliasing at any zoom. Manim bakes video frames;
  JSXGraph rasterizes SVG/canvas.
- **One draw call, GPU-scaled.** Thousands of segments, ticks, labels, arrows in a
  single pass. No SVG-DOM element ceiling.
- **Béziers stay smooth forever.** Sampled function/parametric curves never need
  re-tessellation on zoom.
- **Unified pipeline + real 3D.** Text, math, shapes, plots — same analytic AA,
  in 2D or perspective 3D, with crisp camera-facing labels.
- **Interactive by construction.** Ray-picking + a reactive constraint graph give
  JSXGraph-style live geometry; the frame loop + easing give Manim-style animation.

## The two design decisions (answered)

1. **Math typesetting = the "LaTeX way", but via a KaTeX-style layout, not a TeX
   engine.** We accept LaTeX math syntax, run a box-and-glue layout to positioned
   glyph/rule boxes, and render those through windfoil — analytic, infinitely
   sharp, and animatable as a first-class Mobject. (See `phase-6-math-typesetting.md`.)
2. **PDF.** *Exporting* scenes to vector PDF/SVG is in scope (our contours are
   already Béziers) — see `phase-8-export-polish.md`. *Rendering arbitrary PDFs*
   is a different, much larger problem and is **out of scope** for this sprint.

---

## Phases (each has its own file)

| # | File | Theme | Unlocks |
|---|------|-------|---------|
| 0 | `phase-0-stroke-engine.md` | Analytic stroke→fill engine | Lines/curves with width, caps, joins, dashes |
| 1 | `phase-1-primitives.md` | Geometry primitives + Mobject model | Points, segments, arrows, polygons, circles, arcs, conics |
| 2 | `phase-2-coordinates-axes.md` | Coordinate systems, axes, grids | Number plane, ticks, labels, log/polar scales |
| 3 | `phase-3-plotting.md` | Function & data plotting | y=f(x), parametric, polar, implicit, fields, data series |
| 4 | `phase-4-animation.md` | Scene graph + animation engine | Create, Transform/morph, Fade, updaters, timeline |
| 5 | `phase-5-interactivity.md` | Interactivity + constraint graph | Draggable/dependent objects (JSXGraph parity) |
| 6 | `phase-6-math-typesetting.md` | Analytic LaTeX math | Infinitely-sharp inline/display math as Mobjects |
| 7 | `phase-7-3d-graphing.md` | 3D graphing | Surfaces z=f(x,y), parametric surfaces, space curves |
| 8 | `phase-8-export-polish.md` | Export, docs, gallery, perf | SVG/PDF export, video capture, public API, examples |

**Dependency order:** 0 → 1 → 2 → 3 → 4, then 5/6/7 in any order (all depend on
0–4), then 8 last. `TODO.md` is the master checklist across all phases.

---

## Global quality bar (applies to every phase)

- **Analytic & alias-free** at every zoom — no bitmaps, no SDF, no re-tessellation
  artifacts. If it isn't razor-sharp at 1000× zoom, it's not done.
- **GPU-first.** Prefer one draw call; batch geometry; keep per-frame CPU work
  bounded and incremental (dirty-tracking).
- **Smooth by construction.** All animation eased; no popping/snapping; morphs are
  continuous path interpolations.
- **Prove it.** Each phase lists numeric/visual acceptance criteria; verify before
  marking done.
- **Small, layered, dependency-light.** Reuse windfoil's `mat4`, camera, atlas,
  geometry helpers. No heavy deps unless justified (KaTeX layout is the one
  sanctioned exception, Phase 6).

## Repo layout (target)

```
src/
  windfoil/        # renderer (unchanged core)
  windgraph/       # NEW: the library
    stroke/        # phase 0
    mobject/       # phase 1 (base types + primitives)
    coords/        # phase 2
    plot/          # phase 3
    anim/          # phase 4
    interact/      # phase 5
    math/          # phase 6 (LaTeX layout → boxes)
    space3d/       # phase 7
    export/        # phase 8
    scene.ts       # top-level Scene/app wiring
```

## How to run the sprint

Work one phase at a time, top of `TODO.md` down. Each phase ends with a runnable
demo proving its acceptance criteria. Do not start a phase until its dependencies
are checked off.
