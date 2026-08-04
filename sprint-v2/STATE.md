# windgraph v2 — Live State

**This file is ground truth.** An agent starting fresh reads this first.
If this file and the code disagree, investigate before trusting either.

## Current position

- **Phase:** RE-FOCUS on the original sprint (2026-08-04, user directives —
  D36 + D38). The performance era (07-31 → 08-04, D27–D35) is DONE and held:
  240fps idle 3D (frameCache blit), near-zero-fps-hit drags (persistent
  composition + dirty-range uploads + slack slots), and the record/replay
  harness (`perf:record` / `perf:replay`) as the standing measurement
  instrument. Goal (D38): **the best math plotting + animation library for the
  web** — ultra-high performance, windfoil sharpness for 2D, mesh3d for 3D
  (two separate pipelines — NO analytic 3D, ever again), smooth animation,
  pedagogical: math made accessible in the browser, better than Manim. The
  Phase-3 flagships (contour→surface, Galton board) are the best teaching
  demos and are still UNBUILT — they go next, ahead of further
  parity/3D-catalog work.
- **Done so far:** Phases 0–2 (CP1/CP2/CP3 passed) · Phase 4 engine wiring
  (A1–18, B1–12, C1–7, D1–6, K1–6 — resolver/IR complete; boards wired but
  stub-quality per the D20 lesson) · F3D-2 (watertight mesh tubes, D26 pivot) ·
  Lane E domain logic (30 tests, unwired) · perf substrate (frame-skip sigs,
  slice caches, dirty-range GPU uploads, frameCache, MSAA gating, record/replay).
- **Next tasks (in order):**
  1. **Showcase pass** on the Phase-4 lane boards — a kind is not done until its
     board reads as a showcase (D20). Prerequisite for a meaningful CP6.
  2. **CP6, split per lane** (A/B/C/D/K in separate sittings) — record culls as
     strikes in Phases 5–6.
  3. **Phase 3 (moat):** G0 design notes (G4 seam + G5 skin loft) → G1–G6 →
     **CP4**; lane H concurrent: early box3d 500-ball benchmark (OQ-4) → H1–H4 →
     **CP5**. Lane L1 (expression parser) may run in parallel — disjoint modules.
- **Checkpoints passed:** CP1 (2026-07-27), CP2 (2026-07-28), CP3 (2026-07-28)
- **Blockers:** none
- **Last updated:** 2026-08-04 (re-focus housekeeping; STATE log pre-08-01
  archived to `log-archive.md`; code state re-verified: tsc clean, 431 bun +
  9 vitest tests green)

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

- 2026-08-04 — **D39: video export can wait; focus = hypersmooth live renderer
  (user: "a self-contained link beats manim; video is an option; focus on the
  hypersmooth live renderer first").** Corrects D38's M3 weight: video capture
  stays a Phase-6 option; the share format is the self-contained link (M2
  URL-state — SceneDoc is JSON → the recipient gets the LIVE interactive
  scene). Performance is the product: every feature — Phase-3 flagships
  included — is fps-gated via record/replay before it counts as done; where a
  feature conflicts with smoothness, smoothness wins. NOTES D39 + §5; phase-6
  M2/M3 annotated. Docs-only.
- 2026-08-04 — **D38: two-pipeline law + repositioning (user: "we can't have an
  analytical 3D pipeline — not generalizable, too much headache; separate
  pipelines: analytic for 2D text and plots, mesh3d for 3D; not after a moat —
  the best math and animation library for the web; a pedagogical tool, better
  than Manim").** Recorded as D38 in NOTES.md: windfoil analytic = 2D content
  only; mesh3d = every 3D body (`#curve3d` = the reference demo). The D26
  depth-write analytic-3D infra is deprecated (zero live consumers — no board
  implements `opaqueCount`), removal scheduled in Lane X. Positioning shifted
  from "uniqueness moat" to execution quality (performance, sharpness, smooth
  animation, breadth, pedagogy); lane J + M3 (video export) gain strategic
  weight for the Manim story. Propagated: NOTES §5 direction reminders,
  WINDGRAPH.md goal, SPRINT-windgraph-v2.md banner, phase-3 G0(b)/G5
  (fully-mesh 3D + 2D analytic chrome), CP4 question, TODO banner. Docs-only.
- 2026-08-04 — **Sprint review + re-focus housekeeping (user: "shift focus back
  to the original sprint; goal = the best math plotting + animation library").**
  Full-plan review verdict: structure robust (checkpoint kill-gates, D1–D35
  decisions log, differential-test culture; code state re-verified today — tsc
  clean + 431 bun / 9 vitest green), but execution had drifted from D2
  moat-first: Phase 3 (G/H flagships) untouched while Phase 4 parity + F3D-2
  shipped. Amendments recorded: **D36** (re-focus order: showcase pass →
  per-lane CP6 → Phase 3 G‖H, L1 parallel; N1/N2 credited as delivered),
  **D37** (OQ-9 resolved → top-down-indistinguishable design law), **G0**
  design-note task added to phase-3 (G4 seam vs the D16/D17/D18 laws; G5
  skin-loft = highest-risk task in the plan), CP6 split per lane
  (checkpoints.md). STATE log pre-08-01 moved to `log-archive.md`. Docs-only
  change; no code touched.
- 2026-08-04 — **3D-idle fps fluctuation fixed = still-frame cache + blit (user:
  "zoom in, switch to 3D, nothing changes but fps fluctuates a lot").** Idle 3D
  was re-running the full coverage+mesh+HUD redraw every frame; that GPU cost sat
  at the 240Hz vsync budget so dt split 4.2/8.3ms (fps oscillated 120↔240, min
  102). Full submit-skip is wrong (Chromium throttles a no-damage canvas to 60Hz),
  so the fix keeps presenting but makes still frames cheap: `windfoil/frameCache.ts`
  caches the last render offscreen and a still frame (frame-skip sig + viewProj +
  HUD sig unchanged) presents it with one ~0.3ms blit. Emit frames render direct
  (zero overhead); skipFrame frames render into the cache (8Hz chip tick doesn't
  double-render). Real-GPU: 3D idle stable 240fps at 97% blit; A/B replay all 9
  recordings no regression (3ddonothing avg 200→233, repro 225→234, 3dsimple
  194→214); screenshots pixel-faithful. Residual ~1s single-frame stalls are
  external (GPU reclock/compositor; in the pre-change baseline too). NOTES D35.
  tsc + 27 bun suites + vitest green.

- 2026-08-03 — **Handle-drag FPS fix, attempt 3 = "0 fps hit" (user: the repro
  still shows an fps hit while dragging; make it really free; is the debug fps
  panel the cause?).** Per-label GPU-upload tracing exposed four stacked costs,
  all fixed (NOTES D34): the world's per-frame EMA line was in the HUD skip-sig
  (HUD rebuilt + re-uploaded every drag frame) → sampled at 8Hz; the screen HUD
  seeded from the live working array so its partial uploads never engaged →
  atlas-only seed + prefix-once uploads; xf was full-uploaded twice per frame →
  skip-when-clean + dataVersion-gated; and digit/arc-boundary length changes
  re-emitted the whole tail → **stage 5 fixed crv/rws slots with slack** (slice
  splices in place; inst memmoved; rare relayout on overflow) + **stage 5b
  persistent frame region** (dirty-range splice, copy 1.1→0.09ms). New gates
  4/4b/4c/5 (slack rendered-equivalence vs naive, no full-dirty drags,
  persistent-region protocol); 3/3b run no-slack ≡ naive. **Repro drag window:
  244→3 over-budget frames, jsAvg 2.92→0.93ms.** And YES — the analytic chip's
  text is in the HUD sig (8Hz rebuilds ≈ 1–3ms spikes mid-drag): new toolbar
  `stats` button swaps it for the trivial DOM `#fps` (free) → **1/843 frames
  over budget during the drag**. All suites + tsc green; all 8 recordings
  replay ok; screenshots looked at (pixel-faithful). Residual non-drag spikes:
  mode-toggle rebuild + rare drag-start relayout (Phase-5 worker).
- 2026-08-03 — **Handle-drag FPS fix, attempt 2 (postmortem playbook followed;
  DESIGN-drag-fps-2.md).** The world now composes PERSISTENTLY: clean boards
  contribute nothing (no replay, no prefix seed), a dirty board re-emits into a
  scratch seeded at its comp-absolute offset and splices into its slot; a slice
  LENGTH change re-emits the tail (caches replay with correct rebases — no
  incremental bookkeeping). frame.ts + gpu.ts upload only the world's reported
  dirty ranges (a drag writes ~16–64KB instead of the full 1.76MB crv buffer),
  with full-upload fallbacks for every stale-GPU hazard (growth, prefix change,
  2D camera move, extra emitters, menu growth). `naiveEmit` flag = old full
  recompose = differential-test reference + emergency fallback. Gates in
  `__test_dragPerf.ts`: drag-must-change-emit (bug-A class), still-scene
  bit-identical, persistent≡naive across drags/pans/zooms. Verified per stage:
  tsc + 27 suites + vitest green; real-browser replay; screenshots at
  p25/p50/p75/end LOOKED AT — pixel-identical to baseline. Drag window of
  `repro`: jsAvg 2.92→~2.0–2.3ms, uploads 1202→~600KB/frame (91% <200KB);
  same-conditions A/B: repro median ~181/~95 → ~206/~104, 3dsimple min 74→113,
  latest min 87→108; simple recordings 176–239 min. A stage-4 experiment
  (3D view-independent sigs) was A/B'd and REVERTED (wash on rotation,
  regression on zoom-heavy 3D). Honest residual: the 3 complex 3D recordings
  sit at 108–113 fpsMin — single-frame essential-work spikes (mode-toggle
  rebuild ~22ms, LOD-settle rebuilds, measure-label digit boundaries) that the
  postmortem defers to the Phase-5 worker. New dev tool: `bun run shots <name>
  [atMs] [a:b]` = replay + screenshots + per-section/upload trace (gated on
  `window.__trace`). The original handle-drag bug is FIXED; "solid 240 on the
  whole mixed repro" remains worker-bound.
- 2026-08-02 — **Replay stats panel = playground-style board (user: "the stats
  panel is different — the playground one has a copy-all button and graphs for
  the fps and labels").** The replay report + recording summary now carry the
  per-frame series (`dt`, `js`, downsampled ≤400 pts via `downsampleMax`), and the
  analytic stats panel gained the playground benchmark's chart + copy: a rect-only
  frame-gap chart (green dt columns + orange js caps, bucketed ≤360, 16.7/33.3ms
  budget lines + axis labels + an interpretation caption) above the
  recorded-vs-replay table, plus a **"copy all" button** that writes the stats as
  markdown to the clipboard (label flashes "copied ✓"). Labels: inputs, viewport,
  duration, fps/dt/js, dropped, frames, "js≈dt = main-thread bound · js≪dt =
  GPU/compositor bound". Verified: injected report renders the chart (1763 inst);
  clicking copy puts `### replay · <name>` markdown on the clipboard. tsc + suites
  green.
- 2026-08-02 — **Replay → auto-return to #testinfra with a large stats table
  (user: "remove the stats button; after replaying go back to the recordings list
  and display a larger table with detailed fps/js values and labels").** Removed
  the per-row 📊 stats button (▶ replay + 🗑 delete remain). The ▶ button now
  navigates to `#<route>?replay=<name>&back=testinfra`; when `?back=testinfra` is
  present the replay engine publishes the report then auto-navigates back after a
  1.6s observation window. On return the analytic board shows a LARGER stats
  table (600×470): title, input labels with counts, viewport/duration, and a
  recorded-vs-replay column grid — fps avg/min/p95, frame dt avg/p95/worst (new:
  dt is sampled from `__perf.dt` and added to `StatSide`/`RecSummary`), js
  avg/max, dropped frames, frames sampled. Verified: replay of tri-drag with
  `&back=testinfra` returns to `#testinfra` and renders the stats panel. tsc +
  suites green.
- 2026-08-02 — **Replay fidelity: handle drags now reproduce (user: "not
  replaying exactly; camera fighting; dragging interactive handles recorded as
  camera movement").** Two causes of a handle-grab MISSING on replay (which turns
  the drag into a camera pan): (1) the animated 3D orbit camera (cursor-anchored
  rotation easing, ROT_TAU) drifts from the recording as events replay, so by the
  time a handle-drag pointerdown fires the handle is elsewhere → grab misses →
  moves pan. Fixed: the recorder captures the camera pose on EVERY pointerdown
  (`RecEvent.cam`), and the replay re-syncs to it before dispatching each
  pointerdown — drift is bounded to one gesture. (2) The pointerdown coords are
  screen CSS px; a replay at a DIFFERENT viewport/dpr maps them to the wrong world
  position. The perf:replay script already matches the viewport; the fix is to
  always replay at the recorded viewport (manual `?replay=` in the same browser
  matches). Also fixed a `scripts/record.ts` `worldToScreen` units bug (used
  backing px with CSS mouse coords at dpr 2 → recorded pointerdowns landed off the
  handle). Verified: a fresh 2D handle drag replays with the handle moving
  (A 378→714) and the camera stationary; all recordings pass
  `perf:replay --expect-min 60`. **The user's `latest.json` is a PRE-fix recording
  (no cam fields) — delete it and re-record to get faithful handle-drag replay.**
  tsc + suites green.
- 2026-08-02 — **Replay restores the recorded camera FIRST (user: "replay should
  show the same demo + initial camera position immediately before replaying; now
  it reloads the boot screen then moves the camera there").** The camera restore
  (`snapTo`/`orbitSetPose`) was already instant — the problem was the demo's OWN
  boot framing (the world overview) rendering for the ~60ms before the replay
  engine restored the recorded pose, read as "boot screen, then jump". Fixed:
  `main.ts` sets `window.__replayPending` when `?replay=` is in the URL; the demo
  boots (windgraphWorld + demos.ts) skip their camera framing while it's set
  (`replayBootPending()`), and the replay engine restores the recorded pose as
  the FIRST camera, then clears the flag. Verified: replaying deep-drag (recorded
  pose {378,762,z3}) shows that pose from the first rendered frame — no overview
  flash — then the drag events reproduce. tsc + suites green.
- 2026-08-02 — **Recording route bug fixed (user: "I recorded samebugstill but
  can't replay — it opens #launcher?replay=samebugstill and nothing happens").**
  Root cause: clicking a demo card on the launcher boots the demo WITHOUT
  changing the URL hash, so the recorder's `route()` captured `launcher` for a
  recording made inside a demo — replaying it booted the launcher, which never
  runs the replay. Fixed in `main.ts`: the launcher's onPick now sets
  `location.hash = '#' + demo.id` (replaceState) so the active demo is reflected
  and recordings carry the demo route; `runReplayFromQuery` also runs on the
  launcher route. The recorder now refuses to start on the launcher (flash "open
  a demo first") and classifies UI-chrome presses (toolbar buttons like the 3D
  toggle, open menu/panel) as "ui button"/"ui click" instead of "camera pan".
  The user's existing samebugstill.json is a launcher recording (no demo content)
  — delete it and re-record inside the demo. tsc + suites green.
- 2026-08-02 — **Analytic #testinfra (zero-DOM) + deep-zoom plot-fill FPS fix
  (user: "no DOM, purely analytical test infra, check the reference design, SVG
  icons, polish, then fix the fps tank when moving camera or dragging
  handles").** (1) Replaced the DOM testinfra demo with a **fully analytic board**
  (`src/playground/boards/testInfraBoard.ts`, the reference-design pattern —
  world-space, `addRect`+`layoutStr`+geometric icon primitives, zero DOM): lists
  recordings with per-row icon buttons (▶ replay / 📊 stats / 🗑 delete with a
  click-twice confirm), hover states (row + header + per-button), an empty state,
  and a stats table for the most recent replay (persisted to
  `localStorage['cs-last-report']`; dismiss × hit-testable). `#testinfra` boots
  the board full-viewport. (2) **Deep-zoom plot-fill fix.** Measured with the
  Playwright protocol (2560×1440@2, nvidia): a handle drag at zoom 5 replayed at
  188fps vs 238 at overview — GPU fragment fill, jsAvg only 0.7ms. Root cause:
  the LOD scales plot samples UP with zoom (√zoom → 2.2-2.8× at zoom 5-8), but
  plots sample their FULL domain — the extra samples feed OFF-screen pieces that
  the winding integral still pays per-pixel (O(pieces-per-band)). The visible arc
  is already sub-pixel-smooth at 1× base, so the deep-zoom multiplier only buys
  off-screen cost. **Fix: cap the LOD sample multiplier at 1.5× base**
  (`WgScene.plotSamples`) — deep-zoom pieces drop up to 2×, visible sharpness
  unchanged. Measured: zoom-5 drag 188→205fps, zoom-8 drag →228fps (near
  overview). All 6 recordings pass `perf:replay --expect-min 60`. tsc + suites
  green.
- 2026-08-02 — **testinfra demo + input classification + crisp browser launches
  (user: "when you open chromium yourself it's blurry; I need a demo that lists
  recordings with rename/delete/replay + a stats table of input labels + js +
  fps; you shall have programmatic access to record/replay/assess").** Added the
  `#testinfra` demo (DOM, no iframe): lists every `recordings/*.json` with
  per-row [▶ replay] [📊 stats] [✎ rename] [🗑 delete]. ▶ navigates to
  `#<route>?replay=<name>` and replays the action in the recorded demo; 📊 adds
  `&stats=1` → a compact stats table appears after replay (input labels with
  counts, recorded vs replay fps avg/min/p95, js avg/max, dropped frames,
  duration, viewport match, "back to testinfra"). **Input classification:** the
  recorder now labels gestures live — "handle drag <point>" (via a new
  `WindgraphWorld.activeHandle` getter), "slider drag", "camera pan",
  "rotate (3D)", "wheel zoom" — stored in `Recording.summary.inputs` and shown in
  both the demo and the Playwright table. **Stats:** `RecSummary` grew to
  fps avg/min/p95 + js avg/max + dropped (via `window.__perf.dt`). **Programmatic
  access:** `window.__recorder.start()/stop(name)`, `window.__rec` (state/getCam/
  setCam), `window.__perf`, `window.__recReport`; `scripts/record.ts` (with
  `--zoom N` to frame the dragged handle for deep-zoom scenarios) and
  `scripts/replay.ts [name] [--expect-min N]` print the input-labelled fps table
  and exit 1 on failure. **Blur fixed:** headed launches now probe the real
  display (screen CSS size × devicePixelRatio) instead of an arbitrary small
  viewport the compositor upscales. Two SPA-navigation bugs fixed (hash-only
  changes don't reload → `location.reload()` after setting the hash; flag values
  consumed as positional names in the CLI parsers). Verified: tri-drag/tri-zoom/
  tri-pan/deep-drag record + replay at 238-240 fps, inputs labelled. tsc + suites
  green.
- 2026-08-02 — **Record/replay test infra — FIXED + Playwright-driven (user:
  "the replay did not work; no iframe or CSS for the replay demo; wire in
  Playwright").** The parallel session's `src/recorder/` (bridge + F2 recorder +
  http/localStorage store + `?replay=` replay engine + vite `/__rec` plugin
  persisting `recordings/*.json` + `window.__perf`) recorded fine but the REPLAY
  path was broken and glued to an iframe. Fixed: (1) **start-pose bug** — the
  recorder captured the camera at STOP (post-action); it now captures at START
  (the replay restore point). (2) **`prompt()` blocked automation** —
  `window.__recorder.stop(name)` takes a name and skips the dialog. (3) **Removed
  the `#testbench` demo** (iframe + CSS) per directive — the replay engine now
  publishes only `window.__recReport` + console. (4) **Playwright protocol**:
  `bun run perf:record <name> [--scenario drag|zoom|pan]` (warm-up before
  capture) + `bun run perf:replay [--expect-min N]` (replays every recording at
  its exact viewport+dpr — fixed a device-px-vs-CSS-px units bug — and asserts).
  Browser = the SYSTEM chromium `/usr/bin/chromium` headed (Playwright's bundled
  headless shell exposes NO WebGPU adapter on this machine; `PLAYWRIGHT_CHROMIUM`
  overrides; `HEADLESS=1` is software-only, caveated). Measured: tri-drag
  232/199→238/218, tri-zoom 238/204→240/239, tri-pan 237/218→238/217
  (rec/replay avg/min fps). tsc + suites green. **Perf direction stays D28's**
  (sample reduction + `rectBehindNear` MSAA gate + future shader 2D-gather); the
  D27/D28-reverted clip/cull guesses are NOT re-attempted. Safe CPU wins kept:
  wedge round-joins + `getMesh()` reference-cache.
- 2026-08-02 — **3D/plot perf — review of D27 + corrections (user: "the fps
  still tanks; my lines are no longer infinite, so that was clearly not the
  issue").** A second pass on the D27 3D-perf work found TWO D27 changes were
  regressions the user explicitly rejected, and the D27 culling/bbox theory was
  the wrong diagnosis. **REVERTED:** (a) the infinite-line clipping
  (`clipSegToRect`/`clipPolylineToRect` + `lineClipRect`) that made infinite
  lines stop at the board edge — D27 blamed "huge off-board line bboxes" for the
  drag FPS tank, but reducing samples or clipping didn't move it; lines are
  infinite again. (b) the 3D board frustum culling (`boardVisible` +
  `rect3DVisible` all-behind-camera-inside contract) — the user's "a line
  disappears when I zoom into it because its frame is out of view" was EXACTLY
  that: a board's corners leaving the viewport (all-front past a side plane, or
  all-behind with the camera outside) culled the whole board while its interior
  was still on screen. 3D now always emits every board (cached replays are
  cheap; frame-skip makes a still scene cost ~0 JS). `rect3DVisible` restored to
  "any corner behind → never cull". (c) the emitCache clip/bbox-cull machinery
  (instance-level off-board dropping + slice-bbox skip) — same aggressive-culling
  family, removed. **KEPT from D27:** wedge joins (`addRoundJoin`), the mesh
  upload cache (`getMesh`), the `__perf` hook. **IMPROVED:** the 4× MSAA mesh
  pass (a full-screen 4× clear+resolve every 3D frame — a fixed hidden cost) is
  now gated on `rectBehindNear` (all-4-corners-behind the near plane), which can
  NEVER false-cull a mesh you're looking at — a view framed on a flat board
  skips the pass, zooming into a solid never makes it vanish (the D27 gate's
  failure mode). Plot samples reduced (plotFn 240→160, parametric/polar 320→200,
  rose/liss 400→240): sub-pixel chord sagitta at typical zooms, LOD resamples at
  zoom bands so deep zoom stays sharp — measured plots-board band pieces
  ~15.3k→~11k, worst band 632→418. tsc clean; bun suites + vitest green. **Open
  problem (documented in NOTES.md D28): the plot GPU fill is the winding
  integral's O(pieces-per-band) per-pixel gather — dense plots reach ~400-600
  pieces in the steepest bands, and the only exact fix is a 2D (x-column +
  right-zone prefix) gather, which the shader can't afford at 4 binary searches
  per column. The honest next step is that gather; sample caps are the stopgap.**
  Visual verdict = user.
- 2026-08-02 — **3D perf pass (user: "turning on 3D tanks fps even when the
  viewport doesn't change; dragging tanks way more in 3D than 2D; I expect 0 fps
  hit for redrawing simple lines/circles; massively improve plot perf").** Four
  headless-profiled fixes (full detail in NOTES.md D27). (1) **Stroke round-join
  disc spam**: round joins emitted a full 24-seg disc at EVERY vertex; `addRoundJoin`
  now emits only the turn wedge (segs ∝ turn angle) and `strokeQuadPath` honors
  `style.join`. Circle re-stroke 0.57→0.11ms (5×), triangle scene.emit dirty
  0.84→0.27ms. (2) **3D emitted all 9 boards every frame** (`cull2D=!cam3d.active`);
  re-enabled conservative per-board frustum culling (`rect3DVisible` + half-board
  margin) — 3D idle 1.23→0.64ms, 3D drag 2.1→1.2ms. (3) **`world.getMesh()`
  re-uploaded the combined mesh every frame** (fresh Float32Array defeated mesh3d's
  reference-gate); now cached → steady-state upload 0. (4) **4× MSAA ran whenever
  the world had any mesh**; gated on `meshVisible()` + graph3d visibility. FRUSTUM
  CONTRACT: the all-4-corners-behind case now draws iff the camera is inside the
  rect (reverses the 07-31 "never cull" — a headless orbit sim proved an in-view
  board is never all-behind, only mixed). `__test_frustum.ts` updated; deep-zoom-
  into-a-board stays visible (the user's no-disappear constraint). tsc clean; 25 bun
  suites + vitest green. Visual verdict = user.
