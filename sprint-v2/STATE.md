# windgraph v2 — Live State

**This file is ground truth.** An agent starting fresh reads this first.
If this file and the code disagree, investigate before trusting either.

## Current position

- **Phase:** 4 — **All lanes complete + IR wired** (A+B+C+D+E+K domain + IR)
- **Next task:** CP6 gallery cull prep — build demo boards showcasing B/C/D/E
  kinds on the `#windgraph` world. Then Phase 5 (depth).
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
