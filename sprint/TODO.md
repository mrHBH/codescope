# windgraph — Master TODO

Master checklist across all phases. Work top-down; each phase file has the detail,
rationale, and acceptance criteria. Check an item only when its acceptance
criteria pass.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

> Cinematic flight (`src/ui/demo.ts`, 🎬 button) now showcases the windgraph
> library too: an "It animates" morph shot + an "And it's interactive" shot that
> auto-drives a triangle vertex to show live constraint recompute.

---

## Phase 0 — Stroke→fill engine  (`phase-0-stroke-engine.md`)  ✅
- [x] Polyline → filled ribbon contour (constant width)
- [x] Butt / square / round caps
- [x] Miter / bevel / round joins (with miter limit)
- [x] Bézier-path stroking (quadratic; cubic via existing subdivision)
- [x] Dashed strokes (dash array + offset)
- [ ] Variable width along path (taper) — stretch
- [x] Feeds windfoil as normal fill instances; crisp at any zoom
- [x] Demo: strokes board (grid, caps, joins, ring, S-curve, dashes) via 📈 button

## Phase 1 — Primitives + Mobject model  (`phase-1-primitives.md`)  ✅
- [x] `Mobject` base: path(s), stroke/fill style, transform, z-order
- [x] Point (dot), Segment, Vector/Arrow (arrowheads) + Label
- [~] Ray, Line (infinite) — deferred to Phase 2 (need viewport clipping)
- [x] Polyline, Polygon (stroked + filled)
- [x] Circle, Arc, Ellipse  ·  [ ] Sector, general conic (stretch)
- [x] Group/Mobject tree with combined transforms
- [x] Demo: a labeled geometry scene (triangle, incircle, vectors)

## Phase 2 — Coordinates, axes, grids  (`phase-2-coordinates-axes.md`)  ✅
- [x] Data↔screen transform tied to the windfoil camera
- [x] NumberPlane: linear axes, ticks, minor/major grid
- [x] Tick labels + axis labels (windfoil text)
- [ ] Log scale, polar grid (later)
- [x] Auto-ranging + nice-number tick selection (adaptive to zoom)
- [x] Demo: axes that stay crisp + correctly ticked through zoom

## Phase 3 — Plotting  (`phase-3-plotting.md`)  ✅
- [x] `y = f(x)` plot (adaptive Bézier sampling)
- [x] Parametric + polar curves
- [x] Implicit `f(x,y)=0` (marching squares → contours)
- [x] Vector / slope fields
- [x] Area fill under/between curves; Riemann rectangles
- [x] Discrete data: scatter, line, bar, step, error bars
- [x] Demo: multi-series plot, implicit contours, vector field, slope field, data series

## Phase 4 — Animation engine  (`phase-4-animation.md`)  ✅
- [x] Scene + timeline (play/sequence/parallel, easing library)
- [x] Create/Draw (partial-length path reveal)
- [x] Transform/morph (path interpolation with point correspondence)
- [x] FadeIn/Out, shift/scale/rotate, MoveAlongPath
- [x] ValueTracker + updaters (dependent animation)
- [x] Demo: sin→polynomial morph with moving labeled point

## Phase 5 — Interactivity + constraints  (`phase-5-interactivity.md`)  ✅
- [x] Reactive dependency graph (free vs. constrained objects)
- [x] Draggable free points (uses windfoil picking)
- [x] Derived objects: midpoint, intersection, glider-on-curve, reflection
      (+ centroid, circumcircle, perpendicular, parallel, angle, distance)
- [x] Live recompute + redraw on drag
- [x] Demo: draggable triangle with live centroid/circumcircle

## Phase 6 — Math typesetting  (`phase-6-math-typesetting.md`)  ✅
- [x] Math font atlas (KaTeX TTFs → windfoil, multi-font: mi:/mn:/sz: prefixes)
- [x] LaTeX-math → box tree (in-house parser + TeX-style box layout, no KaTeX lib)
- [x] Box tree → windfoil instances (glyphs + rule rects + radical strokes)
- [x] `MathTex`: display math, anchoring, participates in emit
- [x] Animatable: write-on (reveal) + fade ; [~] true glyph morph (crossfade for now)
- [x] Constructs: fractions, exponents/subscripts (nested), radicals, sums/
      integrals with limits, Greek, operators  ·  [ ] matrices (stretch)
- [x] Demo (📐): gallery of identities + animated headline, sharp at any zoom

## Phase 7 — 3D graphing  (`phase-7-3d-graphing.md`)  ⚠️ REDO (placeholder only)
> **Revisit required.** The current impl is a *fake-3D* CPU projection painter-
> sorted into the **flat 2D canvas** — performance is poor (thousands of sorted
> fills/frame) and it does **not** integrate with the real 3D free-camera. The
> intended design: the graph should extend in **true 3D above the ground plane**,
> rendered by the actual orbit camera (so panning the 3D world flies over/around
> it). That needs a per-instance **height/Z** in `windfoil.wgsl` (the vs currently
> hardcodes z=0) — a real renderer change. Come back to this.
- [~] 3D axes + grid — placeholder (CPU-projected, 2D canvas)
- [~] Surface `z = f(x,y)` — placeholder (painter-sort, slow); redo as true 3D
- [x] Space curves `C(t)`  ·  [ ] parametric surfaces `S(u,v)` (stretch)
- [ ] **True** hidden-surface handling via a depth buffer in the windfoil pass
- [x] Camera-facing crisp labels (upright 2D text billboards)
- [~] Demo (🗻) — works but is the placeholder fake-3D, not integrated 3D

## Phase 8 — Export, docs, polish  (`phase-8-export-polish.md`)
- [ ] SVG export of a frame (contours → path data)
- [ ] PDF export of a frame
- [ ] Frame-sequence / video (or GIF/WebM) capture of an animation
- [ ] Public API surface + typedocs
- [ ] Examples gallery + landing demo
- [ ] Performance pass (dirty-tracking, buffer diffing)
