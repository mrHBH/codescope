# windgraph v2 — Notes, decisions, tips, open questions

Append-only working memory. Anything a fresh agent needs that isn't obvious
from the code lives here. Newest entries at the bottom of each section.

---

## 1. Decisions log (locked — do not relitigate without user sign-off)

- **D1 — Primitives vs islands (user decision, 2026-07-27).** Object-like
  content (typed parameters, identity, draggable/measurable/serializable,
  per-object animation) = **first-class IR primitives**: new `ObjectSpec`
  kinds → windgraph `Mobject` instances. Field-like content (per-pixel,
  procedural, no sub-object identity) = **islands / shader passes**. Islands
  additionally provide the *hosting plumbing* (board slot, `DrawHelpers`,
  `s.interactive` routing) that windgraph boards reuse. Consequence: math-ish
  islands (`gdCurve`, `lineFit`, `lossContour`, `network`) are misfiled and
  migrate to primitives in Phase 6. Full table in `../SPRINT-windgraph-v2.md` §1.
- **D2 — Moat-first sequencing.** Continuous 2D↔3D (lane G) and physics (lane H)
  ship before parity work. Nobody chooses this engine for a histogram; they
  choose it for the contour→surface lift and the Galton board. Parity trails
  behind, culled by actual taste verdicts at CP6.
- **D3 — Acceptance-bar carve-out.** "Analytic, zero aliasing, any zoom" is the
  contract for 2D content (strokes, fills, glyphs, math, chart chrome). Sampled
  3D (marching cubes, volume raymarch, 4D projection) is explicitly labeled
  "sampled", gets adaptive tessellation + silhouette refinement, and never
  claims the analytic guarantee. (`WINDGRAPH.md` §5 fixed in task 0.3.)
- **D4 — Chrome is not foundation.** Sidebar/inspector demoted out of the
  foundation phase; moat demos run on hardcoded specs + sliders. Chrome is
  Phase 6.
- **D5 — Chrome is analytic-rendered, not DOM.** The repo already replaced the
  DOM toolbar and context menu with GPU-rendered analytic ones (commits
  `d83c839`, `1abc027`, `a4473e4`, plus soft shadows + transform support).
  Track I (tooltips, sidebar, inspector) follows that pattern: rounded-rect
  coverage + windfoil text, themed via the existing palette. No new DOM overlays.
- **D6 — Execution contract.** Autonomous churn; stops only at the 8 🔍
  checkpoints (`checkpoints.md`). Typecheck + tests after every task. No
  commits unless asked; no new npm deps; targeted edits, never file overwrites.
- **D7 — Phase 1 extends the existing IR, it does not fork it.** `ir/types.ts`
  already has `ObjectSpec` kinds (text, glyph, rect, circle, polygon, line,
  math, group, island), `ClipSpec` kinds (fadeIn/out, draw, write, moveTo,
  scaleTo, rotateTo, **morph, param**), and a **parameter system**
  (`{kind:'number', min, max, step}`, boolean, point, color —
  `ir/types.ts:208-215`; `ParamRef = {$param}` is the slider-binding wire,
  already used by `IslandSpec.params`). New windgraph kinds and slider binding
  plug into these. Full spec sketches: `contracts.md`.
- **D8 — runtime.ts split seams (settles OQ-7, Phase 0.1).** The split shipped
  as: `runtime/shared.ts` (state-free: DragState, PlanPage, constants, sigVal,
  trimPolyline, emitGlow, emitGlyph, resolveIslandParams), `runtime/emitObject.ts`
  (emitObject/emitObjectAt behind an `ObjectEmitHost` interface),
  `runtime/dragControl.ts` (all drag/hit-testing behind a `DragHost` interface).
  runtime.ts: 1311 → 677 lines. Pattern for future extraction: free functions
  + narrow host interface that SceneRuntime satisfies structurally; `import
  type` for back-references (no runtime cycles). Cost: ~15 class members
  de-privatized (grabbed, hoveredHandle, hudPeel, lastView, liveParams,
  paramVersion, livePageSize, liveItemWH, layoutMap, font, atlas, frameState,
  ensureLayout, invalidateLayout, findPageParent, isNestedPage) + 2 new public
  methods (texFor, grabbedHandleName). External API unchanged; tsc + all 58
  authoring tests green.

## 2. Technical tips (file:line anchored)

**The 3D substrate already exists — extend, don't rebuild:**
- `src/windfoil/windfoil.wgsl:69` — `fxXforms` storage buffer, `vec4f` pair per
  instance (`rotX, rotY, z, scale`), applied when `fxActive`. Task 2.1 promotes
  this from FX-only to a Mobject-emitted property.
- `SPRINT.md` decision D6 (IDE FX sprint): **depth write stays OFF** on the
  windfoil pass; flying glyphs append last (painter order, z≥0). Extruded
  side-walls routed through `mesh3d` are depth-tested in a *separate* pipeline
  — the compositing boundary between the two is the risk in 2.2. See OQ-1.
- `src/windfoil/mesh3d.ts` — true-3D triangles + lines, shared depth buffer,
  Gouraud shading. v1 perf lesson (sprint/TODO.md): static vertex buffers
  upload ONCE; depth-view cached; frustum culling exists — don't regress these.
- `src/frame.ts:398-430` — windgraph board emit + `EmitCache` signature
  pattern: `emit(font, atlas, inst, crv, rws, now, view)`. Match it exactly.
- `src/camera/input.ts:143,169,321` — pointer routing already prioritizes
  windgraph handle grabs over camera pan. The Phase-1 board adapter reuses
  this; don't invent new input paths.

**Physics + FX machinery to wrap, not rewrite:**
- `src/ide/fx/physics.ts` — box3d.js rigid bodies per instance: clip planes,
  home transforms (`homeX/homeY` + `homeCx…`), sleep/dormancy pools, broadphase
  grid (`GRID_CELL=64`), reassembly-by-home. `PhysicsBoard` (H1) generalizes
  this: bars→boxes, dots→circles, polylines→chains.
- `src/ide/fx/fireworks.ts` — the `extras()` pattern (`extraFA`/`extraXF`
  appended instances) is how spawned particles/clones join the draw. Reuse for
  event bursts (H2) and shatter debris (H1).
- `src/ide/fx/morph.ts` (if shipped) / `logo.ts` — glyph-correspondence morph
  engine; strategies formation/collapse/explode/grid/stack.

**windgraph v1 assets to reuse:**
- `src/windgraph/interact/graph.ts` — `ConstraintGraph` (Kahn topo-sort, cycle
  detection) is the dependency engine for BOTH the board adapter (Phase 1) and
  the expression engine (Phase 5 lane L: expressions become `GObject`s).
- `src/windgraph/plot/implicit.ts` — marching squares already exists. G5
  (contour→surface) and A15 (labeled contours) build on `plotImplicit`; do not
  re-derive contours.
- `src/windgraph/anim/` — Scene/Timeline/ValueTracker/easing; `Transform` does
  path-correspondence morph (`resample`, `pointAtFraction`). Representation
  morphs (G1–G4) reuse this for the 2D side.
- `src/windgraph/math/mathtex.ts` — `MathTex` with write-on; glyph morph is
  crossfade-only today (v1 stretch item).
- `src/windgraph/space3d/project3d.ts` — `colormap`, `LIGHT_DIR`, `faceNormal`
  — the shading vocabulary for extrusion (2.2) and surfaces.

**Frame-level dirty tracking (perf pass 6 — read before touching frame.ts):**
- Still-frame path: `frameSig` match → skip emit/conversion/upload → the pass
  redraws persistent GPU buffers. Invariant that keeps it correct: the sig
  covers EVERYTHING that changes the bytes — content (board revs, hover ids,
  tile/zoom-band quantizations, grid toggle), camera (`viewX/viewY/viewZ` —
  the 2D conversion subtracts them per instance! — plus `cam3d.active`),
  canvas size, `staticRev` (theme/rebake), sharpen flag.
- `gpu.ts draw(..., dataVersion?)`: version supplied → writeBuffer only on
  version change; absent → legacy behavior (all other callers unchanged).
- Eligibility is opt-in per board (`frameSig` method) AND requires no
  time-dependent emitters in the app (editor caret blink etc.). Adding a new
  always-animated board to a demo? It must either lack `frameSig` or be in
  the exclusion list in frame.ts.
- screenHud skip: `frame(..., sig)`; rebuild bumps its internal dataVersion.
  HUD sig lives in frame.ts and includes toolbar hover, chip mode/status/
  pressed, both debug texts, and a 50ms tick while menu/panel are open.
- Debug line caveat: world section timings are measured in `emit`, so on
  skipped frames they show the LAST real emit — the cumulative `skipped N`
  counter (frame.ts → chip extra) is the truth for idle cost.

**Perf facts (measured reasoning, not vibes):**
- Idle-frame cost is dominated by `EmitCache` replay: every cached board
  re-appends its slice to the shared `inst/crv/rws` JS arrays each frame
  (frame.ts clears them per frame — appending is mandatory, skipping is not
  possible at board level). Replay was 16 conditional pushes per instance;
  now native bulk pushes + in-place rowBase patches (`emitCache.ts`; contract
  tests in `src/windfoil/__test_emitCache.ts` — extend those before touching
  the rebase logic).
- `frame.ts` then converts `instJS` (number[]) → `instFA` (Float32Array):
  `set()` in 2D (fast), per-instance camera-relative loop in 3D (the 3D toggle
  costs — expected, opt-in).
- Hover hit-testing runs every frame from `frame.ts`; world + board guard on
  `wx|wy|scaleQ|revs` — keep that guard when adding new interactive layers.
- Plot LOD: `WgScene.setLodScale` (√zoom, 10% steps, min 48 samples) — board
  bumps `rev` on LOD change so the cache rebuilds once. Marching-squares
  implicits do NOT LOD yet (gridRes fixed) — candidate for Lane N.
- The structural fix for idle frames is instance-buffer diffing / persistent
  static GPU buffers (Lane N): static boards should upload once, not replay
  per frame. Everything above is a constant-factor win; that one is asymptotic.

**Phase 1 architecture (as built — read before extending):**
- `WgScene` (`runtime/object-resolver.ts`): constraint graph runs in WORLD
  space (free points store world coords; data→world via `plane.dToWx/dToWy` at
  resolve time). Angles/circles are therefore visually true even with
  non-uniform plane scales. Worklist build tolerates any doc order; validation
  guarantees termination.
- Live values flow through closures: `pt(WgPoint)` / `num(WgNum)` return
  getters over params/points; syncables re-read them after every
  `graph.update()` and `markDirty()` the Mobjects. Plot groups resample only
  when the numeric-param signature changes (`paramSig`).
- Implicit plots + fields are NOT Mobjects — they're view-dependent direct
  draws (`directDraws(ctx, view)`) calling `plotImplicit`/`plotVectorField`/
  `plotSlopeField`. Function/parametric/polar plots ARE Mobject polylines
  (animatable/morphable — the moat needs this). Discontinuities split into
  multiple polylines (jump > 4× plane height or non-finite).
- `WindgraphSceneBoard` (`playground/boards/windgraphScene.ts`) owns the
  `s.interactive` slot (superseded v1 `InteractDemo` — same position/button;
  `autoDrive` feeds the cinematic flight). Emit is cached on
  `rev|hoveredId|tile-quantized-view`; drag/param changes bump `rev`. Sliders
  are analytic, screen-constant (geometry ∝ 1/zoom), hit-tested before scene
  points in `tryBeginDrag`.
- `wgRepl(board, line)` is terminal-agnostic (returns lines); mutations
  validate the whole doc and roll back on error, then `board.rebuild()`.
  Terminal UI hookup = Phase 6 (Lane I).
- `emitTS` projects wg kinds: scene-level wg objects are "orphans" → `s.wg.*`;
  chapter-parented → `ch.wg.*` with NO chapter offset (data space). `$param`
  refs print as `s.param.ref('name')` via the existing `fmt`.

**Authoring system facts:**
- `src/authoring/runtime/runtime.ts` is 62KB in one file — task 0.1 splits it
  before anything else piles on. Proposed seams: draw-emit, input/interactive
  contract, object-tree/chrome, orbit-camera driving.
- `src/authoring/builder/scene.ts` (30KB) has the builder's existing object
  vocabulary — reconcile with new specs in 1.1/1.3 (extend, never fork).
- `src/authoring/islands/draw.ts` — `DrawHelpers` (10+ GPU primitives) shared
  by runtime + islands; windgraph boards get the same helpers.
- `src/authoring/repl.ts` — 13 existing scene commands; windgraph commands
  (1.6) follow that registration pattern.
- Demo routing is hash-based: `#authoring`, `#explainer-v2`, `#islands`,
  `#pages` (`src/authoring/demo.ts`). Playground boards get toolbar buttons
  (`src/playground/playground.ts:298-302` pattern) — extend for windgraph v2
  boards; see OQ-5.

## 3. Open questions (answer → move to decisions log)

- **OQ-1 — Extruded side-walls: mesh3d or analytic fills?** mesh3d triangles
  get depth occlusion right but lose analytic AA on wall silhouette edges;
  analytic fill quads with per-instance z keep AA but need painter ordering
  against the depth-tested surface pass. Prototype both inside 2.2; CP3 verdict
  decides. (Hybrid is possible: analytic walls for isolated extrusions, mesh3d
  when interleaving with true-3D surfaces.)
- **OQ-2 — Contact shadow technique (2.5).** Project elevated silhouette to the
  ground plane as a blurred analytic fill (penumbra via widened coverage
  falloff)? Needs a prototype; keep it one draw-call-friendly pass.
- **OQ-3 — Expression engine vs authored specs (lane L).** Live calculator
  expressions and static SceneDoc parameters must coexist: spec parameter
  values should be allowed to *be* expressions evaluated per frame. Decide the
  binding in L1; likely `ConstraintGraph` nodes owned by the board adapter.
- **OQ-4 — Galton board scale (H4).** physics.ts shards UI glyphs (hundreds,
  mostly dormant). Hundreds of *live* bouncing balls may need substep/grid
  tuning (`SUBSTEPS=2`, `GRID_CELL=64` in physics.ts). Benchmark early in H4;
  fallback: deterministic custom circle-packing sim if box3d chokes.
- **OQ-5 — Board discovery UI.** Playground toolbar buttons (current pattern)
  vs island gallery (`islands/gallery.ts`) vs a windgraph gallery board.
  Interim: playground buttons. Revisit at CP6 with the full board count.
- **OQ-6 — Naming.** "windgraph" is a working title (sprint/README.md:3).
  Settle before Phase 6 export/branding work.
- **OQ-8 — IDE frame-time drift (user-reported 2026-07-27).** Idle IDE js time
  ~4 ms now vs 0.8–1.4 ms in the bento era. NOT a current-sprint regression
  (predates Phase 0; the runtime split is not in the IDE path). Part of the
  delta is legitimate new workload: editor/terminal/file-tree panels (three
  per-frame dynamic emitters), screenHud pass, analytic toolbar/menus, depth
  buffer — none existed in the bento era. But 4 ms needs a section breakdown
  to judge. Diagnosis plan: the `mark()` sections in `frame.ts` exist but only
  collect while `s.perf.running` (🧪 bench) — enable always-on collection (~14
  `performance.now()`/frame, negligible) + expose via `window.__frameMarks` or
  overlay second line, read the numbers, then fix the hot section or accept it.
  Candidate hot spots to check first: editor/terminal/tree emit (uncached by
  design), instance-buffer upload size, hover hitTest/resolveStyle (regressed
  once before — sprint/TODO.md), per-frame FX plumbing with FX off. **Deferred
  unless user calls it — lands naturally in Lane N perf gates.**
- ~~**OQ-7 — runtime.ts split seams (0.1).**~~ **Resolved 2026-07-27 → D8.**
  Seams confirmed as hypothesized, minus camera/playback/layout (too
  state-entangled to separate cleanly; they stay on the class).

## 4. Lessons (digest of oldsprintplan/POSTMORTEM.md + v1 sprint)

- **Static before interactive.** Prove a feature with one static board, then
  add drag/animation. Most v1 pain came from building interactive demos on
  unproven statics.
- **Match the system's grain.** Reuse `s.interactive`, the `emit(...)` board
  signature, `EmitCache`, existing input routing. New patterns need justification.
- **Never overwrite a file; targeted edits only; grep for duplicates after
  `replaceAll`.** A bad replaceAll once cost hours.
- **Don't fight infrastructure.** Vite/WASM fights get a 30-minute timebox,
  then the simplest alternative.
- **Perf regressions hide in per-frame work.** v1 regressions: per-frame
  `writeBuffer` of 1MB meshes, per-frame `createView()`, per-frame CSS selector
  matching on hover, per-glyph cmap lookups. Rule: anything in `frame()` runs
  60×/s — cache, dirty-track, or precompute.
- **The user is the only visual test runner.** Agents can't see the browser —
  that's exactly what the 🔍 checkpoints are for; never fake a visual verdict.

## 5. Direction reminders (why, when tired)

- The moat is §G/§H of `WINDGRAPH.md`: continuous 2D↔3D with glyph height, and
  physics-driven graphs. If a task doesn't serve the moat or unblock something
  that does, question whether it's in the right phase.
- Sharpness is the brand. Every 2D element must survive 1000× zoom in every
  board, including new chrome and shadows. Sampled 3D says so honestly (D3).
- One draw call is the religion. New passes need justification; batch geometry;
  keep per-frame CPU bounded.
- Smooth by construction: no snapping anywhere — every mode change is an
  animatable parameter (elevation, tilt, morph weight).
