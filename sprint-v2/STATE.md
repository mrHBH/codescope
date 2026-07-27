# windgraph v2 — Live State

**This file is ground truth.** An agent starting fresh reads this first.
If this file and the code disagree, investigate before trusting either.

## Current position

- **Phase:** 0 — Substrate repair: **all 4 tasks done, awaiting CP1 verdict**
- **Next task:** 🔍 **CP1** — user regression smoke (`checkpoints.md`); on
  "clear", proceed to Phase 1 task 1.1
- **Checkpoints passed:** none
- **Blockers:** none
- **Last updated:** 2026-07-27 (Phase 0 complete)

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
