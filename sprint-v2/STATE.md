# windgraph v2 — Live State

**This file is ground truth.** An agent starting fresh reads this first.
If this file and the code disagree, investigate before trusting either.

## Current position

- **Phase:** 4/5 — **F3D-2 DONE: 3D space curves = watertight Gouraud mesh tubes
  (2026-07-31, D26 mesh pivot — user verdict: flat analytic ribbons were
  "unstable and ugly"; accept mesh3d for 3D bodies).** Torus knot + helix as
  static-cached tubes (`pushTube`), depth-tested crossings, flat analytic chrome
  on top. `#curve3d` route + 9th world board. The depth-write pipeline variant +
  opaqueCount pass stay as infra for locally-planar 3D content. 10 curve + 27
  world tests. **Next task:** CP6 verdict (pending) OR continue F3D —
  grid-in-plane, quiver3D (F3D-8), then F3D-1 parametric surfaces (mesh morph).
- **Track A (Phase 2, concurrent):** **2.1–2.5 DONE + extrude demo + CP3 polish.**
- **Track A (Phase 2, concurrent):** **2.1–2.5 DONE + extrude demo + CP3 polish.**
  Per-instance z wiring (D10); analytic extrude renderer (D9); glyph/math extrusion;
  continuous tilt; contact shadows (D11). Demo `boards/windgraphExtrude.ts` (4th
  world board + `#extrude`). CP3 rounds: pure-mesh closed solids + analytic-top
  overlay (D16/D17); round-5 universal quality panel + Gouraud smooth walls +
  analytic-top plug fix (sliver gone) + MSAA toggle + real depth-mapped shadows
  toggle (D18). Defaults smooth ON / MSAA OFF / shadows OFF (GPU features
  unverified-by-me, console-loud on error). **Awaiting CP3 verdict. STOPPED.**
  382 tests green; tsc clean.
- 2026-07-28 — **Track A CP3 round-1 fixes (3 user-reported bugs).** (1) Standalone
  `#extrude` rendered flat → board now owns its xf buffer + `xfBuffer()` (D14);
  frame.ts enables fxActive for it. (2) "Depth wrong" → back-face culling added
  (the cylinder's far wall was showing through) + the painter-depth sign was
  flipped and is now correct (`camDepth`, D12); bodies draw in two passes
  (shadows, then far→near). (3) Extruded text read as flat → `Tex` now z-lofts the
  glyphs into a solid 3D letter (D13); caption relocated clear of the prisms.
  Cylinder bumped to 64-gon. 3 new alignment tests + culling test; **371 tests
  green across 22 files; tsc clean.** Awaiting CP3 re-verdict (still STOPPED).
- 2026-07-28 — **Track A CP3 round-2 fixes (3 more user notes).** (a)+(c) the
  "hidden portions near top" AND the disliked shadows were ONE bug: `emitShadow`
  scaled the silhouette up to ~1.74× at h=130 → a dark halo bigger than the object
  = a fake hole swallowing the base. Now an ABSOLUTE-feather penumbra (3 layers,
  strength 0.20, footprint-sized) — a tight grounded contact shadow (D15). (b) the
  text comb = too few copies + wrong trig; overlap needs `tan(polar)` not `sin`, so
  `glyphLoftLayers` now yields overlapping copies → one smooth shaded side under a
  lit cap, collapsing to flat at top-down. **380 tests green across 22 files; tsc
  clean.** Awaiting CP3 re-verdict (still STOPPED).
- 2026-07-28 — **Track A CP3 round-3: extrusion walls → depth-tested mesh3d (D16,
  the real fix).** User: rotating notch + gaps at some angles + text still stacked.
  Root cause = analytic painter-order walls are never watertight, and stacked
  glyphs comb worse on zoom. Now the side walls are REAL triangles (`pushWalls`)
  drawn through the existing mesh3d depth buffer before the analytic pass; the
  analytic pass keeps only the razor-sharp top faces (depth-tested over the mesh).
  Watertight at every angle, no culling/painter fragility. Text is now a TRUE
  extrusion: the glyph outline is stored on the math atlas at bake time
  (`bands.ts quadsToContours`) → `MathTex.outlineLoops`/`Tex.wallLoops` → wall
  tubes; sharp top + solid depth-tested side, resolution-independent. Shadows sunk
  to z=−1 + gated off at top-down. Board caches the wall mesh; world.getMesh() +
  frame.ts draw it like graph3d; app.ts gives every demo the meshRenderer.
  Consistent with D3 (3D content = depth-tested; 2D tops stay analytic). Tests
  rewritten; **379 green across 22 files; tsc clean.** Awaiting CP3 re-verdict
  (still STOPPED).
- 2026-07-28 — **Track A CP3 round-4 (D17): flat 3D shapes → pure mesh; 3 bugs
  fixed.** (1) right-click flattened the scene because the world-projected menu
  (appended after the board's xf buffer) tripped the fxActive length check → now
  frame.ts zero-pads xf to the full frame count. (2) double context menu → app.ts
  HUD copy gated on `!menuWorldPose`. (3) per the user's verdict, box+cylinder are
  now CLOSED pure-mesh solids (`pushWalls`+`pushCap`, watertight, no seam); the
  analytic top survives only as a top-down sharpness overlay (polar<0.06), shadow
  gated polar>0.06. Text keeps the hybrid (sharp glyph = the moat) with its wall
  loop inset 0.75px so it never z-fights the glyph. **381 green across 22 files;
  tsc clean.** Awaiting CP3 re-verdict (still STOPPED).
- **Lane A+K (Phase 4, this session):** all 18 plot-catalog kinds (A1–A18) +
  all 6 mathtex extensions (K1–K6) shipped — 9 new `plot/*` modules, 18 IR kinds
  wired end-to-end (types/validate/builder/resolver/emitTS), `expr.ts` gained
  comparison/logical ops (piecewise prereq), growing delimiters drawn as analytic
  vector paths. `plotGalleryDoc()` ready for a board slot. 312 tests green, tsc clean.
- **Checkpoints passed:** CP1 (2026-07-27), CP2 (2026-07-28), CP3 (2026-07-28)
- **Blockers:** none
- **Last updated:** 2026-07-29 (Phase 4 IR wiring B/C/D/E complete; 402 tests green)

## Update protocol (every agent, every task)

1. After completing a task: check its box in the phase file **and** in
   `TODO.md`, advance "Next task" above, run `bunx tsc --noEmit` (+ any
   `__test_*.ts` in touched modules), append one line to the log below.
2. After a checkpoint: record the user's verdict in `checkpoints.md` and note
   it in the log. If the verdict culls tasks, strike them in the phase file
   with `~~strikethrough~~` + reason — never silently delete.
3. When you discover something future agents need: append to `NOTES.md`
   (tips/decisions/open questions). When an open question gets answered,
   move it to the decisions log with its answer.
4. Keep entries terse. This file is a dashboard, not a diary.

## Log

- 2026-07-31 — **curve3d analytic-2D + REAL MSAA (user: "curves still aliased in
  3D and 2D, AA does nothing; in 2D I expected the analytic pipeline").** Two
  fixes. (1) **2D is now properly analytic + smooth**: the curves already went
  through the winding-integral pipeline but as a RAW POLYLINE contour — which the
  analytic renderer draws exactly, so every chord facet showed. Switched to the
  smooth quadratic-Bézier ribbon path (`polyToQuads` B-spline fit +
  `strokeQuadPath` → `fillQuads` — the exact mechanism the 2D plots use), so the
  band boundary is a smooth curve at any zoom. (2) **The AA dial is now REAL MSAA
  (4×)** instead of 2× supersampling: a multisampled color+depth pair resolved to
  the swapchain (`view` holds the clear — the old D19 black-screen was the clear
  on the resolve target), all main-pass pipelines (analytic + mesh + HUD) swapped
  to lazily-cached sampleCount-4 variants via the toggle (app.ts setAA; castPipe
  stays 1× for the single-sample shadow pass). MSAA smooths the MESH silhouette's
  hard triangle edges — the real "aliased in 3D" cause — without touching the
  analytic content. The supersample path could not fix GEOMETRIC facets (why AA
  "did nothing"); MSAA + the Bézier 2D both address the geometry. 12 curve tests;
  27 world tests; 24/24 suites green; tsc clean (only pre-existing font.ts);
  vite build ok. Visual verdict = user (`#curve3d` → toggle AA, zoom).
- 2026-07-31 — **curve3d 2D silhouette fix (user: "in 2D the 3D curve looks
  ugly... it should look identical to 3D from above"; also AA questions).** The
  2D ugly was the flat-projected tube MESH: the 2D ortho collapses every tube
  face onto ONE depth layer (z→0.5), so back/side faces overlap the front into a
  jumbled blob — 3D top-down looks different only because depth occludes the far
  side. Fix: in flat 2D the board does NOT draw the tube mesh; it emits the
  tube's TOP-DOWN SILHOUETTE as a clean analytic band along the curve's
  xy-projection, width = the tube diameter (exactly the "3D from above" view,
  razor-sharp, the extrude OQ-9 pattern). `getMesh()` returns null below a polar
  gate (0.06, the extrude shadow gate); emit strokes vs. tubes split on the same
  gate; frameSig now carries tilt + zoom band. **AA audit:** the toggle is 2×
  whole-frame SUPERSAMPLING (canvas backing ×2, CSS-downscaled). It reads as "no
  effect on the mesh" because 64-gon tubes are already sub-pixel-smooth, and the
  reported "text worse" was most likely the text drawn OVER the jumbled 2D mesh
  blob (now gone) — exact coverage at 2× cannot be worse; if it persists it is
  the CSS-downscale path (esp. non-integer dpr) and the fix is an offscreen
  render + blit instead of CSS downscale. 27 world tests; 24/24 suites green;
  tsc clean (only pre-existing font.ts); vite build ok. Visual verdict = user.
- 2026-07-31 — **3D architecture audit + dead-code cleanup (user: "i really dont
  want any scattered implementation... how is the learning demo's 3D rendered?").**
  Verified the map: ALL 3D bodies render through ONE GPU mesh pipeline
  (`mesh3d.ts` — tris/lines/shadow) + ONE orbit camera + one shared depth buffer.
  The learning demo's gradient-descent surface is `LossSurface3D` →
  `s.graph3d` → `drawTris`+`drawLines` (frame.ts:1480); the curve tubes +
  extrude walls feed the same pipeline via `s.interactive.getMesh()`. Content
  builders (LossSurface3D, pushWalls/pushCap, pushTube) all emit the same 7-float
  vertex format; THREE.js is only the orbit camera. Removed the v1 CPU
  `Projector` class (painter-sorted 3D→2D — zero consumers left) from
  project3d.ts; fixed a stale `meshAA (MSAA)` comment (it is 2× supersampling
  since D19). **AA toggle audit:** it IS wired in #curve3d (`makeQualityPanel` →
  `renderScale` → canvas ×2, CSS-downscaled = whole-frame supersample); it reads
  as "nothing" because the scene is already sub-pixel-smooth (64-gon tubes +
  exact analytic text) — nothing to alias. tsc clean; 24/24 suites green.
- 2026-07-31 — **F3D-2 tube quality pass (user: "i dont like the quality... I
  remember troika-three-text producing higher quality bezier curves").** Two
  things. (1) Troika-three-text is a TEXT library (GPU winding-fill of glyph
  bezier outlines into a texture atlas) — it draws no curves; our analytic
  pipeline already does that glyph fill in closed form per-pixel (strictly
  sharper, no atlas). The "higher quality curves" memory is three.js fat-lines/
  TubeGeometry, whose quality secret is a TESSELATION BUDGET — which the tubes
  lacked: the mesh was static at 18-gon / ~40px chords, so the silhouette
  faceted at the default framing. (2) Quality fix: base 64-gon + ~10px centerline
  chords (the same relative smoothness as the approved extrude cylinder) and a
  QUANTIZED √2-zoom-band LOD (detail ~ z^0.75 scales centerline + radial; capped
  ~470k verts, facets sub-pixel to ~5× zoom; beyond that the D3 "sampled
  content" tradeoff, honestly labeled). Rebuilds are one-frame hitches at band
  crossings only — mesh3d gates the upload on the Float32Array reference, so a
  still frame (and pure orbiting) never rebuilds. Base mesh 140k verts / ~19ms
  once. **tsc clean; 24/24 suites green; vite build ok.** Visual verdict = user
  (`#curve3d` → tilt → zoom in). Awaiting CP6. STOPPED.
- 2026-07-31 — **F3D-2 PIVOT to mesh tubes (user verdict on #curve3d: "kinda
  unstable and ugly — accept that for 3D we will need mesh3d").** Flat analytic
  ribbons are the wrong primitive for 3D curves (zero thickness along the normal
  → paper-strip look + grazing collapse; camera-adaptive resampling popped during
  orbit; strict-less z-fighting between quads and joint discs flickered — the same
  "analytic walls are never watertight" class as D16). `curve3d.ts` now sweeps
  WATER-TIGHT GOURAUD MESH TUBES (`pushTube`: N-gon rings ⟂ tangent, radial
  per-vertex normals, end caps; static fixed-quality sampling → the mesh caches
  once and orbiting never rebuilds). The board's curves/axes are mesh3d
  (`getMesh()`; world composes extrude-walls + tube mesh); flat analytic chrome
  stays on top. The depth-write pipeline variant + opaqueCount pass + quaternion
  frame helpers REMAIN as infrastructure for locally-planar 3D content per the
  user's choice. 10 curve3d tests + 27 world tests; 24/24 suites green; tsc clean
  (only pre-existing font.ts); vite build ok. Visual verdict = user
  (`#curve3d` → tilt). Awaiting CP6. STOPPED.
- 2026-07-31 — **F3D-2 bind-group fix (user: "new demo is black in 3D").** The
  depth-write pipeline's draw threw a WebGPU validation error — the auto-layout
  `pipelineDepth` rejected the bind group created from the normal pipeline's
  `getBindGroupLayout(0)`, invalidating the whole command buffer → black frame.
  Fix: one bind group PER pipeline (`bindGroupDepth` from `pipelineDepth.getBindGroupLayout(0)`),
  rebuilt together on buffer growth, selected on draw. Lesson logged in NOTES.md
  (auto layouts are per-pipeline objects). tsc clean; 24/24 suites green; vite
  build ok. Visual verdict = user (`#curve3d` → tilt). Awaiting CP6. STOPPED.
- 2026-07-31 — **F3D-2 foundation: analytic 3D space curves + depth-write variant
  (D26).** User green-lit Phase 5 work (CP6 still formally pending — the human is
  the checkpoint authority; noted in checkpoints.md). New: (1) `gpu.ts` dual-
  pipeline `createGlyphRenderer({depthWrite})` — the depth-WRITING analytic
  variant (strict-less + depthWrite) over the same shader/bind group, selected
  per draw via `{depthWrite, firstInstance}`; `engine.ts` builds it. (2)
  `windgraph/space3d/curve3d.ts`: adaptive screen-space sampler (`sampleCurve3D`,
  midpoint subdivision until the projected chord deviation is sub-pixel; world-
  tolerance fallback behind camera; budget-capped) + `emitCurve3D` (per-segment
  quaternion quads + joint/cap discs in the ⟂-tangent plane, closed-loop seam
  dedup, per-face Lambert). (3) `frame.ts` opaque analytic pass — boards expose
  `opaqueCount()` (their leading depth-writing instances); drawn FIRST through the
  depth-write pipeline, GATED to the 3D orbit camera (strict-less would cull every
  equal-depth overlap in the flat 2D ortho); the rest test-only after. (4)
  `boards/windgraphCurve3d.ts` (helix + torus knot + doc axes, self-occluding,
  orbit-resampled) + `#curve3d` standalone route + 9th world board (emitted FIRST
  so its instances form the opaque prefix; world `opaqueCount()` = frame prefix +
  masthead + board prefix). Dev-time fixes: the shader's `xa.z` is a WORLD z-
  translation, so `pushXf` must carry the segment mid-height (else every curve sat
  at z=0); `quatApply` must NOT apply an extra cross — the shader's outer
  `cross(q, cross(q,v) + w·v)` expands to `q×(q×v) + w·(q×v)`. **11 new curve3d
  tests + 2 world tests; 24/24 suites green; tsc clean (only pre-existing
  font.ts); vite build ok.** Visual verdict = user (`bun run dev` → `#curve3d` or
  the world's knot button → tilt). Awaiting CP6. STOPPED.
- 2026-07-31 — **D25-fixup: 2D text + plots were broken (user: "grid moves now
  but all the text and plots are broken in 2D").** The D25 band.zw camera-relative
  shift skipped copying inst[14]/[15] for ALL instances while only re-setting
  them for fillRule-3 grids — every non-grid instance (glyph text, plot strokes)
  kept a STALE band.z/w (glyph bandH/invH) from the previous frame → broken
  glyph/plot rendering. Fix in frame.ts: copy all 14 fields verbatim, then
  override 14/15 only for grids. Regression test mirrors the 2D upload on a
  reused buffer (stale-value trap). **tsc clean; 404 tests green; vite build
  ok.** Visual verdict = user. Awaiting CP6. STOPPED.
- 2026-07-31 — **2D grid slid with the camera + 3D deep-zoom FPS tank (user:
  "in 2D panning the grid does not move with the camera, in 3D it does; in 3D
  zooming in the grid becomes too fine/high-res → FPS tank, 2D is fine").** (1)
  The 2D instance upload makes `place.xy` camera-relative but left the grid's
  phase (`band.zw`) absolute → the fillRule-3 shader's `place + rc − phase` gave
  `worldX − cx − worldX0`, so lines slid with the camera (screen-anchored) in
  2D. Fix: the 2D upload now shifts `band.zw` by −cx/−cy for fillRule-3 too.
  (2) The tick LABELS were built inside the cached slice against the tile
  superset — deep zoom × huge 3D ray-cast rect = thousands of glyph instances
  (measured 36k / 28.5ms at z300); 2D survived because its viewport is small.
  Fix: labels moved OUT of the cache — `NumberPlane.renderLabels` emits them
  uncached against the LIVE viewport, capped to ≤48/axis via a nice labelStep
  multiple (labels stay on grid lines). Grid/axes/scene stay cached (tile).
  Rebuild at deep 3D zoom dropped to ~0.8ms / ~260 instances. D25. **tsc clean;
  403 tests green across 22 suites; vite build ok.** Visual verdict = user
  (`bun run dev` → `#windgraph`: pan in 2D — grid stays world-anchored; tilt to
  3D + dolly deep — FPS holds). Awaiting CP6. STOPPED.
- 2026-07-31 — **2D pan froze the per-plot grids (user: "in 3D it is perfect;
  in 2D panning does not update the grid it appears").** The board's `sigFor`
  tile-quantized the cache key (1200px) but `emit` built the cached slice with
  the RAW viewport — a replayed slice covered only the build-time viewport, so
  panning within a tile revealed content-less gaps until the next tile boundary.
  Fix: new `tileView(view)` in `windgraphScene` (view∩board snapped OUTWARD to
  1200px tiles) is now BOTH the cache key AND the geometry-build view
  (`plane.render`/`scene.emit`), so the cached slice covers the whole tile —
  the frame.ts "strict superset" intent finally applied to the build, not just
  the key. Regression test (two same-tile viewports → identical grid covering
  both). D24-followup. **tsc clean; 401 tests green across 22 suites; vite
  build ok.** Visual verdict = user (`bun run dev` → `#windgraph` → pan in 2D).
  Awaiting CP6. STOPPED.
- 2026-07-31 — **Culling conservative + world grid removed + per-plot grids
  reworked (user: "culling still too aggressive"; "the main grid I can toggle
  needs to be removed, useless"; "per-plot grids need reworking from scratch to
  be sharp, nice, performant").** (1) `rect3DVisible` never culls a rect with
  any corner behind the near plane (mixed front/behind → always draw): the side
  tests are only exact for all-front corners, and a behind corner can pull a
  near-plane crossing back across the viewport even when every front corner is
  off one side. All-behind keeps the camera-inside guard (D23); all-front keeps
  exact plane culls. (2) World backdrop grid REMOVED (`showGrid`, `grid` toolbar
  button, `GRID_*`, `addGrid`, `fineStep`, grid instances) — the backdrop is the
  static masthead only. (3) NumberPlane grids reworked from scratch: TWO
  procedural `fillRule 3` instances (minor step/5 ~1px, major step ~1.8px,
  screen-px width) instead of dozens of strokes; phase-locked to the data origin
  via new `band.zw` (worldX0/worldY0) so lines sit under the labels; one shared
  1.26× step both axes; minor always on; crisp at any zoom + under tilt, moiré
  horizon. (4) `EmitCache` capture now never rebases fillRule ≥ 1.5 instances
  (their inst[12] is a band, not a rowBase — a grid step ≥ rowBase0 was being
  corrupted at replay). D24. **tsc clean (only pre-existing font.ts error); 400
  tests green across 22 suites; vite build ok.** Visual verdict = user
  (`bun run dev` → `#windgraph`: zoom deep into a plot + tilt; no more world
  dot-grid). Awaiting CP6. STOPPED.
- 2026-07-31 — **Grid rework + 3D culling fix (user: "the grid shrinks /
  doesn't behave correctly as I zoom in"; "the line disappears halfway while
  zooming").** Root causes (headless sim): `niceStep(140/z)`'s 1-2-5 ladder
  pulsed on-screen spacing 140→280→140px (2.5×) mid-zoom; and the world grid
  emitted full-length per-line strokes cached against raw view bounds (rebuild
  every pan/dolly frame; world-constant widths fatten near / vanish at the
  horizon under tilt). Fix: **procedural per-pixel grid** — new shader
  `fillRule 3` (windfoil.wgsl), TWO full-rect instances (minor at `step`, major
  at `5·step`), coverage box-filtered per-pixel from world coords with SCREEN-px
  width (uniformly crisp at every depth under tilt) + moiré fade
  (`gs/(3·s)`); fine 10-step/decade ladder `[1,1.25,…,8]` (`fineStep`, sweeps
  ≤1.29×); backdrop cache sig quantized to a 2400px tile (pan/dolly replays the
  cache until a tile boundary). Culling: `rect3DVisible` (extracted to
  `src/camera/frustum.ts`) now resolves the all-corners-behind case BEFORE the
  side-plane tests — w≤0 reverses them and they can spuriously cull a rect the
  camera is standing inside (dolly into a line); the guard keeps a rect visible
  iff the camera's ground position is inside it, else culls (real off-screen).
  `__test_frustum.ts` + 7 world-grid tests (shader-coverage mirror, step-ladder
  pulse bound, tile-quantized sig, 2-instance emit). D23. **tsc clean (only
  pre-existing font.ts error); 397 tests green across 22 suites; vite build ok.**
  Visual verdict = user (`bun run dev` → `#windgraph` → zoom toward off-origin
  lines + tilt). Awaiting CP6. STOPPED.
- 2026-07-31 — **Slider panels: back to WORLD space in 3D (user: "they became
  2D billboards — they need to be 3D in world space; fixed sizing for now").**
  `temp1` had pinned each board's `AnalyticPanel` into the screen HUD in 3D
  (screen-ortho overlay at the corner's projection) — the billboard the user
  rejected. Panels now emit into the WORLD instance buffer at the board's corner
  in both modes; hit-testing + slider drags are doc coords everywhere; the
  screen-HUD panel path was deleted (`screenChromeSig`/`renderScreenChrome`
  gone). Follow-up same day: **fixed world size is now the default in 2D AND 3D**
  (a real flat object that zooms/tilts/dollies with the scene), and each board
  panel gained a `fixed size` toggle to switch to screen-constant (`panelMode`
  on `SliderBoard`, folded into `frameSig` so toggling re-emits). See NOTES.md
  D21 + OQ-11 (later: same visible size, rotated). **tsc clean; 387 tests green
  across 22 suites.** Awaiting CP6. STOPPED.
- 2026-07-31 — **Board titles fixed (user: "the labels for each graph; the size
  change; fix them; make them bigger").** Titles were 18px and screen-constant
  only in 2D — under the 3D tilt they're fixed-world objects that SHRINK (the
  size change), and they sat hidden under the always-open corner settings panel.
  Attempt 1 = screen-constant compensator (`titleSize`/`groundScaleAt`, polar
  band in frameSig) — USER REJECTED ("they still change size": the banded
  re-bake reads as wobble mid-tilt). Final: titles are FIXED world size (tSize
  40, k = 1, like the panels), top-CENTER (visible above the corner panel),
  bright near-white, NO underline. Panels: the `fixed size` toggle is REMOVED —
  fixed (k = 1) is the only mode (`panelMode`, toggle rows, screen branch all
  deleted). **tsc clean; 387 tests green across 22 suites.** Awaiting CP6.
  STOPPED.
- 2026-07-27 — Sprint docs created (`sprint-v2/`, `SPRINT-windgraph-v2.md`,
  `WINDGRAPH.md`). Architecture settled: windgraph objects = IR primitives,
  islands = procedural/field content only. No code changed.
- 2026-07-27 — **0.1 done.** runtime.ts split into shared.ts + emitObject.ts +
  dragControl.ts (1311 → 677 lines); tsc clean; all 58 authoring tests green.
  See NOTES.md D8.
- 2026-07-27 — **0.2 done.** AGENTS.md active-sprint fixed (was stale: pointed
  at completed Authoring v2); PROGRESS.md §0c added (IDE FX sprint + v2 pointer).
- 2026-07-27 — **0.3 done.** WINDGRAPH.md §5 analytic-vs-sampled carve-out (D3);
  implicit-surface/4D/volume/fractal items tagged "sampled content".
- 2026-07-27 — **0.4 done.** `contracts.md` written: primitives-vs-islands
  table, ObjectSpec kind sketches, clip→Animation mapping, board-adapter
  contract. Phase 1 can execute from it.
- 2026-07-27 — Phase 0 complete → stopped at CP1 for user regression smoke.
- 2026-07-27 — **CP1 PASSED** ("all is still identical"). IDE perf drift noted
  → OQ-8 (pre-existing, deferred to Lane N).
- 2026-07-27 — **1.1 done.** `windgraph/expr.ts` compiler (25 tests) + 22 new
  ObjectSpec kinds in `ir/types.ts` + validation (refs, constraint cycles,
  expr syntax, $param refs in any field/array) + 10 new IR tests (29 total).
  All 93 tests green, tsc clean.
- 2026-07-27 — **1.2 done.** `runtime/object-resolver.ts`: `WgScene` resolves
  wg-* specs → ConstraintGraph (world space) + ordered Mobject draw list;
  worklist build, live pt/num sources, plot resampling on param change,
  implicit/field as direct draws, DragController delegation (12 tests).
- 2026-07-27 — **1.3 done.** `builder/objects.ts` (WgBuilder: all 22 kinds,
  `SceneBuilder.wg` + `ChapterBuilder.wg`), `builder/clips.ts` +
  `moveAlongPath` clip kind (types+validate+builder). 13 builder tests.
- 2026-07-27 — **1.4 done.** `playground/boards/windgraphScene.ts`:
  WindgraphSceneBoard hosts the authored demo scene as `s.interactive`
  (supersedes v1 InteractDemo at the same slot/button; autoDrive kept for the
  cinematic). EmitCache on rev|hoverId|tile; hover ring; 8 board tests.
- 2026-07-27 — **1.5 done.** Analytic sliders on the board (screen-constant
  size, drag-to-value, quantized by step); `emitTS` projects all wg kinds
  (scene-level `s.wg.*` orphans + chapter `ch.wg.*` + moveAlongPath). 9 emit
  tests.
- 2026-07-27 — **1.6 done.** `wgRepl(board, line)`: list/params/plot/point/
  circle/slider/drag/remove/emit with validate+rollback+rebuild. Terminal
  hookup is Phase-6 chrome; mechanism tested headless (13 board tests total).
- 2026-07-27 — Phase 1 complete → stopped at CP2.
- 2026-07-27 — **windgraph world demo** (user request, pre-CP2): new `#windgraph`
  route — infinite dot-grid canvas + masthead hosting three authored scenes:
  the triangle port (demoDoc), a constraint-geometry catalog board, and a
  plot-gallery board (rose/damping sliders, lemniscate, vector field).
  `src/playground/windgraphWorld.ts` + demos.ts entry; pointer routes to the
  board under it, empty canvas pans. Playground untouched. 6 world tests;
  CP2 procedure updated to use `#windgraph`.
- 2026-07-27 — World pass 2 (user feedback): boards spaced tighter (GAP 60,
  row y 200), 3D free-camera toggle (cube button), and two zoom-perf fixes —
  backdrop cache keyed on grid STEP not raw zoom, and board cache zoom
  quantized to ~9% log2 bands (zooming no longer rebuilds dots/plots/marching
  squares per frame).
- 2026-07-27 — World pass 3: dot-grid toggle (new `grid` toolbar icon; state
  in cache sig; masthead stays), then boards spaced much further apart
  (GAP 60 → 500 both axes; overview framing auto-derives).
- 2026-07-27 — **Perf pass (overview "abyssimal" report).** Root cause: idle
  frames re-pushed every cached instance through JS conditionals (16 per
  instance × ~8–10k instances × 4 caches). Fixes: (1) `EmitCache.replay`
  rewritten — native bulk pushes + in-place rowBase patches (contract locked
  by new `src/windfoil/__test_emitCache.ts`, 5 tests); (2) hover-static guards
  (world + board) skip the per-frame hit-test walk when pointer/zoom/revs are
  unchanged; (3) zoom-LOD plot sampling — density follows √zoom in 10% steps
  (overview decimates to ~50%, deep zoom refines up to 3×). Remaining
  structural cost = per-frame replay is still O(instances); the real fix is
  instance-buffer diffing / persistent static GPU buffers (Lane N).
- 2026-07-28 — **Drag perf: butt caps + miter joins for geometry strokes.**
  Round caps = 24-quad disc per end = 48 instances per segment; round joins
  another 24 per vertex. A geometry drag rebuilt ~6 segments × 49 instances =
  ~294 scratch instances/frame → GC pressure → worst 25-75ms spikes. With
  butt+miter: ~6 × 3 = 18 instances. 15× reduction. Imperceptible at typical
  stroke widths; infinite-line ends are off-screen anyway. Expected: geom
  during drag 3-8ms → ~1ms, worst spikes mostly gone.
- 2026-07-28 — **"just gray" regression from comp-array bulk-copy offsets.**
  The comp buffer's prefix is a verbatim copy of the frame buffer's prefix,
  so the world's content lands at the same indices in both arrays — row/quad
  references need NO adjustment. The earlier `+rwsOff`/`+crvOff` shifted every
  reference 5×/6× off → zero coverage → gray screen. Fix: removed the offsets
  from the bulk-copy loops. Lesson: when the comp buffer carries a duplicate
  prefix, the copy is index-preserving — patching is only needed when the
  comp buffer's prefix size differs from the frame buffer's (which it doesn't
  here). Screenshot is the ground-truth test; unit tests on rebase must check
  the actual rendered output, not just rowBase ranges.
- 2026-07-28 — **Drag perf: pre-allocated composition buffers (the real fix).**
  Recording showed drag at 80-116fps with tri 4-5ms/frame. Root cause: NOT
  the stroking math — V8 reallocs on number[] `.length` growth. 15 slice
  compositions × 3 arrays each grew the frame buffer's inst/crv/rws, triggering
  realloc + memcpy + GC tail every frame. Fix: WindgraphWorld now owns
  pre-allocated comp arrays (cInst/cCrv/cRws, 65536); the grid + every board
  compose into them via setLen/readLen (no .length growth during composition);
  one bulk-copy at the end appends to the frame buffer with row/quad offset
  patching (comp crv/rws carry a copy of the frame buffer's atlas+static
  prefix so refs stay valid; the duplicate is dead weight after the copy).
  Expected: drag tri 4-5ms → ~1-2ms, js 9-11ms → ~3-4ms, sustained 120fps.
  Visual correctness verified by rowBase/quad-pointer offset math (comp
  atlas-referencing refs land on the duplicate prefix = same data). Screenshot
  is the ground-truth test — user must confirm curves/edges render.
- 2026-07-28 — **REGRESSION from slice caching: all strokes + fills vanished
  (triangle edges, circumcircle, every curve) — only glyphs + direct draws
  survived.** Cause: `EmitCache.appendInto` patched the per-instance rowBase
  with the FLOAT offset (rOff) instead of the ROW offset (rOff/5) — rowBase is
  a row index, so fills/strokes sampled 5× off the end of the row buffer →
  zero coverage; glyphs were untouched (atlas prefix, never patched). Fix:
  `rowOfs = rOff / 5`, mirroring `EmitCache.replay`. Added a test guard that
  asserts every instance rowBase ∈ [0, rws.length/5) — the precise check that
  catches a wrong-unit patch (my earlier byte-identity + range tests missed it
  because they checked rws quad-pointers, not inst rowBase). Lesson logged in
  NOTES: the screenshot is the real test; unit tests on rebase must check the
  inst rowBase unit, not just rws.
- 2026-07-28 — **Drag perf: per-mobject slice caching (recorded drag showed
  the dragged board re-emitting fully every frame — the 240-sample wave
  restroked on every vertex drag).** WgScene now caches each mobject's
  instance slice in a typed EmitCache slice, keyed on a geometry sig the
  syncables return; markDirty fires only on real change, and emit composes
  slices via direct-indexed writes (scratch buffers seeded with the
  atlas+static prefix size so atlas band refs stay distinguishable from
  scratch rows). Dragging one vertex now rebuilds ~6 slices, not the scene.
  Regression test proves byte-identical idle re-emit + partial change on drag
  + row/quad rebase sanity. 125 tests green. Expected drag js ~7ms → ~4ms
  (sustained 120fps); tile-crossing `worst` spikes remain (marching squares →
  Phase 5 worker).
- 2026-07-28 — **IDE idle perf DONE: 13ms → 0.3ms avg (2D and settled 3D).**
  Final fixes: (1) `tabTransT < 1` was permanently true at rest (it only
  advances during a tab switch) — gated on `tabFrom >= 0`; (2) hidden
  terminal's internal animation (boot residue / live widget) no longer blocks
  the skip — gated on `termH > 1`; (3) 3D no longer blanket-excluded — orbit
  pose (azimuth/polar/scale/target) is in the signature, so settled 3D skips
  and orbiting builds. Chip extra line now ends `· gate X` (self-reported
  skip blocker). Verified settled: gate ok, js 0.2-0.7ms, builds ~3-5/sec
  (residual = pointer micro-motion while long-press-sampling; freezes with a
  still pointer). worst ~9ms = occasional GC/encode stall, ≤1 dropped frame
  at 120Hz. Floor is 2 pass encodes + caret overlay (~0.2ms) — stopping here.
- 2026-07-28 — **Chip long-press = sampling log (user: "expect many values").**
  Copying 5×/second only overwrites one clipboard slot — so the chip now
  ACCUMULATES: after the 500ms hold it appends the readout to a log and
  re-copies the GROWING log every 200ms while held (capped ~2 min); one paste
  yields every sample of the hold. Status shows `copied ×N`. Also: the IDE
  debug toolbar button (stats) now toggles the analytic chip's visibility
  (it used to re-show the DOM #fps — the "broken duplicate" the user saw);
  chip gained a `visible` flag (hidden = no render, no clicks).
- 2026-07-28 — **IDE fps chip (user request): identical to the windgraph
  demos.** IDE now renders the shared analytic `FpsChip` (DOM #fps hidden):
  click cycles fps → full → full+diagnostics (`ide js · inst · builds`), long
  press copies. New chip behaviour (both demos + IDE): **while the press is
  held, it keeps copying at 5Hz** so the clipboard always carries the live
  readout (Chromium grants clipboard-write without re-activation; elsewhere
  only the first copy may succeed). HUD skip-sig extended with chip
  mode/status/pressed so toggles redraw instantly.
- 2026-07-28 — **IDE idle pass 3 (REGRESSION: sidebar/terminal wouldn't open).**
  Bug: the quick-hash shortcut matched `quick === lastQuick` without the
  canSkipBuild gate — non-skippable frames set both to -1, so every subsequent
  animation frame matched -1===-1 and skipped: sidebar/terminal eased 1/60s
  then froze. Fix: `if (canSkipBuild && quick === lastQuick)` (frame.ts never
  had this bug — its else branch resets lastFrameSig). Also cached the caret
  subarrays (no per-frame subarray allocs) and added `· b N` (cumulative main
  builds) to the IDE fps line — frozen while idle = skip holds. OPEN: periodic
  fps dips (worst 9-18) — need js-vs-fps during a dip to place it (JS/GC vs
  GPU/compositor).
- 2026-07-28 — **IDE idle pass 2 (0.4ms avg but periodic 4ms spikes report).**
  The spikes were the 80ms quantum rebuilds — a full IDE build 12.5×/sec just
  to flip carets. Fix: **carets moved to a per-frame overlay pass** —
  `CodeEditor.emitCaret` (bloom + step blink from the offset cache) and
  `Terminal.emitCaret` (glide easing + sinusoidal blink from geometry cached
  in render) draw into a tiny buffer through a dedicated `caretRenderer`
  (~4 instances/frame) after the main draw. Main build now runs ~never while
  idle (sig has no time-dependent inputs; quantum is a 250ms collision net).
  Also: IDE skip got a zero-allocation numeric pre-hash (string sig built only
  on detected change — per-frame template strings were the GC pressure),
  allocation-gated HUD sig, and cached draw subarrays. Terminal.sigState no
  longer carries caret state. Expected idle: ~0.2-0.3ms flat, carets at full
  60fps (terminal glide now perfectly smooth).
- 2026-07-28 — **IDE idle <1ms (user request) + default FX → none.**
  `ide.ts` default `fxMode` 'cloth' → 'off' (cloth ran a per-instance apply
  loop every frame). IDE render got the same frame-skip as frame.ts:
  signature over the full render state (cursor/anchor/doc version, ed.y0
  scroll, fileTree hover + scrollOffset, terminal.sigState, tabs/hovers/
  search/panel/menu, sidebarT/termT quanta, quality flags, 80ms blink
  quantum) → on match, skip build + f64→f32 convert + uploads; the pass
  redraws persistent buffers (ide renderer now passes `ideDataVersion`), and
  the IDE screenHud got sig-skipping too. New accessors: `Terminal.animating`
  + `Terminal.sigState`, `FileTree.scrollOffset`. Safety nets: continuous
  motion (fx on, cam3d, tab/sidebar/term transitions, terminal boot/widgets,
  search) disables skipping entirely; the 80ms quantum caps any staleness.
  Caret blinks render natively (editor's is a 530ms step; terminal at 12.5fps).
- 2026-07-27 — **Perf pass 7 (idle hit 0.2ms ✓; interactive >5ms report).**
  `EmitCache` replay rebuilt: capture into typed arrays (Float32Array/
  Uint32Array), replay via direct-indexed composition into pre-grown target
  arrays — no per-frame `push(...spread)`. Replay was ~3.7μs/instance (the
  whole interactive-frame cost, since unchanged boards replay while one board
  rebuilds); contract tests unchanged + green. Known remaining spike: `worst`
  ~8ms on fast pans = plots tile-crossing rebuilds re-run marching squares
  (~5-10ms) — worker offload is Phase 5 (F3D-3); directCache tile is already
  coarse (2400px) to limit crossing frequency.
- 2026-07-27 — **Perf pass 6 — FRAME-LEVEL DIRTY TRACKING (the asymptotic
  fix, Lane N pulled forward; user granted sole frame.ts ownership).** A still
  scene now costs ~0 JS: `WindgraphWorld.frameSig(view)` + per-board `sigFor`
  answer "would this emit identically?" — frame.ts compares
  `staticRev|canvas|viewX,Y,Z|cam3d|sharpen|contentSig` and on match skips
  emit + f64→f32 conversion + all GPU uploads; the render pass redraws the
  PERSISTENT buffers (gpu.ts `draw` gained a caller-managed `dataVersion`
  gating writeBuffer). screenHud got the same treatment (sig → skip
  onBuild+sync+uploads; chrome changes on hover / 8Hz tick / menu / panel).
  `precompute.buildStatic` bumps `s.staticRev`. Skip eligibility excludes
  every time-dependent emitter (editor/terminal/fileTree/demos/fx/menus/
  dynamicEls). Chip diagnostics show cumulative `skipped N still-frames`.
  Interacting (drag/pan/zoom/slider) takes the full path exactly as before.
- 2026-07-27 — **Perf pass 5 (user: grid looks like shit + readings inverted).**
  Two fixes: (1) dot grid → TRUE LINE GRID — a full-length line is one stroke
  instance vs one per dot (~20-40 instances total, ~0.1-0.2ms; minor/major
  tiers, widths derive from step so they're cache-band-constant); (2) debug
  section timings were single-frame snapshots at 120Hz — noise-dominated
  (readings came back inverted: fewer instances costing more = GC/scheduler
  swings) — now EMA-smoothed (α=0.08), 2-decimal. Non-wg js floor (~3-4ms) is
  the two GPU passes + encode + rAF at 120Hz; breaking <2ms needs HUD-pass
  caching / render bundles → frame.ts/screenHud.ts (blocked on the concurrent
  editing session there).
- 2026-07-27 — **Perf pass 4 (grid 4.9ms / js-without-grid 4.3ms reads).**
  Replay throughput is ~3μs/instance (number[] pushes, not memcpy — Lane N
  fixes the floor), so the grid's ~950 dots cost milliseconds: replaced the
  fixed 800px tile margin with a 3-step margin quantized to the grid step
  (spacing target 140px) — dot count now bounded ~100-350 at every zoom.
  And `createBaseApp(useDoc=false)` was hit-testing the FULL reference
  document every frame — empty-doc demos now get an empty docRoot.
- 2026-07-27 — **Perf pass 3 (diagnostic read: 4370 instances idle, caches
  stable).** Root cause of the instance count: round joins cost a 24-quad
  `discCW` disc PER POLYLINE VERTEX (plot curves, implicit contours) and round
  caps two discs per field-arrow shaft. Fixes: plot strokes + implicit contours
  → miter joins (identical at sample density; engine miter-limit guards
  corners), arrow shafts → butt caps, dot grid target 44→60px screen spacing.
  Expected ~3-4× instance cut. Debug line now shows instance count (was float
  count). NOTE: concurrent external edits in the tree this session (frame.ts,
  themeController, layout/*, engine.ts — not sprint work); fixed their missed
  `accent/accentHover` in launcher.ts ThemeCol literal.
- 2026-07-27 — **Analytic fps chip** (user: "absolutely no DOM"): new
  `src/ui/fpsChip.ts` — screen-HUD chip, click cycles fps → full → full + demo
  diagnostics, long press copies. DOM #fps hidden in all finishApp demos;
  playground's inline readout replaced by the chip; windgraph world feeds its
  perf line via `s.hudDebugExtra` (flickering analytic overlay removed).
- 2026-07-27 — **Perf pass 2 (gallery "very poor fps").** The plots board
  re-ran marching squares + vector field on EVERY slider-drag frame and every
  pan tile-crossing, though neither depends on the sliders. Fix: direct draws
  now have their own `EmitCache` inside `WgScene.emit` — signature = zoom band
  + coarse 2400px tile superset + ONLY the param names each expression reads
  (`exprDeps`). Unrelated sliders replay; marching squares re-runs a few times
  per second while panning, not per frame. Regression test: unrelated param
  change keeps emitted instance count identical (13 resolver tests).
- 2026-07-27 — **Reference-design pass (user request, pre-CP2).** (1) Eight
  named analytic button hover effects — lift/sweep/underline/glow/border/
  topbar/ring/corners — drawn in `frame.ts renderHoverFx`, tagged by `hov-*`
  classes (`walkDOM` → `StyledEl.hoverFx`), each labeled in the Foundations
  page so they're tellable. (2) New HUD page (`content/pages/04-hud.html`)
  hosts a LIVE world-space analytic toolbar + settings panel
  (`boards/referenceHud.ts` wired as `s.interactive`); its sliders/toggles
  drive the board's glow/labels/accent-hue. HUD jump buttons added across all
  pages. tsc clean; all `__test_*.ts` green (5 new board tests).
- 2026-07-27 — **Reference-design pass 2 (user request).** Ten more hover
  effects + click effects. Physical trio (push/key/dent) translate face+label
  as one unit — their text is un-baked (`HOVER_FX_MOVES_TEXT` in walk.ts,
  skipped in precompute, re-laid via `layoutFlow(dx,dy)` in the dynamic pass);
  lift on hover, sink on press. Motion set: tilt (rotated `polygonQuads`
  plates), spotlight (tracks `s.mwx`), stack, scan, blink, grow, split. Click
  effects via `clk-*` → `StyledEl.clickFx` + `pressT` (set on pointerdown):
  ripple/burst/flash in `renderClickFx`. Chose geometric pseudo-3D over the
  IDE's per-instance `fxXforms` path — that needs `fxActive` on the whole-doc
  draw + an 8-float/instance upload per frame; true GPU glyph 3D deferred.
  tsc clean; build green; all `__test_*.ts` pass.
- 2026-07-27 — **Reference-design pass 3 (user request).** 25 paired hover×
  click concepts — each button is `hov-X clk-X`, the click the "release" of the
  hover ("charge"): orbit/comet/vortex/helix/pendulum, aurora/prism/neon/
  glitch/static, fuse/ember/torch/firework/radar, levitate/breathe/origami/
  zipper/domino, wave/sonar/typewriter/matrix/barcode. New shared helpers in
  frame.ts: `_shiftHue` (theme-matched multi-color via hue-rotation matrix),
  `_ring`, `_bounce`. Levitate joins `HOVER_FX_MOVES_TEXT` (float+wobble, click
  drops+bounces via `_bounce(pressT)`). Origami/prism fold real rotated quads
  (`polygonQuads`). tsc clean; build green; all `__test_*.ts` pass.
- 2026-07-28 — **Phase 4 Lanes B+C+D+E domain logic (147 tests).** Lane B:
  `constraints.ts` extended with 30+ GObject classes — triangle centers
  (circumcenter/incenter/orthocenter/excenters/Euler line/nine-point circle),
  bisectors/tangents, more circles (diameter/incircle/excircles), radical
  axis/polar/Apollonius/common tangents, conics (ellipse/parabola/hyperbola/
  5-point), transforms (rotate/translate/dilate), circle inversion + Möbius,
  trace/locus, drag constraints (H/V lock, grid/angle snap), measurements
  (length/angle/area/slope/radius), construction protocol, regular n-gon.
  Lane C: `src/windgraph/stats/` — distributions (normal/binomial/Poisson/
  exponential/uniform/geometric/χ²/t/F with PDF+CDF), sampling + histogram,
  CLT simulation, random walks 1D/2D + Brownian motion, Monte Carlo π +
  Buffon's needle, correlation + regression + Anscombe, confidence intervals +
  hypothesis tests. Lane D: `src/windgraph/linalg/` — Mat2 ops (apply/det/
  inverse/mul/rotation/scale/shear), grid transform, eigenvectors (analytic
  2×2 + power iteration), dot/cross/projection/angle, Gram-Schmidt, SVD,
  change of basis. Lane E: `src/windgraph/graph/` — named graphs (Petersen/
  Kₙ/Cₙ/grid/star/wheel/tree/G(n,p)), force-directed layout (Hooke+Coulomb),
  BFS/DFS/Dijkstra, Kruskal/Prim MST, Eulerian path/circuit (Hierholzer).
  All pure domain logic, no IR wiring. tsc clean (my files); 147 new tests
  green; all pre-existing tests unaffected.
- 2026-07-28 — **Track A 2.1 done (Phase 2 moat foundation).** `Mobject` gains
  `elevation/extrude/faceTilt`; `RenderCtx.xf` carries the shader's `fxXforms`
  layout (8 floats/instance) and `emitOp` writes (rotX,rotY,z,scale) for elevated
  ops — per-instance z WITHOUT the IDE FX system (D10). `WindgraphWorld` composes
  a parallel `cXf` comp buffer → full-prefix `xfBuf`, exposes `xfBuffer()`;
  `frame.ts` passes it to `renderer.draw` + sets `fxActive` only when something is
  elevated (flat scenes = zero cost). Under the 2D ortho VP the shader's clip-z row
  is 0, so elevation is invisible in 2D and reveals on tilt (OQ-9 seamlessness).
  IDE FX path untouched. tsc clean; world/scene/emitCache tests green (24).
- 2026-07-28 — **Track A 2.2 done (extrude renderer, resolves OQ-1 → D9).**
  `space3d/extrude.ts` `emitPrism`: top face = polygon fill translated to z=h
  (Euler-path xform); side walls = ONE analytic fill quad each, stood vertical by
  a per-instance quaternion (mat3→quat, columns +x→edge, +y→up, +z→outward normal)
  — stays in the single windfoil pass so silhouette edges stay razor-sharp at any
  zoom/grazing orbit (the moat) and ride the same orbit VP (seamless, OQ-9). Flat
  Lambert shading reuses `LIGHT_DIR`; convex prism emits all walls depth-sorted
  back-to-front + top last (no cull → azimuth-sign robust); walls skipped near
  top-down (polar<0.02) so the 2D ortho view is a clean flat polygon. `Polygon` +
  `Circle` (cylinder = 40-gon) override `emit` for `extrude>0`, reading the live
  orbit pose (`isEnabled/orbitPolar/orbitAzimuth`). 5 geometry tests verify the
  quaternion walls stand vertical (+y→+z) + xf stays 1:1 with instances. tsc clean.
- 2026-07-28 — **Track A 2.3 done (glyph & math extrusion).** `MathTex.emit`
  gains `z`+`xf` opts — every glyph/rule/path instance is lifted by z into the
  per-instance fxXforms buffer (Euler-path translation), 1:1 with instances. New
  `Tex` Mobject (primitives.ts) wraps MathTex with `elevation`+`extrude` (folds
  both into the glyph z); `Label` folds `extrude` into its accumulated z so its
  text op rises. The IDE fireworks/logo per-instance 3D is now a first-class
  Mobject capability (no FX system). 5 headless tests (`__test_glyphExtrude.ts`,
  mock atlas glyph) verify z+xf alignment. tsc clean.
- 2026-07-28 — **Track A 2.4 done (continuous camera tilt).** `orbit.tiltOrbit`
  eases the polar via the camera-controls library transition (no snap). The
  windgraph world gains `toggleTilt` (enter3D → seamless top-down entry per OQ-9,
  then glide to a 0.9-rad 3/4 tilt; exit3D eases back to 2D) + a `doubleTap` hook;
  the cube toolbar button now drives it, and `input.ts`'s dblclick routes to
  `s.interactive.doubleTap` (boards without it fall through to fit-to-screen). One
  shared camera → every board lifts together, no per-board special-casing. tsc clean.
- 2026-07-28 — **Track A 2.5 done (analytic contact shadows, resolves OQ-2 → D11).**
  `space3d/extrude.ts` `emitShadow`: silhouette projected along `LIGHT_DIR` to the
  ground plane (z=0), drawn as ~4 concentric analytic fills with alpha `0.55^i` —
  a penumbra whose every edge is a coverage integral (sharp at 1000×, no raster
  blur). Offset/spread/strength scale with height ⇒ animates continuously with
  elevation; drawn first (painter order, under the prism). `emitBlobShadow` covers
  glyphs (ellipse footprint); `Mobject.castShadow` → `emitPrism({shadow})`. 4 new
  tests (9 total in `__test_extrude.ts`). tsc clean.
- 2026-07-28 — **Track A Phase 2 demo board + CP3 gate.** `boards/windgraphExtrude.ts`:
  a square prism + a cylinder extrude on an analytic slider (0→130px), a `z=f(x,y)`
  LaTeX headline whose glyphs rise, a rising label — all casting layered contact
  shadows; double-tap (or the cube button) glides the whole world into a tilted
  orbit via the shared `toggleTilt` (camera.ts). Wired as the world's 4th board
  (xf composed through the world's `cXf` → `xfBuffer()` → frame.ts `fxActive`) and
  as a standalone `#extrude` route (demos.ts). Board `emit` matches the `Board`
  contract (xf via `xfTarget`); `sigFor` tracks the quantized orbit pose so orbiting
  rebuilds and settling frame-skips. **Phase 2 (Track A) complete → STOPPED at CP3.**
  403 repo tests green (22 files); tsc clean.
- 2026-07-28 — **Phase 4 Lane A (plot catalog) + Lane K (mathtex) complete.**
  Lane A: 9 new `src/windgraph/plot/*` modules (spline, sequence, calculus, ode,
  fourier, stats, contour, inequality, charts) + 18 new ObjectSpec kinds wired
  end-to-end (ir/types union, validate, builder/objects, object-resolver buildOne
  + depsOf, emitTS projection, plot.ts barrel). Object-like plots resolve to
  Mobject groups (animatable); field-like ones (inequality/streamlines/bifurcation/
  contours) are view-dependent direct draws — same split as plot-fn vs implicit
  (D1). Prereq: `expr.ts` grew comparison/logical ops (`> < >= <= == != && || !`)
  so piecewise conditions `{x>0: …}` compile (the Lane-L grammar extension, pulled
  forward). Lane K: mathtex parser+layout gained matrices + TRUE growing
  delimiters `\left(…\right)` (drawn as analytic vector paths/rules, not scaled
  glyphs → sharp at any zoom), `\begin{cases}`, `align`/`align*` + equation
  numbers, accents + over/underbrace, `\xrightarrow`, and K6 `MathTex.locate()`
  (world box of a coefficient for click→slider binding). `plotGalleryDoc()` in
  windgraphScene.ts showcases the catalog (needs a board slot — demos.ts/world are
  Track A's). 56 new tests (27 plot math + 20 resolver kinds + 10 mathtex − 1
  shared); 312 total green, tsc clean.
- 2026-07-28 — **Lane A review fixes.** (1) `accumulation()` sign bug: the old
  walk added a positive `h`-contribution on both sides of `a` and never anchored
  `F(a)=0`, so `F(x)` for `x<a` had the wrong sign. Rewritten as `F(x)=G(x)−G(a)`
  (cumulative trapezoid from `x0` minus a fine anchor integral whose sign follows
  the step direction) — correct on both sides; test now asserts `F(a)=0`, the
  negative side, and the even-antiderivative case `∫₀⁻² t dt = +2`. (2) The
  `expr.ts` comparison/logical ops (pulled forward for A1) had zero direct tests —
  added 8 (each op's 1/0 result, `&&`-tighter-than-`||`, cmp-tighter-than-logical,
  additive-tighter-than-cmp, a piecewise-style variable condition, and a bare-`=`
  rejection). expr 33 / plot 27 / plotKinds 20 green, tsc clean. (The 4 failing
  repo tests are concurrent sessions' in-flight files — mobject/space3d extrusion
  + stats — untouched by this track.)
- 2026-07-28 — **Track A CP3 round-5 (D18): quality panel + smooth + plug + MSAA +
  real shadows.** Universal `AnalyticPanel` (reused via app.ts `makeQualityPanel`/
  `qualityToolbarButton`; finishApp renders s.panel) wired into #windgraph +
  #extrude with res/sharpen + smooth/MSAA/real-shadows toggles. Smooth = per-vertex
  normals in pushWalls (Gouraud; box flat, cylinder+glyph sides smooth). Plug =
  analytic glyph top raised 1.5px + wall inset removed → sliver gone. MSAA =
  sampleCount on both pipelines + 4× resolve targets + recreate-on-toggle. Real
  shadows = depth-only caster pass (lightViewProj) + textureSampleCompare + a
  no-depth-write ground catcher; fake blobs skipped when on; gated to tilted 3D.
  Bind-group gotchas fixed (caster group1-only; line group1 = uniform-only). Tight
  shadow frustum + small bias for precision. Defaults smooth ON / MSAA OFF /
  shadows OFF (GPU features I can't see → off = known-good; WebGPU console-loud on
  mis-wire). The mobject/space3d test failures the prior log flagged are now FIXED
  here. **382 tests green across 22 files; tsc clean. STOPPED at CP3.**
- 2026-07-28 — **Track A CP3 round-6 (D19): MSAA + real-shadow robustness.** User
  reported MSAA→black and real-shadows→black flicker. (a) MSAA multisample resolve
  black-screened (WebGPU clears the resolve target, not the MSAA view) → replaced
  with 2× supersampling via renderScale (the AA toggle now drives resolution; deleted
  the resolve/ensureMSAAViews/rebuildRenderers machinery). (b) Shadow flicker = solids
  self-sampling the map (co-planar acne) → fsTri no longer samples; only the ground
  catcher (fsCatch) does; grounded shadow is the payoff, solids keep baked Lambert.
  (c) Removing shadowFactor from fsTri collapsed triPipeS group-1 to uniform-only,
  invalidating the 3-entry triShadowBind → black; rebuilt tri+line bind groups as
  uniform-only, catcher keeps the full map bind. Lesson logged: editing a fragment's
  resource use invalidates its auto-layout bind group. Defaults unchanged (smooth ON /
   AA OFF / shadows OFF). **382 tests green; tsc clean. STOPPED at CP3.**
- 2026-07-29 — **CP2+CP3 PASSED** ("both ok").
- 2026-07-29 — **Phase 4 IR wiring B/C/D/E complete.** 46 new ObjectSpec kinds
  wired end-to-end (types/validate/builder/resolver/emitTS): Lane B geometry
  (circumcenter/incenter/orthocenter/excenter/euler-line/nine-point/perp-bisector/
  angle-bisector/median/altitude/tangent/tangents-from/circle-diameter/incircle/
  excircle/radical-axis/polar-line/pole-point/common-tangents/apollonius/rotated-pt/
  translated-pt/dilated-pt/inversion/mobius/locus/regular-polygon/h-lock/v-lock/
  grid-snap/angle-snap/length/slope/radius/area); Lane C stats (distribution/
  sampling/clt/random-walk/monte-carlo/correlation/hypothesis); Lane D linalg
  (matrix-grid/determinant/eigenvectors/matrix-compose/dot-product/svd); Lane E
  graph theory (graph/traversal/shortest-path/mst/eulerian). `wg-conic` stub
  replaced with live resolver (ellipse/hyperbola/parabola from foci/directrix).
  **382 tests green across 22 files; tsc clean.**
- 2026-07-29 — **Demo boards wired.** Four new `WindgraphSceneBoard`s added to
  the world: `geometryCatalogDoc` (B: centers, Euler line, nine-point, incircle,
  conics, n-gon, measurements), `statsDoc` (C: distributions, sampling, CLT,
  random walks, Monte Carlo, Anscombe), `linalgDoc` (D: matrix grid morph with
  4 entry sliders, determinant parallelogram, eigenvectors, dot product, SVD),
  `graphTheoryDoc` (E: Petersen, complete, BFS grid, Kruskal MST, Eulerian
  circuit). World now hosts 8 boards. VALID_KINDS set updated. World test
  updated (4→8 boards). **382 tests green; tsc clean.**
- 2026-07-29 — **Catalog board bug-fix pass (user: empty graph card + dead n
  slider + messy overlap).** Three root causes, all in the resolver/cache layer:
  (1) **empty graph card** = `EmitCache.signature` initialised to `''`, which
  equals a param-less scene's `lastParamSig` (`''`) → the first-emit slice gate
  `sig !== sc.signature` was `'' !== ''` = false → the slice was never captured
  and replayed empty forever (only param-less boards hit it; linalg/stats survived
  because their sliders make the sig non-empty). Added a `captured` flag to
  EmitCache; gate is now `!sc.captured || sig !== sc.signature`. (2) **n-gon off-
  screen / dead slider** = `this.pt(literal)` returns WORLD coords but the loop
  treated the centre as data and ran `dToWx` a second time (→ ~37000px off-card);
  the constraint graph lives in world space, so the polygon is now built in world
  directly (slider re-runs resample → sides change live). Same double-conversion
  hid the **conic** (also `sample()` is world, not data → dropped `toWorld`; and
  `semiMajor:3` was world px vs a ~280px focus gap = degenerate → now sized from
  the live focus distance, with foci in the track sig so dragging them re-runs it).
  (3) **measurement labels** showed px magnitudes (`A=244550`) → scaled by unitX /
  unitX·unitY to data units. Probe-driven: direct `group.emit` gave 544 instances
  while the slice path gave 0, which localised the bug to capture, not geometry.
  **382 tests green; tsc clean.**
- 2026-07-30 — **Catalog-board polish pass (user: panels limited/buggy, sliders
  ugly + only-n-updates, zoom tanks fps + chrome resizes + grid hairlines).**
  Assessment: sprint counted a kind "done" at engine-wiring + headless test, but
  the surfacing boards were stubs and the chrome off-brand; CP6 (taste gate) was
  still pending so nothing reconciled green-tests with product feel. Four fixes,
  all local: (1) **sliders → reference look + full-row track grab** — replaced the
  knob-only `strokeInto` line + `circleQuads` dot with the AnalyticPanel language
  (track rect + accent fill + square thumb + right-aligned value chip, yasmineOS
  palette, `addRect`); `tryBeginDrag`/`updateHover` now hit the whole row and
  click-to-position, so μ/σ/a–d respond on press, not only a 14·k knob — this was
  the "only n updates" cause (n's integer step is the one unmistakable shape
  change; the rest looked dead). (2) **chrome uncached from zoom-quantized
  geometry** — title + sliders now emit every frame at exact k=1/zoom OUTSIDE the
  `sigFor`-keyed cache (cheap, ~10 inst), so they no longer snap at the ~9% zoom
  bands; the frame-skip sig embeds raw viewZ so zoom never skips anyway → the old
  design paid the per-frame replay tank AND snapped the chrome (worst of both).
  (3) **grid** — `numberPlane` line width floored 1→1.5 screen px (1px hairlines
  alias harshly / vanish at overview) and minor grid skipped below 0.3× zoom
  (doubles line count for zero payoff at overview). (4) **LOD resample debounced**
  150ms after the last zoom change (was every band during a zoom gesture = full
  resample across all on-screen boards). Boards enriched: stats `randomWalk.steps`
  now param-bound (was `seed:99` dead weight); graph-theory swapped the fixed
  `petersen` (no slider) for a `random` graph with live `n`+`p` sliders driving the
  BFS traversal. Headless verification: 3 new contract tests in
  `__test_windgraphWorld.ts` (track-grab sets min/max; walk+traversal resample on
  param change; overview grid sparser than 1×) + updated slider-drag test; **45
  green across scene/world/resolver/emitCache; tsc clean.** NOTE: headless
  Chromium has NO WebGPU adapter → cannot screenshot pixels here; visual gate =
  user's machine at CP6. Awaiting CP6 verdict. STOPPED.
- 2026-07-30 — **Conic focus-drag fix (user: oval ignores its foci).** Real
  invalidation bug, not feel: `wg-conic` registered its `resample()` in
  `plotResamples`, which `update()` only runs on a *slider param* change
  (`object-resolver.ts:2062`) — dragging F1/F2 moves *points*, so the ellipse
  polyline never rebuilt (the track sync saw the move but re-emitted stale
  children). Fix: rebuild inside the track closure gated on a sig carrying the
  foci + directrix positions (the `wg-plot-spline` pattern); dropped the
  param-only registration. Regression test drags a focus, asserts the polyline
  reshapes. **15 resolver tests green; tsc clean.** Latent-class check: the only
  other point-driven kinds (`regular-polygon`/`rotated-pt`/`locus`) use fixed or
  param centers on current boards, so none are exposed — conic was the sole live
  case. Awaiting CP6. STOPPED.
- 2026-07-30 — **Pre-CP6 bug-fix pass (user: 3D zoom ≠ 2D + panel sliders must be
  analytic/fixed-size both modes).** (1) 3D zoom: the chip read the stale 2D
  `viewZ` (never synced from the orbit camera) → frozen number; and the eased dolly
  swept each board's live zoom-band sig → full marching-squares/resample rebuild ×8
  boards per glide → the tank. Fix: `camera.ts stepCamera` reflects the orbit pose
  into `viewX/Y/Z` (chip tracks live); boards freeze the 3D zoom band to a settled
  value (120ms debounce, like the LOD path) so the glide zooms via the VP with zero
  emit + one rebuild on settle (render pass redraws persistent buffers through the
  live VP — verified the skip path only gates the upload). (2) Sliders: the
  world-space hand-rolled sliders warped under perspective (a ground-plane rect is a
  screen trapezoid). Now each board owns a real `AnalyticPanel` drawn as a
  screen-space HUD overlay pinned to the board's projected corner
  (`boards/sliderOverlay.ts worldToScreenPx`); at scale=1 it's pixel-identical to
  the old 2D sliders, and crisp+fixed in 3D — one component both modes. Hits stay in
  the world-coordinate contract (project pointer→screen px inside the board), so
  input.ts + the headless slider tests are UNCHANGED and pass as-is. Dead world-
  space slider code deleted. **tsc clean (only pre-existing font.ts opentype-types
  error, untouched); 13 scene + 13 world tests green.** Visual+fps = user's machine
  (headless has no WebGPU adapter). Awaiting CP6. STOPPED.
- 2026-07-30 — **3D zoom parity fix (user: 3D zoom tanks fps + delayed quality
  change ≠ 2D smoothness).** Root cause: the D21 `zq3d` freeze + 120ms debounce
  prevented per-band rebuilds but left the FRAME-SKIP sig embedding raw `viewZ`
  → every dolly frame changed the sig → no skip → full emit (8-board replay +
  composition + upload) ran 120×/s = the tank. And the 120ms debounce snapped
  quality on settle = "delayed quality change". Fix (3 changes, all matching
  2D's path): (1) `frame.ts` frame-skip sig uses `'3d'` instead of raw
  `viewX,viewY,viewZ` in 3D — geometry is camera-independent (the VP transforms
  cached instances in the shader), so the sig is stable between geometry
  changes (rev/hover/zq-band/LOD) → frames skip between bands (cost ~0), full
  emit at bands only (same as 2D). (2) `frame.ts` computes the actual visible
  ground-plane rect for `boardView` in 3D (ray-casts 4 viewport corners via
  `scrToDoc`) instead of the ±1e12 sentinel — this enables sub-board culling
  (only visible boards emit, same as 2D) and lets `sigFor`/`backdropParts`/
  `WgScene.emit`/`emitObject` all use the 2D tile-quantized clip path (no
  3D special-case). (3) Removed the `zq3d` freeze/debounce from both boards —
  `sigFor` uses live `zq` (same as 2D), so quality updates at band boundaries
  during the glide (no delay). `backdropParts` clamps the 3D rect to the content
  area so behind-camera rays (looking at the sky above the horizon) don't
  inflate the grid. **tsc clean (only pre-existing font.ts error); 57 tests
  green across 5 suites.** Visual+fps = user's machine (no WebGPU adapter
  headless). Awaiting CP6. STOPPED.
- 2026-07-30 — **Instant 2D↔3D toggle + slider panels in world space (user:
  no camera movement on toggle; panels should be in 3D like context menus).**
  (1) Toggle: `tiltOrbit` + `flattenOrbit` now use `animate=false` — the 2D↔3D
  button snaps instantly (no eased camera tilt). `exit3D` still eases control
  back to 2D via `stepCamera`'s polar<1e-2 handoff (one frame). (2) Panels:
  moved from screen-HUD overlay to WORLD instance buffer — each board's `emit`
  renders its `AnalyticPanel` after the title (uncached, in doc coords at the
  board's corner, screen-constant size `k=1/cameraScale`). In 3D the panel sits
  on the ground plane, perspective-foreshortened through the orbit VP ("in 3D"
  like the context menu). In 2D the ortho VP maps it to the same screen
  position as the old HUD overlay. Hit-testing uses world coords directly (no
  `worldToScreenPx` conversion — the panel is in doc space). `renderScreenChrome`/
  `screenChromeSig` are no-ops (panels not in HUD). `frameSig` includes panel
  interaction state (open/hover/drag) so hover highlights and slider drags don't
  stall on skipped frames. `sliderOverlay.ts` `SliderBoard` interface gains
  `app` field (for `cameraScale`). Dead `sliderGeom`/`KNOB` code deleted.
  **tsc clean; 57 tests green across 5 suites.** Awaiting CP6. STOPPED.
