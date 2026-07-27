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
