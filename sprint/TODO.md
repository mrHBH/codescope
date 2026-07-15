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
- [x] Constructs: fractions, exponents/subscripts (nested), radicals, Greek, operators
- [x] Display-style limits: \sum/\prod/\lim ABOVE/BELOW, \int to the SIDE,
      \int\limits/\nolimits override; \iint/\iiint/\oint (native glyphs); proper
      integral-limit sizing; function-argument spacing; \,\;\:\!\quad spacing
- [x] Demo (📐): 2-column gallery + animated headline + symbol showcase, sharp at any zoom
- [ ] Matrices / growing delimiters (\left(…\right) that scale) — stretch

## Phase 7 — 3D graphing  (`phase-7-3d-graphing.md`)  ✅ (true 3D; labels pending)
> **Redone as TRUE 3D.** The surface is a real 3D triangle mesh that rises off the
> ground plane, rendered by the orbit free-camera through a shared depth buffer
> (companion `mesh3d` pipeline) — it lives in the SAME 3D world as the document /
> editor / other boards, so there is no jarring 2D↔3D switch. 🗻 now lifts
> straight into a tilted 3D view (not a flat top-down colour map); drag orbits.
> SMOOTH per-vertex (Gouraud) shading from the height-field gradient + res 72 → no
> faceting / no blockiness. Surface floor sits on the ground plane (coplanar with
> 2D content) and the mesh OCCLUDES 2D content behind it (windfoil depth-tests).
- [x] Depth buffer added to the windfoil pass (shared; 2D unaffected)
- [x] 3D mesh pipeline (`src/windfoil/mesh3d.ts`) — triangles + lines, depth-tested
- [x] Surface `z = f(x,y)` as a true 3D mesh (colormap + SMOOTH Gouraud shading)
- [x] 3D axes + floor grid + surface wireframe (3D lines)
- [x] Correct self-occlusion via depth buffer (no painter-sort hack)
- [x] Seamless: 🗻 enters true 3D; cinematic flight orbits it; drag = orbit
- [x] PERF: static mesh vertex buffer uploaded ONCE (was re-uploading ~1MB every
      frame); depth-view cached; AND 3D frustum culling so off-screen boards/pages
      don't emit in the free camera (the `cam3d.active` force-emit was the real
      120→90 FPS regression — every board + page emitted each frame in 3D)
- [ ] Billboarded crisp axis labels (stage 4 — pending: needs per-instance Z)
- [ ] Parametric surfaces `S(u,v)` + space curves in true 3D (stretch)

## Phase 8 — Export, docs, polish  (`phase-8-export-polish.md`)
- [ ] SVG export of a frame (contours → path data)
- [ ] PDF export of a frame
- [ ] Frame-sequence / video (or GIF/WebM) capture of an animation
- [ ] Public API surface + typedocs
- [ ] Examples gallery + landing demo
- [ ] Performance pass (dirty-tracking, buffer diffing)
