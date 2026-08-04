# windgraph v2 — Sprint Execution Plan

> **2026-08-04 update (NOTES D38):** positioning and architecture superseded —
> the goal is **the best math + animation library for the web** (pedagogical,
> better than Manim: interactive, real-time, sharp, exportable), not a
> uniqueness moat; and there is **no analytic 3D pipeline** (windfoil analytic
> = 2D content, mesh3d = all 3D bodies). Read "moat" below as "flagship
> quality demos". D2's ordering (flagships before parity) stands.

Companion to `WINDGRAPH.md` (feature surface) and the critique of it. This is
the execution plan: phased, moat-first, structured for autonomous agent churn
with a small number of human feel-checkpoints.

---

## 0. Execution contract

1. **The agent churns.** Tasks run back-to-back without stopping. After each
   task: `bunx tsc --noEmit`, run any `__test_*.ts` in touched modules, self-
   verify what is verifiable headlessly. Never stop to ask "should I continue?"
2. **The only stops are 🔍 checkpoints.** Each checkpoint names: the URL hash
   or board button, the exact actions to perform, what it should *feel* like,
   and what to report back (feel, bugs, taste verdict). No checkpoint is a
   status update — every one is a judgment call only the user can make.
3. **One task = one bounded diff** (one module + its board/demo). If a task
   balloons, split it and keep going; don't stop to ask.
4. **Substrate rule.** `windfoil.wgsl`, `mesh3d.ts`, `frame.ts`,
   `ConstraintGraph`, and the authoring IR are shared substrate — tasks
   touching them run sequentially, never in parallel lanes.
5. **No commits unless asked. No new npm deps. No comments unless the file
   already has them. Targeted edits, never file overwrites.** (Repo rules.)
6. **Checkpoints are ~7 across ~120 tasks.** If review starts lagging at a
   checkpoint, the response is to slow the next fan-out, not to skip the stop.

---

## 1. Architecture decision (locked, settles islands vs. primitives)

| Content kind | Nature | Home | Examples |
|---|---|---|---|
| **Object-like** | typed parameters, identity, draggable/measurable/serializable, per-object animation | **windgraph primitives**: new `ObjectSpec` kinds in the authoring IR → `Mobject` instances via an object-resolver (the `oldsprintplan/SPRINT.md` design that was never built) | points, segments, circles, conics, plots, surfaces, labels, math, constraint constructions |
| **Field-like** | per-pixel / procedural, no sub-object identity | **islands / shader passes** (existing escape hatch) | sdfField, coverageSweep, domain coloring, Mandelbrot/Julia, volume raymarch |
| **Hosting** | board slot, `DrawHelpers`, `s.interactive` input routing, gallery | **island plumbing, reused** — a windgraph scene is a board that hosts primitive objects | windgraph board adapter |

Consequences:
- The authoring IR gains windgraph `ObjectSpec` kinds; `builder/objects.ts`,
  `builder/clips.ts`, `runtime/object-resolver.ts` get built as originally
  designed. Sliders bind to spec parameters; `emitTS` projects them; the REPL
  edits them; chrome inspects them; timeline clips animate per-object.
- `ConstraintGraph` scenes live in the board adapter; free points are dragged
  through the existing `s.interactive` contract → `DragController`.
- Math-flavored islands (`gdCurve`, `lineFit`, `lossContour`, `network`) are
  misfiled procedural demos → migrated to primitives in Phase 6 cleanup.

---

## Phase 0 — Substrate repair (sequential, 4 tasks)

| # | Task | Files |
|---|---|---|
| 0.1 | Split `runtime/runtime.ts` (62KB) into focused files (draw-emit, input, object-tree, orbit) — behavior-identical, tests green | `src/authoring/runtime/` |
| 0.2 | Fix stale docs: `AGENTS.md` active-sprint line, `PROGRESS.md` FX-sprint section | root docs |
| 0.3 | Fix `WINDGRAPH.md` §5: analytic-AA contract covers 2D content (strokes/fills/glyphs/math/chrome); sampled 3D (marching cubes, raymarch, 4D projection) gets adaptive tessellation + silhouette refinement and is explicitly labeled | `WINDGRAPH.md` |
| 0.4 | Integration note: primitives-vs-islands table above + `ObjectSpec` kind list + board-adapter contract, as the header of the Phase 1 work | `src/authoring/ir/windgraph-specs.md` (or header in `types.ts`) |

**🔍 CP1 — regression smoke.** `#authoring`, `#explainer-v2`, `#islands`,
`#pages`, playground flight all behave exactly as before. Report: anything
that feels off, else "clear".

---

## Phase 1 — windgraph as IR primitives (sequential, 6 tasks)

Builds the layer `oldsprintplan/SPRINT.md` designed but never shipped.

| # | Task | Deliverable |
|---|---|---|
| 1.1 | `ir/types.ts`: windgraph `ObjectSpec` kinds (point, segment, polygon, circle, arc, vector, plot-fn, plot-parametric, plot-implicit, surface, label, math, group) + typed parameter schemas; `validate.ts` coverage; IR tests | specs round-trip JSON |
| 1.2 | `runtime/object-resolver.ts`: ObjectSpec → windgraph `Mobject` instances; parameter updates re-resolve incrementally | unit test: spec tree → mobject tree |
| 1.3 | `builder/objects.ts` + `builder/clips.ts`: builder methods for every kind; `AnimationClip` → windgraph `Animation` subclass mapping (Create/Fade/Transform/MoveAlongPath) | builder tests |
| 1.4 | Windgraph board adapter: hosts a `ConstraintGraph` scene, emits via `DrawHelpers`, routes pointer → `DragController` through `s.interactive` | board: authored triangle + circumcircle, drag a vertex live |
| 1.5 | Slider binding: free numeric parameter in any spec → live slider; `emitTS` projection for the new kinds | board: `y = a·sin(x)` authored in SceneDoc, slider drives `a` |
| 1.6 | REPL: `plot`, `point`, `drag`, `slider`, `anim` commands over the live scene | REPL session drives the board |

**🔍 CP2 — the drag feel.** Grab a vertex in the authored scene; circumcircle
recomputes live; scrub the `a` slider; type a REPL command. Report: does
direct manipulation feel as good as the Phase-5 interact demo? This decides
whether the adapter contract holds.

---

## Phase 2 — Moat foundation (sequential — shader/camera substrate, 5 tasks)

| # | Task | Deliverable |
|---|---|---|
| 2.1 | Promote `elevation`/`extrude`/`faceTilt` from FX-only (`fxXforms`) to `Mobject` properties, emitted per instance by windgraph boards without `fxActive` | any mobject rises at rest |
| 2.2 | Extrude renderer: top face (existing `polygonQuads` offset by z) + side-wall quads through `mesh3d`, lit with existing `LIGHT_DIR` Gouraud | board: square extrudes 0→h on slider, silhouette stays sharp at 1000× |
| 2.3 | Glyph/math extrusion: generalize the fireworks/logo per-instance 3D to `MathTex` + `Label` | board: extruded LaTeX headline, tilts with camera |
| 2.4 | Continuous camera tilt generalized from 🗻 to any board (double-tap toggle, no snap) | any 2D board lifts into orbit and back |
| ~~2.5~~ | ~~Analytic contact shadows~~ — **CULLED 2026-07-31: user found shadows "rather stupid"; the entire shadow feature (analytic blobs + depth-mapped cast shadows) was removed** | ~~extruded square casts soft shadow~~ |

**🔍 CP3 — the 3D feel.** Extrude slider, tilt toggle, orbit drag, 1000× zoom
on a silhouette edge. Report: does 2D↔3D read as *one continuous space* or as
a mode switch? This is the thesis of the whole plan — kill it here if it
doesn't feel right, before 100 tasks assume it does.

---

## Phase 3 — The moat (two parallel lanes, 11 tasks)

Lanes G and H touch disjoint modules (G: mobject/mesh emit; H: physics
wrapper over `src/ide/fx/physics.ts` machinery) — run concurrently.

### Lane G — continuous 2D↔3D (6 tasks, depends on Phase 2)

| # | Task | Board |
|---|---|---|
| G1 | Bars ↔ 3D columns morph (same instances, elevation animates) | `bars_to_columns` |
| G2 | Scatter ↔ point cloud · heatmap cells ↔ height field (cells rise to value) | `scatter_cloud_heatmap` |
| G3 | Pie ↔ donut ↔ cylinder segments morph | `pie_to_cylinder` |
| G4 | `y=f(x)` ribbon → `z=f(x,y)` surface morph (function gains an argument while extruding) | `ribbon_to_surface` |
| G5 | **Contours → surface**: `plotImplicit` level curves lift to their heights, skin interpolates between them on one slider | `contour_lift` — flagship |
| G6 | Cinematic flight capture of G5 + camera keyframe polish | flight shot |

**🔍 CP4 — flagship #1.** Scrub the contour-lift slider slowly, then orbit it,
then zoom into the skin. Report: is this the "nobody else can do this" shot?
Taste verdict: launch-worthy / needs-work (say what) / wrong idea.

### Lane H — physics (5 tasks, depends on Phase 1 adapter)

| # | Task | Board |
|---|---|---|
| H1 | `PhysicsBoard`: generic Mobject→body mapping (bars→boxes, dots→circles, polylines→chains) + home-transform reassembly (generalize `physics.ts` shard machinery) | `shatter_rebuild` |
| H2 | Event-triggered bursts (root found → spark pattern from `fireworks.ts` at the intersection) | `event_burst` |
| H3 | Spring easing family (under/critically damped) as first-class easings + elastic glider drag | `spring_gallery` |
| H4 | **Galton board**: static peg bodies + circle balls → pile forms binomial→normal, live histogram counts landings | `galton_board` — flagship |
| H5 | Physics beeswarm (collision-resolved strip jitter) + ball rolling on `z=f(x,y)` with real dynamics | `beeswarm_gradient` |

**🔍 CP5 — flagship #2.** Drop 500 balls; watch the normal curve emerge; grab
and throw a ball. Report: does it feel like *physics* or like a simulation of
physics? Launch verdict as CP4.

**Milestone: after CP4+CP5 the project has two genuinely novel demos even if
nothing else ships. Deliberate pause point.**

---

## Phase 4 — Parity fan-out (5 parallel lanes, 49 tasks)

Disjoint modules → full parallel churn; user reviews in one batch per lane at
the phase checkpoint. Task lists follow `WINDGRAPH.md` §2 priorities; each
task ships one board.

- **Lane A — plot catalog (18):** A1 piecewise · A2 inequality shading ·
  A3 sequences/cobweb · A4 splines + draggable ctrl pts · A5 tangent/normal +
  live f′/f″ · A6 accumulation function · A7 Riemann→trap→Simpson ·
  A8 streamlines · A9 ODE + phase portraits · A10 bifurcation · A11 Fourier +
  epicycles · A12 histogram auto-bin · A13 box/violin/beeswarm ·
  A14 pie/bubble/heatmap/hexbin · A15 labeled contours · A16 regression suite +
  residuals · A17 candlestick/waterfall/funnel/radar/wind-rose ·
  A18 ternary/parallel-coords/SPLOM
- **Lane B — geometry (12):** B1 triangle centers + Euler line + 9-pt circle ·
  B2 bisectors/tangents · B3 circle constructions · B4 radical axis/polar/
  Apollonius · B5 live conics (2-foci ellipse, focus+directrix parabola) ·
  B6 rotation/translation/dilation · B7 circle inversion + Möbius ·
  B8 trace + **locus curve** · B9 drag constraints/snaps · B10 measurement
  labels · B11 construction-protocol replay · B12 regular n-gon → circle morph
- **Lane C — stats/probability (7):** C1 distribution library · C2 live
  sampling→histogram · C3 CLT animation · C4 random walk/Brownian · C5 Monte
  Carlo π + Buffon (reuses H-lane physics) · C6 correlation playground +
  Anscombe · C7 CI / hypothesis-test visualizer
- **Lane D — linear algebra (6):** D1 matrix-transforms-the-plane ·
  D2 determinant-as-area · D3 eigenvector invariant lines · D4 multiplication
  as composition · D5 dot/cross (3D parallelepiped) · D6 basis change /
  Gram–Schmidt / SVD
- **Lane K — math typesetting (6):** K1 matrices + growing delimiters ·
  K2 `\cases` · K3 align/align* · K4 accents + over/underbrace · K5 extensible
  arrows · K6 formula↔graph binding (click coefficient → slider, via Phase 1
  spec parameters)

**🔍 CP6 — gallery browse.** One session: user flies the gallery, opens any 5
boards, drags things. Report: which boards feel weak, which to cut, which to
keep polishing. Cull the backlog based on this — not everything in Phase 5/6
has to survive contact with this verdict.

---

## Phase 5 — Depth (4 lanes, 27 tasks)

- **Lane F3D — 3D catalog (9, needs Phase 2):** parametric surfaces with live
  u/v morph · space curves as analytic tubes · implicit surfaces (marching
  cubes, worker; **labeled "sampled" per §5 carve-out**) · solid of revolution
  with ghost profile · slicing plane + linked cross-section · tangent plane +
  gradient path · 3D scatter/bars · 3D vector field/streamtubes · quadric
  gallery with discriminant morph
- **Lane L — expression engine + lite CAS (7, needs Phase 1):** full parser
  (lists, Σ/Π, subscripts, piecewise) → ConstraintGraph GObjects · stats
  functions · `y₁ ~ mx₁+b` regressions · symbolic differentiation (pattern
  rules) · integration table · Root/Extremum solvers · REPL exposure via the
  authoring DSL
- **Lane E — graph theory (5, needs H3):** named graphs · force-directed
  layout via spring physics · BFS/DFS/Dijkstra wavefronts · Kruskal/Prim ·
  Eulerian trace + adjacency-matrix linked view
- **Lane J — animation extensions (6):** scrub bar + loop/ping-pong · stagger
  groups · partial reveal (radial/sweep/contour-rise) · animation→physics
  handoff (morph ends, object falls) · camera keyframe tracks · explain-mode
  auto-annotation

**🔍 CP7 — depth check, batched.** Implicit-surface gyroid under zoom (verify
the sampled-content labeling reads honestly), expression engine typing feel,
force-layout grab-and-throw. Report per lane: ship / fix / cut.

---

## Phase 6 — Product surface (3 lanes + cleanup, ~20 tasks)

- **Lane I — chrome (10, threaded but sequenced here):** hover tooltips ·
  crosshair + trace · expression sidebar · inspector/style panel · undo/redo ·
  selection (click/box/lasso) · snapping · context menu · ticker/actions ·
  linked views/brushing across 2D↔3D
- **Lane M — export (6):** SVG/PNG · copy-as-LaTeX + URL state · PDF/WebM/GIF
  capture · TikZ codegen · CSV/JSON import · glTF export of the 3D scene
- **Lane N — perf gates (acceptance, not tasks):** dirty-tracking on slider
  drag (ConstraintGraph dependency sets) · geometry caching · GPU picking for
  dense scenes · benchmark boards: 10k-segment curve, 5k-point scatter,
  200-slider scene, all @60fps
- **Cleanup:** migrate `gdCurve`/`lineFit`/`lossContour`/`network` islands to
  windgraph primitives; retire their island registrations; gallery unification

**🔍 CP8 — final.** Full flight: authored SceneDoc scene with sliders →
contour lift → Galton drop → orbit → SVG export. Verdict: done / not done.

---

## 2. Checkpoint index

| CP | After | What the user feels | Gate power |
|---|---|---|---|
| CP1 | Phase 0 | nothing regressed | clear / fix |
| CP2 | Phase 1 | direct manipulation of authored objects | adapter contract holds? |
| CP3 | Phase 2 | continuous 2D↔3D, extrusion, shadows | **kill-or-continue the thesis** |
| CP4 | G5–G6 | contour→surface flagship | launch-worthy? |
| CP5 | H4 | Galton board flagship | launch-worthy? |
| CP6 | Phase 4 | parity gallery breadth | cull the backlog |
| CP7 | Phase 5 | depth features | ship/fix/cut per lane |
| CP8 | Phase 6 | the whole product | done? |

## 3. Parallelism map

```
Phase 0 (seq) → CP1
Phase 1 (seq, IR substrate) → CP2
Phase 2 (seq, shader substrate) → CP3          ← thesis gate
Phase 3:  G ║ H  → CP4, CP5                    ← flagships
Phase 4:  A ║ B ║ C ║ D ║ K  → CP6             ← max fan-out
Phase 5:  F3D ║ L ║ E ║ J  → CP7
Phase 6:  I → M → N (mostly seq: chrome touches everything) → CP8
```

Total ≈ 120 tasks, 8 stops. Everything between stops is autonomous churn:
typecheck + tests after each task, boards as self-evidence, no status pings.

## 4. Minimum viable done (if runway ends)

Phase 0 + 1 + 2 + 3 (through CP5). Two novel flagship demos, a first-class
object model, and continuous 2D↔3D — the thing that isn't GeoGebra. Phases
4–6 are breadth; they extend the lead but don't define it.
