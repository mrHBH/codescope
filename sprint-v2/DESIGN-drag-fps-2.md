# Design note — handle-drag FPS fix, attempt 2 (2026-08-03)

Follow-up to `POSTMORTEM-drag-fps.md`. This note states the measured costs, the
target budget, and the correctness invariants BEFORE coding (postmortem §6.7),
and pins the design to small, separately-verifiable stages.

## Measured costs (drag frame in `repro`, ~7 ms JS; baseline replay 215–219 avg / 102–130 min fps)

1. `writeBuffer` of the FULL crv (~1.76 MB) + rws + inst per changed frame ≈ 1.2 ms+
   (99% redundant: a drag changes one board's ~4k of ~440k crv floats).
2. World re-runs EVERY board's cached slice replay into fresh comp arrays ≈ 2–4 ms
   (redundant for the 8 unchanged boards).
3. Copying the atlas+static prefix into comp every frame ≈ 1 ms (only its LENGTH
   matters — row/quad refs rebase to lengths).

Budget: 240 fps → ≤4.17 ms/frame; target ≤2.5 ms JS on drag frames (headroom for
GPU/compositor). Unavoidable work: the dragged board's rebuild (constraint solve +
stroke + band, ~1–2 ms) + its panel chrome.

## Correctness invariants (the failure modes from attempt 1, on the table up front)

- **I1 — absolute refs.** In the final arrays: `rws[5k]` is a quad index into crv
  (float index / 6); a shape instance's `inst[16i+12]` is a row index into rws.
  Both are ABSOLUTE in the composed arrays. Any tail shift must rebase BOTH.
- **I2 — atlas prefix is immutable.** Glyph instances reference rows in the atlas
  prefix (rowBase < prefix rows) and must NEVER be rebased. fillRule ≥ 1.5
  instances (solid rect = 2, grid = 3) carry a band/params in inst[12..15], NOT a
  row ref — never touch those (the EmitCache capture rule).
- **I3 — sig ⇔ content.** Frame-skip redraws persistent GPU buffers when the sig
  matches: if the sig did NOT change, the emitted content must be bit-identical;
  if content changed, the sig must change. Per-board sig snapshots must be stored
  as immutable strings — NEVER a reference to an array another function mutates
  (Bug A of attempt 1).
- **I4 — inst is camera-relative in 2D.** The inst GPU content changes with the
  camera even when geometry doesn't. Partial inst uploads are only valid when the
  camera is unchanged since the last full upload; otherwise full upload.
- **I5 — buffer growth ⇒ full upload.** A reallocated GPU buffer is empty; any
  partial-upload scheme must fall back to full on growth.

## Design

Layout of the composed crv/rws: `[atlas+static prefix][masthead][board0..board8]`.
During a drag exactly ONE board's sig changes (its rev bumps per drag event); its
slice content changes and its LENGTH may change (digit/arc boundaries — the
occasional expensive frame, postmortem Bug C).

### Stage 2 — world persistent composition (fixes cost #2 + #3)

`WindgraphWorld.emit` keeps its comp buffers persistent across frames:
- Per-board sigs stored as strings; clean boards contribute NOTHING (no replay,
  no copy) — their content already sits in the comp buffers at their slot.
- A dirty board re-emits into scratch (seeded to prefix LENGTHS, not content —
  capture only needs the lengths to classify atlas refs) and is spliced into its
  slot. If its slice length changed, the tail is memmoved and ALL absolute refs in
  the tail are rewritten IDEMPOTENTLY from the boards' cache metadata
  (`rowBase = boardRowStart + relRowBase`, `row.start = boardQuadStart + relStart`)
  — no incremental `+=` that could accumulate errors.
- Any structural change (prefix lengths moved, board set/visibility changed)
  falls back to a full re-emit that frame (rare, safe).
- The world exposes `dirtyRanges()`: float/row/instance ranges (absolute in the
  final arrays) that changed this frame. Full ranges after a fallback.
- **Verification:** headless equivalence test — the persistent composition must be
  element-wise IDENTICAL to the old naive full recompose, across scripted
  drag/pan/zoom sequences including length-changing drags. This is the test that
  would have caught every Bug B bookkeeping escape.

### Stage 3 — partial GPU uploads (fixes cost #1)

frame.ts consumes `dirtyRanges()`:
- crv/rws: sync + `writeBuffer` only the dirty byte ranges (a drag ≈ 16 KB instead
  of 1.76 MB). Falls back to full when the camera changed (2D inst rebase shifts
  nothing in crv/rws, but keep it simple + I5 growth), the prefix lengths changed,
  or the world reported full.
- inst + xf: partial only when the camera is UNCHANGED since the last upload
  (I4) — true throughout a handle drag; pan/zoom frames upload full as today.
- gpu.ts `draw` gains optional dirty ranges; buffer growth forces full (I5).

### Explicitly NOT doing (attempt-1 overreach)

- No running-offset "shifted tail re-emit only" micro-scheme beyond the memmove.
- No fixed-segment-count arc changes (stroke.ts stays untouched).
- No prefix-content seeding changes in object-resolver.
- Inst stays fully uploaded when the camera moves.

## Verification protocol (per stage, no exceptions)

1. `bunx tsc --noEmit` + bun suites + vitest.
2. Headless invariant tests (drag changes emit; persistent ≡ naive).
3. Real-browser replay: `bun run perf:replay` (multi-run, record avg/min spread).
4. **Screenshots mid-drag + end-state, LOOKED AT** (scripts/shots.ts + image-capable
   review) — compared against pre-change baselines. Artifacts caught by eye.

---

## Results (2026-08-03, attempt 2 — SHIPPED as stages 2+3)

**Shipped:** stage 2 (persistent composition) + stage 3 (partial uploads).
**Rejected:** stage 4 (3D view-independent sigs) — A/B showed a wash on the
rotation recording and a regression on zoom-heavy 3D (full-board rebuilds cost
more than the tile rebuilds it removed). Reverted; logged in NOTES.md.

Drag window of `repro` (t=5307–8871, the user's complaint), baseline → final:
| metric | baseline | final |
|---|---|---|
| jsAvg | 2.92 ms | 1.93–2.59 ms |
| interact (world emit) | 1.58 ms | 1.03–1.33 ms |
| GPU upload | 1202 KB/frame | ~600 KB/frame (91% of frames <200KB) |
| over-budget frames | 320/771 | ~259/769 (smaller overages) |

Same-conditions A/B on `repro` (4 runs each): baseline median ~181 avg / ~95 min
(one 137/56 outlier) → final 197–209 avg / 87–109 min (tight). `3dsimple` min
74→113, `latest` min 87→108. All simple recordings (tri-drag/pan/zoom,
deep-drag, 2dsimple) replay at 176–239 min.

**Honest residual:** the three complex 3D recordings sit at 108–113 fpsMin —
just under the 120 gate — bounded by single-frame ESSENTIAL-work spikes the
postmortem already deferred to the Phase-5 worker: the 2D↔3D mode-toggle
structural rebuild (~22ms, all 9 boards), LOD-settle rebuilds during zoom
(~18ms), and drag frames crossing measure-label digit boundaries (tail re-emit
+ big upload, ~10% of drag frames). The drag itself is now ~2ms JS with 90% of
frames under the 240fps budget — the "fps tanks massively on a simple drag"
bug is fixed; "solid 240 on the whole mixed repro" needs the worker.

**Process notes (what worked, per postmortem §6):**
- The differential test (persistent ≡ naive across drags/pans/zooms) caught the
  one real bookkeeping bug immediately (scratch seeded at prefix length lost the
  comp offset → rowBase 0 vs 118). Fixed before any browser run.
- Screenshots at p25/p50/p75/end after every stage: pixel-identical to baseline.
  No artifacts escaped — the image-capable review closed attempt-1's #1 gap.
- Stage 4 was reverted on A/B evidence instead of shipped on theory.
- Measurement caveat learned the hard way: interrupted replay runs leak
  chromium processes (WebGPU contexts) that throttle later runs — 17 leaked
  browsers produced a fake 114fps on a 2.4ms-js pan recording. `pkill -9 -f
  chromium` between measurement sessions; never trust a run that follows an
  interrupted one.
