# windgraph — Master TODO

Master checklist across all phases. Work top-down; each phase file has the detail,
rationale, and acceptance criteria. Check an item only when its acceptance
criteria pass.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

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

## Phase 3 — Plotting  (`phase-3-plotting.md`)
- [ ] `y = f(x)` plot (adaptive Bézier sampling)
- [ ] Parametric + polar curves
- [ ] Implicit `f(x,y)=0` (marching squares → contours)
- [ ] Vector / slope fields
- [ ] Area fill under/between curves; Riemann rectangles
- [ ] Discrete data: scatter, line, bar, step
- [ ] Demo: multi-series plot, zoomable, sharp

## Phase 4 — Animation engine  (`phase-4-animation.md`)
- [ ] Scene + timeline (play/sequence/parallel, easing library)
- [ ] Create/Draw (partial-length path reveal)
- [ ] Transform/morph (path interpolation with point correspondence)
- [ ] FadeIn/Out, shift/scale/rotate, MoveAlongPath
- [ ] ValueTracker + updaters (dependent animation)
- [ ] Demo: sin→polynomial morph with moving labeled point

## Phase 5 — Interactivity + constraints  (`phase-5-interactivity.md`)
- [ ] Reactive dependency graph (free vs. constrained objects)
- [ ] Draggable free points (uses windfoil picking)
- [ ] Derived objects: midpoint, intersection, glider-on-curve, reflection
- [ ] Live recompute + redraw on drag
- [ ] Demo: draggable triangle with live centroid/circumcircle

## Phase 6 — Math typesetting  (`phase-6-math-typesetting.md`)
- [ ] LaTeX math → positioned glyph/rule boxes (KaTeX-style layout)
- [ ] Math font atlas baked into windfoil
- [ ] Inline + display math as a `MathTex` Mobject
- [ ] Animatable/transformable like any shape
- [ ] Demo: an equation that writes on and morphs, sharp at any zoom

## Phase 7 — 3D graphing  (`phase-7-3d-graphing.md`)
- [ ] 3D axes + grid (uses the existing perspective camera)
- [ ] Surface `z = f(x,y)` (quad mesh → analytic fills/strokes)
- [ ] Parametric surfaces, space curves
- [ ] Camera-facing crisp labels
- [ ] Demo: rotatable surface with sharp axis labels

## Phase 8 — Export, docs, polish  (`phase-8-export-polish.md`)
- [ ] SVG export of a frame (contours → path data)
- [ ] PDF export of a frame
- [ ] Frame-sequence / video (or GIF/WebM) capture of an animation
- [ ] Public API surface + typedocs
- [ ] Examples gallery + landing demo
- [ ] Performance pass (dirty-tracking, buffer diffing)
