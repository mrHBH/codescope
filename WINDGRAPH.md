# windgraph v2 — Master Expansion Plan

**Goal:** make windgraph the most comprehensive math plotting + geometry +
animation engine that exists — beating JSXGraph, GeoGebra, Desmos, Plotly, and
Manim each on their home turf, then going somewhere none of them can follow:
**continuous 2D↔3D with true glyph height, and physics-driven graphs** (box3d),
all rendered through the analytic windfoil pipeline (one draw call, zero
aliasing, any zoom).

Status: planning doc. Supersedes nothing — `sprint/` phases 0–8 stay valid;
this adds the v2 surface on top. Granular checkboxes will move into
`sprint/TODO.md` / a new `sprint-v2/` when a phase is picked up.

---

## 0. What we already have (audit, 2026-07-27)

| Module | Capability |
|---|---|
| `src/windgraph/stroke/` | Analytic stroke→fill: caps, joins, dashes, Bézier paths |
| `src/windgraph/mobject/` | `Mobject` tree, affine transforms; Dot, Segment, Polyline, Polygon, Vector, Circle, Arc, Ellipse, Label, Group |
| `src/windgraph/coords/` | `NumberPlane`: linear axes, adaptive nice-number ticks, grid |
| `src/windgraph/plot/` | `y=f(x)`, parametric, polar, implicit (marching squares), vector/slope fields, area under/between, Riemann rects, scatter/line/step/bars/errorbars |
| `src/windgraph/anim/` | Scene, Timeline, ValueTracker+updaters; Create, Fade, Shift, MoveTo, ScaleTo, Rotate, MoveAlongPath, Transform (path morph); full easing library |
| `src/windgraph/interact/` | `ConstraintGraph` (topo-sort, cycle detection); free/draggable points, midpoint, centroid, reflection, intersection, glider, line through, perpendicular, parallel, circumcircle, distance, angle; `DragController` |
| `src/windgraph/math/` | LaTeX-math parser + TeX-style box layout → analytic glyphs; fractions, scripts, radicals, big operators with limits, spacing |
| `src/windgraph/space3d/` | Projector, colormap, normals |
| `src/windgraph/story/` | MathMobject, CameraRig, StoryPlayer |
| `src/windfoil/mesh3d.ts` | **True-3D** triangle+line pipeline, shared depth buffer, Gouraud shading, frustum culling |
| `src/windfoil/windfoil.wgsl` | **Per-instance 3D xform already in the shader** — `fxXforms` (`rotX, rotY, z, scale` per instance), `fxActive` flag |
| `src/ide/fx/physics.ts` | **box3d.js** rigid-body world: every glyph becomes a shard body (pos + quaternion), clip planes, sleep/dormancy, broadphase grid, reassembly |
| `src/ide/fx/fireworks.ts` | Per-glyph launch/spin/z-burst + spawned 3D particles, `tilt(polar)` into the 3D camera |
| `src/playground/` | Boards: stroke, morph, interact, true-3D surface (🗻 orbit), math gallery; cinematic flight |
| `src/authoring/` | Scene IR + TS builder + REPL + islands (already reuses windgraph stroke/math/colormap; `lossSurface3d` scene) |

**The three assets no competitor has:**
1. Closed-form coverage rendering — infinitely sharp at any zoom, one draw call.
2. A single shared 3D world — document, editor, boards, and graphs live in the
   same depth-tested space with a continuous orbit camera (no 2D/3D mode switch).
3. Per-instance 3D transforms + a real rigid-body physics engine already wired
   to glyph instances — every glyph *can* have true height, spin, and weight.

---

## 1. Competitive landscape

### JSXGraph (v1.13) — the interactivity benchmark
Euclidean **and projective** geometry; 2D + 3D views; curve/surface plotting;
vector fields; implicit curves; **ODE solving**; charts & statistics; animation;
gliders/constraints; multi-touch; JessieCode scripting language; MathJax/KaTeX
interop; ARIA/keyboard **accessibility**; e-assessment hooks (state read-back).
*Weaknesses:* SVG/canvas rasterizer (blurry under zoom, DOM element ceiling),
3D is a bolt-on canvas view, animation is primitive (`animate()` only), no
physics, no morphing between representations.

### GeoGebra — the completeness benchmark
Interactive geometry 2D/3D; **CAS** (Giac/Xcas: symbolic diff/int, `Root`,
`Extremum`); built-in **spreadsheet**; scripting hooks; **locus & trace**;
construction protocol replay; materials/sharing platform; exports SVG/PNG/PDF/
GIF/EPS + **LaTeX codegen**; inequalities, implicit polynomials, conics, nets of
solids, probability calculator.
*Weaknesses:* Java/web rasterizer, heavy, closed license, animation = sliders
only, no continuous 3D, no physics.

### Desmos — the calculator-UX benchmark
Expression-list UI; **live dependency graph** over expressions; sliders with
play/loop/speed; lists + Σ/Π; **inequalities & systems** shaded; implicit
relations; **regressions** (`y₁ ~ mx₁+b`); statistics functions; **actions /
ticker** (event-driven rules); clickable/hoverable expressions; draggable
points on curves; Desmos Geometry (compass/straightedge).
*Weaknesses:* canvas raster, 2D only, no geometry-construction catalog, no
export quality, closed.

### Plotly / ECharts / d3 — the chart-catalog benchmark
Plotly: scatter, line, bar, pie, bubble, sunburst, sankey, treemap, table, box,
violin, histogram, 2D density/hexbin, contour, heatmap, ternary, parallel
coordinates, radar, carpet, polar, candlestick/OHLC, waterfall, funnel, gauge,
bullet, maps, 3D scatter/surface/mesh/trisurf, isosurface, volume, streamtube,
cone, pointcloud; hover tooltips, box/lasso select, linked brushing, frames
animation. d3: force layouts, Voronoi, brushes. ECharts: graph/tree/theme-river/
calendar/pictorial.
*Weaknesses:* all raster or SVG, no math (no implicit/ODE/geometry), no
animation grammar, no 3D text, aliasing.

### Manim (+ Motion Canvas, MathBox) — the animation benchmark
Manim: mobject scene graph, LaTeX everywhere, matrices, graph theory, number
planes, 3D surfaces, Transform/morph, Write-on, updaters, ValueTracker, camera
scenes. MathBox: continuous representation morphing, 4D projection.
*Weaknesses:* **renders video frames** (not interactive, not sharp at arbitrary
zoom mid-animation), zero interactivity, no physics, offline-only.

### Cinderella / Kig / Grapher — niche but instructive
Cinderella: **inversive geometry** (circle inversion, Möbius), physics sims,
locus. Kig: macro constructions. macOS Grapher: ODE *systems* with animated
parameter sweeps.

### Positioning matrix

| Capability | JSXGraph | GeoGebra | Desmos | Plotly | Manim | **windgraph target** |
|---|---|---|---|---|---|---|
| Sharp at ∞ zoom | ✗ | ✗ | ✗ | ✗ | ✗ (baked) | **✓ analytic** |
| Geometry constructions | ✓✓ | ✓✓✓ | ✓ (geometry app) | ✗ | ✗ | **✓✓✓** |
| Expression calculator | ✗ | ✓✓ (CAS) | ✓✓✓ | ✗ | ✗ | **✓✓** |
| Chart catalog | ✓ | ✓ | ✗ | ✓✓✓ | ✗ | **✓✓** |
| Animation grammar | ✗ | ✗ | ~ (ticker) | ~ (frames) | ✓✓✓ | **✓✓✓** |
| Interactivity | ✓✓✓ | ✓✓✓ | ✓✓✓ | ✓✓ | ✗ | **✓✓✓** |
| True 3D, shared world | ~ (view) | ✓ (view) | ✗ | ✓ (view) | ✓ (view) | **✓✓✓ same space** |
| Continuous 2D↔3D | ✗ | ✗ | ✗ | ✗ | ✗ | **✓ unique** |
| Physics | ✗ | ~ (Cinderella-ish) | ✗ | ✗ | ✗ | **✓ box3d** |
| Glyph height/extrusion | ✗ | ✗ | ✗ | ✗ | ✗ | **✓ unique** |
| Vector export | raster | ✓ | ✗ | ✗ | SVG-ish | **✓ native Bézier** |
| LaTeX quality math | via KaTeX | ✓ | ✓ | ✗ | ✓✓ | **✓ analytic** |

---

## 2. The comprehensive feature list

Legend: ✓ = have · `[ ]` = to build · priority: **P0** (core parity) /
**P1** (differentiator) / **P2** (stretch/wow). Items marked ⚡ exploit our
unique assets (analytic AA, shared 3D, physics, glyph height).

### A. Plot catalog — every curve & chart type

**Functions & curves**
- ✓ `y=f(x)` adaptive Bézier sampling · parametric · polar
- [ ] **P0** Piecewise functions `{ cond: expr, ... }` (Desmos core)
- [ ] **P0** Inequalities `f(x,y) > 0` region shading + systems of inequalities
- [ ] **P1** Sequences/discrete plots `aₙ` (dots on integers, cobweb input)
- [ ] **P1** Splines through points: Catmull-Rom, natural cubic, B-spline — with
      draggable control points + de Casteljau construction animation ⚡
- [ ] **P1** Interpolants visualized: Lagrange, Newton, cubic spline (toggle between)
- [ ] **P2** Envelope of a curve family (GeoGebra `Envelope`)
- [ ] **P2** Conformal-map / complex-function views: domain coloring, |f|/arg
      surfaces (GPU fragment side-channel — analytic fill + per-pixel color field)
- [ ] **P2** Fractals: Mandelbrot/Julia via GPU compute, orbit traps — interiors
      are **sampled content** (§5); the boundary itself is traced as analytic
      contours where feasible, which is the showcase ⚡
- [ ] **P2** L-systems & space-filling curves (Hilbert, Koch, Sierpiński) with
      animated generation depth

**Calculus & fields**
- ✓ Vector field · slope field · area under/between · Riemann rectangles
- [ ] **P0** Tangent/normal line at a draggable point; live `f'(x)` and `f''(x)`
      companion curves (linked trace, Desmos-style)
- [ ] **P0** Accumulation function `F(x)=∫ₐˣ f(t)dt` live curve
- [ ] **P0** Riemann → trapezoid → Simpson toggle with animated n and error readout
- [ ] **P1** Streamlines/streamplot (RK-integrated field lines, animated flow)
- [ ] **P1** ODE solutions `y'=f(x,y)` through draggable initial points (RK4);
      ODE **systems** phase portraits with multiple trajectories (Grapher parity)
- [ ] **P1** Cobweb/staircase diagrams for `xₙ₊₁=f(xₙ)` (logistic map, period-doubling)
- [ ] **P1** Bifurcation diagrams (GPU-batched point splats)
- [ ] **P1** Arc length, curvature `κ`, osculating circle, evolute — live on drag
- [ ] **P1** Taylor partial sums with animated order `n` (slider → convergence)
- [ ] **P1** Fourier partial sums + **epicycle** construction (rotating circles
      drawing the curve) — classic wow, trivial for our arc primitives ⚡
- [ ] **P2** ε–δ limit visualizer (draggable ε band → computed δ band)
- [ ] **P2** Newton/bisection/secant iteration animations (tangent steps)
- [ ] **P2** Line integrals, circulation/curl density overlays (Green's theorem)

**Data & statistics charts (Plotly parity)**
- ✓ scatter · line · step · bars · error bars
- [ ] **P0** Histogram with auto-binning (Sturges/Freedman–Diaconis) + animated re-bin
- [ ] **P0** Box plot · violin · strip/beeswarm (beeswarm jitter = **physics
      collision resolution** ⚡ — points physically push apart)
- [ ] **P0** Pie/donut (arc primitives; animated slice sweep)
- [ ] **P0** Bubble chart (size channel) · heatmap (matrix cells) · 2D histogram/hexbin
- [ ] **P1** Contour plot: line contours + filled bands + **labeled** contours
      (reuse marching squares; labels = billboarded MathTex)
- [ ] **P1** Regression: linear, polynomial, exponential, logistic, power — with
      `R²`, residual plot toggle, confidence band
- [ ] **P1** Candlestick/OHLC · waterfall · funnel · radar/spider · polar histogram (wind rose)
- [ ] **P1** Ternary plot · parallel coordinates · scatterplot matrix (facets)
- [ ] **P2** Sankey (flow ribbons = variable-width stroke ⚡, phase-0 taper task)
- [ ] **P2** Treemap · sunburst · dendrogram · calendar heatmap
- [ ] **P2** Network/graph plots → see §F (force layout via physics ⚡)
- [ ] **P2** Gauge/bullet indicators (analytic chrome for dashboards)

### B. Dynamic geometry — JSXGraph/GeoGebra parity, then beyond

**Points** — ✓ free/draggable, glider, intersection, midpoint, centroid
- [ ] **P0** Circumcenter, incenter, orthocenter, excenters, Euler line, nine-point circle
- [ ] **P0** Weighted barycenter (drag weights = sliders)
- [ ] **P1** Point from polar/parametric coords; lattice snap point

**Lines & circles** — ✓ line-through, perpendicular, parallel, circumcircle
- [ ] **P0** Perpendicular bisector · angle bisector · median/altitude · tangent
      to circle/curve at point · tangents from external point
- [ ] **P0** Circle by 3 points · by diameter · incircle · excircles
- [ ] **P1** Radical axis · polar/pole · common tangents · Apollonius circle
- [ ] **P1** **Conics as constructions**: ellipse from 2 foci (drag foci, string
      definition animated), hyperbola, parabola from focus+directrix, conic
      through 5 points — all live

**Transforms** — ✓ reflection
- [ ] **P0** Rotation, translation, dilation/homothety (drag center + k slider)
- [ ] **P1** Glide reflection · transform composition (visible intermediate ghosts)
- [ ] **P1** **Circle inversion** + Möbius transforms (Cinderella's crown jewel —
      generalized circles stay generalized circles; our analytic circles make
      this exact, not tessellated) ⚡
- [ ] **P2** Projective maps, cross-ratio readout, homogeneous-coordinate mode
      (JSXGraph parity)

**Modes & machinery**
- [ ] **P0** **Trace** per object (drag → locus trail, fading)
- [ ] **P0** **Locus curve** — the full locus of a dependent point as a free
      point sweeps (GeoGebra killer feature; sample + fit to our Bézier contours)
- [ ] **P0** Drag constraints: horizontal/vertical lock, snap-to-grid, snap-to-angle
- [ ] **P0** Live measurements as labels: length, angle°, area, slope, radius
- [ ] **P1** **Construction protocol** — ordered step list, replay/step-through
      with play button (GeoGebra parity, great for teaching)
- [ ] **P1** Regular n-gon (n slider, morphs as n→∞ to circle ⚡)
- [ ] **P1** Sector, angle mark with arc + label, mark congruence ticks
- [ ] **P2** Macro constructions / user-defined tools
- [ ] **P2** Compass-and-straightedge "game mode" (Desmos Geometry parity)
- [ ] **P2** Spherical geometry on the true-3D sphere (great circles, spherical
      triangles with angle sum > 180°) ⚡ — nobody renders this live & sharp

### C. Statistics & probability suite

- [ ] **P0** Distribution library: normal, binomial, Poisson, exponential,
      uniform, geometric, χ², t, F — PDF/CDF curves with parameter sliders
- [ ] **P0** Sampling: draw n samples → dots + histogram build live
- [ ] **P1** **CLT animation**: means of k samples histogram converging to normal
      as n grows (slider drives both)
- [ ] **P1** **Galton board** ⚡ — pegs + balls through **box3d**, pile forms the
      binomial → normal. *The* physics-showcase demo.
- [ ] **P1** Random walks 1D/2D, Brownian motion, diffusion limit
- [ ] **P1** Monte Carlo π (animated darts, running estimate readout) · Buffon's needle
- [ ] **P1** Correlation playground: drag scatter points, live `r`, regression
      updates; Anscombe's quartet one-click
- [ ] **P2** Confidence-interval visualizer (drag n → CI width; repeated-sampling animation)
- [ ] **P2** Hypothesis testing: two distributions, draggable μ, p-value shading
- [ ] **P2** Markov chains: state graph + animated probability flow (ties §F)

### D. Linear algebra (3Blue1Brown tier)

- [ ] **P0** **Matrix transforms the plane**: grid + basis vectors morph under
      `A` (sliders for entries) — the signature 3b1b shot, but *interactive*
- [ ] **P0** Determinant as parallelogram area (signed, animated through 0 = collapse)
- [ ] **P1** Eigenvectors as invariant lines (drag matrix, lines persist)
- [ ] **P1** Matrix multiplication as composition (two grids, ghost intermediate)
- [ ] **P1** Dot product as projection · cross product as parallelepiped volume (3D ⚡)
- [ ] **P2** Change of basis (dual grids) · Gram–Schmidt animation · SVD as
      rotate–scale–rotate · rank/nullspace shading
- [ ] **P2** 3D linear maps: plane images, kernel line, in the true-3D world ⚡

### E. Graph theory & networks

- [ ] **P1** Named graphs: Petersen, Kₙ, Cₙ, grids, trees, random G(n,p)
- [ ] **P1** **Force-directed layout via box2d springs** ⚡ — drag nodes, layout
      physically settles (d3 parity but with real dynamics + 3D layouts: nodes
      at different heights)
- [ ] **P1** Algorithm animations: BFS/DFS wavefront, Dijkstra shortest path,
      Kruskal/Prim MST, greedy coloring — step or play
- [ ] **P2** Eulerian path drawing (pen traces edges) · adjacency-matrix linked
      view (click cell → highlight edge) · PageRank flow

### F. True 3D catalog (on `mesh3d` + orbit camera)

- ✓ Surface `z=f(x,y)` (true mesh, Gouraud, depth-tested, occludes 2D content)
- [ ] **P0** Billboarded crisp axis labels (pending sprint item — needs per-instance Z)
- [ ] **P0** Parametric surfaces `S(u,v)`: torus, Möbius band, helicoid, catenoid,
      Enneper, ellipsoid, sphere — with u/v range sliders that **morph the mesh live**
- [ ] **P0** Space curves `C(t)`: helix, torus knots `(p,q)`, 3D Lissajous — as
      analytic tubes (stroke engine extruded ⚡). Foundation (D26): the
      **depth-write pipeline variant** (opaque 3D analytic content self-occludes
      inside the single draw call via per-vertex z) + **adaptive screen-space
      subdivision** (perspective-projected Béziers are rational, not quadratic;
      subdivide until the midpoint's projected chord deviation is sub-pixel).
      Flat stroke-ribbon segments first; N-gon tubes follow.
- [ ] **P1** **Implicit surfaces** `f(x,y,z)=0` via marching cubes (worker thread),
      smooth-shaded; gyroid showcase — **sampled content** (§5 carve-out):
      adaptive tessellation + silhouette refinement, labeled as such
- [ ] **P1** **Solid of revolution**: 2D curve swept about an axis — animated
      sweep with ghost profile ⚡ (the 2D→3D story made literal)
- [ ] **P1** Slicing plane: draggable cross-section of any surface/volume, contour
      drawn *in* the plane + projected on the floor (linked views)
- [ ] **P1** Tangent plane + normal vector at a draggable surface point; gradient
      ascent/descent path animated on the surface
- [ ] **P1** 3D scatter/point cloud (instances as elevated dots) · 3D bars (columns)
- [ ] **P1** 3D vector field: arrows in space, streamtubes/cones on a seed line
- [ ] **P2** Quadric gallery with classification (drag coefficients through the
      discriminant — watch a hyperboloid split into a cone)
- [ ] **P2** Spherical/cylindrical coordinate grids + coordinate-transform morphs
- [ ] **P2** **4D → 3D projection** (MathBox territory): rotating tesseract,
      4D rotation planes, stereographic — our depth buffer makes this coherent ⚡
      (edges rendered as analytic tubes where feasible; projected faces are
      **sampled content** per §5)
- [ ] **P2** Volume rendering (raymarch pass) — stretch; **sampled content**
      per §5; analytic edges on raymarched interiors would be a first

### G. Continuous 2D↔3D — the signature differentiator ⚡

No engine does this. Rule: **there is no 3D mode.** Every object carries an
animatable elevation/extrusion; the camera tilt is continuous (`tilt(polar)`
already exists in the FX ctx); representations morph, never switch.

- [ ] **P0** **Per-Mobject `elevation` + `extrude`** — flat shape → prism with
      analytic side walls + lit top face (reuse `LIGHT_DIR`/colormap shading).
      Zero at rest; any animation can drive it.
- [ ] **P0** **Glyph height** — any text/label/math can extrude (the IDE
      fireworks/logo effect generalized: `fxXforms` already carries per-instance
      `rotX/rotY/z/scale`; promote to a first-class Mobject property, not FX-only)
- [ ] **P0** Continuous camera: 2D board ↔ tilted orbit with no snap (extend the
      🗻 transition to *every* board; double-tap toggles)
- [ ] **P1** **Representation morphs** (same data, no cut):
      bars ↔ 3D columns · scatter ↔ point cloud · line ↔ ribbon ↔ tube ·
      heatmap cells ↔ height field (cells rise to their values) ·
      pie ↔ donut ↔ cylinder segments
- [ ] **P1** **Contours → surface**: level curves lift to their heights and a
      skin interpolates between them as the slider sweeps (the single most
      "only we can do this" animation in the plan)
- [ ] **P1** `y=f(x)` ribbon → `z=f(x,y)` surface morph (extrude along z while
      the function gains a second argument)
- [ ] **P1** ~~**Analytic contact shadows** of elevated objects on the ground plane
      (soft penumbra via the same coverage integral — sharp shadow edges at any zoom)~~
      — **CULLED 2026-07-31: user found shadows "rather stupid"; the whole shadow
      feature (analytic blobs + depth-mapped cast shadows) was removed.**
- [ ] **P2** 2.5D layering: boards at different z, focus/depth cues
- [ ] **P2** Time as the 3rd axis: `y=f(x,t)` → surface where z=time, with a
      sweeping slice line linked to the live 2D curve

### H. Physics integration (box3d) ⚡

`src/ide/fx/physics.ts` already turns glyphs into rigid bodies; generalize that
machinery (body-per-mobject, clip planes, sleep/dormancy, reassembly) to
windgraph objects so graphs have *weight*.

- [ ] **P0** **Physics mode per board**: gravity toggle; bars become boxes, dots
      become circles, curves become segment chains (rope) — then **reassembly**
      (bodies seek home transforms, as physics.ts already does)
- [ ] **P0** **Shatter/burst on events** (fireworks pattern): root found → spark
      burst at intersection; proof complete → construction explodes & rebuilds
- [ ] **P1** **Galton board** (§C) — the flagship physics demo
- [ ] **P1** **Spring aesthetics**: sliders with spring feel; rubber-band
      selection; elastic drag of gliders (overshoot + settle via critically
      damped springs, also as new easing family)
- [ ] **P1** Balls rolling on surfaces: gradient descent with real dynamics on
      `z=f(x,y)` — pair with the authoring system's loss-surface scene
- [ ] **P1** **Physics beeswarm**: overlapping scatter dots resolve by collision
      (strip/beeswarm charts for free, §A)
- [ ] **P2** Ragdoll curves: polyline goes limp, then shape-matches back
- [ ] **P2** Zero-g mode: points float with momentum; grab-and-throw
- [ ] **P2** Deterministic physics replay: seeded RNG + fixed substep so the
      timeline can scrub physics-driven animations backwards
- [ ] **P2** Wind/fields: vector-field plots *push* particles (field visualization
      by advection — streamlines made of actual moving dots)

### I. Interaction & tool chrome (Desmos UX parity)

- ✓ Draggable free points · gliders · live constraint recompute · orbit camera
- [ ] **P0** **Hover tooltips**: value readout on any curve/point/surface
      (analytic rounded-rect + text, camera-facing)
- [ ] **P0** **Crosshair + trace**: pointer x → moving dot on every plotted
      curve + coordinate readout (Desmos core UX)
- [ ] **P0** **Sliders**: min/max/step, play/loop/ping-pong, speed; any free
      variable auto-becomes one
- [ ] **P0** **Undo/redo** stack over construction mutations
- [ ] **P0** Selection: click, box, lasso; multi-select; delete/duplicate
- [ ] **P1** **Expression sidebar** (Desmos-style): list of objects/expressions,
      visibility eye, color chip, lock, inline edit (click label → edit formula)
- [ ] **P1** Object inspector: style panel (stroke width, dash, color, fill opacity)
- [ ] **P1** Snapping: to grid, to object, to intersection (magnet cursor)
- [ ] **P1** Context menu per object (edit, style, trace on, physics on, export)
- [ ] **P1** **Ticker/actions** (Desmos): `on click`, `on tick` rules driving
      variables — the bridge to physics triggers (§H)
- [ ] **P1** **Linked views / brushing**: select points in the scatter → same
      rows highlight in the histogram, contour, and 3D cloud ⚡ (no raster tool
      links across 2D/3D like this)
- [ ] **P1** Keyboard: arrows nudge selection, Tab cycles objects, space plays
- [ ] **P2** **Accessibility** (JSXGraph parity + beyond): ARIA live-region
      narration of the construction ("A at (1,2); circumcircle radius 1.4"),
      full keyboard construction, high-contrast palette, sonification of slope
      (pitch while tracing a curve)
- [ ] **P2** Presentation mode: step through the construction protocol (§B) with
      captions; presenter notes
- [ ] **P2** Randomize button for stochastic demos; URL serialization of board state

### J. Animation engine extensions (Manim parity + interactivity)

- ✓ Timeline (sequence/parallel), easing library, morph, updaters, CameraRig
- [ ] **P0** **Scrub bar + loop/ping-pong** over any timeline; drag to scrub
- [ ] **P0** Stagger/group animations (per-element delay waves)
- [ ] **P1** **Spring easing family** (under/critically damped) as first-class easings
- [ ] **P1** Partial surface reveal: radial/sweep/contour-rise unveilings ⚡
- [ ] **P1** Animation → physics handoff: a morph ends and the object *falls*
      (§H); a Create finishes and the curve has momentum
- [ ] **P1** Camera keyframes: position/tilt/roll tracks with easing (extend
      CameraRig into a full crane)
- [ ] **P2** "Explain mode": auto-annotated steps (tangent appears, label types
      itself via Write-on, value counts up)
- [ ] **P2** Deterministic record/replay of interactive sessions (for the
      e-assessment hooks, JSXGraph parity)

### K. Math typesetting extensions

- ✓ Fractions, scripts, radicals, Greek, big ops with limits, spacing, Write-on
- [ ] **P0** **Matrices + growing delimiters** `\left(…\right)` (listed stretch — promote)
- [ ] **P0** `\begin{cases}` piecewise brace (pairs with §A piecewise functions:
      the rendered formula *is* the plot definition)
- [ ] **P1** `align`/`align*` multi-line, equation numbers
- [ ] **P1** Accents: `\hat \bar \vec \tilde \dot`; overbrace/underbrace with labels
- [ ] **P1** Arrows: `\xrightarrow[text]{}` extensible reaction arrows
- [ ] **P1** **Formula↔graph binding**: click `a` in `f(x)=ax²` → attaches a
      slider (Desmos magic, but with real LaTeX quality) ⚡
- [ ] **P2** mhchem-style chemistry · units (`\si`) · SI number formatting

### L. Expression engine (Desmos-class calculator)

- [ ] **P0** Parser: `y=…`, `r=…`, `(x(t),y(t))`, inequalities, piecewise
      `{x>0: x, x^2}`, lists `[1…10]`, Σ/Π, subscripted variables `y₁`
- [ ] **P0** Live dependency graph — **reuse `ConstraintGraph`**: expressions are
      GObjects; topo-recompute on every keystroke
- [ ] **P0** Auto-slider for every free variable; named constants
- [ ] **P1** Stats functions: `mean, median, stdev, quantile, nCr, nPr`
- [ ] **P1** Regressions `y₁ ~ mx₁ + b` (§A)
- [ ] **P1** **Symbolic differentiation (lite CAS)**: power/product/chain/trig
      rules → exact `f'` formula shown next to the numeric trace (GeoGebra-CAS
      lite; numeric fallback for anything else)
- [ ] **P2** Symbolic integration table (pattern-matched) · `Root`/`Extremum`
      commands (numeric solvers, GeoGebra parity)
- [ ] **P2** JessieCode-style scripting → instead: **authoring-system DSL**
      (the sprint's declarative TS builder *is* our scripting layer; expose it
      in the REPL with windgraph objects as builtins)

### M. Export, interop, ecosystem

- [ ] **P0** SVG export (contours are already Béziers — near-free) · PNG (GPU readback)
- [ ] **P0** Copy-expression-as-LaTeX · board-state URL serialization
- [ ] **P1** PDF export · WebM/GIF animation capture (frame-sequence encoder)
- [ ] **P1** **TikZ/pgfplots codegen** (GeoGebra parity — our Béziers → `plot` coords)
- [ ] **P1** CSV/JSON drag-and-drop import → auto scatter/line/bars
- [ ] **P2** **glTF export of the 3D scene** (nobody exports live-sharp math to
      3D formats) ⚡ · embeddable web component · headless node render for docs
- [ ] **P1** Gallery: 50+ example boards, each a playground button (extend
      `src/playground/boards/`); tutorial pages rendered *as windfoil documents*
- [ ] **P1** **The windgraph demo IS the API reference** ⚡: one catalog board
      that renders EVERY IR kind (A–E + K plot kinds + F3D 3D primitives) as a
      browsable grid, each entry with an inspect panel showing its SceneDoc
      spec (JSON) + emitted TS + draggable/slider bindings. `plotGalleryDoc()`
      (OQ-10) is its foundation; X2 unifies the per-lane boards under it.
      "All possible plots in one demo" is a first-class deliverable, not an
      afterthought — it doubles as the typed API's visual docs (M "Public
      typed API").
- [ ] **P1** Public typed API + typedocs (phase-8 item, keep)

### N. Performance & quality bar (cross-cutting)

- [ ] **P0** Dirty-tracking: slider drag recomputes only dependent subgraph
      (ConstraintGraph already gives the dependency set)
- [ ] **P0** Geometry caching + incremental re-tessellation (TODO.md item, keep)
- [ ] **P1** Marching squares/cubes in a worker; incremental iso-update on slider
- [ ] **P1** Benchmarks as boards: 10k-segment curve @60fps, 5k-point scatter
      @60fps, 200 live sliders — acceptance gates per phase
- [ ] **P1** GPU picking for dense scenes (color-id pass) beyond current hit-test
- [ ] **P2** LOD for far boards in the 3D world (extend existing frustum culling
      to detail culling)

---

## 3. Deep dive — how the unique pieces fit the existing code

**Glyph height is already half-built.** `windfoil.wgsl` consumes `fxXforms`
(two `vec4f` per instance: `rotX, rotY, z, scale` + extras) whenever `fxActive`
is set — fireworks.ts and physics.ts drive it today. The v2 move: promote this
from FX-only to a **Mobject-level property** (`elevation`, `extrude`,
`faceTilt`), emitted per instance by `windgraph` boards exactly like FX does,
so any label, dot, or bar can rise without the FX system being active.

**Extruded shapes.** A polygon with `extrude>0` emits: top face (existing
`polygonQuads`, offset by z), side walls (per-edge quads into the `mesh3d`
pipeline or as analytic fills with per-instance z), lit with the existing
`LIGHT_DIR` Gouraud term. Because coverage is analytic, the silhouette edge of
an extruded prism stays razor-sharp at grazing angles — no tessellation seam.

**Physics for graphs.** `physics.ts`'s shard machinery (body per instance,
`clip` planes, home transforms, sleep/dormancy, `byBKey` reassembly) is generic.
Wrap it: `PhysicsBoard` maps windgraph Mobjects → bodies (bars→boxes, dots→
circles, polylines→segment chains with joint constraints). "Shatter" = spawn
bodies from current instances (fireworks already does instance cloning via
`extraFA/extraXF`); "rebuild" = drive bodies toward home transforms (physics.ts
already homes shards). Galton board is just static peg bodies + circle balls +
a histogram that counts landings.

**Continuous 2D↔3D.** The camera already tilts continuously (`ctx.tilt(polar)`,
🗻 demo). What's missing is *content* that responds continuously: §G's
elevation/extrude parameters + representation morphs (which reuse the existing
`Transform` path-correspondence morph for the 2D side and the mesh3d pipeline
for the 3D side, cross-fading geometry weight rather than switching pipelines).

---

## 4. Suggested phase plan (windgraph v2)

| # | Phase | Beats | Depends on |
|---|---|---|---|
| V1 | Expression engine + sliders + tooltips + crosshair trace (§L, §I core) | Desmos core | ConstraintGraph reuse |
| V2 | Geometry catalog completion: conics, locus, trace, protocol replay, snapping (§B) | JSXGraph/GeoGebra | V1 sliders |
| V3 | Stats suite + chart catalog: histogram, box/violin, regression, contour, heatmaps (§A, §C) | Plotly | V1 |
| V4 | Calculus suite: tangents, accumulation, Taylor/Fourier, ODE/phase portraits (§A calc) | GeoGebra/Manim | V1 |
| V5 | Continuous 2D↔3D: elevation/extrude, glyph height, shadows, representation morphs (§G) | **nobody** | mesh3d, fxXforms promotion |
| V6 | Physics playground: shatter/rebuild, springs, Galton board, rolling balls (§H, §C) | **nobody** | V5 + box3d wrapper |
| V7 | 3D catalog: parametric/implicit surfaces, solids of revolution, slicing, 3D fields (§F) | Plotly/GeoGebra 3D | V5 |
| V8 | Linear algebra + graph theory + networks (§D, §E) | 3b1b/d3 | V6 (springs) |
| V9 | Chrome: undo, inspector, a11y, ticker/actions, linked brushing (§I rest, §J) | Desmos/JSXGraph | V1–V4 |
| V10 | Export breadth + gallery + API + perf gates (§M, §N) | everyone | all |

**Ordering logic:** V1–V4 are parity (each independently shippable as boards);
V5–V6 are the moat; V7–V8 ride the moat; V9–V10 make it a product.

---

## 5. Acceptance bar (unchanged from sprint/README.md, extended)

- Razor-sharp at 1000× zoom — including extruded silhouettes and shadow edges —
  for all **analytic content**: strokes, fills, glyphs, math, chart chrome,
  Bézier curves, contour lines, and shadow *edges*. This is the contract.
- **Sampled-content carve-out.** Inherently discretized features (marching-cubes
  implicit surfaces, volume raymarching, 4D→3D projections, point-splat
  bifurcation diagrams, fractal interiors) do NOT claim the analytic guarantee.
  They are explicitly labeled "sampled" in UI/docs, get adaptive tessellation +
  silhouette refinement so edges degrade gracefully under zoom, and may be
  composited with analytic overlays (axes, contour lines, labels) that *do*
  stay sharp. The headline pitch ("zero aliasing, any zoom") refers to the
  analytic pipeline; sampled features are honest exceptions, never faked.
- One draw call for the 2D pass; 3D shares the depth-tested world.
- No snapping anywhere: every mode change is an animatable parameter.
- Physics is deterministic under scrub (seeded, fixed substep) or it doesn't
  ship in timelines.
- Every phase ends with a board in `src/playground/boards/` + a cinematic
  flight shot proving it.
