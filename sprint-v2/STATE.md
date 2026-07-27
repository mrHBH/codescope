# windgraph v2 — Live State

**This file is ground truth.** An agent starting fresh reads this first.
If this file and the code disagree, investigate before trusting either.

## Current position

- **Phase:** 1 — **all 6 tasks done, awaiting CP2 verdict**
- **Next task:** 🔍 **CP2** — the drag feel (`checkpoints.md`; board lives in
  `#playground` → "windgraph v2 authored scene" button). On pass → Phase 2.
- **Checkpoints passed:** CP1 (2026-07-27)
- **Blockers:** none
- **Last updated:** 2026-07-27 (Phase 1 complete; 127 tests green)

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
