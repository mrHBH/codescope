# Postmortem — windgraph handle-drag FPS fix (attempted, reverted)

**Date:** 2026-08-03
**Status:** REVERTED. All performance changes rolled back to `b4494a3` (test infra intact).
**Update (same day): attempt 2 SHIPPED** — stages 2+3 of `DESIGN-drag-fps-2.md`
(persistent composition + partial uploads), following §6's playbook; see the
D33 entry in `NOTES.md` and the STATE.md log for measured results.
**Reporter:** user — "when I drag an interactive handle for a curve, fps drops massively, it
should not for these simple cases!" Acceptance: the `repro` recording should replay at a
solid 240 fps.

---

## 1. The bug being chased

Dragging an interactive handle (a free point that re-solves a constraint graph) tanked fps.
The user's `repro` recording = rotate camera in 3D → move a handle. Baseline replay measured
~122–221 avg / ~57–136 min fps (large run-to-run variance; the *recording* captured ~211/90).

The headless + browser profile showed a drag frame costs ~7 ms of JS:

| section (frame.ts `mark`) | ~ms | what it is |
|---|---|---|
| `interact` | 3.7–5.5 | world emit: every board re-emitted/comp-posed every frame |
| `draws` | 2–4.6 | `writeBuffer` of the full crv (~1.76 MB) + command encode |
| `upload` | 0.4 | number[] → Float32Array copies |

Two dominant, avoidable costs were identified:
1. `writeBuffer(curveBuf, 0, curves)` of the **entire** curve buffer every changed frame
   (measured **1.22 ms** for 1.76 MB in the browser — a 3-buffer write per frame).
2. The world re-ran **every board's cached slice replay** into fresh comp arrays each frame,
   plus copied the full atlas+static prefix into comp (the bulk of crv) every frame.

## 2. What I changed (all now reverted)

1. **frame.ts / gpu.ts — partial upload.** The world exposes `dirtyRegions()` (float-index
   ranges of crv/rws that actually changed); frame.ts partial-sets `crvFA`/`rwsUA`; the
   renderer `writeBuffer`s only those byte ranges. Inst stays full (its 2D content is
   camera-relative).
2. **windgraphWorld.ts — persistent-slot composition.** Clean boards' content persists in the
   comp buffers; only *dirty* boards re-emit (into a scratch at a fixed slot, then copied into
   place). Later extended to *running offsets* so a board whose slice length changes re-emits
   only the shifted tail instead of all 9 boards.
3. **windgraphWorld.ts — prefix-seed elimination.** Comp buffers only need the prefix LENGTH
   (row/quad refs rebase to lengths); the per-frame prefix content copy was removed.
4. **object-resolver.ts — scratch zero-fill once.** The WgScene per-mobject scratch prefix is
   filled once, then reused via truncation.
5. **stroke.ts — `arcQuads` fixed 32 segments** (was ∝ sweep angle → variable slice length).

## 3. What went wrong

**Bug A (critical, user-visible): "nothing changes in the scene during a drag."**
`this.lastSigs = boardSigs` stored a **reference** to `frameBoardSigs`. `frameSig()` mutates
`frameBoardSigs[i]` **in place** on every frame — so the next frame's dirty check compared the
current sig to itself and the dragged board was **never re-emitted**. Fixed with `.slice()`, but
it shipped into the user's session before the fix landed → the board froze during drags. This is
the single most damaging failure: a subtle aliasing bug on the hottest path.

**Bug B: rendering artifacts.** The slot path + partial uploads produce stale/corrupt GPU
content if any offset/length bookkeeping is wrong (a partial-inst-write bug left the instance
buffer un-uploaded entirely at one point; shifted-tail bookkeeping had gaps). The user saw
"the rendering is full of artifacts."

**Bug C: fps still not solid.** Even when correct, a drag crosses digit/arc boundaries where a
measure label's glyph count or an arc's length changes → the layout shifts → a ~12 ms full or
~5 ms tail re-emit. fps min stayed < 240.

**Process failure:** the change was too big and too fast — 5 independent optimizations stacked
into one uncommitted diff, with correctness verified only by fps numbers and pixel-diff
heuristics, never by actually *looking* at the output.

## 4. How I tested (honest assessment)

**What worked:**
- **Real-browser replay** via the existing `perf:replay` protocol (Playwright + system Chromium
  + real WebGPU) — the only ground truth.
- **Per-section frame timing.** I temporarily added `mark()` buckets around upload/draws and
  published a per-section breakdown into `window.__perf` (gated on a trace flag), captured by a
  modified replay engine. This found the 1.22 ms `writeBuffer` and the board-replay costs.
- **Headless bun microbenchmarks** for the world emit + scene emit.

**What failed / misled me:**
- **Microbenchmarks reused growing arrays** across iterations (my first world- and board-level
  benches appended into the same `inst/crv/rws` without resetting). `seedRows` grew every
  frame, invalidating every slice cache → I measured a fake 1–1.8 ms scene rebuild that doesn't
  exist in the real flow. I lost hours to this artifact before realizing the arrays must be
  reset like `frame.ts` does.
- **Run-to-run variance was huge** (replay avg 122→221 on the *same* build). I kept chasing
  single-run deltas instead of multi-run distributions.
- **I cannot see images.** My model has no image input. I verified rendering with screenshot
  pixel-diff counts and `drawImage` readbacks (which silently returned "empty" for a WebGPU
  canvas) — not by looking. **Every artifact the user saw would have been caught in seconds by
  an image-capable agent.** This is the single biggest testing gap.
- I did not run the full bun/vitest suite until near the end (they pass — 382 tests — but they
  don't exercise the GPU path, so they never caught the visual bugs).

## 5. What the measurements actually said (the durable insight)

The honest, reproducible root-cause ranking (validated repeatedly, consistent across runs):
1. `writeBuffer` of the full crv buffer per changed frame ≈ **1.2 ms** — the single largest
   fixed cost, and it is 99% redundant (a drag changes one board's ~4k of ~440k floats).
2. Re-running every board's cache **replay** into fresh arrays ≈ **2–4 ms** — redundant for the
   8 unchanged boards.
3. Copying the atlas+static prefix into comp every frame ≈ **1 ms** — redundant (only the
   length matters).

Any future fix should target **#1 (partial writeBuffer) and #2 (skip unchanged-board replays)**
with **surgical, separately-verifiable** changes — not a monolithic rewrite.

## 6. How a better AI should tackle this

1. **Look at the output, every step.** Screenshot after every change and compare visually (the
   model must accept images). The artifacts would be caught immediately. No exceptions.
2. **Change one thing, verify, commit.** Five stacked optimizations in one uncommitted diff is
   how Bug A + artifacts happened. Each change: `tsc` → bun suites → headless logic test →
   real-browser replay → screenshot diff → commit.
3. **Profile the real drag path first, and trust only clean microbenchmarks.** Reset the target
   arrays between iterations exactly like `frame.ts` does. Cross-check every headless number
   against the browser replay before acting on it. Track multi-run medians, not single runs.
4. **Prefer the small, testable fix over the architecture rewrite.** The partial-upload change
   (gpu.ts + frame.ts + a `dirtyRegions()` hook) is ~50 lines and can be verified by comparing
   the GPU buffer contents (read-back) to the JS truth. The persistent-slot rewrite is where
   correctness escaped.
5. **Add a regression gate before optimizing:**
   - Headless: `tryBeginDrag` → `dragTo` → assert the emitted `inst/crv/rws` content changed
     (catches "board doesn't update" bugs — the exact Bug A).
   - Replay: `bun run perf:replay --expect-min 120 repro` as a floor, PLUS a replay
     screenshot-diff assertion that the drag actually moved pixels.
   - Commit the failing test first (red → green), so the fix is provably the fix.
6. **Keep the world emit deterministic and simple.** The frame-skip (still = 0.1 ms) was
   already excellent; the gap was *changed* frames being all-or-nothing. The next attempt
   should make "one board changed" cost proportional to one board, with the GPU upload the
   only non-trivial step.
7. **Write a short design note before coding** (state the measured costs, the target budget,
   the correctness invariants — e.g. "row/quad refs are absolute in the final arrays; glyph
   rowBases point into the immutable atlas prefix") so the aliasing/length-shift failure modes
   are on the table from the start.

## 7. Current state

All performance changes reverted. Repo is at `b4494a3` + the user's new recordings
(`recordings/2dsimple.json`, `recordings/3dsimple.json` are untracked and kept). `tsc` clean;
bun suites green (27 + 14 in the touched areas). The original handle-drag fps bug remains open.
